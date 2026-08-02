import { Component, input, output } from '@angular/core';
import { MessageDisplayPart } from '../../core/utils/message-formatting';

@Component({
  selector: 'app-message-text-part',
  template: `
    @if (part().bold && part().highlight) {
      <mark
        ><strong>{{ part().text }}</strong></mark
      >
    } @else if (part().bold) {
      <strong>{{ part().text }}</strong>
    } @else if (part().highlight) {
      <mark>{{ part().text }}</mark>
    } @else {
      {{ part().text }}
    }
  `,
  styles: `
    :host {
      display: inline;
      white-space: pre-wrap;
    }
    :host.entity {
      color: var(--primary);
      text-decoration: underline;
      text-decoration-thickness: 0.08em;
      text-underline-offset: 0.14em;
      cursor: pointer;
    }
    :host.entity:focus-visible {
      border-radius: 0.2rem;
      outline: 0.15rem solid color-mix(in srgb, var(--primary) 65%, white);
      outline-offset: 0.1rem;
    }
    mark {
      padding: 0.05em 0.12em;
      border-radius: 0.2em;
      color: var(--text);
      background: #ffe27a;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    :host-context(:root[data-theme='dark']) mark {
      color: #fff8d8;
      background: #715b00;
    }
  `,
  host: {
    '[class.entity]': "part().kind !== 'text'",
    '[attr.role]': "part().kind === 'text' ? null : 'link'",
    '[attr.tabindex]': "part().kind === 'text' ? null : 0",
    '[attr.aria-label]': 'ariaLabel()',
    '(click)': 'activate($event)',
    '(keydown.enter)': 'activate($event)',
    '(keydown.space)': 'activate($event)',
  },
})
export class MessageTextPart {
  readonly part = input.required<MessageDisplayPart>();
  readonly activated = output<MessageDisplayPart>();

  protected ariaLabel(): string | null {
    if (this.part().kind === 'url') return `Open link actions for ${this.part().text}`;
    if (this.part().kind === 'phone') return `Open phone actions for ${this.part().text}`;
    return null;
  }

  protected activate(event: Event): void {
    if (this.part().kind === 'text') return;
    const selection = (event.currentTarget as HTMLElement | null)?.ownerDocument.defaultView
      ?.getSelection()
      ?.toString();
    if (selection) return;
    event.preventDefault();
    this.activated.emit(this.part());
  }
}
