import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppIcon } from './shared/components/app-icon';
import { AppFeedback } from './shared/components/app-feedback';
import { AppStore } from './core/services/app-store.service';
import { NativeIntegrationService } from './core/services/native-integration.service';
import { SecurityService } from './core/services/security.service';

@Component({
  selector: 'app-root',
  imports: [
    AppFeedback,
    AppIcon,
    FormsModule,
    NgOptimizedImage,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
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
  private readonly security = inject(SecurityService);
  protected readonly unlockPin = signal('');
  protected readonly unlockError = signal('');

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

  protected async unlock(): Promise<void> {
    if (await this.security.unlock(this.unlockPin())) {
      this.unlockPin.set('');
      this.unlockError.set('');
    } else {
      this.unlockError.set('Incorrect PIN. Try again.');
      this.unlockPin.set('');
    }
  }

  protected biometricAvailable(): boolean {
    return this.store.settings().biometricEnabled && this.security.biometricAvailable();
  }

  protected async unlockWithBiometric(): Promise<void> {
    this.unlockError.set('');
    try {
      if (!(await this.security.unlockWithBiometric())) {
        this.unlockError.set('Biometric unlock could not verify this application.');
      }
    } catch (error: unknown) {
      this.unlockError.set(
        error instanceof Error ? error.message : 'Biometric authentication was cancelled.',
      );
    }
  }
}
