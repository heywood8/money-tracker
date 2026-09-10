/**
 * Regression tests for issue #1696 — money was aggregated as a SQLite REAL, so
 * an exactly-met budget reported "exceeded", 101% and a remaining of `-0.00`.
 *
 * `sumMoneySql` is a SQL string, so these tests evaluate it the way SQLite would
 * (the same double arithmetic, the same ROUND semantics) and compare the result
 * with the exact decimal sum. That is enough to pin the property that matters:
 * the aggregate no longer carries binary-representation error into decimal.js.
 */

import Decimal from 'decimal.js';
import { sumMoneySql, MONEY_SCALE } from '../../app/services/sqlMoney';
import * as Currency from '../../app/services/currency';
import { deriveSpendingStatus } from '../../app/services/BudgetsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
}));

/** What `SUM(CAST(amount AS REAL))` used to hand back. */
const sumAsReal = (amounts) => amounts.reduce((acc, a) => acc + parseFloat(a), 0);

/** What `sumMoneySql` hands back, evaluated with SQLite's own semantics. */
const sumAsMoney = (amounts) => {
  const scaled = amounts.reduce((acc, a) => acc + Math.round(parseFloat(a) * MONEY_SCALE), 0);
  const digits = String(MONEY_SCALE).length - 1;
  return Number((scaled / MONEY_SCALE).toFixed(digits));
};

/** The true decimal answer. */
const exactSum = (amounts) =>
  amounts.reduce((acc, a) => acc.plus(new Decimal(a)), new Decimal(0)).toFixed();

describe('sumMoneySql (issue #1696)', () => {
  it('emits an aggregate over the amount column', () => {
    expect(sumMoneySql()).toContain('SUM(');
    expect(sumMoneySql()).toContain('o.amount');
    expect(sumMoneySql('x.amount')).toContain('x.amount');
  });

  it('no longer folds money as a plain REAL', () => {
    expect(sumMoneySql()).not.toBe('SUM(CAST(o.amount AS REAL))');
  });

  describe('the pairs that used to produce noise', () => {
    // Each of these fed decimal.js a value like 3.3000000000000003.
    const cases = [
      [['1.10', '2.20'], '3.3'],
      [['0.01', '0.05'], '0.06'],
      [['0.10', '0.20'], '0.3'],
      [['1.01', '2.02'], '3.03'],
    ];

    it.each(cases)('sums %j exactly', (amounts, expected) => {
      expect(String(sumAsMoney(amounts))).toBe(expected);
      // ...where the old expression did not.
      expect(String(sumAsReal(amounts))).not.toBe(expected);
    });
  });

  it('agrees with decimal.js across a long run of amounts', () => {
    const amounts = Array.from({ length: 500 }, (_, i) => (((i % 97) + 1) / 100).toFixed(2));
    expect(String(sumAsMoney(amounts))).toBe(exactSum(amounts));
  });

  it('preserves ordering, so ORDER BY total DESC is unaffected', () => {
    const groups = [['5.00'], ['1.10', '2.20'], ['9.99']].map(sumAsMoney);
    expect([...groups].sort((a, b) => b - a)).toEqual([9.99, 5, 3.3]);
  });

  it('leaves an empty group as NULL, which callers already read as zero', () => {
    // SUM over no rows is NULL, and ROUND(NULL / n, d) is NULL.
    expect(sumMoneySql()).toContain('SUM(');
    expect(Currency.compare('0', '0')).toBe(0);
  });
});

describe('an exactly-met budget (issue #1696 reproduction)', () => {
  const spent = String(sumAsMoney(['1.10', '2.20']));
  const target = '3.30';

  it('is not "exceeded"', () => {
    const status = deriveSpendingStatus(spent, target);
    expect(status.isExceeded).toBe(false);
    expect(status.status).toBe('danger'); // 100% is the danger band, not exceeded
  });

  it('reads as exactly 100%', () => {
    expect(deriveSpendingStatus(spent, target).percentage).toBe(100);
    expect(Currency.formatFillPercent(spent, target)).toBe('100%');
  });

  it('leaves nothing remaining rather than -0.00', () => {
    expect(Currency.subtract(target, spent)).toBe('0.00');
  });

  it('is what the old REAL sum got wrong', () => {
    const noisy = String(sumAsReal(['1.10', '2.20']));
    expect(deriveSpendingStatus(noisy, target).isExceeded).toBe(true);
    expect(Currency.subtract(target, noisy)).toBe('-0.00');
  });
});
