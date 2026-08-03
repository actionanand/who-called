import { inject, Service, signal } from '@angular/core';
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
import { NativeIntegrationService } from './native-integration.service';

@Service()
export class KeepsakeReminderService {
  private readonly native = inject(NativeIntegrationService);
  private readonly channelId = 'who-called-keepsakes';
  readonly permission = signal<'unavailable' | 'prompt' | 'denied' | 'granted'>('unavailable');
  readonly lastError = signal('');

  async requestPermission(contacts: readonly PrivateContact[] = []): Promise<boolean> {
    if (!this.isAndroid()) return true;
    try {
      const alreadyGranted = this.native.notificationPermissionGranted();
      const granted = await this.native.requestNotificationPermission();
      this.permission.set(granted ? 'granted' : 'denied');
      this.lastError.set(granted ? '' : 'Android notification permission was not granted.');
      if (granted) {
        await this.scheduleNotifications(contacts, !alreadyGranted);
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
      if (!this.native.notificationPermissionGranted()) {
        this.permission.set('prompt');
        return;
      }
      this.permission.set('granted');
      await this.scheduleNotifications(contacts, catchUpMissedToday);
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
    return [...recurringIds, ...recurringIds.map((id) => this.followingNotificationId(id))];
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

  private followingNotificationId(firstId: number): number {
    return -firstId;
  }

  private async scheduleNotifications(
    contacts: readonly PrivateContact[],
    catchUpMissedToday: boolean,
  ): Promise<void> {
    this.native.ensureKeepsakeNotificationChannel();
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
      const firstAt =
        event.nextDate.getTime() > now.getTime()
          ? event.nextDate
          : catchUpMissedToday
            ? keepsakeNotificationDate(event.nextDate, now)
            : dateForYear(now.getFullYear() + 1, event.month, event.day);
      const followingAt = dateForYear(firstAt.getFullYear() + 1, event.month, event.day);
      return [
        {
          ...shared,
          id,
          schedule: {
            at: firstAt,
            allowWhileIdle: true,
          },
        },
        {
          ...shared,
          id: this.followingNotificationId(id),
          schedule: {
            at: followingAt,
            allowWhileIdle: true,
          },
        },
      ];
    });
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  }

  private isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }
}
