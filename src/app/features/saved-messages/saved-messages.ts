import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SavedMessage } from '../../core/models/app.models';
import { SORTED_COUNTRY_CODES } from '../../core/data/country-codes';
import { AppStore } from '../../core/services/app-store.service';
import { CallService } from '../../core/services/call.service';
import { FeedbackService } from '../../core/services/feedback.service';
import {
  NativeIntegrationService,
  WhatsAppPackage,
} from '../../core/services/native-integration.service';
import {
  MessageDisplayPart,
  MessageFormatKind,
  MessageTextRange,
  messageDisplayParts,
  messageFormatState,
  toggleMessageFormat,
} from '../../core/utils/message-formatting';
import { detectLikelyCode } from '../../core/utils/otp';
import { digitsOnly, normalizePhone } from '../../core/utils/phone-number';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';
import { WhatsAppAppChooser } from '../../shared/components/whatsapp-app-chooser';
import { MessageTextPart } from './message-text-part';

const MESSAGE_CATEGORIES: readonly SelectPickerOption[] = [
  'OTP',
  'Delivery',
  'Booking',
  'Appointment',
  'Payment',
  'Auto Pay (E-Mandate)',
  'Account',
  'Personal',
  'Other',
].map((value) => ({ value, label: value }));

const CALLING_CODES_BY_LENGTH = [
  ...new Set(SORTED_COUNTRY_CODES.map((country) => country.callingCode)),
].sort((left, right) => right.length - left.length);

