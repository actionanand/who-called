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

const DEFAULT_SETTINGS: AppSettings & { readonly id: string } = {
  id: 'primary',
  theme: 'automatic',
  defaultCountry: 'India',
  defaultCallingCode: '+91',
  recentActivityEnabled: true,
  whatsappBusinessFallback: true,
};

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly database = inject(LOCAL_RECORD_REPOSITORY);
  private readonly themeService = inject(ThemeService);

  readonly contacts = signal<readonly PrivateContact[]>([]);
  readonly messages = signal<readonly SavedMessage[]>([]);
  readonly taggedNumbers = signal<readonly TaggedNumber[]>([]);
  readonly settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly loading = signal(true);
  readonly storageError = signal(false);
  readonly pendingSharedText = signal('');
  readonly quickActionsOpen = signal(false);
  readonly favoriteContacts = computed(() => this.contacts().filter((contact) => contact.favorite));
  readonly recentContacts = computed(() =>
    [...this.contacts()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 4),
  );

  constructor() {
    void this.initialize();
  }

  async addContact(contact: PrivateContact): Promise<void> {
    await this.database.put('contact', contact);
    this.contacts.update((contacts) => [contact, ...contacts]);
  }

  async removeContact(id: string): Promise<void> {
    await this.database.remove('contact', id);
    this.contacts.update((contacts) => contacts.filter((contact) => contact.id !== id));
  }

  async addMessage(message: SavedMessage): Promise<void> {
    await this.database.put('message', message);
    this.messages.update((messages) => [message, ...messages]);
  }

  async removeMessage(id: string): Promise<void> {
    await this.database.remove('message', id);
    this.messages.update((messages) => messages.filter((message) => message.id !== id));
  }

  async addTaggedNumber(taggedNumber: TaggedNumber): Promise<void> {
    await this.database.put('tagged-number', taggedNumber);
    this.taggedNumbers.update((numbers) => [taggedNumber, ...numbers]);
  }

  async removeTaggedNumber(id: string): Promise<void> {
    await this.database.remove('tagged-number', id);
    this.taggedNumbers.update((numbers) => numbers.filter((number) => number.id !== id));
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    const settings = { ...this.settings(), theme };
    this.settings.set(settings);
    this.themeService.apply(theme);
    await this.database.put('settings', { id: 'primary', ...settings });
  }

  private async initialize(): Promise<void> {
    try {
      const [contacts, messages, taggedNumbers, settings] = await Promise.all([
        this.database.list<PrivateContact>('contact'),
        this.database.list<SavedMessage>('message'),
        this.database.list<TaggedNumber>('tagged-number'),
        this.database.list<AppSettings & { readonly id: string }>('settings'),
      ]);
      this.contacts.set(contacts);
      this.messages.set(messages);
      this.taggedNumbers.set(taggedNumbers);
      this.settings.set(settings[0] ?? DEFAULT_SETTINGS);
      this.themeService.apply(this.settings().theme);
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
