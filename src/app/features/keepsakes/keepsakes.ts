import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../core/services/app-store.service';
import { KeepsakeEvent, KeepsakeKind, keepsakeEvents } from '../../core/utils/keepsake-events';
import { AppIcon } from '../../shared/components/app-icon';

type KeepsakePeriod = 'today' | 'week' | 'month' | 'next-month' | 'past-month' | 'upcoming';
type KeepsakeView = 'list' | 'calendar';

interface CalendarCell {
  readonly day: number;
  readonly key: string;
  readonly today: boolean;
  readonly events: readonly KeepsakeEvent[];
}

@Component({
  selector: 'app-keepsakes',
  imports: [AppIcon, RouterLink],
  templateUrl: './keepsakes.html',
  styleUrl: './keepsakes.scss',
})
export class Keepsakes {
  protected readonly store = inject(AppStore);
  protected readonly period = signal<KeepsakePeriod>('today');
  protected readonly kind = signal<'all' | KeepsakeKind>('all');
  protected readonly view = signal<KeepsakeView>('list');
  protected readonly calendarMonth = signal(this.monthKey(new Date()));
  protected readonly selectedDate = signal(this.dateKey(new Date()));
  protected readonly periods: readonly {
    readonly value: KeepsakePeriod;
    readonly label: string;
  }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'next-month', label: 'Next month' },
    { value: 'past-month', label: 'Past month' },
    { value: 'upcoming', label: 'Upcoming' },
  ];

  protected readonly allEvents = computed(() => keepsakeEvents(this.store.visibleContacts()));
  protected readonly events = computed(() => {
    const now = new Date();
    const kind = this.kind();
    return this.allEvents().filter((event) => {
      if (kind !== 'all' && event.kind !== kind) return false;
      return this.inPeriod(event, this.period(), now);
    });
  });
  protected readonly monthLabel = computed(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
      new Date(year, month - 1, 1),
    );
  });
  protected readonly leadingBlanks = computed(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    return Array.from({ length: new Date(year, month - 1, 1).getDay() });
  });
  protected readonly calendarCells = computed<readonly CalendarCell[]>(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const dayCount = new Date(year, month, 0).getDate();
    const today = this.dateKey(new Date());
    return Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const key =
        String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      return {
        day,
        key,
        today: key === today,
        events: this.allEvents().filter(
          (event) =>
            (this.kind() === 'all' || this.kind() === event.kind) &&
            event.month === month &&
            Math.min(event.day, dayCount) === day,
        ),
      };
    });
  });
  protected readonly selectedEvents = computed(() => {
    const selected = this.selectedDate();
    return this.calendarCells().find((cell) => cell.key === selected)?.events ?? [];
  });

  protected setPeriod(period: KeepsakePeriod): void {
    this.period.set(period);
    this.view.set('list');
  }

  protected setKind(kind: 'all' | KeepsakeKind): void {
    this.kind.set(kind);
  }

  protected setView(view: KeepsakeView): void {
    this.view.set(view);
  }

  protected moveMonth(offset: number): void {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    this.calendarMonth.set(this.monthKey(next));
    this.selectedDate.set(this.monthKey(next) + '-01');
  }

  protected chooseDate(key: string): void {
    this.selectedDate.set(key);
  }

  protected eventDate(event: KeepsakeEvent): string {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(event.nextDate);
  }

  protected timing(event: KeepsakeEvent): string {
    if (event.daysUntil === 0) return 'Today';
    if (event.daysUntil === 1) return 'Tomorrow';
    return 'In ' + event.daysUntil + ' days';
  }

  protected yearsLabel(event: KeepsakeEvent): string {
    if (!event.year) return '';
    const years = event.nextDate.getFullYear() - event.year;
    if (years < 0) return '';
    return event.kind === 'birthday' ? 'Turns ' + years : years + ' years';
  }

  private inPeriod(event: KeepsakeEvent, period: KeepsakePeriod, now: Date): boolean {
    const currentMonth = now.getMonth() + 1;
    const nextMonth = (currentMonth % 12) + 1;
    const previousMonth = ((currentMonth + 10) % 12) + 1;
    switch (period) {
      case 'today':
        return event.daysUntil === 0;
      case 'week': {
        const end = new Date(now);
        end.setDate(now.getDate() + (6 - now.getDay()));
        end.setHours(23, 59, 59, 999);
        return event.nextDate <= end;
      }
      case 'month':
        return event.month === currentMonth;
      case 'next-month':
        return event.month === nextMonth;
      case 'past-month':
        return event.month === previousMonth;
      case 'upcoming':
        return event.daysUntil > 0;
    }
  }

  private monthKey(date: Date): string {
    return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  private dateKey(date: Date): string {
    return this.monthKey(date) + '-' + String(date.getDate()).padStart(2, '0');
  }
}
