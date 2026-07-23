import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/services/app-store.service';
import { digitsOnly, normalizePhone } from '../../core/utils/phone-number';
import { AppIcon } from '../../shared/components/app-icon';

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
  imports: [AppIcon, ReactiveFormsModule],
  templateUrl: './tagged-numbers.html',
  styleUrl: './tagged-numbers.scss',
})
export class TaggedNumbers {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly search = signal('');
  protected readonly tags = DEFAULT_TAGS;
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.store.taggedNumbers();
    return this.store
      .taggedNumbers()
      .filter((number) =>
        `${number.phone} ${number.tag} ${number.note}`.toLocaleLowerCase().includes(query),
      );
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    phone: ['', [Validators.required, Validators.minLength(6)]],
    tag: ['Repeated Call', Validators.required],
    note: ['', Validators.maxLength(1000)],
    important: false,
  });

  protected openEditor(): void {
    this.form.reset({ phone: '', tag: 'Repeated Call', note: '', important: false });
    this.editorOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const now = new Date().toISOString();
    await this.store.addTaggedNumber({
      id: crypto.randomUUID(),
      phone: digitsOnly(value.phone),
      normalizedPhone: normalizePhone('+91', value.phone),
      tag: value.tag,
      note: value.note.trim(),
      important: value.important,
      appearanceCount: 1,
      lastSeenAt: now,
      createdAt: now,
    });
    this.editorOpen.set(false);
  }

  protected async remove(id: string): Promise<void> {
    if (confirm('Delete this temporary number note? Call history will not be affected.')) {
      await this.store.removeTaggedNumber(id);
    }
  }
}
