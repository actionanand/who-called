const KEYWORD_CODE =
  /\b(?:otp|code|pin|verification|delivery|reference|ref)\D{0,16}([A-Z0-9]{4,10})\b/i;
const STANDALONE_CODE = /\b(\d{4,8})\b/;

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
  return message.match(KEYWORD_CODE)?.[1] ?? message.match(STANDALONE_CODE)?.[1] ?? '';
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
