const CURRENCY_TOKEN = String.raw`(?:\u20B9|Rs\.?|INR|USD|US\$|\$|EUR|\u20AC|GBP|\u00A3|AED|SAR|JPY|CNY|RMB|\u00A5|CAD|AUD|SGD|NZD|CHF|HKD)`;
const AMOUNT_TOKEN = String.raw`\d+(?:,\d+)*(?:\.\d{1,2})?`;
const PREFIXED_AMOUNT = new RegExp(
  `(${CURRENCY_TOKEN})\\s*(?::|=)?\\s*(${AMOUNT_TOKEN})(?![\\d,]|\\.\\d)`,
  'giu',
);
const SUFFIXED_AMOUNT = new RegExp(`(${AMOUNT_TOKEN})\\s*(${CURRENCY_TOKEN})(?![A-Za-z])`, 'giu');

export type DetectedMessageValueKind = 'otp' | 'amount' | 'code';

export interface DetectedMessageValue {
  readonly value: string;
  readonly kind: DetectedMessageValueKind;
}

interface CurrencyAmountCandidate {
  readonly index: number;
  readonly currency: string;
  readonly amount: string;
  readonly score: number;
}

export function detectLikelyCode(message: string): string {
  const candidates = collectCodeCandidates(message);
  if (candidates.length === 0) return '';
  const keywords = collectCodeKeywords(message);
  let best: (CodeCandidate & { readonly score: number }) | null = null;
  for (const candidate of candidates) {
    const score = scoreCodeCandidate(message, candidate, keywords);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (best && best.score > 0) return best.value;
  const fallback = candidates.find((candidate) => candidate.kind === 'digits') ?? candidates[0];
  return fallback.value;
}

interface CodeCandidate {
  readonly index: number;
  readonly end: number;
  readonly value: string;
  readonly kind: 'hyphen' | 'mixed' | 'digits';
}

interface CodeKeyword {
  readonly start: number;
  readonly end: number;
  readonly weight: number;
}

const HYPHENATED_CODE = /\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g;
const MIXED_CODE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{4,10}\b/g;
const DIGIT_CODE = /\b\d{4,8}\b/g;
const STRONG_KEYWORD =
  /\b(?:otp|one[\s-]?time(?:\s+(?:password|passcode|pin|code))?|passcode|password|verification|verify|secret|security\s+code|authentication(?:\s+code)?|auth\s+code)\b/gi;
const WEAK_KEYWORD = /\b(?:code|pin|reference|ref|delivery)\b/gi;

function collectCodeCandidates(message: string): readonly CodeCandidate[] {
  const found = new Map<number, CodeCandidate>();
  const add = (index: number, value: string, kind: CodeCandidate['kind']): void => {
    if (!found.has(index)) found.set(index, { index, end: index + value.length, value, kind });
  };
  for (const match of message.matchAll(HYPHENATED_CODE)) {
    if (match.index !== undefined && acceptHyphenatedCode(match[0])) {
      add(match.index, match[0], 'hyphen');
    }
  }
  for (const match of message.matchAll(MIXED_CODE)) {
    if (match.index !== undefined) add(match.index, match[0], 'mixed');
  }
  for (const match of message.matchAll(DIGIT_CODE)) {
    if (match.index !== undefined) add(match.index, match[0], 'digits');
  }
  return [...found.values()].sort((left, right) => left.index - right.index);
}

function acceptHyphenatedCode(value: string): boolean {
  if (!/\d/u.test(value)) return false;
  if (/[A-Za-z]/u.test(value)) return true;
  return value.split('-').every((group) => group.length >= 3);
}

function collectCodeKeywords(message: string): readonly CodeKeyword[] {
  const keywords: CodeKeyword[] = [];
  for (const match of message.matchAll(STRONG_KEYWORD)) {
    if (match.index !== undefined) {
      keywords.push({ start: match.index, end: match.index + match[0].length, weight: 9 });
    }
  }
  for (const match of message.matchAll(WEAK_KEYWORD)) {
    if (match.index !== undefined) {
      keywords.push({ start: match.index, end: match.index + match[0].length, weight: 5 });
    }
  }
  return keywords;
}

function scoreCodeCandidate(
  message: string,
  candidate: CodeCandidate,
  keywords: readonly CodeKeyword[],
): number {
  let score = keywordProximityScore(candidate, keywords);
  const before = message.slice(Math.max(0, candidate.index - 16), candidate.index);
  if (
    /\b(?:is|are|:)\s*$/iu.test(message.slice(Math.max(0, candidate.index - 6), candidate.index))
  ) {
    score += 2;
  }
  if (new RegExp(`${CURRENCY_TOKEN}\\s*$`, 'iu').test(before)) score -= 8;
  if (/\b(?:card|ending|a\/c|acct|account|bal|balance|xx+)\b\W*$/iu.test(before)) score -= 5;
  if (candidate.kind === 'hyphen') score += 3;
  else if (candidate.kind === 'digits') score += 1;
  return score;
}

function keywordProximityScore(candidate: CodeCandidate, keywords: readonly CodeKeyword[]): number {
  const maxGap = 45;
  let best = 0;
  for (const keyword of keywords) {
    let gap: number;
    if (candidate.index >= keyword.end) gap = candidate.index - keyword.end;
    else if (keyword.start >= candidate.end) gap = keyword.start - candidate.end + 6;
    else continue;
    if (gap > maxGap) continue;
    const value = keyword.weight * (1 - gap / (maxGap + 1));
    if (value > best) best = value;
  }
  return best;
}

export function detectMessageValue(message: string, category: string): DetectedMessageValue {
  if (category.trim().toLocaleUpperCase() === 'OTP') {
    return { value: detectLikelyCode(message), kind: 'otp' };
  }
  const amount = detectCurrencyAmount(message);
  if (amount) return { value: amount, kind: 'amount' };
  return { value: detectLikelyCode(message), kind: 'code' };
}

export function detectCurrencyAmount(message: string): string {
  const candidates = [
    ...currencyCandidates(message, PREFIXED_AMOUNT, false),
    ...currencyCandidates(message, SUFFIXED_AMOUNT, true),
  ];
  const best = candidates.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  )[0];
  return best ? formatCurrencyAmount(best.currency, best.amount) : '';
}

