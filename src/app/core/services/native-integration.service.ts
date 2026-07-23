import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

interface WhoCalledNativeBridge {
  consumeSharedText(): string;
  openWhatsApp(number: string, message: string): void;
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

  openWhatsApp(number: string, message: string): boolean {
    const bridge = this.bridge();
    if (!bridge) return false;
    bridge.openWhatsApp(number, message);
    return true;
  }

  private bridge(): WhoCalledNativeBridge | undefined {
    return (this.document.defaultView as NativeWindow | null)?.WhoCalledNative;
  }
}
