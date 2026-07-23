import { Component, inject } from '@angular/core';
import { FeedbackService } from '../../core/services/feedback.service';
import { AppIcon } from './app-icon';

@Component({
  selector: 'app-feedback',
  imports: [AppIcon],
  template: `
    @if (feedback.confirmation(); as confirmation) {
      <div class="confirm-backdrop">
        <section
          class="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
          aria-describedby="app-confirm-message"
        >
          <span class="confirm-icon" [class.destructive]="confirmation.destructive !== false">
            <app-icon [name]="confirmation.destructive === false ? 'shield' : 'trash'" />
          </span>
          <div>
            <h2 id="app-confirm-title">{{ confirmation.title }}</h2>
            <p id="app-confirm-message">{{ confirmation.message }}</p>
          </div>
          <div class="confirm-actions">
            <button
              class="secondary-button"
              type="button"
              (click)="feedback.resolveConfirmation(false)"
            >
              Cancel
            </button>
            <button
              class="confirm-button"
              [class.destructive]="confirmation.destructive !== false"
              type="button"
              (click)="feedback.resolveConfirmation(true)"
            >
              {{ confirmation.confirmLabel ?? 'Delete' }}
            </button>
          </div>
        </section>
      </div>
    }

    @if (feedback.snackbar()) {
      <div class="snackbar" role="status" aria-live="polite">
        <span><app-icon name="check" /></span>
        {{ feedback.snackbar() }}
      </div>
    }
  `,
  styles: `
    .confirm-backdrop {
      position: fixed;
      z-index: 150;
      inset: 0;
      display: grid;
      align-items: end;
      padding: 1rem;
      background: rgb(2 12 8 / 58%);
      backdrop-filter: blur(4px);
    }
    .confirm-dialog {
      display: grid;
      width: min(100%, 28rem);
      gap: 1rem;
      margin: 0 auto calc(env(safe-area-inset-bottom) + 0.2rem);
      padding: 1.25rem;
      border: 1px solid var(--border-subtle);
      border-radius: 1.35rem;
      background: var(--surface);
      box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
      animation: confirm-in 160ms ease-out;
    }
    .confirm-icon {
      display: grid;
      width: 3rem;
      height: 3rem;
      place-items: center;
      border-radius: 1rem;
      color: var(--primary);
      background: var(--primary-soft);
    }
    .confirm-icon.destructive {
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, var(--surface));
    }
    h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    p {
      margin: 0.4rem 0 0;
      color: var(--text-muted);
      font-size: 0.84rem;
      line-height: 1.55;
    }
    .confirm-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .confirm-button {
      min-height: 3.25rem;
      border: 0;
      border-radius: 1rem;
      color: #fff;
      background: var(--primary);
      font-weight: 750;
    }
    .confirm-button.destructive {
      background: var(--danger);
    }
    .snackbar {
      position: fixed;
      z-index: 160;
      right: 1rem;
      bottom: calc(5.75rem + env(safe-area-inset-bottom));
      left: 1rem;
      display: flex;
      width: fit-content;
      max-width: calc(100% - 2rem);
      min-height: 3.2rem;
      align-items: center;
      gap: 0.65rem;
      margin-inline: auto;
      padding: 0.65rem 1rem 0.65rem 0.7rem;
      border: 1px solid var(--border-subtle);
      border-radius: 1rem;
      color: var(--text);
      background: var(--surface);
      box-shadow: 0 1rem 3rem rgb(0 0 0 / 28%);
    }
    .snackbar span {
      display: grid;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border-radius: 0.65rem;
      color: var(--primary);
      background: var(--primary-soft);
    }
    @keyframes confirm-in {
      from {
        transform: translateY(1.5rem);
        opacity: 0;
      }
    }
    @media (min-width: 720px) {
      .confirm-backdrop {
        align-items: center;
      }
      .snackbar {
        bottom: 7rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .confirm-dialog {
        animation: none;
      }
    }
  `,
  host: {
    '(document:keydown.escape)': 'feedback.resolveConfirmation(false)',
  },
})
export class AppFeedback {
  protected readonly feedback = inject(FeedbackService);
}
