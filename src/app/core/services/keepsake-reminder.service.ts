import { Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PrivateContact } from '../models/app.models';
import { contactDisplayName } from '../utils/contact-privacy';
import {
  dateForYear,
  KeepsakeEvent,
  keepsakeEvents,
  keepsakeNotificationDate,
} from '../utils/keepsake-events';

@Service()
export class KeepsakeReminderService {
  private readonly channelId = 'who-called-keepsakes';
  readonly permission = signal<'unavailable' | 'prompt' | 'denied' | 'granted'>('unavailable');
  readonly lastError = signal('');

  async initialise(contacts: readonly PrivateContact[]): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      const previousPermission = this.permission();
      await this.ensureChannel();
      const status = await LocalNotifications.checkPermissions();
      this.permission.set(
        status.display === 'granted'
          ? 'granted'
          : status.display === 'denied'
            ? 'denied'
            : 'prompt',
      );
      if (status.display === 'granted') {
        await this.reschedule(
          contacts,
          previousPermission === 'prompt' || previousPermission === 'denied',
          true,
        );
      }
    } catch {
      this.lastError.set('Keepsake reminders could not be initialised.');
    }
  }

  async shouldRequestNotificationPermission(): Promise<boolean> {
    if (!this.isAndroid()) return false;
    try {
      const status = await LocalNotifications.checkPermissions();
      return status.display !== 'granted';
    } catch {
      this.lastError.set('Android notification permission could not be checked.');
      return false;
    }
  }

  async requestPermission(contacts: readonly PrivateContact[] = []): Promise<boolean> {
    if (!this.isAndroid()) return true;
    try {
      const current = await LocalNotifications.checkPermissions();
      const status =
        current.display === 'granted' ? current : await LocalNotifications.requestPermissions();
      const granted = status.display === 'granted';
      this.permission.set(granted ? 'granted' : 'denied');
      this.lastError.set(granted ? '' : 'Android notification permission was not granted.');
      if (granted) {
        await this.ensureChannel();
        await this.reschedule(contacts, current.display !== 'granted');
      }
      return granted;
    } catch {
      this.permission.set('denied');
      this.lastError.set('Android notification permission could not be requested.');
      return false;
    }
  }

  async reschedule(
    contacts: readonly PrivateContact[],
    catchUpMissedToday = false,
    preserveDuePending = false,
  ): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        this.permission.set(status.display === 'denied' ? 'denied' : 'prompt');
        return;
      }
      this.permission.set('granted');
      await this.ensureChannel();
      const now = new Date();
      const events = keepsakeEvents(
        contacts.filter((contact) => !contact.deletedAt),
        now,
      )
        .filter((event) => event.reminderEnabled)
        .map((event) => ({ event, id: this.notificationIdForEvent(event) }));
      const preservedIds = preserveDuePending
        ? await this.pendingIdsForDueEvents(events, now)
        : new Set<number>();
      const ids = contacts
        .flatMap((contact) => this.notificationIds(contact.id))
        .filter((id) => !preservedIds.has(id));
      if (ids.length) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      const notifications = events
        .filter(({ id }) => !preservedIds.has(id))
        .map(({ event, id }) => ({
          id,
          title: event.kind === 'birthday' ? 'Birthday today' : `${event.label} today`,
          body:
            event.kind === 'birthday'
              ? `${contactDisplayName(event.contact)}'s birthday is today.`
              : `${contactDisplayName(event.contact)}'s ${event.label.toLocaleLowerCase()} is today.`,
          channelId: this.channelId,
          smallIcon: 'ic_stat_who_called',
          autoCancel: true,
          schedule: {
            at:
              catchUpMissedToday && event.nextDate.getTime() <= now.getTime()
                ? keepsakeNotificationDate(event.nextDate, now)
                : event.nextDate.getTime() <= now.getTime()
                  ? dateForYear(now.getFullYear() + 1, event.month, event.day)
                  : event.nextDate,
            allowWhileIdle: true,
          },
          extra: { source: 'who-called', contactId: event.contact.id, kind: event.kind },
        }));
      if (notifications.length) await LocalNotifications.schedule({ notifications });
      this.lastError.set('');
    } catch {
      this.lastError.set('Keepsake reminders could not be scheduled. Check Android settings.');
    }
  }

  async cancelForContact(contactId: string): Promise<void> {
    if (!this.isAndroid()) return;
    await LocalNotifications.cancel({
      notifications: this.notificationIds(contactId).map((id) => ({ id })),
    });
  }

  async rebuildAfterRestore(
    previousContacts: readonly PrivateContact[],
    restoredContacts: readonly PrivateContact[],
  ): Promise<void> {
    if (!this.isAndroid()) return;
    const ids = new Set([
      ...previousContacts.flatMap((contact) => this.notificationIds(contact.id)),
      ...restoredContacts.flatMap((contact) => this.notificationIds(contact.id)),
      ...(await this.pendingKeepsakeNotificationIds()),
    ]);
    try {
      if (ids.size) {
        await LocalNotifications.cancel({
          notifications: [...ids].map((id) => ({ id })),
        });
      }
    } catch {
      this.lastError.set('Existing keepsake reminders could not be cleared after restore.');
      return;
    }
    await this.reschedule(restoredContacts);
  }

  private notificationIds(contactId: string): readonly number[] {
    return Array.from({ length: 4 }, (_, index) => this.notificationId(contactId, index));
  }

  private notificationIdForEvent(event: KeepsakeEvent): number {
    const offset =
      event.kind === 'birthday'
        ? 0
        : 1 +
          Math.max(
            0,
            (event.contact.anniversaries ?? []).findIndex((item) =>
              event.id.endsWith(`:${item.id}`),
            ),
          );
    return this.notificationId(event.contact.id, offset);
  }

  private async pendingIdsForDueEvents(
    events: readonly { readonly event: KeepsakeEvent; readonly id: number }[],
    now: Date,
  ): Promise<ReadonlySet<number>> {
    const dueIds = new Set(
      events.filter(({ event }) => event.nextDate.getTime() <= now.getTime()).map(({ id }) => id),
    );
    if (!dueIds.size) return new Set<number>();
    try {
      const pending = await LocalNotifications.getPending();
      return new Set(pending.notifications.map(({ id }) => id).filter((id) => dueIds.has(id)));
    } catch {
      return new Set<number>();
    }
  }

  private async pendingKeepsakeNotificationIds(): Promise<readonly number[]> {
    try {
      const pending = await LocalNotifications.getPending();
      return pending.notifications
        .filter(({ extra }) => this.isKeepsakeNotificationExtra(extra))
        .map(({ id }) => id);
    } catch {
      return [];
    }
  }

  private isKeepsakeNotificationExtra(extra: unknown): boolean {
    if (typeof extra !== 'object' || extra === null) return false;
    return (extra as Record<string, unknown>)['source'] === 'who-called';
  }

  private notificationId(contactId: string, offset: number): number {
    let hash = 0;
    for (const character of contactId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    return 100_000_000 + (Math.abs(hash) % 400_000_000) * 4 + offset;
  }

  private async ensureChannel(): Promise<void> {
    await LocalNotifications.createChannel({
      id: this.channelId,
      name: 'Birthdays and anniversaries',
      description: 'Yearly contact keepsake reminders at 6:00 AM',
      importance: 4,
      visibility: 0,
      lights: true,
      lightColor: '#087647',
      vibration: true,
    });
  }

  private isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }
}
