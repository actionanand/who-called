import { detectCurrencyAmount, detectLikelyCode, detectMessageValue } from './otp';

describe('OTP detection', () => {
  it('prefers a code near an OTP keyword', () => {
    expect(detectLikelyCode('Your LPG delivery OTP is 5821. Ref 999999.')).toBe('5821');
  });

  it('supports alphanumeric verification codes', () => {
    expect(detectLikelyCode('Verification code: AB12Z9')).toBe('AB12Z9');
  });

  it('detects and normalizes symbol and currency-code amounts', () => {
    expect(detectCurrencyAmount('You paid \u20B91,299.50 successfully.')).toBe('\u20B91,299.50');
    expect(detectCurrencyAmount('Total Rs. 450 is due.')).toBe('Rs 450');
    expect(detectCurrencyAmount('Payment of 29.99 USD completed.')).toBe('USD 29.99');
  });

  it('prefers a transaction amount over an available balance', () => {
    expect(
      detectCurrencyAmount('Your account was debited INR 500.00. Avl Bal INR 12,450.00.'),
    ).toBe('INR 500.00');
  });

  it('detects the maximum transaction amount in an e-mandate message', () => {
    expect(
      detectCurrencyAmount('Current Txn Amt INR:2.00 Max Txn Amt INR:1950.00 Ref 09876543210'),
    ).toBe('INR 1950.00');
  });

  it('lets an explicitly selected OTP category override currency detection', () => {
    expect(detectMessageValue('Amount \u20B91,950. OTP is 4821.', 'OTP')).toEqual({
      value: '4821',
      kind: 'otp',
    });
    expect(detectMessageValue('Amount \u20B91,950. Reference 4821.', 'Payment')).toEqual({
      value: '\u20B91,950',
      kind: 'amount',
    });
  });
});
