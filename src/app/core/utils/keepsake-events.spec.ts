import { describe, expect, it } from 'vitest';
import { PrivateContact } from '../models/app.models';
import { dateForYear, keepsakeEvents } from './keepsake-events';

function contact(overrides: Partial<PrivateContact> = {}): PrivateContact {
  return {
    id: 'contact-1',
    name: 'Anand',
    company: '',
    phone: '9876543210',
    normalizedPhone: '+919876543210',
    whatsappEnabled: true,
    favorite: false,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('keepsakeEvents', () => {
  it('returns a birthday and named anniversaries in date order', () => {
    const events = keepsakeEvents(
      [
        contact({
          birthDate: {
            mode: 'full',
            year: 1990,
            month: 8,
            day: 3,
            reminderEnabled: true,
          },
          anniversaries: [
            {
              id: 'wedding',
              name: 'Wedding anniversary',
              year: 2020,
              month: 8,
              day: 5,
              reminderEnabled: true,
            },
            {
              id: 'company',
              name: 'Work anniversary',
              year: 2021,
              month: 7,
              day: 1,
              reminderEnabled: false,
            },
          ],
        }),
      ],
      new Date(2026, 7, 3, 12),
    );

    expect(events.map((event) => event.label)).toEqual([
      'Birthday',
      'Wedding anniversary',
      'Work anniversary',
    ]);
    expect(events[0].daysUntil).toBe(0);
    expect(events[1].daysUntil).toBe(2);
    expect(events[2].nextDate.getFullYear()).toBe(2027);
    expect(events.filter((event) => event.reminderEnabled)).toHaveLength(2);
  });

  it('clamps leap-day keepsakes to the last valid day of February', () => {
    expect(dateForYear(2027, 2, 29).getDate()).toBe(28);
    expect(dateForYear(2028, 2, 29).getDate()).toBe(29);
  });
});
