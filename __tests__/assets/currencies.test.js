/**
 * assets/currencies.json decides how many decimals every amount in a currency
 * keeps: the amount field's input, rounding at save time, conversions, and how
 * balances are shown (Currency.getDecimalPlaces).
 *
 * Its `decimal_digits` are a product decision, not ISO 4217. RUB, CNY, THB,
 * TRY and AMD are deliberately whole units (0), like JPY and KRW, although ISO
 * gives them 2. Audits have flagged this as a bug more than once; it is not.
 * See CLAUDE.md, "Assets Structure". Change a value here only together with
 * that decision.
 */
import currencies from '../../assets/currencies.json';

describe('assets/currencies.json decimal places', () => {
  it('keeps RUB, CNY, THB, TRY and AMD in whole units by design', () => {
    ['RUB', 'CNY', 'THB', 'TRY', 'AMD'].forEach(code => {
      expect(currencies[code].decimal_digits).toBe(0);
    });
  });

  it('keeps JPY and KRW in whole units, as ISO 4217 does', () => {
    expect(currencies.JPY.decimal_digits).toBe(0);
    expect(currencies.KRW.decimal_digits).toBe(0);
  });

  // Several parts of the app rely on this bound: amount parsing reads a
  // 3-digit tail as thousands grouping, and SQL money sums scale by 10^4.
  it('gives no currency more than 2 decimals', () => {
    Object.entries(currencies).forEach(([code, info]) => {
      expect([code, info.decimal_digits <= 2]).toEqual([code, true]);
    });
  });

  it('names each entry by its own code', () => {
    Object.entries(currencies).forEach(([code, info]) => {
      expect(info.code).toBe(code);
    });
  });
});
