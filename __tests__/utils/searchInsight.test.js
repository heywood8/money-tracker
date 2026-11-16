import { buildSearchInsight, lastMonths, INSIGHT_MONTHS } from '../../app/utils/searchInsight';

const NOW = new Date(2026, 10, 16); // 16 November 2026, local time

const currencies = new Map([
  ['card', 'RUB'],
  ['cash', 'RUB'],
  ['usd', 'USD'],
]);

// Currency.add hands back fixed-point strings ("150.00"); the figures are
// compared as numbers so the tests pin the arithmetic, not the padding.
const num = (totals) => Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)]));
const amounts = (chart) => chart.months.map((m) => [m.key, Number(m.amount)]);

const op = (id, overrides = {}) => ({
  id,
  type: 'expense',
  amount: '100',
  accountId: 'card',
  date: '2026-11-10',
  description: 'кофе',
  ...overrides,
});

describe('searchInsight', () => {
  describe('lastMonths', () => {
    it('lists the months ending with the current one, oldest first', () => {
      expect(lastMonths(NOW, 3).map((m) => m.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    });

    it('crosses a year boundary', () => {
      const months = lastMonths(new Date(2027, 1, 3), INSIGHT_MONTHS);
      expect(months.map((m) => m.key)).toEqual([
        '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
      ]);
      expect(months[3]).toEqual({ key: '2026-12', year: 2026, month: 11 });
    });
  });

  describe('count and totals', () => {
    it('counts every row, transfers included', () => {
      const insight = buildSearchInsight([
        op('a'),
        op('b', { type: 'transfer', toAccountId: 'cash' }),
      ], currencies, { now: NOW });
      expect(insight.count).toBe(2);
    });

    it('sums expense and income apart, per currency, and leaves transfers out', () => {
      const insight = buildSearchInsight([
        op('a', { amount: '420' }),
        op('b', { amount: '280', accountId: 'cash' }),
        op('c', { amount: '12.50', accountId: 'usd' }),
        op('d', { type: 'income', amount: '85000' }),
        op('e', { type: 'transfer', amount: '1000', toAccountId: 'cash' }),
      ], currencies, { now: NOW });

      expect(num(insight.totals.expense)).toEqual({ RUB: 700, USD: 12.5 });
      expect(num(insight.totals.income)).toEqual({ RUB: 85000 });
    });

    it('adds decimals exactly', () => {
      const insight = buildSearchInsight([
        op('a', { amount: '0.1', accountId: 'usd' }),
        op('b', { amount: '0.2', accountId: 'usd' }),
      ], currencies, { now: NOW });
      expect(insight.totals.expense.USD).toBe('0.30');
    });

    it('counts rows hidden from charts in the totals, since they are in the list', () => {
      const insight = buildSearchInsight([
        op('a', { amount: '100' }),
        op('b', { amount: '50', excludeFromCharts: true }),
      ], currencies, { now: NOW });
      expect(Number(insight.totals.expense.RUB)).toBe(150);
    });

    it('skips rows whose account is unknown or whose amount is not a number', () => {
      const insight = buildSearchInsight([
        op('a', { accountId: 'gone' }),
        op('b', { amount: 'abc' }),
        op('c', { amount: '10' }),
      ], currencies, { now: NOW });
      expect(insight.count).toBe(3);
      expect(num(insight.totals.expense)).toEqual({ RUB: 10 });
    });

    it('draws no chart unless one is asked for', () => {
      expect(buildSearchInsight([op('a')], currencies, { now: NOW }).chart).toBeNull();
    });
  });

  describe('chart', () => {
    it('sums each of the last six months, the current one last', () => {
      const { chart } = buildSearchInsight([
        op('a', { date: '2026-11-10', amount: '420' }),
        op('b', { date: '2026-11-01', amount: '80' }),
        op('c', { date: '2026-10-31', amount: '300' }),
        op('d', { date: '2026-06-01', amount: '50' }),
        op('e', { date: '2026-05-31', amount: '999' }), // before the window
      ], currencies, { chartType: 'expense', now: NOW });

      expect(chart.type).toBe('expense');
      expect(chart.currency).toBe('RUB');
      expect(amounts(chart)).toEqual([
        ['2026-06', 50],
        ['2026-07', 0],
        ['2026-08', 0],
        ['2026-09', 0],
        ['2026-10', 300],
        ['2026-11', 500],
      ]);
    });

    it('leaves rows hidden from charts out of the bars', () => {
      const { chart } = buildSearchInsight([
        op('a', { amount: '100' }),
        op('b', { amount: '50', excludeFromCharts: true }),
      ], currencies, { chartType: 'expense', now: NOW });
      expect(Number(chart.months[5].amount)).toBe(100);
    });

    it('draws only the requested side', () => {
      const { chart } = buildSearchInsight([
        op('a', { amount: '100' }),
        op('b', { type: 'income', amount: '5000' }),
      ], currencies, { chartType: 'income', now: NOW });
      expect(chart.type).toBe('income');
      expect(Number(chart.months[5].amount)).toBe(5000);
    });

    it("'auto' draws whichever side the results hold more of", () => {
      const { chart } = buildSearchInsight([
        op('a', { type: 'income', amount: '100' }),
        op('b', { type: 'income', amount: '200' }),
        op('c', { amount: '5000' }),
      ], currencies, { chartType: 'auto', now: NOW });
      expect(chart.type).toBe('income');
    });

    it("'auto' prefers expense on a tie", () => {
      const { chart } = buildSearchInsight([
        op('a', { type: 'income' }),
        op('b'),
      ], currencies, { chartType: 'auto', now: NOW });
      expect(chart.type).toBe('expense');
    });

    it('draws one currency: the one most results are in', () => {
      const { chart } = buildSearchInsight([
        op('a', { accountId: 'usd', amount: '5' }),
        op('b', { amount: '100' }),
        op('c', { accountId: 'cash', amount: '200' }),
      ], currencies, { chartType: 'expense', now: NOW });
      expect(chart.currency).toBe('RUB');
      expect(Number(chart.months[5].amount)).toBe(300);
    });

    it('picks the side from the rows it can draw, not the ones hidden from charts', () => {
      const { chart } = buildSearchInsight([
        op('a', { amount: '10', excludeFromCharts: true }),
        op('b', { amount: '20', excludeFromCharts: true }),
        op('c', { type: 'income', amount: '500' }),
      ], currencies, { chartType: 'auto', now: NOW });
      expect(chart.type).toBe('income');
      expect(Number(chart.months[5].amount)).toBe(500);
    });

    it('picks the currency from the rows it can draw', () => {
      const { chart } = buildSearchInsight([
        op('a', { accountId: 'usd', amount: '1', excludeFromCharts: true }),
        op('b', { accountId: 'usd', amount: '2', excludeFromCharts: true }),
        op('c', { amount: '300' }),
      ], currencies, { chartType: 'expense', now: NOW });
      expect(chart.currency).toBe('RUB');
    });

    it('draws nothing when every row of the side is hidden from charts', () => {
      const { chart } = buildSearchInsight([
        op('a', { excludeFromCharts: true }),
      ], currencies, { chartType: 'expense', now: NOW });
      expect(chart).toBeNull();
    });

    it('draws nothing when the results hold none of the requested side', () => {
      const { chart } = buildSearchInsight([
        op('a', { type: 'transfer', toAccountId: 'cash' }),
      ], currencies, { chartType: 'auto', now: NOW });
      expect(chart).toBeNull();

      expect(buildSearchInsight([op('b')], currencies, { chartType: 'income', now: NOW }).chart).toBeNull();
    });

    it('draws empty months when every result is older than the window', () => {
      const { chart } = buildSearchInsight([
        op('a', { date: '2025-01-01' }),
      ], currencies, { chartType: 'expense', now: NOW });
      expect(chart.months.every((m) => Number(m.amount) === 0)).toBe(true);
    });
  });
});
