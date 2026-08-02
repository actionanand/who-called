import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrivateContact } from '../../core/models/app.models';
import { AppStore } from '../../core/services/app-store.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { KeepsakeEvent, keepsakeEvents } from '../../core/utils/keepsake-events';
import { contactDisplayName } from '../../core/utils/contact-privacy';
import { AppIcon } from '../../shared/components/app-icon';

interface AlertContact {
  readonly contact: PrivateContact;
  readonly events: readonly KeepsakeEvent[];
}

@Component({
  selector: 'app-alert-directory',
  imports: [AppIcon, RouterLink],
  templateUrl: './alert-directory.html',
  styleUrl: './alert-directory.scss',
})
export class AlertDirectory {
  private readonly store = inject(AppStore);
  private readonly feedback = inject(FeedbackService);

  protected readonly contacts = computed<readonly AlertContact[]>(() => {
    const activeContacts = this.store.activeContacts();
    const events = keepsakeEvents(activeContacts).filter((event) => event.reminderEnabled);
    return activeContacts.flatMap((contact): readonly AlertContact[] => {
      const contactEvents = events.filter((event) => event.contact.id === contact.id);
      return contactEvents.length ? [{ contact, events: contactEvents }] : [];
    });
  });

  protected displayName(contact: PrivateContact): string {
    return contactDisplayName(contact);
  }

  protected async disableReminder(event: KeepsakeEvent): Promise<void> {
    const current = this.store.activeContacts().find((contact) => contact.id === event.contact.id);
    if (!current) return;
    const updated =
      event.kind === 'birthday'
        ? {
            ...current,
            birthDate: current.birthDate
              ? { ...current.birthDate, reminderEnabled: false }
              : undefined,
            updatedAt: new Date().toISOString(),
          }
        : {
            ...current,
            anniversaries: (current.anniversaries ?? []).map((anniversary) =>
              event.id.endsWith(':' + anniversary.id)
                ? { ...anniversary, reminderEnabled: false }
                : anniversary,
            ),
            updatedAt: new Date().toISOString(),
          };
    await this.store.updateContact(updated);
    this.feedback.notify(event.label + ' reminder disabled');
  }

  protected async disableAll(contact: PrivateContact): Promise<void> {
    const current = this.store.activeContacts().find((entry) => entry.id === contact.id);
    if (!current) return;
    await this.store.updateContact({
      ...current,
      birthDate: current.birthDate ? { ...current.birthDate, reminderEnabled: false } : undefined,
      anniversaries: (current.anniversaries ?? []).map((anniversary) => ({
        ...anniversary,
        reminderEnabled: false,
      })),
      updatedAt: new Date().toISOString(),
    });
    this.feedback.notify('All reminders disabled for ' + this.displayName(contact));
  }

  protected dateLabel(event: KeepsakeEvent): string {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long' }).format(
      event.nextDate,
    );
  }
}
