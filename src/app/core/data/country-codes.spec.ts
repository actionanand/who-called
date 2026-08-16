import { countryNameForCallingCode, SORTED_COUNTRY_CODES } from './country-codes';

describe('country calling codes', () => {
  it('keeps the current country when it shares a calling code', () => {
    expect(countryNameForCallingCode('+1', 'Canada')).toBe('Canada');
  });

  it('uses stable defaults for calling codes shared by countries and territories', () => {
    expect(countryNameForCallingCode('1', 'India')).toBe('United States');
    expect(countryNameForCallingCode('+44', 'India')).toBe('United Kingdom');
    expect(countryNameForCallingCode('+61', 'India')).toBe('Australia');
  });

  it('matches a unique calling code', () => {
    expect(countryNameForCallingCode('+383', 'India')).toBe('Kosovo');
  });

  it('uses the custom option for an unknown code', () => {
    expect(countryNameForCallingCode('+9999', 'India')).toBe('Custom calling code');
  });

  it('keeps the custom option last', () => {
    expect(SORTED_COUNTRY_CODES.at(-1)?.iso).toBe('CUSTOM');
  });
});
