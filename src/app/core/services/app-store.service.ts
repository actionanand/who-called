import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AppSettings,
  PrivateContact,
  SavedMessage,
  TaggedNumber,
  ThemePreference,
} from '../models/app.models';
import { LOCAL_RECORD_REPOSITORY } from '../repositories/repository.contracts';
import { ThemeService } from './theme.service';
import { NativeIntegrationService } from './native-integration.service';
import { KeepsakeReminderService } from './keepsake-reminder.service';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS: AppSettings & { readonly id: string } = {
  id: 'primary',
  theme: 'automatic',
  defaultCountry: 'India',
  defaultCallingCode: '+91',
  recentActivityEnabled: true,
  whatsappBusinessFallback: true,
  deviceCallHistoryEnabled: true,
  screenshotProtection: true,
  pinEnabled: false,
  biometricEnabled: false,
  hideHiddenContacts: true,
};

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly database = inject(LOCAL_RECORD_REPOSITORY);
  private readonly themeService = inject(ThemeService);
  private readonly native = inject(NativeIntegrationService);
  private readonly keepsakeReminders = inject(KeepsakeReminderService);

  readonly contacts = signal<readonly PrivateContact[]>([]);
  readonly messages = signal<readonly SavedMessage[]>([]);
  readonly taggedNumbers = signal<readonly TaggedNumber[]>([]);
  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly loading = signal(true);
  readonly storageError = signal(false);
  readonly pendingSharedText = signal('');
  readonly pendingContactDraft = signal<{
    readonly taggedNumberId?: string;
    readonly removeFromTaggedList?: boolean;
    readonly callingCode?: string;
    readonly phone: string;
    readonly note: string;
    readonly tag: string;
  } | null>(null);
  readonly pendingTaggedNumber = signal('');
  readonly quickActionsOpen = signal(false);
  readonly locked = signal(false);
  readonly activeContacts = computed(() => this.contacts().filter((contact) => !contact.deletedAt));
  readonly trashedContacts = computed(() =>
    this.contacts()
      .filter((contact) => contact.deletedAt)
      .sort((first, second) => (second.deletedAt ?? '').localeCompare(first.deletedAt ?? '')),
  );
  readonly visibleContacts = computed(() =>
    this.settings().hideHiddenContacts
      ? this.activeContacts().filter((contact) => !contact.hidden)
      : this.activeContacts(),
  );
  readonly favoriteContacts = computed(() =>
    this.visibleContacts().filter((contact) => contact.favorite),
  );
  readonly recentContacts = computed(() =>
    [...this.visibleContacts()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 4),
  );

  constructor() {
    void this.initialize();
  }

  async addContact(contact: PrivateContact): Promise<void> {
    await this.database.put('contact', contact);
    this.contacts.update((contacts) => [contact, ...contacts]);
    await this.keepsakeReminders.reschedule(this.contacts());
  }

  async updateContact(contact: PrivateContact): Promise<void> {
    await this.database.put('contact', contact);
    this.contacts.update((contacts) =>
      contacts.map((existing) => (existing.id === contact.id ? contact : existing)),
    );
    await this.keepsakeReminders.reschedule(this.contacts());
  }

  async removeContact(id: string): Promise<void> {
    await this.keepsakeReminders.cancelForContact(id);
    await this.database.remove('contact', id);
    this.contacts.update((contacts) => contacts.filter((contact) => contact.id !== id));
  }

  async trashContact(id: string): Promise<void> {
    const contact = this.contacts().find((entry) => entry.id === id);
    if (!contact || contact.deletedAt) return;
    const now = new Date().toISOString();
    const trashed = { ...contact, deletedAt: now, updatedAt: now };
    await this.database.put('contact', trashed);
    this.contacts.update((contacts) =>
      contacts.map((entry) => (entry.id === id ? trashed : entry)),
    );
    await this.keepsakeReminders.cancelForContact(id);
  }

  async restoreContact(id: string): Promise<void> {
    const contact = this.contacts().find((entry) => entry.id === id);
    if (!contact?.deletedAt) return;
    const restored = {
      ...contact,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.database.put('contact', restored);
    this.contacts.update((contacts) =>
      contacts.map((entry) => (entry.id === id ? restored : entry)),
    );
    await this.keepsakeReminders.reschedule(this.contacts());
  }

  async addMessage(message: SavedMessage): Promise<void> {
    await this.database.put('message', message);
    this.messages.update((messages) => [message, ...messages]);
  }

  async updateMessage(message: SavedMessage): Promise<void> {
    await this.database.put('message', message);
    this.messages.update((messages) =>
      messages.map((existing) => (existing.id === message.id ? message : existing)),
    );
  }

  async removeMessage(id: string): Promise<void> {
    await this.database.remove('message', id);
    this.messages.update((messages) => messages.filter((message) => message.id !== id));
  }

  async addTaggedNumber(taggedNumber: TaggedNumber): Promise<void> {
    await this.database.put('tagged-number', taggedNumber);
    this.taggedNumbers.update((numbers) => [taggedNumber, ...numbers]);
  }

  async updateTaggedNumber(taggedNumber: TaggedNumber): Promise<void> {
    await this.database.put('tagged-number', taggedNumber);
    this.taggedNumbers.update((numbers) =>
      numbers.map((number) => (number.id === taggedNumber.id ? taggedNumber : number)),
    );
  }

  async removeTaggedNumber(id: string): Promise<void> {
    await this.database.remove('tagged-number', id);
    this.taggedNumbers.update((numbers) => numbers.filter((number) => number.id !== id));
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    await this.updateSettings({ theme });
    this.themeService.apply(theme);
  }

  async updateSettings(changes: Partial<AppSettings>): Promise<void> {
    const settings = { ...this.settings(), ...changes };
    this.settings.set(settings);
    await this.database.put('settings', { id: 'primary', ...settings });
  }

  async replaceData(snapshot: {
    readonly contacts: readonly PrivateContact[];
    readonly messages: readonly SavedMessage[];
    readonly taggedNumbers: readonly TaggedNumber[];
    readonly settings?: Partial<AppSettings>;
  }): Promise<void> {
    const previousContacts = this.contacts();
    await Promise.all([
      this.database.clear('contact'),
      this.database.clear('message'),
      this.database.clear('tagged-number'),
    ]);
    await Promise.all([
      ...snapshot.contacts.map((contact) => this.database.put('contact', contact)),
      ...snapshot.messages.map((message) => this.database.put('message', message)),
      ...snapshot.taggedNumbers.map((number) => this.database.put('tagged-number', number)),
    ]);
    this.contacts.set(snapshot.contacts);
    this.messages.set(snapshot.messages);
    this.taggedNumbers.set(snapshot.taggedNumbers);
    if (snapshot.settings) await this.updateSettings(snapshot.settings);
    await this.keepsakeReminders.rebuildAfterRestore(previousContacts, snapshot.contacts);
  }

  async unlockSensitiveData(): Promise<void> {
    const [storedContacts, messages, taggedNumbers] = await Promise.all([
      this.database.list<PrivateContact>('contact'),
      this.database.list<SavedMessage>('message'),
      this.database.list<TaggedNumber>('tagged-number'),
    ]);
    const contacts = await this.purgeExpiredContacts(storedContacts);
    this.contacts.set(contacts);
    this.messages.set(await this.purgeExpiredMessages(messages));
    this.taggedNumbers.set(taggedNumbers);
    // Scheduled notifications are persisted by Capacitor and restored by Android. Rebuilding them
    // here couples a native notification operation to PIN/biometric authentication and can keep the
    // app locked (or terminate the native process on affected devices) after a successful login.
    // Reminder changes and backup restores already reschedule explicitly at their mutation points.
    this.locked.set(false);
  }

  private async purgeExpiredContacts(
    contacts: readonly PrivateContact[],
  ): Promise<readonly PrivateContact[]> {
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    const expiredIds = new Set(
      contacts
        .filter((contact) => {
          if (!contact.deletedAt) return false;
          const deletedAt = Date.parse(contact.deletedAt);
          return Number.isFinite(deletedAt) && deletedAt <= cutoff;
        })
        .map((contact) => contact.id),
    );
    await Promise.all([...expiredIds].map((id) => this.database.remove('contact', id)));
    return contacts.filter((contact) => !expiredIds.has(contact.id));
  }

  private async purgeExpiredMessages(
    messages: readonly SavedMessage[],
  ): Promise<readonly SavedMessage[]> {
    const now = Date.now();
    const expiredIds = new Set(
      messages
        .filter((message) => {
          if (!message.expiresAt) return false;
          const expiresAt = Date.parse(message.expiresAt);
          return Number.isFinite(expiresAt) && expiresAt <= now;
        })
        .map((message) => message.id),
    );
    await Promise.all([...expiredIds].map((id) => this.database.remove('message', id)));
    return messages.filter((message) => !expiredIds.has(message.id));
  }

  lockAndClear(): void {
    this.contacts.set([]);
    this.messages.set([]);
    this.taggedNumbers.set([]);
    this.locked.set(true);
  }

  private async initialize(): Promise<void> {
    try {
      const settings = await this.database.list<AppSettings & { readonly id: string }>('settings');
      const storedSettings = settings[0];
      if (!storedSettings) this.native.disableBiometric();
      this.settings.set({ ...DEFAULT_SETTINGS, ...(storedSettings ?? {}) });
      this.themeService.apply(this.settings().theme);
      this.native.setScreenshotProtection(this.settings().screenshotProtection);
      if (this.settings().pinEnabled) this.locked.set(true);
      else await this.unlockSensitiveData();
    } catch {
      this.storageError.set(true);
    } finally {
      this.loading.set(false);
      const schedule =
        globalThis.requestAnimationFrame ??
        ((callback: FrameRequestCallback) => {
          callback(0);
          return 0;
        });
      schedule(() => this.themeService.hideNativeSplash());
    }
  }
}
