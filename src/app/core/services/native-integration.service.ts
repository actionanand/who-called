import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { DeviceCallHistoryEntry, DeviceCallType } from '../models/app.models';

export type WhatsAppPackage = 'com.whatsapp' | 'com.whatsapp.w4b';

interface WhoCalledNativeBridge {
  consumeSharedText(): string;
  openWhatsApp(number: string, message: string, businessFallback: boolean): void;
  availableWhatsAppApps(): string;
  openWhatsAppIn(number: string, message: string, packageName: string): void;
  setScreenshotProtection(enabled: boolean): void;
  deviceCallHistorySupported(): boolean;
  requestDeviceCallHistory(): void;
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

  availableWhatsAppApps(): readonly WhatsAppPackage[] {
    const value = this.bridge()?.availableWhatsAppApps();
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is WhatsAppPackage =>
          entry === 'com.whatsapp' || entry === 'com.whatsapp.w4b',
      );
    } catch {
      return [];
    }
  }

  openWhatsAppIn(number: string, message: string, packageName: WhatsAppPackage): boolean {
    const bridge = this.bridge();
    if (!bridge) return false;
    bridge.openWhatsAppIn(number, message, packageName);
    return true;
  }

  setScreenshotProtection(enabled: boolean): void {
    this.bridge()?.setScreenshotProtection(enabled);
  }

  deviceCallHistorySupported(): boolean {
    return this.bridge()?.deviceCallHistorySupported() ?? false;
  }

  requestDeviceCallHistory(): Promise<readonly DeviceCallHistoryEntry[]> {
    const bridge = this.bridge();
    if (!bridge) {
      return Promise.reject(new Error('Phone call history is available only on Android.'));
    }
    return this.waitForNativeResult('call-history', () => bridge.requestDeviceCallHistory()).then(
      (value) => this.parseCallHistory(value),
    );
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
        else reject(new Error(detail.message || 'The Android request could not be completed.'));
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

  private parseCallHistory(value: string): readonly DeviceCallHistoryEntry[] {
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry): readonly DeviceCallHistoryEntry[] => {
        if (!this.isRecord(entry)) return [];
        const type = this.callType(entry['type']);
        const timestamp = this.numberValue(entry['timestamp']);
        const durationSeconds = this.numberValue(entry['durationSeconds']);
        return [
          {
            id: String(entry['id'] ?? `${timestamp}-${String(entry['number'] ?? '')}`),
            number: String(entry['number'] ?? ''),
            cachedName: String(entry['cachedName'] ?? ''),
            type,
            timestamp,
            durationSeconds,
          },
        ];
      });
    } catch {
      return [];
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private callType(value: unknown): DeviceCallType {
    const types: readonly DeviceCallType[] = [
      'incoming',
      'outgoing',
      'missed',
      'rejected',
      'blocked',
      'voicemail',
      'unknown',
    ];
    return types.includes(value as DeviceCallType) ? (value as DeviceCallType) : 'unknown';
  }
}
