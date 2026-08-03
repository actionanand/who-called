import { PrivateContact } from '../models/app.models';

export type KeepsakeKind = 'birthday' | 'anniversary';

export interface KeepsakeEvent {
  readonly id: string;
  readonly contact: PrivateContact;
  readonly kind: KeepsakeKind;
  readonly label: string;
  readonly month: number;
  readonly day: number;
  readonly year?: number;
  readonly reminderEnabled: boolean;
  readonly nextDate: Date;
  readonly daysUntil: number;
}

const DAY_MS = 86_400_000;
const CATCH_UP_DELAY_MS = 60_000;

export function keepsakeEvents(
  contacts: readonly PrivateContact[],
  now = new Date(),
): readonly KeepsakeEvent[] {
  return contacts
    .flatMap((contact) => {
      const events: KeepsakeEvent[] = [];
      if (contact.birthDate) {
        events.push(
          createEvent(
            `${contact.id}:birthday`,
            contact,
            'birthday',
            'Birthday',
            contact.birthDate.month,
            contact.birthDate.day,
            contact.birthDate.year,
            Boolean(contact.birthDate.reminderEnabled),
            now,
          ),
        );
      }
      for (const anniversary of (contact.anniversaries ?? []).slice(0, 3)) {
        events.push(
          createEvent(
            `${contact.id}:anniversary:${anniversary.id}`,
            contact,
            'anniversary',
            anniversary.name || 'Anniversary',
            anniversary.month,
            anniversary.day,
            anniversary.year,
            anniversary.reminderEnabled,
            now,
          ),
        );
      }
      return events;
    })
    .sort((left, right) => left.nextDate.getTime() - right.nextDate.getTime());
}

export function dateForYear(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay), 6, 0, 0, 0);
}

export function keepsakeNotificationDate(nextDate: Date, now = new Date()): Date {
  const scheduled = new Date(nextDate);
  const isToday =
    scheduled.getFullYear() === now.getFullYear() &&
    scheduled.getMonth() === now.getMonth() &&
    scheduled.getDate() === now.getDate();
  return isToday && scheduled.getTime() <= now.getTime()
    ? new Date(now.getTime() + CATCH_UP_DELAY_MS)
    : scheduled;
}

function createEvent(
  id: string,
  contact: PrivateContact,
  kind: KeepsakeKind,
  label: string,
  month: number,
  day: number,
  year: number | undefined,
  reminderEnabled: boolean,
  now: Date,
): KeepsakeEvent {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let nextDate = dateForYear(now.getFullYear(), month, day);
  if (nextDate.getTime() < today.getTime())
    nextDate = dateForYear(now.getFullYear() + 1, month, day);
  const eventDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
  return {
    id,
    contact,
    kind,
    label,
    month,
    day,
    year,
    reminderEnabled,
    nextDate,
    daysUntil: Math.round((eventDay.getTime() - today.getTime()) / DAY_MS),
  };
}
