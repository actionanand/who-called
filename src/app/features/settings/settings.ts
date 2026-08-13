import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SORTED_COUNTRY_CODES } from '../../core/data/country-codes';
import { ThemePreference } from '../../core/models/app.models';
import { AppStore } from '../../core/services/app-store.service';
import { DataPortabilityService } from '../../core/services/data-portability.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { SecurityService } from '../../core/services/security.service';
import { NativeIntegrationService } from '../../core/services/native-integration.service';
import { AppIcon } from '../../shared/components/app-icon';
import { SelectPicker, SelectPickerOption } from '../../shared/components/select-picker';

type SettingsPanel =
  'lock' | 'biometric' | 'privacy' | 'country' | 'backup' | 'restore' | 'export' | null;

@Component({
  selector: 'app-settings',
  imports: [AppIcon, FormsModule, NgOptimizedImage, SelectPicker],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly store = inject(AppStore);
  private readonly security = inject(SecurityService);
  private readonly data = inject(DataPortabilityService);
  private readonly feedback = inject(FeedbackService);
  private readonly native = inject(NativeIntegrationService);
  protected readonly panel = signal<SettingsPanel>(null);
  protected readonly pin = signal('');
  protected readonly pinConfirmation = signal('');
  protected readonly backupPassphrase = signal('');
  protected readonly backupConfirmation = signal('');
  protected readonly restoreFile = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly countryOptions: readonly SelectPickerOption[] = SORTED_COUNTRY_CODES.map(
    (country) => ({
      value: country.name,
      label: country.name,
      detail: country.callingCode ? `${country.iso} · ${country.callingCode}` : 'Custom code',
    }),
  );

  protected selectTheme(theme: ThemePreference): void {
    void this.store.setTheme(theme);
  }

  protected openPanel(panel: Exclude<SettingsPanel, null>): void {
    this.error.set('');
    this.pin.set('');
    this.pinConfirmation.set('');
    this.backupPassphrase.set('');
    this.backupConfirmation.set('');
    this.panel.set(panel);
  }

  protected closePanel(): void {
    if (!this.busy()) {
      this.panel.set(null);
      this.restoreFile.set(null);
    }
  }

  protected async savePin(): Promise<void> {
    this.error.set('');
    if (this.pin() !== this.pinConfirmation()) {
      this.error.set('The PIN entries do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.security.enablePin(this.pin());
      this.panel.set(null);
      this.feedback.notify('Application PIN enabled');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The PIN could not be saved.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async removePin(): Promise<void> {
    const confirmed = await this.feedback.confirm({
      title: 'Remove application PIN?',
      message: 'Who Called? will open without asking for a PIN on this device.',
      confirmLabel: 'Remove PIN',
      destructive: false,
    });
    if (!confirmed) return;
    await this.security.disablePin();
    this.panel.set(null);
    this.feedback.notify('Application PIN removed');
  }

  protected manualLock(): void {
    this.panel.set(null);
    this.security.lock();
  }

  protected biometricAvailable(): boolean {
    return this.security.biometricAvailable();
  }

  protected async toggleBiometric(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      if (this.store.settings().biometricEnabled) {
        await this.security.disableBiometric();
        this.feedback.notify('Biometric unlock disabled');
      } else {
        await this.security.enableBiometric(this.pin());
        this.pin.set('');
        this.feedback.notify('Biometric unlock enabled');
      }
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Biometric settings could not be changed.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected openApplicationLock(): void {
    this.openPanel('lock');
  }

  protected async toggleScreenshotProtection(): Promise<void> {
    const enabled = !this.store.settings().screenshotProtection;
    await this.security.setScreenshotProtection(enabled);
    this.feedback.notify(
      enabled ? 'Screenshot protection enabled' : 'Screenshot protection disabled',
    );
  }

  protected async selectCountry(name: string): Promise<void> {
    const country = SORTED_COUNTRY_CODES.find((entry) => entry.name === name);
    if (!country?.callingCode) return;
    await this.store.updateSettings({
      defaultCountry: country.name,
      defaultCallingCode: country.callingCode,
    });
    this.feedback.notify(`Default country changed to ${country.name}`);
  }

  protected countryIso(): string {
    return (
      SORTED_COUNTRY_CODES.find((country) => country.name === this.store.settings().defaultCountry)
        ?.iso ?? '—'
    );
  }

  protected async toggleWhatsAppFallback(): Promise<void> {
    const enabled = !this.store.settings().whatsappBusinessFallback;
    await this.store.updateSettings({ whatsappBusinessFallback: enabled });
    this.feedback.notify(
      enabled ? 'WhatsApp Business fallback enabled' : 'WhatsApp Business fallback disabled',
    );
  }

  protected async deviceCallHistory(): Promise<void> {
    if (!this.native.deviceCallHistorySupported()) {
      this.feedback.notify('Device call history is unavailable in this permission-free build');
      return;
    }
    const enabled = !this.store.settings().deviceCallHistoryEnabled;
    await this.store.updateSettings({ deviceCallHistoryEnabled: enabled });
    this.feedback.notify(enabled ? 'Device call history enabled' : 'Device call history disabled');
  }

  protected async toggleRecentActivity(): Promise<void> {
    const enabled = !this.store.settings().recentActivityEnabled;
    await this.store.updateSettings({ recentActivityEnabled: enabled });
    this.feedback.notify(enabled ? 'Recent activity enabled' : 'Recent activity disabled');
  }

  protected async toggleHiddenContacts(): Promise<void> {
    const enabled = !this.store.settings().hideHiddenContacts;
    await this.store.updateSettings({ hideHiddenContacts: enabled });
    this.feedback.notify(
      enabled
        ? 'Hidden contacts removed from the regular list'
        : 'Hidden contacts shown in the regular list',
    );
  }

  protected async createBackup(): Promise<void> {
    this.error.set('');
    if (this.backupPassphrase() !== this.backupConfirmation()) {
      this.error.set('The backup passphrases do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.data.createEncryptedBackup(this.backupPassphrase());
      this.panel.set(null);
      this.feedback.notify('Encrypted backup created');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The backup could not be created.');
    } finally {
      this.busy.set(false);
    }
  }

  protected chooseRestore(input: HTMLInputElement): void {
    input.click();
  }

  protected selectRestoreFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.restoreFile.set(file);
    this.backupPassphrase.set('');
    this.error.set('');
    this.panel.set('restore');
    input.value = '';
  }

  protected async restoreBackup(): Promise<void> {
    const file = this.restoreFile();
    if (!file) {
      this.error.set('Choose a .contactvault backup file again.');
      return;
    }
    const confirmed = await this.feedback.confirm({
      title: 'Replace local data?',
      message:
        'Restoring this backup replaces contacts, saved messages and tagged numbers on this device.',
      confirmLabel: 'Restore backup',
    });
    if (!confirmed) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.data.restoreEncryptedBackup(file, this.backupPassphrase());
      this.panel.set(null);
      this.restoreFile.set(null);
      this.feedback.notify('Encrypted backup restored');
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The backup could not be decrypted or restored.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async exportCsv(): Promise<void> {
    this.busy.set(true);
    try {
      await this.data.exportCsv();
      this.feedback.notify('Plaintext CSV exported');
    } catch (error: unknown) {
      this.feedback.notify(
        error instanceof Error ? error.message : 'The CSV could not be exported.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async exportVCard(): Promise<void> {
    this.busy.set(true);
    try {
      await this.data.exportVCard();
      this.feedback.notify('vCard exported');
    } catch (error: unknown) {
      this.feedback.notify(
        error instanceof Error ? error.message : 'The vCard could not be exported.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected isAndroid(): boolean {
    return this.native.isAndroid();
  }

  protected androidVersion(): string {
    return this.native.appVersion();
  }

  protected chooseImport(input: HTMLInputElement): void {
    input.click();
  }

  protected async importContacts(event: Event, type: 'csv' | 'vcard'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.busy.set(true);
    try {
      const count =
        type === 'csv' ? await this.data.importCsv(file) : await this.data.importVCard(file);
      this.feedback.notify(`${count} ${count === 1 ? 'contact' : 'contacts'} imported`);
      this.panel.set(null);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The contacts could not be imported.',
      );
    } finally {
      input.value = '';
      this.busy.set(false);
    }
  }
}
