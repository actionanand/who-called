export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePhone(callingCode: string, nationalNumber: string): string {
  const code = digitsOnly(callingCode);
  let number = digitsOnly(nationalNumber);

  if (code === '91' && number.length === 11 && number.startsWith('0')) {
    number = number.slice(1);
  }

  return code && number ? `+${code}${number}` : '';
}

export function formatIndianPhone(value: string): string {
  const digits = digitsOnly(value).slice(-10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function buildWhatsAppUrl(
  callingCode: string,
  nationalNumber: string,
  message: string,
): string | null {
  const normalized = normalizePhone(callingCode, nationalNumber);
  if (normalized.length < 8) return null;
  const text = message.trim();
  return `https://wa.me/${normalized.slice(1)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
