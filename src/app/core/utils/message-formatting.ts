import { MessageTextFormat } from '../models/app.models';

export type MessageFormatKind = 'bold' | 'highlight';
export type MessageEntityKind = 'text' | 'url' | 'phone';

export interface MessageTextRange {
  readonly start: number;
  readonly end: number;
}

export interface MessageDisplayPart extends MessageTextRange {
  readonly text: string;
  readonly kind: MessageEntityKind;
  readonly bold: boolean;
  readonly highlight: boolean;
}

interface EntityRange extends MessageTextRange {
  readonly kind: Exclude<MessageEntityKind, 'text'>;
}

export function toggleMessageFormat(
  textLength: number,
  formats: readonly MessageTextFormat[],
  selection: MessageTextRange,
  kind: MessageFormatKind,
): readonly MessageTextFormat[] {
  const range = safeRange(selection, textLength);
  if (!range) return normalizeMessageFormats(textLength, formats);
  const flags = formatFlags(textLength, formats);
  const target = kind === 'bold' ? flags.bold : flags.highlight;
  const enable = target.slice(range.start, range.end).some((value) => value === 0);
  target.fill(enable ? 1 : 0, range.start, range.end);
  return compressFlags(flags.bold, flags.highlight);
}

export function messageFormatState(
  textLength: number,
  formats: readonly MessageTextFormat[],
  selection: MessageTextRange | null,
): Readonly<Record<MessageFormatKind, boolean>> {
  const range = selection ? safeRange(selection, textLength) : null;
  if (!range) return { bold: false, highlight: false };
  const flags = formatFlags(textLength, formats);
  return {
    bold: flags.bold.slice(range.start, range.end).every((value) => value === 1),
    highlight: flags.highlight.slice(range.start, range.end).every((value) => value === 1),
  };
}

export function messageDisplayParts(
  text: string,
  formats: readonly MessageTextFormat[] = [],
): readonly MessageDisplayPart[] {
  if (!text) return [];
  const flags = formatFlags(text.length, formats);
  const entities = entityRanges(text);
  const boundaries = new Set<number>([0, text.length]);
  for (const format of normalizeMessageFormats(text.length, formats)) {
    boundaries.add(format.start);
    boundaries.add(format.end);
  }
  for (const entity of entities) {
    boundaries.add(entity.start);
    boundaries.add(entity.end);
  }
  const points = [...boundaries].sort((left, right) => left - right);
  return points.slice(0, -1).flatMap((start, index): readonly MessageDisplayPart[] => {
    const end = points[index + 1];
    if (end <= start) return [];
    const entity = entities.find((candidate) => candidate.start <= start && candidate.end >= end);
    return [
      {
        start,
        end,
        text: text.slice(start, end),
        kind: entity?.kind ?? 'text',
        bold: flags.bold[start] === 1,
        highlight: flags.highlight[start] === 1,
      },
    ];
  });
}

export function normalizeMessageFormats(
  textLength: number,
  formats: readonly MessageTextFormat[],
): readonly MessageTextFormat[] {
  const flags = formatFlags(textLength, formats);
  return compressFlags(flags.bold, flags.highlight);
}

function formatFlags(
  textLength: number,
  formats: readonly MessageTextFormat[],
): { readonly bold: Uint8Array; readonly highlight: Uint8Array } {
  const length = Math.max(0, Math.floor(textLength));
  const bold = new Uint8Array(length);
  const highlight = new Uint8Array(length);
  for (const format of formats) {
    const range = safeRange(format, length);
    if (!range) continue;
    if (format.bold) bold.fill(1, range.start, range.end);
    if (format.highlight) highlight.fill(1, range.start, range.end);
  }
  return { bold, highlight };
}

function compressFlags(bold: Uint8Array, highlight: Uint8Array): readonly MessageTextFormat[] {
  const formats: MessageTextFormat[] = [];
  let start = 0;
  while (start < bold.length) {
    const isBold = bold[start] === 1;
    const isHighlighted = highlight[start] === 1;
    if (!isBold && !isHighlighted) {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (
      end < bold.length &&
      (bold[end] === 1) === isBold &&
      (highlight[end] === 1) === isHighlighted
    ) {
      end += 1;
    }
    formats.push({ start, end, bold: isBold, highlight: isHighlighted });
    start = end;
  }
  return formats;
}

function safeRange(range: MessageTextRange, textLength: number): MessageTextRange | null {
  const start = Math.max(0, Math.min(textLength, Math.floor(range.start)));
  const end = Math.max(start, Math.min(textLength, Math.floor(range.end)));
  return end > start ? { start, end } : null;
}

function entityRanges(text: string): readonly EntityRange[] {
  const entities: EntityRange[] = [];
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
  for (const match of text.matchAll(urlPattern)) {
    const start = match.index;
    let value = match[0];
    while (/[.,!?;:)\]}]$/u.test(value)) value = value.slice(0, -1);
    if (value) entities.push({ start, end: start + value.length, kind: 'url' });
  }

  const phonePattern = /\+?\d(?:[\d\s().-]*\d)/gu;
  for (const match of text.matchAll(phonePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    const digits = match[0].replaceAll(/\D/gu, '');
    const minimumLength = match[0].trimStart().startsWith('+') ? 8 : 10;
    if (digits.length < minimumLength || digits.length > 15) continue;
    if (entities.some((entity) => entity.start < end && entity.end > start)) continue;
    const before = text[start - 1] ?? '';
    const after = text[end] ?? '';
    if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) continue;
    entities.push({ start, end, kind: 'phone' });
  }
  return entities.sort((left, right) => left.start - right.start);
}
