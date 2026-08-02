import { describe, expect, it } from 'vitest';
import { messageDisplayParts, messageFormatState, toggleMessageFormat } from './message-formatting';

describe('message formatting', () => {
  it('persists bold and highlight independently and together', () => {
    let formats = toggleMessageFormat(12, [], { start: 0, end: 5 }, 'bold');
    formats = toggleMessageFormat(12, formats, { start: 3, end: 8 }, 'highlight');

    expect(formats).toEqual([
      { start: 0, end: 3, bold: true, highlight: false },
      { start: 3, end: 5, bold: true, highlight: true },
      { start: 5, end: 8, bold: false, highlight: true },
    ]);
    expect(messageFormatState(12, formats, { start: 3, end: 5 })).toEqual({
      bold: true,
      highlight: true,
    });
  });

  it('removes a format when the complete selection already has it', () => {
    const formats = toggleMessageFormat(
      8,
      [{ start: 1, end: 7, bold: true, highlight: false }],
      { start: 2, end: 5 },
      'bold',
    );
    expect(formats).toEqual([
      { start: 1, end: 2, bold: true, highlight: false },
      { start: 5, end: 7, bold: true, highlight: false },
    ]);
  });

  it('detects safe web links and phone numbers without treating short codes as phones', () => {
    const text =
      'Visit https://example.com/pay. Use www.example.org or call +91 98765 43210. OTP 4821.';
    const parts = messageDisplayParts(text);
    expect(parts.find((part) => part.kind === 'url')?.text).toBe('https://example.com/pay');
    expect(parts.some((part) => part.kind === 'url' && part.text === 'www.example.org')).toBe(true);
    expect(parts.find((part) => part.kind === 'phone')?.text).toBe('+91 98765 43210');
    expect(parts.some((part) => part.text === '4821' && part.kind === 'phone')).toBe(false);
  });
});
