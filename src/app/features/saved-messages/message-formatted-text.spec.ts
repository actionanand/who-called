import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { messageDisplayParts } from '../../core/utils/message-formatting';
import { MessageFormattedText } from './message-formatted-text';

describe('MessageFormattedText', () => {
  it('renders formatting boundaries without adding separator spaces', () => {
    const message = 'Booking reference WC-2026-4821';
    const fixture = TestBed.createComponent(MessageFormattedText);
    fixture.componentRef.setInput(
      'parts',
      messageDisplayParts(message, [
        { start: 1, end: 12, bold: false, highlight: true },
        { start: 23, end: 27, bold: true, highlight: false },
      ]),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe(message);
    expect(
      [...fixture.nativeElement.childNodes].filter(
        (node: Node) => node.nodeType === Node.TEXT_NODE && node.textContent,
      ),
    ).toHaveLength(0);
  });
});
