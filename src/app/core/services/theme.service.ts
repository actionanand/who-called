import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { ThemePreference } from '../models/app.models';

interface SystemBarsBridge {
  setDarkMode(enabled: boolean): void;
}

interface NativeWindow extends Window {
  WhoCalledSystemBars?: SystemBarsBridge;
  WhoCalledNative?: { hideSplash(): void };
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private preference: ThemePreference = 'automatic';

  constructor() {
    this.media?.addEventListener('change', () => this.apply(this.preference));
  }

  apply(preference: ThemePreference): void {
    this.preference = preference;
    const root = this.document.documentElement;
    if (preference === 'automatic') root.removeAttribute('data-theme');
    else root.dataset['theme'] = preference;

    const dark =
      preference === 'dark' || (preference === 'automatic' && Boolean(this.media?.matches));
    const nativeWindow = this.document.defaultView as NativeWindow | null;
    nativeWindow?.WhoCalledSystemBars?.setDarkMode(dark);
  }

  hideNativeSplash(): void {
    const nativeWindow = this.document.defaultView as NativeWindow | null;
    nativeWindow?.WhoCalledNative?.hideSplash();
  }
}
