import { Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PrivateContact } from '../models/app.models';
import { contactDisplayName } from '../utils/contact-privacy';
import { keepsakeEvents } from '../utils/keepsake-events';

@Service()
export class KeepsakeReminderService {
  private readonly channelId = 'who-called-keepsakes';
  readonly permission = signal<'unavailable' | 'prompt' | 'denied' | 'granted'>('unavailable');
  readonly lastError = signal('');

  async initialise(contacts: readonly PrivateContact[]): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      await this.ensureChannel();
      const status = await LocalNotifications.checkPermissions();
      this.permission.set(
        status.display === 'granted'
          ? 'granted'
          : status.display === 'denied'
            ? 'denied'
            : 'prompt',
      );
      if (status.display === 'granted') await this.reschedule(contacts);
    } catch {
      this.lastError.set('Keepsake reminders could not be initialised.');
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isAndroid()) return true;
    try {
      await this.ensureChannel();
      const current = await LocalNotifications.checkPermissions();
      const status =
        current.display === 'granted' ? current : await LocalNotifications.requestPermissions();
      const granted = status.display === 'granted';
      this.permission.set(granted ? 'granted' : 'denied');
      this.lastError.set(granted ? '' : 'Android notification permission was not granted.');
      return granted;
    } catch {
      this.permission.set('denied');
      this.lastError.set('Android notification permission could not be requested.');
      return false;
    }
  }

  async reschedule(contacts: readonly PrivateContact[]): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        this.permission.set(status.display === 'denied' ? 'denied' : 'prompt');
        return;
      }
      this.permission.set('granted');
      const ids = contacts.flatMap((contact) => this.notificationIds(contact.id));
      if (ids.length) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      const notifications = keepsakeEvents(contacts.filter((contact) => !contact.deletedAt))
        .filter((event) => event.reminderEnabled)
        .map((event) => ({
          id: this.notificationId(
            event.contact.id,
            event.kind === 'birthday'
              ? 0
              : 1 +
                  Math.max(
                    0,
                    (event.contact.anniversaries ?? []).findIndex((item) =>
                      event.id.endsWith(`:${item.id}`),
                    ),
                  ),
          ),
          title: event.kind === 'birthday' ? 'Birthday today' : `${event.label} today`,
          body:
            event.kind === 'birthday'
              ? `${contactDisplayName(event.contact)}'s birthday is today.`
              : `${contactDisplayName(event.contact)}'s ${event.label.toLocaleLowerCase()} is today.`,
          channelId: this.channelId,
          smallIcon: 'ic_stat_who_called',
          autoCancel: true,
          schedule: {
            on: {
              month: event.month,
              day: event.month === 2 && event.day === 29 ? 28 : event.day,
              hour: 6,
              minute: 0,
            },
            repeats: true,
            allowWhileIdle: false,
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

  private notificationIds(contactId: string): readonly number[] {
    return Array.from({ length: 4 }, (_, index) => this.notificationId(contactId, index));
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
