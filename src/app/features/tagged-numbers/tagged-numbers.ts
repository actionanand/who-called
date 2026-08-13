import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TaggedNumber } from '../../core/models/app.models';
import { CallService } from '../../core/services/call.service';
import { AppStore } from '../../core/services/app-store.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { digitsOnly, normalizePhone } from '../../core/utils/phone-number';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';

const DEFAULT_TAGS = [
  'Fraud',
  'Spam',
  'Repeated Call',
  'Sales',
  'Marketing',
  'Delivery',
  'Courier',
  'Service Centre',
  'Bank',
  'Recruitment',
  'Business',
  'Important',
  'Unknown',
  'Other',
] as const;

@Component({
  selector: 'app-tagged-numbers',
  imports: [AppIcon, ReactiveFormsModule, SelectPicker],
  templateUrl: './tagged-numbers.html',
  styleUrl: './tagged-numbers.scss',
})
export class TaggedNumbers {
  private readonly formBuilder = inject(FormBuilder);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly calls = inject(CallService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly editingNumber = signal<TaggedNumber | null>(null);
  protected readonly selectedNumber = signal<TaggedNumber | null>(null);
  protected readonly search = signal('');
  protected readonly tagOptions: readonly SelectPickerOption[] = DEFAULT_TAGS.map((value) => ({
    value,
    label: value,
  }));
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.store.taggedNumbers();
    return this.store
      .taggedNumbers()
      .filter((number) =>
        `${number.phone} ${number.name ?? ''} ${number.tag} ${number.note}`
          .toLocaleLowerCase()
          .includes(query),
      );
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    phone: ['', [Validators.required, Validators.minLength(6)]],
    name: ['', Validators.maxLength(120)],
    tag: ['Repeated Call', Validators.required],
    note: ['', Validators.maxLength(1000)],
    important: false,
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      if (!parameters.has('add')) return;
      this.openEditor(undefined, this.store.pendingTaggedNumber());
      this.store.pendingTaggedNumber.set('');
    });
  }

  protected openEditor(number?: TaggedNumber, draftPhone = ''): void {
    this.editingNumber.set(number ?? null);
    this.form.reset({
      phone: number?.phone ?? draftPhone,
      name: number?.name ?? '',
      tag: number?.tag ?? 'Repeated Call',
      note: number?.note ?? '',
      important: number?.important ?? false,
    });
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const now = new Date().toISOString();
    const existing = this.editingNumber();
    const normalizedPhone = value.phone.trimStart().startsWith('+')
      ? `+${digitsOnly(value.phone)}`
      : normalizePhone(this.store.settings().defaultCallingCode, value.phone);
    const taggedNumber: TaggedNumber = {
      id: existing?.id ?? crypto.randomUUID(),
      phone: digitsOnly(value.phone),
      normalizedPhone,
      name: value.name.trim(),
      tag: value.tag,
      note: value.note.trim(),
      important: value.important,
      appearanceCount: existing?.appearanceCount ?? 1,
      lastSeenAt: existing?.lastSeenAt ?? now,
      createdAt: existing?.createdAt ?? now,
    };
    if (existing) await this.store.updateTaggedNumber(taggedNumber);
    else await this.store.addTaggedNumber(taggedNumber);
    this.editorOpen.set(false);
    this.feedback.notify(existing ? 'Tagged number updated' : 'Tagged number saved');
  }

  protected convertToContact(number: TaggedNumber): void {
    this.store.pendingContactDraft.set({
      taggedNumberId: number.id,
      phone: number.phone,
      note: number.note,
      tag: number.tag,
    });
    void this.router.navigate(['/contacts'], { queryParams: { add: 1 } });
  }

  protected async remove(id: string): Promise<void> {
    const confirmed = await this.feedback.confirm({
      title: 'Delete tagged number?',
      message:
        'The temporary tag and note will be deleted. Matching device call history and private contacts will not be affected.',
      confirmLabel: 'Delete tag & note',
    });
    if (!confirmed) return;
    await this.store.removeTaggedNumber(id);
    this.selectedNumber.set(null);
    this.feedback.notify('Tagged number deleted');
  }

  protected call(number: TaggedNumber): void {
    void this.calls.confirmAndCall(number.normalizedPhone, number.normalizedPhone);
  }

  protected openDetails(number: TaggedNumber): void {
    this.selectedNumber.set(number);
  }

  protected closeDetails(): void {
    this.selectedNumber.set(null);
  }

  protected editFromDetails(number: TaggedNumber): void {
    this.selectedNumber.set(null);
    this.openEditor(number);
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  }
}
