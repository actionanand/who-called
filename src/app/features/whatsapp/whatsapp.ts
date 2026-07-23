import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/services/app-store.service';
import { NativeIntegrationService } from '../../core/services/native-integration.service';
import { AppIcon } from '../../shared/components/app-icon';
import { buildWhatsAppUrl, normalizePhone } from '../../core/utils/phone-number';

@Component({
  selector: 'app-whatsapp',
  imports: [AppIcon, ReactiveFormsModule],
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.scss',
})
export class WhatsApp {
  private readonly formBuilder = inject(FormBuilder);
  private readonly native = inject(NativeIntegrationService);
  protected readonly store = inject(AppStore);
  protected readonly attempted = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    country: ['India', Validators.required],
    callingCode: ['+91', [Validators.required, Validators.pattern(/^\+\d{1,4}$/)]],
    number: ['', [Validators.required, Validators.minLength(6)]],
    message: ['', Validators.maxLength(4096)],
  });
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
    if (this.native.openWhatsApp(normalized.slice(1), value.message.trim())) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  protected pasteNumber(): void {
    void navigator.clipboard.readText().then((value) => this.form.controls.number.setValue(value));
  }
}
