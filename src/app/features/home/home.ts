import { Component, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ContactPhone,
  DeviceCallHistoryEntry,
  PrivateContact,
  TaggedNumber,
} from '../../core/models/app.models';
import { SORTED_COUNTRY_CODES } from '../../core/data/country-codes';
import { CallService } from '../../core/services/call.service';
import { AppStore } from '../../core/services/app-store.service';
import {
  NativeIntegrationService,
  WhatsAppPackage,
} from '../../core/services/native-integration.service';
import { contactDisplayName } from '../../core/utils/contact-privacy';
import { digitsOnly, formatIndianPhone, normalizePhone } from '../../core/utils/phone-number';
import { FeedbackService } from '../../core/services/feedback.service';
import { environment } from '../../../environments/environment';
import { AppIcon } from '../../shared/components/app-icon';
import { WhatsAppAppChooser } from '../../shared/components/whatsapp-app-chooser';

interface HomeCallHistoryEntry extends DeviceCallHistoryEntry {
  readonly contact?: PrivateContact;
  readonly taggedNumber?: TaggedNumber;
  readonly displayName: string;
}

const CALLING_CODES_BY_LENGTH = [
  ...new Set(
    SORTED_COUNTRY_CODES.map((country) => country.callingCode).filter((code) => code.length > 0),
  ),
].sort((left, right) => right.length - left.length);

