import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppIcon } from './shared/components/app-icon';
import { AppFeedback } from './shared/components/app-feedback';
import { AppStore } from './core/services/app-store.service';
import { CallService } from './core/services/call.service';
import { FeedbackService } from './core/services/feedback.service';
import { KeepsakeReminderService } from './core/services/keepsake-reminder.service';
import { NativeIntegrationService } from './core/services/native-integration.service';
import { SecurityService } from './core/services/security.service';

const NOTIFICATION_PROMPT_KEY = 'who-called.notification-schedule-v2';

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
    '(document:keydown.escape)': 'dismissNotificationPermissionPrompt()',
  },
})
export class App {
  protected readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);
  private readonly calls = inject(CallService);
  private readonly feedback = inject(FeedbackService);
  private readonly notifications = inject(KeepsakeReminderService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly security = inject(SecurityService);
  protected readonly unlockPin = signal('');
  protected readonly unlockError = signal('');
  protected readonly biometricBusy = signal(false);
  protected readonly showNotificationPermissionPrompt = signal(false);
  protected readonly notificationPermissionBusy = signal(false);
  private readonly viewReady = signal(false);
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
  private readonly allowNotificationsButton = viewChild<ElementRef<HTMLButtonElement>>(
    'allowNotificationsButton',
  );
  private notificationPromptInitialised = false;

  constructor() {
    afterNextRender(() => this.viewReady.set(true));
    effect(() => {
      const ready = this.viewReady() && !this.store.loading() && !this.store.locked();
      if (!ready || this.notificationPromptInitialised) return;
      this.notificationPromptInitialised = true;
      if (!this.shouldShowNotificationPermissionPrompt()) return;
      this.showNotificationPermissionPrompt.set(true);
      queueMicrotask(() => this.allowNotificationsButton()?.nativeElement.focus());
    });

    const sharedText = this.native.consumeSharedText();
    if (sharedText) {
      this.store.pendingSharedText.set(sharedText);
      void this.router.navigate(['/messages']);
    }
  }

  protected closeQuickActions(): void {
    this.store.quickActionsOpen.set(false);
  }

  protected makeCall(): void {
    this.closeQuickActions();
    void this.calls.confirmAndCall();
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

  protected biometricEnabled(): boolean {
    return this.store.settings().biometricEnabled && this.native.isAndroid();
  }

  protected async unlockWithBiometric(): Promise<void> {
    this.unlockError.set('');
    this.biometricBusy.set(true);
    try {
      if (!(await this.security.unlockWithBiometric())) {
        this.unlockError.set('Biometric unlock could not verify this application.');
      }
    } catch (error: unknown) {
      this.unlockError.set(
        error instanceof Error ? error.message : 'Biometric authentication was cancelled.',
      );
    } finally {
      this.biometricBusy.set(false);
    }
  }

  protected dismissNotificationPermissionPrompt(): void {
    if (this.notificationPermissionBusy() || !this.showNotificationPermissionPrompt()) return;
    this.showNotificationPermissionPrompt.set(false);
    queueMicrotask(() => this.mainContent()?.nativeElement.focus());
  }

  protected async allowNotifications(): Promise<void> {
    if (this.notificationPermissionBusy()) return;
    this.showNotificationPermissionPrompt.set(false);
    this.notificationPermissionBusy.set(true);
    // Persist the user's action before Android takes over the activity for its runtime-permission
    // UI. If an OEM recreates the WebView during that transition, the explanatory sheet must not
    // trap the user on every subsequent launch. Permission can still be enabled from Settings.
    this.markNotificationPromptHandled();
    const granted = await this.notifications.requestPermission(this.store.contacts());
    this.notificationPermissionBusy.set(false);
    this.feedback.notify(
      granted
        ? 'Notifications enabled. Keepsake reminders are scheduled.'
        : 'Notifications were not enabled. You can allow them later in Android settings.',
    );
    queueMicrotask(() => this.mainContent()?.nativeElement.focus());
  }

  private shouldShowNotificationPermissionPrompt(): boolean {
    if (!this.native.isAndroid()) return false;
    try {
      return this.document.defaultView?.localStorage.getItem(NOTIFICATION_PROMPT_KEY) !== 'handled';
    } catch {
      return true;
    }
  }

  private markNotificationPromptHandled(): void {
    try {
      this.document.defaultView?.localStorage.setItem(NOTIFICATION_PROMPT_KEY, 'handled');
    } catch {
      // The permission action still works when WebView storage is unavailable.
    }
  }
}
