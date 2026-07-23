import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppStore } from '../../core/services/app-store.service';
import { AppIcon } from '../../shared/components/app-icon';
import { digitsOnly, formatIndianPhone, normalizePhone } from '../../core/utils/phone-number';

@Component({
  selector: 'app-contacts',
  imports: [AppIcon, ReactiveFormsModule],
  templateUrl: './contacts.html',
  styleUrl: './contacts.scss',
})
export class Contacts {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(AppStore);
  protected readonly editorOpen = signal(false);
  protected readonly search = signal('');
  protected readonly saving = signal(false);
  protected readonly formatPhone = formatIndianPhone;

  protected readonly filteredContacts = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.store.contacts();
    const phoneQuery = digitsOnly(query);
    return this.store.contacts().filter((contact) => {
      const copy =
        `${contact.name} ${contact.company} ${contact.phone} ${contact.notes}`.toLocaleLowerCase();
      return (
        copy.includes(query) ||
        (phoneQuery.length > 0 && digitsOnly(contact.phone).includes(phoneQuery))
      );
    });
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    company: ['', Validators.maxLength(100)],
    phone: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(24)]],
    notes: ['', Validators.maxLength(2000)],
    whatsappEnabled: true,
    favorite: false,
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      if (parameters.has('add')) this.openEditor();
    });
  }

  protected openEditor(): void {
    this.form.reset({
      name: '',
      company: '',
      phone: '',
      notes: '',
      whatsappEnabled: true,
      favorite: false,
    });
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const now = new Date().toISOString();
    await this.store.addContact({
      id: crypto.randomUUID(),
      name: value.name.trim(),
      company: value.company.trim(),
      phone: digitsOnly(value.phone),
      normalizedPhone: normalizePhone('+91', value.phone),
      whatsappEnabled: value.whatsappEnabled,
      favorite: value.favorite,
      notes: value.notes.trim(),
      createdAt: now,
      updatedAt: now,
    });
    this.saving.set(false);
    this.closeEditor();
  }

  protected async remove(id: string, name: string): Promise<void> {
    if (confirm(`Delete ${name} from your private contacts?`)) {
      await this.store.removeContact(id);
    }
  }
}
