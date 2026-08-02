import { Component, input, output } from '@angular/core';
import { MessageDisplayPart } from '../../core/utils/message-formatting';
import { MessageTextPart } from './message-text-part';

@Component({
  selector: 'app-message-formatted-text',
  imports: [MessageTextPart],
  template:
    '@for (part of parts(); track $index) {<app-message-text-part [part]="part" (activated)="activated.emit($event)" />}',
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class MessageFormattedText {
  readonly parts = input.required<readonly MessageDisplayPart[]>();
  readonly activated = output<MessageDisplayPart>();
}
