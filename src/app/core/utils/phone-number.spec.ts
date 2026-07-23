import { buildWhatsAppUrl, normalizePhone } from './phone-number';

describe('phone number utilities', () => {
  it('uses India and removes the local trunk prefix', () => {
    expect(normalizePhone('+91', '09876543210')).toBe('+919876543210');
  });

  it('creates an encoded WhatsApp URL', () => {
    expect(buildWhatsAppUrl('+91', '98765 43210', 'Hello & welcome')).toBe(
      'https://wa.me/919876543210?text=Hello%20%26%20welcome',
    );
  });

  it('rejects an incomplete number', () => {
    expect(buildWhatsAppUrl('+91', '123', '')).toBeNull();
  });
});
