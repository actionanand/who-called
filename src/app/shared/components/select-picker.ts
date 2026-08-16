import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { AppIcon } from './app-icon';

export interface SelectPickerOption {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'app-select-picker',
  imports: [AppIcon],
  template: `
    <button
      #trigger
      type="button"
      class="picker-trigger"
      [class.compact]="compact()"
      [disabled]="disabled()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      (click)="openPicker()"
    >
      <span>{{ selectedOption()?.label ?? placeholder() }}</span>
      <app-icon name="chevron-down" />
    </button>

    @if (open()) {
      <div class="picker-overlay">
        <button
          class="picker-backdrop"
          type="button"
          aria-label="Close options"
          (click)="close()"
        ></button>
        <section
          class="picker-sheet"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="sheetTitle()"
        >
          <header>
            <strong>{{ sheetTitle() }}</strong>
            <button #closeButton type="button" aria-label="Close options" (click)="close()">
              <app-icon name="close" />
            </button>
          </header>
          @if (searchable()) {
            <label class="picker-search">
              <span class="visually-hidden">Search {{ sheetTitle() }}</span>
              <app-icon name="search" />
              <input
                #searchInput
                type="search"
                autocomplete="off"
                [placeholder]="searchPlaceholder()"
                [value]="search()"
                (input)="updateSearch($event)"
              />
            </label>
          }
          @if (filteredOptions().length) {
            <div class="picker-options" role="listbox" [attr.aria-label]="sheetTitle()">
              @for (option of filteredOptions(); track option.value) {
                <button
                  type="button"
                  class="picker-option"
                  [class.selected]="option.value === value()"
                  [disabled]="option.disabled"
                  role="option"
                  [attr.aria-selected]="option.value === value()"
                  (click)="select(option.value)"
                >
                  @if (option.icon) {
                    <span class="option-icon"><app-icon [name]="option.icon" /></span>
                  }
                  <span class="option-copy">
                    <strong>{{ option.label }}</strong>
                    @if (option.detail) {
                      <small>{{ option.detail }}</small>
                    }
                  </span>
                  @if (option.value === value()) {
                    <app-icon class="option-check" name="check" />
                  }
                </button>
              }
            </div>
          } @else {
            <p class="empty-options" role="status">No matching options</p>
          }
        </section>
      </div>
    }
  `,
  styleUrl: './select-picker.scss',
  host: {
    '(document:keydown.escape)': 'close()',
  },
})
export class SelectPicker {
  readonly value = input('');
  readonly options = input.required<readonly SelectPickerOption[]>();
  readonly sheetTitle = input('Choose an option');
  readonly placeholder = input('Choose an option');
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly searchable = input(false);
  readonly searchPlaceholder = input('Search options');
  readonly valueChange = output<string>();
  readonly open = signal(false);
  readonly search = signal('');
  readonly selectedOption = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  readonly filteredOptions = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.options();
    return this.options().filter((option) =>
      `${option.label} ${option.detail ?? ''} ${option.value}`.toLocaleLowerCase().includes(query),
    );
  });
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  openPicker(): void {
    this.search.set('');
    this.open.set(true);
    globalThis.setTimeout(
      () => (this.searchInput() ?? this.closeButton())?.nativeElement.focus(),
      0,
    );
  }

  close(restoreFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) globalThis.setTimeout(() => this.trigger()?.nativeElement.focus(), 0);
  }

  select(value: string): void {
    this.valueChange.emit(value);
    this.close();
  }

  updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
}
