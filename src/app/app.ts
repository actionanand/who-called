import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppIcon } from './shared/components/app-icon';
import { AppStore } from './core/services/app-store.service';
import { NativeIntegrationService } from './core/services/native-integration.service';

@Component({
  selector: 'app-root',
  imports: [AppIcon, NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.sheet-open]': 'store.quickActionsOpen()',
  },
})
export class App {
  protected readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);
  private readonly router = inject(Router);

  constructor() {
    const sharedText = this.native.consumeSharedText();
    if (sharedText) {
      this.store.pendingSharedText.set(sharedText);
      void this.router.navigate(['/messages']);
    }
  }

  protected closeQuickActions(): void {
    this.store.quickActionsOpen.set(false);
  }
}
