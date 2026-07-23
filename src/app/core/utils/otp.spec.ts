import { detectLikelyCode } from './otp';

describe('OTP detection', () => {
  it('prefers a code near an OTP keyword', () => {
    expect(detectLikelyCode('Your LPG delivery OTP is 5821. Ref 999999.')).toBe('5821');
  });

  it('supports alphanumeric verification codes', () => {
    expect(detectLikelyCode('Verification code: AB12Z9')).toBe('AB12Z9');
  });
});
