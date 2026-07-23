import { inject, Injectable } from '@angular/core';
import { AppStore } from './app-store.service';
import { NativeIntegrationService } from './native-integration.service';

const PIN_ITERATIONS = 210_000;

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);

  async enablePin(pin: string): Promise<void> {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a numeric PIN with 4 to 8 digits.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await this.derive(pin, salt, PIN_ITERATIONS);
    await this.store.updateSettings({
      pinEnabled: true,
      pinSalt: this.toBase64(salt),
      pinVerifier: this.toBase64(verifier),
      pinIterations: PIN_ITERATIONS,
    });
  }

  async disablePin(): Promise<void> {
    this.native.disableBiometric();
    await this.store.updateSettings({
      pinEnabled: false,
      pinSalt: undefined,
      pinVerifier: undefined,
      pinIterations: undefined,
      biometricEnabled: false,
    });
    this.store.locked.set(false);
  }

  async unlock(pin: string): Promise<boolean> {
    const valid = await this.verifyPin(pin);
    if (valid) await this.store.unlockSensitiveData();
    return valid;
  }

  biometricAvailable(): boolean {
    return this.native.biometricAvailable();
  }

  async enableBiometric(pin: string): Promise<void> {
    if (!(await this.verifyPin(pin))) throw new Error('Enter the current application PIN.');
    await this.native.enableBiometric(pin);
    await this.store.updateSettings({ biometricEnabled: true });
  }

  async disableBiometric(): Promise<void> {
    this.native.disableBiometric();
    await this.store.updateSettings({ biometricEnabled: false });
  }

  async unlockWithBiometric(): Promise<boolean> {
    const pin = await this.native.authenticateBiometric();
    return this.unlock(pin);
  }

  private async verifyPin(pin: string): Promise<boolean> {
    const settings = this.store.settings();
    if (!settings.pinEnabled || !settings.pinSalt || !settings.pinVerifier) return true;
    const actual = await this.derive(
      pin,
      this.fromBase64(settings.pinSalt),
      settings.pinIterations ?? PIN_ITERATIONS,
    );
    const expected = this.fromBase64(settings.pinVerifier);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  }

  lock(): void {
    if (this.store.settings().pinEnabled) this.store.lockAndClear();
  }

  async setScreenshotProtection(enabled: boolean): Promise<void> {
    await this.store.updateSettings({ screenshotProtection: enabled });
    this.native.setScreenshotProtection(enabled);
  }

  private async derive(
    pin: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      256,
    );
    return new Uint8Array(bits);
  }

  private toBase64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
