import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ContactEmail,
  ContactPhone,
  ContactSocial,
  PrivateContact,
} from '../../core/models/app.models';
import { AppStore } from '../../core/services/app-store.service';
import { CallService } from '../../core/services/call.service';
import { FeedbackService } from '../../core/services/feedback.service';
import {
  NativeIntegrationService,
  WhatsAppPackage,
} from '../../core/services/native-integration.service';
import { digitsOnly, formatIndianPhone, normalizePhone } from '../../core/utils/phone-number';
import { contactDisplayName } from '../../core/utils/contact-privacy';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';
import { WhatsAppAppChooser } from '../../shared/components/whatsapp-app-chooser';

const PHONE_TYPES: readonly SelectPickerOption[] = [
  { value: 'Mobile', label: 'Mobile' },
  { value: 'Work', label: 'Work' },
  { value: 'Home', label: 'Home' },
  { value: 'Personal', label: 'Personal' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Other', label: 'Other' },
];

const EMAIL_TYPES: readonly SelectPickerOption[] = [
  { value: 'Personal', label: 'Personal' },
  { value: 'Work', label: 'Work' },
  { value: 'Other', label: 'Other' },
];

const SOCIAL_TYPES: readonly SelectPickerOption[] = [
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'X', label: 'X / Twitter' },
  { value: 'Website', label: 'Website' },
  { value: 'Other', label: 'Other' },
];

const DOB_MODES: readonly SelectPickerOption[] = [
  { value: 'none', label: 'Do not save a birthday' },
  { value: 'month-day', label: 'Month and day only', detail: 'Age will not be calculated' },
  { value: 'full', label: 'Full date of birth', detail: 'Shows the current age' },
];

type PhoneAction = 'call' | 'whatsapp';

interface PhoneChoiceSheet {
  readonly mode: PhoneAction;
  readonly phones: readonly ContactPhone[];
}

@Component({
  selector: 'app-contacts',
  imports: [AppIcon, ReactiveFormsModule, RouterLink, SelectPicker, WhatsAppAppChooser],
  templateUrl: './contacts.html',
  styleUrl: './contacts.scss',
})
export class Contacts {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  private readonly document = inject(DOCUMENT);
  private readonly native = inject(NativeIntegrationService);
  private readonly calls = inject(CallService);
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly editingContact = signal<PrivateContact | null>(null);
  protected readonly search = signal('');
  protected readonly saving = signal(false);
  protected readonly revealedNames = signal<ReadonlySet<string>>(new Set());
  protected readonly phoneChoice = signal<PhoneChoiceSheet | null>(null);
  protected readonly whatsappChoice = signal<{
    readonly phone: ContactPhone;
    readonly packages: readonly WhatsAppPackage[];
  } | null>(null);
  protected readonly selectedContact = signal<PrivateContact | null>(null);
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly trashView = signal(false);
  protected readonly selectionMode = computed(() => this.selectedIds().size > 0);
  protected readonly selectedContacts = computed(() => {
    const ids = this.selectedIds();
    return this.store.contacts().filter((contact) => ids.has(contact.id));
  });
  protected readonly formatPhone = formatIndianPhone;
  protected readonly phoneTypes = PHONE_TYPES;
  protected readonly emailTypes = EMAIL_TYPES;
  protected readonly socialTypes = SOCIAL_TYPES;
  protected readonly dobModes = DOB_MODES;

