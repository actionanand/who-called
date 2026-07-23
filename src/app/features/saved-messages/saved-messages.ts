import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppStore } from '../../core/services/app-store.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { detectLikelyCode } from '../../core/utils/otp';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';

const MESSAGE_CATEGORIES: readonly SelectPickerOption[] = [
  'OTP',
  'Delivery',
  'Booking',
  'Appointment',
  'Payment',
  'Account',
  'Personal',
  'Other',
].map((value) => ({ value, label: value }));

@Component({
  selector: 'app-saved-messages',
  imports: [AppIcon, ReactiveFormsModule, SelectPicker],
  templateUrl: './saved-messages.html',
  styleUrl: './saved-messages.scss',
})
export class SavedMessages {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly detectedCode = signal('');
  protected readonly copied = signal('');
  protected readonly categories = MESSAGE_CATEGORIES;

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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    await this.store.addMessage({
      id: crypto.randomUUID(),
      title: value.title.trim(),
      message: value.message.trim(),
      category: value.category,
      sender: value.sender.trim(),
      detectedCode: this.detectedCode(),
      favorite: value.favorite,
      createdAt: new Date().toISOString(),
    });
    this.closeEditor();
  }

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
    setTimeout(() => this.copied.set(''), 1600);
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
