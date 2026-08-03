import { Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PrivateContact } from '../models/app.models';
import { contactDisplayName } from '../utils/contact-privacy';
import { KeepsakeEvent, keepsakeEvents, keepsakeNotificationDate } from '../utils/keepsake-events';

@Service()
export class KeepsakeReminderService {
  private readonly channelId = 'who-called-keepsakes';
  readonly permission = signal<'unavailable' | 'prompt' | 'denied' | 'granted'>('unavailable');
  readonly lastError = signal('');

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

  async reschedule(contacts: readonly PrivateContact[], catchUpMissedToday = false): Promise<void> {
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
      const ids = contacts.flatMap((contact) => this.notificationIds(contact.id));
      if (ids.length) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      const notifications = events.flatMap(({ event, id }) => {
        const shared = {
          title: event.kind === 'birthday' ? 'Birthday today' : `${event.label} today`,
          body:
            event.kind === 'birthday'
              ? `${contactDisplayName(event.contact)}'s birthday is today.`
              : `${contactDisplayName(event.contact)}'s ${event.label.toLocaleLowerCase()} is today.`,
          channelId: this.channelId,
          smallIcon: 'ic_stat_who_called',
          autoCancel: true,
          extra: { source: 'who-called', contactId: event.contact.id, kind: event.kind },
        };
        const recurring = {
          ...shared,
          id,
          schedule: {
            on: {
              month: event.month,
              day: event.month === 2 && event.day === 29 ? 28 : event.day,
              hour: 6,
              minute: 0,
            },
            repeats: true,
            allowWhileIdle: true,
          },
        };
        if (!catchUpMissedToday || event.nextDate.getTime() > now.getTime()) {
          return [recurring];
        }
        return [
          recurring,
          {
            ...shared,
            id: this.catchUpNotificationId(id),
            schedule: {
              at: keepsakeNotificationDate(event.nextDate, now),
              allowWhileIdle: true,
            },
          },
        ];
      });
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
    const recurringIds = Array.from({ length: 4 }, (_, index) =>
      this.notificationId(contactId, index),
    );
    return [...recurringIds, ...recurringIds.map((id) => this.catchUpNotificationId(id))];
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

  private catchUpNotificationId(recurringId: number): number {
    return -recurringId;
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