  protected readonly filteredContacts = computed(() => {
    const contacts = this.trashView() ? this.store.trashedContacts() : this.store.visibleContacts();
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return contacts;
    const phoneQuery = digitsOnly(query);
    return contacts.filter((contact) => {
      const phoneValues = (contact.phones ?? []).map((phone) => phone.number).join(' ');
      const emailValues = (contact.emails ?? []).map((email) => email.value).join(' ');
      const socialValues = (contact.socialLinks ?? []).map((link) => link.url).join(' ');
      const copy =
        `${contact.name} ${contact.company} ${contact.phone} ${phoneValues} ${emailValues} ${socialValues} ${contact.notes}`.toLocaleLowerCase();
      return (
        copy.includes(query) ||
        (phoneQuery.length > 0 &&
          digitsOnly(`${contact.phone} ${phoneValues}`).includes(phoneQuery))
      );
    });
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    company: ['', Validators.maxLength(100)],
    notes: ['', Validators.maxLength(2000)],
    favorite: false,
    hidden: false,
    phones: this.formBuilder.array([this.createPhone()]),
    emails: this.formBuilder.array([this.createEmail()]),
    socialLinks: this.formBuilder.array([this.createSocial()]),
    dobMode: 'none',
    dobMonth: 1,
    dobDay: 1,
    dobFull: '',
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timeout of this.revealTimeouts.values()) clearTimeout(timeout);
      this.cancelHold();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      this.trashView.set(parameters.has('trash'));
      this.clearSelection();
      if (parameters.has('add')) this.openEditor();
    });
  }

  private readonly revealTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  protected get phones() {
    return this.form.controls.phones;
  }

  protected get emails() {
    return this.form.controls.emails;
  }

  protected get socialLinks() {
    return this.form.controls.socialLinks;
  }

  protected openEditor(contact?: PrivateContact): void {
    const draft = contact ? null : this.store.pendingContactDraft();
    this.editingContact.set(contact ?? null);
    this.form.controls.phones.clear();
    this.form.controls.emails.clear();
    this.form.controls.socialLinks.clear();

    const phones = contact?.phones?.length
      ? contact.phones
      : contact
        ? [
            {
              id: crypto.randomUUID(),
              type: 'Mobile',
              callingCode: '+91',
              number: contact.phone,
              normalizedNumber: contact.normalizedPhone,
              whatsappEnabled: contact.whatsappEnabled,
            },
          ]
        : [];
    for (const phone of phones) this.phones.push(this.createPhone(phone));
    if (!this.phones.length) this.phones.push(this.createPhone());

    for (const email of contact?.emails ?? []) this.emails.push(this.createEmail(email));
    if (!this.emails.length) this.emails.push(this.createEmail());
    for (const social of contact?.socialLinks ?? [])
      this.socialLinks.push(this.createSocial(social));
    if (!this.socialLinks.length) this.socialLinks.push(this.createSocial());

    const birthDate = contact?.birthDate;
    this.form.patchValue({
      name: contact?.name ?? '',
      company: contact?.company ?? '',
      notes:
        contact?.notes ??
        (draft ? [`Tag: ${draft.tag}`, draft.note].filter(Boolean).join('\n') : ''),
      favorite: contact?.favorite ?? false,
      hidden: contact?.hidden ?? false,
      dobMode: birthDate?.mode ?? 'none',
      dobMonth: birthDate?.month ?? 1,
      dobDay: birthDate?.day ?? 1,
      dobFull:
        birthDate?.mode === 'full' && birthDate.year
          ? `${birthDate.year}-${String(birthDate.month).padStart(2, '0')}-${String(birthDate.day).padStart(2, '0')}`
          : '',
    });
    this.editorOpen.set(true);
    if (draft) this.phones.at(0).controls.number.setValue(draft.phone);
  }

  protected closeEditor(): void {
    if (!this.editingContact() && this.store.pendingContactDraft()) {
      this.store.pendingContactDraft.set(null);
    }
    this.editorOpen.set(false);
  }

  protected toggleFavorite(): void {
    this.form.controls.favorite.setValue(!this.form.controls.favorite.value);
  }

  protected toggleHidden(): void {
    this.form.controls.hidden.setValue(!this.form.controls.hidden.value);
  }

  protected addPhone(): void {
    this.phones.push(this.createPhone());
  }

  protected addEmail(): void {
    this.emails.push(this.createEmail());
  }

  protected addSocial(): void {
    this.socialLinks.push(this.createSocial());
  }

  protected removePhone(index: number): void {
    if (this.phones.length > 1) this.phones.removeAt(index);
  }

  protected removeEmail(index: number): void {
    this.emails.removeAt(index);
  }

  protected removeSocial(index: number): void {
    this.socialLinks.removeAt(index);
  }

  protected setPickerValue(control: FormControl<string>, value: string): void {
    control.setValue(value);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.feedback.notify('Check the highlighted contact fields');
      this.scrollToFirstInvalidField();
      return;
    }
    const value = this.form.getRawValue();
    const usablePhones = value.phones.filter((phone) => digitsOnly(phone.number).length >= 6);
    if (!usablePhones.length) {
      this.phones.at(0).controls.number.setErrors({ required: true });
      this.feedback.notify('Add at least one valid phone number');
      this.scrollToFirstInvalidField();
      return;
    }
    this.saving.set(true);
    try {
      const phones: readonly ContactPhone[] = usablePhones.map((phone) => ({
        id: phone.id || crypto.randomUUID(),
        type: phone.type,
        callingCode: phone.callingCode,
        number: digitsOnly(phone.number),
        normalizedNumber: normalizePhone(phone.callingCode, phone.number),
        whatsappEnabled: phone.whatsappEnabled,
      }));
      const emails: readonly ContactEmail[] = value.emails
        .filter((email) => email.value.trim())
        .map((email) => ({
          id: email.id || crypto.randomUUID(),
          type: email.type,
          value: email.value.trim(),
        }));
      const socialLinks: readonly ContactSocial[] = value.socialLinks
        .filter((link) => link.url.trim())
        .map((link) => ({
          id: link.id || crypto.randomUUID(),
          platform: link.platform,
          url: link.url.trim(),
        }));
      const primary = phones[0];
      const existing = this.editingContact();
      const now = new Date().toISOString();
      const fullDate = value.dobFull ? new Date(`${value.dobFull}T00:00:00`) : null;
      const contact: PrivateContact = {
        id: existing?.id ?? crypto.randomUUID(),
        name: value.name.trim(),
        company: value.company.trim(),
        phone: primary.number,
        normalizedPhone: primary.normalizedNumber,
        whatsappEnabled: primary.whatsappEnabled,
        favorite: value.favorite,
        hidden: value.hidden,
        notes: value.notes.trim(),
        phones,
        emails,
        socialLinks,
        birthDate:
          value.dobMode === 'full' && fullDate && !Number.isNaN(fullDate.getTime())
            ? {
                mode: 'full',
                year: fullDate.getFullYear(),
                month: fullDate.getMonth() + 1,
                day: fullDate.getDate(),
              }
            : value.dobMode === 'month-day'
              ? { mode: 'month-day', month: value.dobMonth, day: value.dobDay }
              : undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) await this.store.updateContact(contact);
      else {
        await this.store.addContact(contact);
        const draft = this.store.pendingContactDraft();
        if (draft?.taggedNumberId) {
          await this.store.removeTaggedNumber(draft.taggedNumberId);
        }
        this.store.pendingContactDraft.set(null);
      }
      this.closeEditor();
      this.feedback.notify(existing ? 'Contact updated' : 'Contact saved');
    } catch {
      this.feedback.notify('Contact could not be saved. Please try again');
    } finally {
      this.saving.set(false);
    }
  }

  protected toggleSelection(id: string): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  protected startHold(contact: PrivateContact, event: PointerEvent): void {
    if (event.pointerType !== 'touch' || this.isInteractiveTarget(event.target)) return;
    this.cancelHold();
    this.holdTimer = setTimeout(() => {
      this.toggleSelection(contact.id);
      navigator.vibrate?.(25);
    }, 550);
  }

  protected cancelHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  protected editSelection(): void {
    if (this.trashView()) return;
    const contact = this.selectedContacts()[0];
    if (this.selectedIds().size !== 1 || !contact) return;
    this.clearSelection();
    this.openEditor(contact);
  }

  protected async deleteSelection(): Promise<void> {
    const contacts = this.selectedContacts();
    if (!contacts.length) return;
    const permanently = this.trashView();
    const confirmed = await this.feedback.confirm({
      title: permanently
        ? contacts.length === 1
          ? 'Delete contact permanently?'
          : 'Delete contacts permanently?'
        : contacts.length === 1
          ? 'Move contact to Trash?'
          : 'Move contacts to Trash?',
      message: permanently
        ? 'This cannot be undone. Device call history will not be deleted.'
        : 'You can restore them from Trash for the next 30 days.',
      confirmLabel: permanently
        ? contacts.length === 1
          ? 'Delete permanently'
          : `Delete ${contacts.length} permanently`
        : contacts.length === 1
          ? 'Move to Trash'
          : `Move ${contacts.length} to Trash`,
    });
    if (!confirmed) return;
    for (const contact of contacts) {
      if (permanently) await this.store.removeContact(contact.id);
      else await this.store.trashContact(contact.id);
    }
    this.clearSelection();
    this.feedback.notify(
      permanently
        ? contacts.length === 1
          ? `${contacts[0].name} permanently deleted`
          : `${contacts.length} contacts permanently deleted`
        : contacts.length === 1
          ? `${contacts[0].name} moved to Trash`
          : `${contacts.length} contacts moved to Trash`,
    );
  }

  protected async restoreSelection(): Promise<void> {
    const contacts = this.selectedContacts();
    for (const contact of contacts) await this.store.restoreContact(contact.id);
    this.clearSelection();
    this.feedback.notify(
      contacts.length === 1
        ? `${contacts[0].name} restored`
        : `${contacts.length} contacts restored`,
    );
  }

  protected async restoreAll(): Promise<void> {
    const contacts = this.store.trashedContacts();
    if (!contacts.length) return;
    for (const contact of contacts) await this.store.restoreContact(contact.id);
    this.clearSelection();
    this.feedback.notify(`${contacts.length} contacts restored`);
  }

  protected async emptyTrash(): Promise<void> {
    const contacts = this.store.trashedContacts();
    if (!contacts.length) return;
    const confirmed = await this.feedback.confirm({
      title: 'Empty Trash?',
      message: `${contacts.length} contacts will be deleted permanently. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
    });
    if (!confirmed) return;
    for (const contact of contacts) await this.store.removeContact(contact.id);
    this.clearSelection();
    this.feedback.notify('Trash emptied');
  }

  protected daysRemaining(contact: PrivateContact): number {
    if (!contact.deletedAt) return 30;
    const elapsed = Date.now() - Date.parse(contact.deletedAt);
    return Math.max(1, 30 - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  }

  protected displayName(contact: PrivateContact): string {
    return this.revealedNames().has(contact.id) ? contact.name : contactDisplayName(contact);
  }

  protected revealHiddenName(contact: PrivateContact): void {
    if (!contact.hidden) return;
    const existingTimeout = this.revealTimeouts.get(contact.id);
    if (existingTimeout) clearTimeout(existingTimeout);
    this.revealedNames.update((ids) => new Set([...ids, contact.id]));
    this.revealTimeouts.set(
      contact.id,
      setTimeout(() => {
        this.revealedNames.update((ids) => {
          const next = new Set(ids);
          next.delete(contact.id);
          return next;
        });
        this.revealTimeouts.delete(contact.id);
      }, 5000),
    );
  }

  protected openPhoneAction(contact: PrivateContact, mode: PhoneAction): void {
    this.closeContactDetails();
    const phones =
      mode === 'whatsapp'
        ? this.contactPhones(contact).filter((phone) => phone.whatsappEnabled)
        : this.contactPhones(contact);
    if (!phones.length) {
      this.feedback.notify(
        mode === 'whatsapp'
          ? 'No WhatsApp-enabled number saved for this contact'
          : 'No phone number saved for this contact',
      );
      return;
    }
    if (phones.length === 1) {
      this.openPhone(phones[0], mode);
      return;
    }
    this.phoneChoice.set({ mode, phones });
  }

  protected closePhoneChoice(): void {
    this.phoneChoice.set(null);
  }

  protected choosePhone(phone: ContactPhone): void {
    const choice = this.phoneChoice();
    if (!choice) return;
    this.closePhoneChoice();
    this.openPhone(phone, choice.mode);
  }

  protected openContactDetails(contact: PrivateContact): void {
    this.selectedContact.set(contact);
  }

  protected closeContactDetails(): void {
    this.selectedContact.set(null);
  }

  protected editContact(contact: PrivateContact): void {
    this.closeContactDetails();
    this.openEditor(contact);
  }

  protected contactPhones(contact: PrivateContact): readonly ContactPhone[] {
    return contact.phones?.length
      ? contact.phones
      : [
          {
            id: contact.id,
            type: 'Mobile',
            callingCode: '+91',
            number: contact.phone,
            normalizedNumber: contact.normalizedPhone,
            whatsappEnabled: contact.whatsappEnabled,
          },
        ];
  }

  protected whatsappPhones(contact: PrivateContact): readonly ContactPhone[] {
    return this.contactPhones(contact).filter((phone) => phone.whatsappEnabled);
  }

  protected phoneLabel(phone: ContactPhone): string {
    return `${phone.callingCode} ${this.formatPhone(phone.number)}`.trim();
  }

  protected birthdayLabel(contact: PrivateContact): string {
    const birthDate = contact.birthDate;
    if (!birthDate) return '';
    const month = String(birthDate.month).padStart(2, '0');
    const day = String(birthDate.day).padStart(2, '0');
    if (birthDate.mode === 'full' && birthDate.year) return `${day}/${month}/${birthDate.year}`;
    return `${day}/${month}`;
  }

  protected birthdayDetail(contact: PrivateContact): string {
    const currentAge = this.age(contact);
    if (currentAge === null) return 'Month and date saved';
    return `${currentAge} years old`;
  }

  protected age(contact: PrivateContact): number | null {
    const birthDate = contact.birthDate;
    if (birthDate?.mode !== 'full' || !birthDate.year) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.year;
    if (
      today.getMonth() + 1 < birthDate.month ||
      (today.getMonth() + 1 === birthDate.month && today.getDate() < birthDate.day)
    ) {
      age -= 1;
    }
    return Math.max(0, age);
  }

  private createPhone(phone?: ContactPhone) {
    return this.formBuilder.nonNullable.group({
      id: phone?.id ?? crypto.randomUUID(),
      type: phone?.type ?? 'Mobile',
      callingCode: phone?.callingCode ?? '+91',
      number: [phone?.number ?? '', [Validators.required, Validators.minLength(6)]],
      whatsappEnabled: phone?.whatsappEnabled ?? true,
    });
  }

  private openPhone(phone: ContactPhone, mode: PhoneAction): void {
    const normalized = phone.normalizedNumber;
    if (mode === 'whatsapp') {
      this.openWhatsApp(phone);
      return;
    }
    void this.calls.confirmAndCall(normalized, this.phoneLabel(phone));
  }

  protected closeWhatsAppChoice(): void {
    this.whatsappChoice.set(null);
  }

  protected openWhatsAppIn(packageName: WhatsAppPackage): void {
    const choice = this.whatsappChoice();
    if (!choice) return;
    this.closeWhatsAppChoice();
    this.native.openWhatsAppIn(choice.phone.normalizedNumber.slice(1), '', packageName);
  }

  private openWhatsApp(phone: ContactPhone): void {
    const number = phone.normalizedNumber.slice(1);
    const packages = this.native.availableWhatsAppApps();
    if (packages.length > 1) {
      this.whatsappChoice.set({ phone, packages });
      return;
    }
    if (packages.length === 1 && this.native.openWhatsAppIn(number, '', packages[0])) return;
    if (this.native.openWhatsApp(number, '', this.store.settings().whatsappBusinessFallback))
      return;
    this.document.defaultView?.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
  }

  private createEmail(email?: ContactEmail) {
    return this.formBuilder.nonNullable.group({
      id: email?.id ?? crypto.randomUUID(),
      type: email?.type ?? 'Personal',
      value: [email?.value ?? '', Validators.email],
    });
  }

  private createSocial(link?: ContactSocial) {
    return this.formBuilder.nonNullable.group({
      id: link?.id ?? crypto.randomUUID(),
      platform: link?.platform ?? 'LinkedIn',
      url: [link?.url ?? '', Validators.pattern(/^https?:\/\/.+/i)],
    });
  }

  private scrollToFirstInvalidField(): void {
    setTimeout(() => {
      const invalid = this.document.querySelector<HTMLElement>(
        '.editor input.ng-invalid, .editor textarea.ng-invalid',
      );
      invalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      invalid?.focus();
    });
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('button, a, input, textarea'));
  }
}