@Component({
  selector: 'app-saved-messages',
  imports: [AppIcon, MessageTextPart, ReactiveFormsModule, SelectPicker, WhatsAppAppChooser],
  templateUrl: './saved-messages.html',
  styleUrl: './saved-messages.scss',
})
export class SavedMessages {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  private readonly calls = inject(CallService);
  private readonly native = inject(NativeIntegrationService);
  private readonly document = inject(DOCUMENT);
  private readonly messageBody = viewChild<ElementRef<HTMLElement>>('messageBody');
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly detectedCode = signal('');
  protected readonly copied = signal('');
  protected readonly selectedMessage = signal<SavedMessage | null>(null);
  protected readonly selectedRange = signal<MessageTextRange | null>(null);
  protected readonly formattingSaving = signal(false);
  protected readonly phoneAction = signal<{
    readonly display: string;
    readonly normalized: string;
  } | null>(null);
  protected readonly urlAction = signal('');
  protected readonly whatsappChoice = signal<{
    readonly number: string;
    readonly packages: readonly WhatsAppPackage[];
  } | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly categories = MESSAGE_CATEGORIES;
  protected readonly displayParts = computed(() => {
    const message = this.selectedMessage();
    return message ? messageDisplayParts(message.message, message.formats) : [];
  });
  protected readonly selectedFormats = computed(() => {
    const message = this.selectedMessage();
    return message
      ? messageFormatState(message.message.length, message.formats ?? [], this.selectedRange())
      : { bold: false, highlight: false };
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    message: ['', [Validators.required, Validators.maxLength(8000)]],
    category: ['OTP', Validators.required],
    sender: ['', Validators.maxLength(120)],
    favorite: false,
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      if (parameters.has('add')) this.openEditor();
    });
    this.form.controls.message.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.detectedCode.set(detectLikelyCode(message)));
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.saveError.set(''));

    const sharedText = this.store.pendingSharedText();
    if (sharedText) {
      this.store.pendingSharedText.set('');
      this.openEditor();
      this.form.controls.title.setValue('Shared message');
      this.form.controls.message.setValue(sharedText);
    }
  }

  protected openEditor(): void {
    this.form.reset({ title: '', message: '', category: 'OTP', sender: '', favorite: false });
    this.detectedCode.set('');
    this.saveError.set('');
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
  }

  protected async pasteMessage(): Promise<void> {
    const text = await navigator.clipboard.readText();
    this.form.controls.message.setValue(text);
  }

  protected async save(): Promise<void> {
    this.saveError.set('');
    const title = this.form.controls.title.value.trim();
    const message = this.form.controls.message.value.trim();
    if (!title) this.form.controls.title.setErrors({ required: true });
    if (!message) this.form.controls.message.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Complete the fields highlighted in red before saving.');
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.store.addMessage({
        id: crypto.randomUUID(),
        title,
        message,
        category: value.category,
        sender: value.sender.trim(),
        detectedCode: this.detectedCode(),
        favorite: value.favorite,
        createdAt: new Date().toISOString(),
      });
      this.closeEditor();
    } catch {
      this.saveError.set(
        'The message could not be saved. Please check your device storage and try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(value);
      setTimeout(() => this.copied.set(''), 1600);
      return true;
    } catch {
      this.feedback.notify('Clipboard access was blocked');
      return false;
    }
  }

  protected openMessage(message: SavedMessage): void {
    this.selectedMessage.set(message);
    this.selectedRange.set(null);
  }

  protected closeMessage(): void {
    this.selectedMessage.set(null);
    this.selectedRange.set(null);
    this.phoneAction.set(null);
    this.urlAction.set('');
    this.whatsappChoice.set(null);
  }

  protected captureSelection(): void {
    const container = this.messageBody()?.nativeElement;
    const selection = container?.ownerDocument.defaultView?.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.selectedRange.set(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      this.selectedRange.set(null);
      return;
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(container);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    this.selectedRange.set(end > start ? { start, end } : null);
  }

  protected async toggleSelectedFormat(kind: MessageFormatKind): Promise<void> {
    const message = this.selectedMessage();
    const selection = this.selectedRange();
    if (!message || !selection || this.formattingSaving()) return;
    const updated: SavedMessage = {
      ...message,
      formats: toggleMessageFormat(message.message.length, message.formats ?? [], selection, kind),
    };
    this.formattingSaving.set(true);
    try {
      await this.store.updateMessage(updated);
      this.selectedMessage.set(updated);
      this.feedback.notify(
        kind === 'bold' ? 'Bold formatting saved' : 'Highlight formatting saved',
      );
    } catch {
      this.feedback.notify('Message formatting could not be saved');
    } finally {
      this.formattingSaving.set(false);
    }
  }

  protected handleEntity(part: MessageDisplayPart): void {
    if (part.kind === 'url') {
      this.urlAction.set(part.text);
      return;
    }
    if (part.kind !== 'phone') return;
    const normalized = part.text.trimStart().startsWith('+')
      ? `+${digitsOnly(part.text)}`
      : normalizePhone(this.store.settings().defaultCallingCode, part.text);
    this.phoneAction.set({ display: part.text, normalized });
  }

  protected savePhoneAsContact(): void {
    const action = this.phoneAction();
    const message = this.selectedMessage();
    if (!action) return;
    const callingCode =
      CALLING_CODES_BY_LENGTH.find((code) => action.normalized.startsWith(code)) ??
      this.store.settings().defaultCallingCode;
    const phone = action.normalized.startsWith(callingCode)
      ? action.normalized.slice(callingCode.length)
      : digitsOnly(action.normalized);
    this.store.pendingContactDraft.set({
      callingCode,
      phone,
      note: message ? `Saved from message: ${message.title}` : '',
      tag: '',
    });
    this.closeMessage();
    void this.router.navigate(['/contacts'], { queryParams: { add: 1 } });
  }

  protected tagPhone(): void {
    const action = this.phoneAction();
    if (!action) return;
    this.store.pendingTaggedNumber.set(action.normalized);
    this.closeMessage();
    void this.router.navigate(['/tagged'], { queryParams: { add: 1 } });
  }

  protected callPhone(): void {
    const action = this.phoneAction();
    if (!action) return;
    this.phoneAction.set(null);
    void this.calls.confirmAndCall(action.normalized, action.display);
  }

  protected openPhoneWhatsApp(): void {
    const action = this.phoneAction();
    if (!action) return;
    const number = action.normalized.replace(/^\+/u, '');
    const packages = this.native.availableWhatsAppApps();
    this.phoneAction.set(null);
    if (packages.length > 1) {
      this.whatsappChoice.set({ number, packages });
      return;
    }
    if (packages.length === 1 && this.native.openWhatsAppIn(number, '', packages[0])) return;
    if (this.native.openWhatsApp(number, '', this.store.settings().whatsappBusinessFallback))
      return;
    this.document.defaultView?.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
  }

  protected openWhatsAppIn(packageName: WhatsAppPackage): void {
    const choice = this.whatsappChoice();
    if (!choice) return;
    this.whatsappChoice.set(null);
    this.native.openWhatsAppIn(choice.number, '', packageName);
  }

  protected async copyPhone(): Promise<void> {
    const action = this.phoneAction();
    if (!action) return;
    const copied = await this.copy(action.normalized);
    this.phoneAction.set(null);
    if (copied) this.feedback.notify('Phone number copied');
  }

  protected async copyUrl(): Promise<void> {
    const url = this.urlAction();
    if (!url) return;
    const copied = await this.copy(url);
    this.urlAction.set('');
    if (copied) this.feedback.notify('Link copied');
  }

  protected navigateToUrl(): void {
    const url = this.urlAction();
    if (!url) return;
    this.urlAction.set('');
    const destination = /^https?:\/\//iu.test(url) ? url : `https://${url}`;
    this.document.defaultView?.open(destination, '_blank', 'noopener,noreferrer');
  }

  protected savedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  protected async remove(id: string, title: string): Promise<void> {
    const confirmed = await this.feedback.confirm({
      title: 'Delete saved message?',
      message: `“${title}” will be removed from your encrypted saved messages.`,
      confirmLabel: 'Delete message',
    });
    if (!confirmed) return;
    await this.store.removeMessage(id);
    this.feedback.notify('Saved message deleted');
  }
}
