import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/services/app-store.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { SORTED_COUNTRY_CODES } from '../../core/data/country-codes';
import {
  NativeIntegrationService,
  WhatsAppPackage,
} from '../../core/services/native-integration.service';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';
import { WhatsAppAppChooser } from '../../shared/components/whatsapp-app-chooser';
import { buildWhatsAppUrl, normalizePhone } from '../../core/utils/phone-number';

@Component({
  selector: 'app-whatsapp',
  imports: [AppIcon, ReactiveFormsModule, SelectPicker, WhatsAppAppChooser],
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.scss',
})
export class WhatsApp {
  private readonly formBuilder = inject(FormBuilder);
  private readonly native = inject(NativeIntegrationService);
  private readonly feedback = inject(FeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(AppStore);
  protected readonly attempted = signal(false);
  protected readonly appChoice = signal<{
    readonly number: string;
    readonly message: string;
    readonly packages: readonly WhatsAppPackage[];
  } | null>(null);
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
    const packages = this.native.availableWhatsAppApps();
    if (packages.length > 1) {
      this.appChoice.set({
        number: normalized.slice(1),
        message: value.message.trim(),
        packages,
      });
      return;
    }
    if (
      packages.length === 1 &&
      this.native.openWhatsAppIn(normalized.slice(1), value.message.trim(), packages[0])
    ) {
      return;
    }
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

  protected closeAppChoice(): void {
    this.appChoice.set(null);
  }

  protected openIn(packageName: WhatsAppPackage): void {
    const choice = this.appChoice();
    if (!choice) return;
    this.closeAppChoice();
    this.native.openWhatsAppIn(choice.number, choice.message, packageName);
  }

  protected async pasteNumber(): Promise<void> {
    let value = this.native.readClipboard();
    if (!value) {
      try {
        value = await navigator.clipboard.readText();
      } catch {
        this.feedback.notify('Clipboard access was blocked by the browser');
        return;
      }
    }
    if (!value.trim()) {
      this.feedback.notify('Clipboard does not contain a phone number');
      return;
    }
    this.form.controls.number.setValue(value.trim());
    this.feedback.notify('Phone number pasted');
  }
}
