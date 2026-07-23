import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/services/app-store.service';
import { SORTED_COUNTRY_CODES } from '../../core/data/country-codes';
import { NativeIntegrationService } from '../../core/services/native-integration.service';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';
import { buildWhatsAppUrl, normalizePhone } from '../../core/utils/phone-number';

@Component({
  selector: 'app-whatsapp',
  imports: [AppIcon, ReactiveFormsModule, SelectPicker],
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.scss',
})
export class WhatsApp {
  private readonly formBuilder = inject(FormBuilder);
  private readonly native = inject(NativeIntegrationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(AppStore);
  protected readonly attempted = signal(false);
  protected readonly countryOptions: readonly SelectPickerOption[] = SORTED_COUNTRY_CODES.map(
    (country) => ({
      value: country.name,
      label: country.name,
      detail: country.callingCode
        ? `${country.iso} / ${country.callingCode}`
        : 'Enter a custom code',
    }),
  );
  protected readonly form = this.formBuilder.nonNullable.group({
    country: ['India', Validators.required],
    callingCode: ['+91', [Validators.required, Validators.pattern(/^\+\d{1,4}$/)]],
    number: ['', [Validators.required, Validators.minLength(6)]],
    message: ['', Validators.maxLength(4096)],
  });
  private defaultApplied = false;

  constructor() {
    effect(() => {
      if (this.store.loading() || this.defaultApplied) return;
      this.defaultApplied = true;
      this.form.patchValue(
        {
          country: this.store.settings().defaultCountry,
          callingCode: this.store.settings().defaultCallingCode,
        },
        { emitEvent: false },
      );
    });
    this.form.controls.callingCode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((callingCode) => {
        const normalized = callingCode.startsWith('+') ? callingCode : `+${callingCode}`;
        const selected = SORTED_COUNTRY_CODES.find(
          (country) => country.name === this.form.controls.country.value,
        );
        if (selected?.callingCode === normalized) return;
        const matches = SORTED_COUNTRY_CODES.filter(
          (country) => country.callingCode === normalized,
        );
        const match =
          matches.find((country) => country.iso === 'US') ??
          matches.find((country) => country.iso === 'RU') ??
          matches[0];
        this.form.controls.country.setValue(match?.name ?? 'Custom calling code', {
          emitEvent: false,
        });
      });
  }

  protected selectCountry(name: string): void {
    const country = SORTED_COUNTRY_CODES.find((entry) => entry.name === name);
    this.form.controls.country.setValue(name, { emitEvent: false });
    if (country?.callingCode) {
      this.form.controls.callingCode.setValue(country.callingCode, { emitEvent: false });
    }
  }

  protected normalizeCallingCode(): void {
    const value = this.form.controls.callingCode.value.trim();
    if (value && !value.startsWith('+')) this.form.controls.callingCode.setValue(`+${value}`);
  }
  protected generatedUrl(): string | null {
    const value = this.form.getRawValue();
    return buildWhatsAppUrl(value.callingCode, value.number, value.message);
  }

  protected openChat(): void {
    this.attempted.set(true);
    const url = this.generatedUrl();
    if (!url) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const normalized = normalizePhone(value.callingCode, value.number);
    if (
      this.native.openWhatsApp(
        normalized.slice(1),
        value.message.trim(),
        this.store.settings().whatsappBusinessFallback,
      )
    )
      return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  protected pasteNumber(): void {
    void navigator.clipboard.readText().then((value) => this.form.controls.number.setValue(value));
  }
}
