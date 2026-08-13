import { detectCurrencyAmount, detectLikelyCode, detectMessageValue } from './otp';

describe('OTP detection', () => {
  it('prefers a code near an OTP keyword', () => {
    expect(detectLikelyCode('Your LPG delivery OTP is 5821. Ref 999999.')).toBe('5821');
  });

  it('supports alphanumeric verification codes', () => {
    expect(detectLikelyCode('Verification code: AB12Z9')).toBe('AB12Z9');
  });

  it('detects hyphenated alphanumeric verification codes', () => {
    expect(
      detectLikelyCode('Your Google verification code is J8K2-9P4M. Valid for 5 minutes.'),
    ).toBe('J8K2-9P4M');
  });

  it('detects a delivery authentication code near the keyword', () => {
    expect(
      detectLikelyCode(
        'We confirm receipt of online payment made via BBPAY for 944.5 against LPG Refill Booking No: 1260952900136035.Your Delivery Authentication Code is 1201 - HPCL',
      ),
    ).toBe('1201');
  });

  it('detects an OTP that appears before the keyword', () => {
    expect(
      detectLikelyCode(
        '004861 is SECRET OTP for txn of INR 294.00 on Axis Bank card XX0957 at GPAYUTILIT on 13-08-26 13:09:45. OTP valid for 5 mins. Please do not share this OTP.',
      ),
    ).toBe('004861');
  });

  it('ignores card and amount numbers when detecting a one-time password', () => {
    expect(
      detectLikelyCode(
        'Your Amex SafeKey One-Time Password for INR 138.00, at PAYU RETAIL PG is 073102. Valid for 10 mins for Card ending  21003. Do not disclose it to anyone.',
      ),
    ).toBe('073102');
  });

  it('detects a leading verification code with a trailing signature', () => {
    expect(
      detectLikelyCode(
        '111294 is your AutoPe verification code. It is valid for 1 minutes. DO NOT share your OTP with anyone.\nTeam AutoPe\nLive Non-Stop\nHmAqckFBMQK',
      ),
    ).toBe('111294');
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
