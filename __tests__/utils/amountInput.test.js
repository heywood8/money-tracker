import { normalizeDecimalComma } from '../../app/utils/amountInput';

describe('normalizeDecimalComma', () => {
  it('leaves text without a comma alone', () => {
    expect(normalizeDecimalComma('1234.56')).toBe('1234.56');
    expect(normalizeDecimalComma('')).toBe('');
    expect(normalizeDecimalComma(undefined)).toBe('');
  });

  // decimal-pad keyboards type "," as the decimal key in most locales.
  it('reads a lone comma as the decimal point', () => {
    expect(normalizeDecimalComma('1234,56')).toBe('1234.56');
    expect(normalizeDecimalComma('12,5')).toBe('12.5');
    expect(normalizeDecimalComma('12,')).toBe('12.');
    expect(normalizeDecimalComma('-3,20')).toBe('-3.20');
  });

  it('reads a comma followed by exactly three digits as grouping', () => {
    expect(normalizeDecimalComma('1,500')).toBe('1500');
    expect(normalizeDecimalComma('1,234,567')).toBe('1234567');
  });

  it('takes the later separator as the decimal point when both appear', () => {
    expect(normalizeDecimalComma('1,234.56')).toBe('1234.56');
    expect(normalizeDecimalComma('1.234,56')).toBe('1234.56');
    expect(normalizeDecimalComma('1.234.567,8')).toBe('1234567.8');
  });
});
