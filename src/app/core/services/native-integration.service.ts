import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

interface WhoCalledNativeBridge {
  consumeSharedText(): string;
  openWhatsApp(number: string, message: string, businessFallback: boolean): void;
  setScreenshotProtection(enabled: boolean): void;
  deviceCallHistorySupported(): boolean;
  appVersion(): string;
  isBiometricAvailable(): boolean;
  enableBiometric(secret: string): void;
  authenticateBiometric(): void;
  disableBiometric(): void;
}

interface NativeWindow extends Window {
  WhoCalledNative?: WhoCalledNativeBridge;
}

@Injectable({ providedIn: 'root' })
export class NativeIntegrationService {
  private readonly document = inject(DOCUMENT);

  consumeSharedText(): string {
    return this.bridge()?.consumeSharedText().trim() ?? '';
  }

  openWhatsApp(number: string, message: string, businessFallback = true): boolean {
    const bridge = this.bridge();
    if (!bridge) return false;
    bridge.openWhatsApp(number, message, businessFallback);
    return true;
  }

  setScreenshotProtection(enabled: boolean): void {
    this.bridge()?.setScreenshotProtection(enabled);
  }

  deviceCallHistorySupported(): boolean {
    return this.bridge()?.deviceCallHistorySupported() ?? false;
  }

  isAndroid(): boolean {
    return Boolean(this.bridge());
  }

  appVersion(): string {
    return this.bridge()?.appVersion() ?? '';
  }

  biometricAvailable(): boolean {
    return this.bridge()?.isBiometricAvailable() ?? false;
  }

  enableBiometric(secret: string): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) return Promise.reject(new Error('Biometric unlock is available only on Android.'));
    return this.waitForNativeResult('biometric-enabled', () => bridge.enableBiometric(secret)).then(
      () => undefined,
    );
  }

  authenticateBiometric(): Promise<string> {
    const bridge = this.bridge();
    if (!bridge) return Promise.reject(new Error('Biometric unlock is available only on Android.'));
    return this.waitForNativeResult('biometric-unlock', () => bridge.authenticateBiometric());
  }

  disableBiometric(): void {
    this.bridge()?.disableBiometric();
  }

  private bridge(): WhoCalledNativeBridge | undefined {
    return (this.document.defaultView as NativeWindow | null)?.WhoCalledNative;
  }

  private waitForNativeResult(action: string, start: () => void): Promise<string> {
    const nativeWindow = this.document.defaultView;
    if (!nativeWindow) return Promise.reject(new Error('The Android bridge is unavailable.'));
    return new Promise<string>((resolve, reject) => {
      const handleResult = (event: Event) => {
        const detail = (
          event as CustomEvent<{
            action: string;
            success: boolean;
            data?: string;
            message?: string;
          }>
        ).detail;
        if (detail.action !== action) return;
        nativeWindow.removeEventListener('who-called-native-result', handleResult);
        if (detail.success) resolve(detail.data ?? '');
        else reject(new Error(detail.message || 'Biometric authentication was cancelled.'));
      };
      nativeWindow.addEventListener('who-called-native-result', handleResult);
      try {
        start();
      } catch (error) {
        nativeWindow.removeEventListener('who-called-native-result', handleResult);
        reject(error instanceof Error ? error : new Error('Biometric authentication failed.'));
      }
    });
  }
}