function currencyCandidates(
  message: string,
  pattern: RegExp,
  amountFirst: boolean,
): readonly CurrencyAmountCandidate[] {
  pattern.lastIndex = 0;
  const candidates: CurrencyAmountCandidate[] = [];
  let match = pattern.exec(message);
  while (match) {
    const currency = match[amountFirst ? 2 : 1];
    const amount = match[amountFirst ? 1 : 2];
    if (currency && amount) {
      candidates.push({
        index: match.index,
        currency,
        amount,
        score: currencyContextScore(message, match.index),
      });
    }
    match = pattern.exec(message);
  }
  return candidates;
}

function currencyContextScore(message: string, index: number): number {
  const context = message.slice(Math.max(0, index - 48), index).toLocaleLowerCase();
  let score = 0;
  if (
    /\b(?:amount|amt|debited|credited|paid|payment|purchase|txn|transaction|total|due|charge)\b/u.test(
      context,
    )
  )
    score += 4;
  if (/\bmax(?:imum)?\s+(?:txn|transaction)?\s*(?:amt|amount)?\b/u.test(context)) score += 2;
  if (/\b(?:available|avl)\s+(?:balance|bal)|\b(?:balance|bal|limit)\b/u.test(context)) score -= 6;
  return score;
}

function formatCurrencyAmount(currency: string, amount: string): string {
  const normalizedCurrency = /^rs\.?$/iu.test(currency)
    ? 'Rs'
    : /^[a-z]+$/iu.test(currency)
      ? currency.toLocaleUpperCase()
      : currency;
  return /^[\u20B9$\u20AC\u00A3\u00A5]$/u.test(normalizedCurrency)
    ? `${normalizedCurrency}${amount}`
    : `${normalizedCurrency} ${amount}`;
}