@Component({
  selector: 'app-home',
  imports: [AppIcon, RouterLink, WhatsAppAppChooser],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);
  private readonly router = inject(Router);
  private readonly calls = inject(CallService);
  private readonly document = inject(DOCUMENT);
  private readonly feedback = inject(FeedbackService);
  protected readonly callHistory = signal<readonly DeviceCallHistoryEntry[]>([]);
  protected readonly callHistoryLoading = signal(false);
  protected readonly callHistoryError = signal('');
  protected readonly callHistorySupported = this.native.deviceCallHistorySupported();
  protected readonly phoneAction = signal<{
    readonly display: string;
    readonly number: string;
  } | null>(null);
  protected readonly whatsappChoice = signal<{
    readonly number: string;
    readonly packages: readonly WhatsAppPackage[];
  } | null>(null);
  protected readonly saveTarget = signal<HomeCallHistoryEntry | null>(null);
  protected readonly removeTagOnSave = signal(true);
  protected readonly contactPickerTarget = signal<HomeCallHistoryEntry | null>(null);
  protected readonly selectedContact = signal<PrivateContact | null>(null);
  protected readonly selectedTaggedNumber = signal<TaggedNumber | null>(null);
  protected readonly contactPickerSearch = signal('');
  protected readonly contactPickerResults = computed<readonly PrivateContact[]>(() => {
    const query = this.contactPickerSearch().trim().toLocaleLowerCase();
    const contacts = this.store.activeContacts();
    if (!query) return contacts;
    const phoneQuery = digitsOnly(query);
    return contacts.filter((contact) => {
      const numbers = this.contactNumbers(contact).join(' ');
      const copy = `${contact.name} ${contact.company} ${numbers}`.toLocaleLowerCase();
      return (
        copy.includes(query) || (phoneQuery.length > 0 && digitsOnly(numbers).includes(phoneQuery))
      );
    });
  });
  private callHistoryRequested = false;

  protected readonly enrichedCallHistory = computed<readonly HomeCallHistoryEntry[]>(() =>
    this.callHistory()
      .slice(0, environment.callHistoryLimit)
      .map((call) => {
        const key = this.phoneKey(call.number);
        const contact = this.store
          .activeContacts()
          .find((entry) =>
            this.contactNumbers(entry).some((number) => this.phoneKey(number) === key),
          );
        const taggedNumber = this.store
          .taggedNumbers()
          .find((entry) => this.phoneKey(entry.normalizedPhone || entry.phone) === key);
        return {
          ...call,
          contact,
          taggedNumber,
          displayName:
            (contact ? contactDisplayName(contact) : '') ||
            call.cachedName ||
            this.displayPhone(call.number),
        };
      }),
  );

  constructor() {
    effect(() => {
      if (
        this.store.loading() ||
        !this.store.settings().deviceCallHistoryEnabled ||
        !this.callHistorySupported ||
        this.callHistoryRequested
      ) {
        return;
      }
      this.callHistoryRequested = true;
      void this.loadCallHistory();
    });
  }

  protected async enableCallHistory(): Promise<void> {
    await this.store.updateSettings({ deviceCallHistoryEnabled: true });
    this.callHistoryRequested = true;
    await this.loadCallHistory();
  }

  protected async loadCallHistory(): Promise<void> {
    this.callHistoryLoading.set(true);
    this.callHistoryError.set('');
    try {
      this.callHistory.set(await this.native.requestDeviceCallHistory());
    } catch (error: unknown) {
      this.callHistoryError.set(
        error instanceof Error ? error.message : 'Phone call history could not be loaded.',
      );
    } finally {
      this.callHistoryLoading.set(false);
    }
  }

  protected saveAsContact(call: HomeCallHistoryEntry): void {
    this.removeTagOnSave.set(true);
    this.saveTarget.set(call);
  }

  protected closeSaveChoice(): void {
    this.saveTarget.set(null);
  }

  protected saveAsNewContact(): void {
    const call = this.saveTarget();
    if (!call) return;
    this.saveTarget.set(null);
    const draftPhone = this.contactDraftPhone(call.number);
    this.store.pendingContactDraft.set({
      taggedNumberId: call.taggedNumber?.id,
      removeFromTaggedList: this.removeTagOnSave(),
      callingCode: draftPhone.callingCode,
      phone: draftPhone.phone,
      note: call.taggedNumber?.note ?? '',
      tag: call.taggedNumber?.tag ?? '',
    });
    void this.router.navigate(['/contacts'], { queryParams: { add: 1 } });
  }

  protected chooseExistingContact(): void {
    const call = this.saveTarget();
    if (!call) return;
    this.saveTarget.set(null);
    this.contactPickerSearch.set('');
    this.contactPickerTarget.set(call);
  }

  protected closeContactPicker(): void {
    this.contactPickerTarget.set(null);
  }

  protected async appendNumberToContact(contact: PrivateContact): Promise<void> {
    const call = this.contactPickerTarget();
    if (!call) return;
    const normalized = digitsOnly(call.number)
      ? call.number.trim().startsWith('+')
        ? `+${digitsOnly(call.number)}`
        : normalizePhone(this.store.settings().defaultCallingCode, call.number)
      : '';
    if (!normalized) {
      this.feedback.notify('This call has no dialable number to save');
      return;
    }
    const existingPhones = this.contactPhones(contact);
    if (existingPhones.some((phone) => phone.normalizedNumber === normalized)) {
      this.contactPickerTarget.set(null);
      if (call.taggedNumber && this.removeTagOnSave()) {
        try {
          await this.store.removeTaggedNumber(call.taggedNumber.id);
          this.feedback.notify(
            `Tag removed; ${contactDisplayName(contact)} already has this number`,
          );
        } catch {
          this.feedback.notify(`${contactDisplayName(contact)} has this number; the tag was kept`);
        }
      } else {
        this.feedback.notify(`${contactDisplayName(contact)} already has this number`);
      }
      return;
    }
    const callingCode =
      CALLING_CODES_BY_LENGTH.find((code) => normalized.startsWith(code)) ??
      this.store.settings().defaultCallingCode;
    const newPhone: ContactPhone = {
      id: crypto.randomUUID(),
      type: 'Mobile',
      callingCode,
      number: normalized.startsWith(callingCode)
        ? normalized.slice(callingCode.length)
        : digitsOnly(normalized),
      normalizedNumber: normalized,
      whatsappEnabled: true,
    };
    const updated: PrivateContact = {
      ...contact,
      phones: [...existingPhones, newPhone],
      updatedAt: new Date().toISOString(),
    };
    this.contactPickerTarget.set(null);
    try {
      await this.store.updateContact(updated);
    } catch {
      this.feedback.notify('The number could not be saved to this contact');
      return;
    }
    if (call.taggedNumber && this.removeTagOnSave()) {
      try {
        await this.store.removeTaggedNumber(call.taggedNumber.id);
      } catch {
        this.feedback.notify(
          `Number added to ${contactDisplayName(contact)}, but the tag could not be removed`,
        );
        return;
      }
    }
    this.feedback.notify(`Number added to ${contactDisplayName(contact)}`);
  }

  protected contactPhones(contact: PrivateContact): readonly ContactPhone[] {
    return contact.phones?.length
      ? contact.phones
      : [
          {
            id: contact.id,
            type: 'Mobile',
            callingCode: this.store.settings().defaultCallingCode,
            number: contact.phone,
            normalizedNumber: contact.normalizedPhone || contact.phone,
            whatsappEnabled: contact.whatsappEnabled,
          },
        ];
  }

  protected tagCall(call: HomeCallHistoryEntry): void {
    this.store.pendingTaggedNumber.set(call.number);
    void this.router.navigate(['/tagged'], { queryParams: { add: 1 } });
  }

  protected openContactDetails(contact: PrivateContact): void {
    this.selectedContact.set(contact);
  }

  protected closeContactDetails(): void {
    this.selectedContact.set(null);
  }

  protected openTaggedDetails(taggedNumber: TaggedNumber): void {
    this.selectedTaggedNumber.set(taggedNumber);
  }

  protected closeTaggedDetails(): void {
    this.selectedTaggedNumber.set(null);
  }

  protected callContactPhone(contact: PrivateContact, phone: ContactPhone): void {
    this.closeContactDetails();
    this.phoneAction.set({
      display: `${contactDisplayName(contact)} · ${phone.type}`,
      number: phone.normalizedNumber || normalizePhone(phone.callingCode, phone.number),
    });
  }

  protected whatsappContactPhone(phone: ContactPhone): void {
    this.closeContactDetails();
    this.openWhatsAppNumber(
      phone.normalizedNumber || normalizePhone(phone.callingCode, phone.number),
    );
  }

  protected callTaggedNumber(taggedNumber: TaggedNumber): void {
    this.closeTaggedDetails();
    this.phoneAction.set({
      display: taggedNumber.name || taggedNumber.tag,
      number: taggedNumber.normalizedPhone,
    });
  }

  protected whatsappTaggedNumber(taggedNumber: TaggedNumber): void {
    this.closeTaggedDetails();
    this.openWhatsAppNumber(taggedNumber.normalizedPhone);
  }

  protected callFromHistory(call: HomeCallHistoryEntry): void {
    if (!this.hasDialableNumber(call.number)) return;
    this.phoneAction.set({ display: call.displayName, number: call.number });
  }

  protected closePhoneAction(): void {
    this.phoneAction.set(null);
  }

  protected confirmPhoneCall(): void {
    const action = this.phoneAction();
    if (!action) return;
    this.phoneAction.set(null);
    this.calls.placeCall(action.number);
  }

  protected openPhoneWhatsApp(): void {
    const action = this.phoneAction();
    if (!action) return;
    const number = digitsOnly(action.number);
    if (!number) return;
    this.phoneAction.set(null);
    this.openWhatsAppNumber(number);
  }

  private openWhatsAppNumber(phone: string): void {
    const number = digitsOnly(phone);
    if (!number) return;
    const packages = this.native.availableWhatsAppApps();
    if (packages.length > 1) {
      this.whatsappChoice.set({ number, packages });
      return;
    }
    if (packages.length === 1 && this.native.openWhatsAppIn(number, '', packages[0])) return;
    if (this.native.openWhatsApp(number, '', this.store.settings().whatsappBusinessFallback)) {
      return;
    }
    this.document.defaultView?.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
  }

  protected openWhatsAppIn(packageName: WhatsAppPackage): void {
    const choice = this.whatsappChoice();
    if (!choice) return;
    this.whatsappChoice.set(null);
    this.native.openWhatsAppIn(choice.number, '', packageName);
  }

  protected callIcon(call: DeviceCallHistoryEntry): string {
    if (call.type === 'outgoing') return 'phone-outgoing';
    if (['missed', 'rejected', 'blocked'].includes(call.type)) return 'phone-missed';
    return 'phone-incoming';
  }

  protected callTypeLabel(call: DeviceCallHistoryEntry): string {
    const labels: Readonly<Record<DeviceCallHistoryEntry['type'], string>> = {
      incoming: 'Incoming',
      outgoing: 'Outgoing',
      missed: 'Missed',
      rejected: 'Rejected',
      blocked: 'Blocked',
      voicemail: 'Voicemail',
      unknown: 'Call',
    };
    return labels[call.type];
  }

  protected callTime(timestamp: number): string {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  protected duration(seconds: number): string {
    if (seconds <= 0) return '';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  protected displayPhone(number: string): string {
    const digits = digitsOnly(number);
    if (!digits) return 'Private number';
    return number.startsWith('+') ? `+${digits}` : digits;
  }

  protected hasDialableNumber(number: string): boolean {
    return digitsOnly(number).length >= 6;
  }

  protected contactPhoneLabel(phone: ContactPhone): string {
    return `${phone.callingCode} ${formatIndianPhone(phone.number)}`.trim();
  }

  protected displayContactName(contact: PrivateContact): string {
    return contactDisplayName(contact);
  }

  protected birthdayLabel(contact: PrivateContact): string {
    const birthDate = contact.birthDate;
    if (!birthDate) return '';
    const day = String(birthDate.day).padStart(2, '0');
    const month = String(birthDate.month).padStart(2, '0');
    return birthDate.mode === 'full' && birthDate.year
      ? `${day}/${month}/${birthDate.year}`
      : `${day}/${month}`;
  }

  protected birthdayDetail(contact: PrivateContact): string {
    const birthDate = contact.birthDate;
    if (birthDate?.mode !== 'full' || !birthDate.year) return 'Month and date saved';
    const today = new Date();
    let age = today.getFullYear() - birthDate.year;
    if (
      today.getMonth() + 1 < birthDate.month ||
      (today.getMonth() + 1 === birthDate.month && today.getDate() < birthDate.day)
    ) {
      age -= 1;
    }
    return `${Math.max(0, age)} years old`;
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  }

  private phoneKey(number: string): string {
    return digitsOnly(number).slice(-10);
  }

  private contactDraftPhone(number: string): {
    readonly callingCode: string;
    readonly phone: string;
  } {
    const normalized = number.trim().startsWith('+')
      ? `+${digitsOnly(number)}`
      : normalizePhone(this.store.settings().defaultCallingCode, number);
    const callingCode =
      CALLING_CODES_BY_LENGTH.find((code) => normalized.startsWith(code)) ??
      this.store.settings().defaultCallingCode;
    return {
      callingCode,
      phone: normalized.startsWith(callingCode)
        ? normalized.slice(callingCode.length)
        : digitsOnly(number),
    };
  }

  private contactNumbers(contact: PrivateContact): readonly string[] {
    return contact.phones?.length
      ? contact.phones.map((phone) => phone.normalizedNumber || phone.number)
      : [contact.normalizedPhone || contact.phone];
  }
}
