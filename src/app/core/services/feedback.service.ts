import { Injectable, signal } from '@angular/core';

export interface ConfirmationRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly destructive?: boolean;
}

interface ActiveConfirmation extends ConfirmationRequest {
  readonly resolve: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  readonly confirmation = signal<ActiveConfirmation | null>(null);
  readonly snackbar = signal('');
  private snackbarTimer: ReturnType<typeof setTimeout> | undefined;

  confirm(request: ConfirmationRequest): Promise<boolean> {
    this.confirmation()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.confirmation.set({ ...request, resolve });
    });
  }

  resolveConfirmation(confirmed: boolean): void {
    const request = this.confirmation();
    if (!request) return;
    this.confirmation.set(null);
    request.resolve(confirmed);
  }

  notify(message: string): void {
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
    this.snackbar.set(message);
    this.snackbarTimer = setTimeout(() => this.snackbar.set(''), 2800);
  }
}
