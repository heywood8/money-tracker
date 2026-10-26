import {
  SPENDING_WINDOW_DAYS,
  spendingWindowStart,
  spendingWindowDays,
  computeSpendingPrediction,
  forecastMonthEndBalance,
  dailySpendingRate,
} from '../../app/utils/spendingPrediction';

describe('spendingPrediction', () => {
  describe('spendingWindowStart', () => {
    it('opens the window 29 days before today, so today makes it 30', () => {
      const start = spendingWindowStart(new Date(2026, 9, 22, 15, 30));
      expect(start).toEqual(new Date(2026, 8, 23));
    });

    it('reaches back across a year boundary', () => {
      expect(spendingWindowStart(new Date(2026, 0, 10))).toEqual(new Date(2025, 11, 12));
    });
  });

  describe('spendingWindowDays', () => {
    const now = new Date(2026, 9, 22, 15, 30);

    it('is the full window when the first operation is unknown', () => {
      expect(spendingWindowDays(now, null)).toBe(SPENDING_WINDOW_DAYS);
    });

    it('is the full window for an account older than the window', () => {
      expect(spendingWindowDays(now, '2024-03-01')).toBe(30);
      expect(spendingWindowDays(now, '2026-09-23')).toBe(30);
    });

    it('shortens to the days since the first operation for a younger account', () => {
      // Oct 13 … Oct 22, both included
      expect(spendingWindowDays(now, '2026-10-13')).toBe(10);
    });

    it('counts today alone when the first operation is today or later', () => {
      expect(spendingWindowDays(now, '2026-10-22')).toBe(1);
      expect(spendingWindowDays(now, '2026-11-05')).toBe(1);
    });

    it('reads the day off an imported timestamp (#773)', () => {
      expect(spendingWindowDays(now, '2026-10-13T10:00:00.000Z')).toBe(10);
    });

    it('ignores an unreadable date rather than dividing by it', () => {
      expect(spendingWindowDays(now, 'not a date')).toBe(30);
    });
  });

  describe('computeSpendingPrediction', () => {
    it('forecasts from the 30-day rate, not from the days elapsed', () => {
      // Rent (2500) landed on the 2nd. Averaged over three days it would forecast
      // 1000 a day for the rest of October; the last 30 days put it at 200.
      const prediction = computeSpendingPrediction({
        monthToDateExpenses: 3000,
        recentExpenses: 6000,
        recentDays: 30,
        selectedYear: 2026,
        selectedMonth: 9,
        now: new Date(2026, 9, 3, 12),
      });

      expect(prediction).toEqual({
        currentSpending: 3000,
        predictedTotal: 3000 + 200 * 28,
        predictedRemaining: 200 * 28,
        dailyAverage: 200,
        daysElapsed: 3,
        daysInMonth: 31,
        percentElapsed: (3 / 31) * 100,
      });
    });

    it('divides the window by its own length for a young account', () => {
      const prediction = computeSpendingPrediction({
        monthToDateExpenses: 700,
        recentExpenses: 700,
        recentDays: 7,
        selectedYear: 2026,
        selectedMonth: 9,
        now: new Date(2026, 9, 22),
      });

      expect(prediction.dailyAverage).toBe(100);
      expect(prediction.predictedRemaining).toBe(900);
    });

    it('forecasts on the 1st before anything was spent this month', () => {
      const prediction = computeSpendingPrediction({
        monthToDateExpenses: 0,
        recentExpenses: 3000,
        recentDays: 30,
        selectedYear: 2026,
        selectedMonth: 10,
        now: new Date(2026, 10, 1),
      });

      expect(prediction.currentSpending).toBe(0);
      expect(prediction.dailyAverage).toBe(100);
      expect(prediction.predictedTotal).toBe(2900);
    });

    it('has nothing to forecast when nothing was spent at all', () => {
      expect(computeSpendingPrediction({
        monthToDateExpenses: 0,
        recentExpenses: 0,
        recentDays: 30,
        selectedYear: 2026,
        selectedMonth: 9,
        now: new Date(2026, 9, 22),
      })).toBeNull();
    });

    it('leaves nothing remaining on the last day of the month', () => {
      const prediction = computeSpendingPrediction({
        monthToDateExpenses: 4000,
        recentExpenses: 3000,
        recentDays: 30,
        selectedYear: 2026,
        selectedMonth: 9,
        now: new Date(2026, 9, 31),
      });

      expect(prediction.predictedTotal).toBe(4000);
      expect(prediction.predictedRemaining).toBe(0);
    });

    it('waits for the window figures instead of forecasting from stale totals', () => {
      // Arriving from September, the totals on hand are still September's until
      // the running month's load lands.
      expect(computeSpendingPrediction({
        monthToDateExpenses: 45000,
        selectedYear: 2026,
        selectedMonth: 9,
        now: new Date(2026, 9, 3),
      })).toBeNull();
    });

    it.each([
      ['a past month', 2026, 8],
      ['a future month', 2026, 10],
      ['the same month a year back', 2025, 9],
      ['the whole-year view', 2026, null],
    ])('has no forecast for %s', (_label, selectedYear, selectedMonth) => {
      expect(computeSpendingPrediction({
        monthToDateExpenses: 1000,
        recentExpenses: 3000,
        recentDays: 30,
        selectedYear,
        selectedMonth,
        now: new Date(2026, 9, 22),
      })).toBeNull();
    });
  });

  describe('dailySpendingRate', () => {
    it('spreads the window’s spending over its days', () => {
      expect(dailySpendingRate(3000, 30)).toBe(100);
      // A week-old account: 700 over 7 days is 100 a day, not 700 / 30.
      expect(dailySpendingRate(700, 7)).toBe(100);
    });

    it.each([
      ['no window', 500, 0],
      ['an unknown window', 500, null],
      ['an unreadable total', NaN, 30],
    ])('is zero with %s', (_label, recentExpenses, recentDays) => {
      expect(dailySpendingRate(recentExpenses, recentDays)).toBe(0);
    });
  });

  describe('forecastMonthEndBalance', () => {
    it('carries the daily rate over the days left after today', () => {
      // 26 October: 5 days left (27th to 31st).
      expect(forecastMonthEndBalance({ balance: 1000, dailyAverage: 100, now: new Date(2026, 9, 26, 15) }))
        .toEqual({ forecast: 500, daysLeft: 5 });
    });

    it('runs at the rate the Graphs prediction reports', () => {
      const now = new Date(2026, 9, 10);
      const prediction = computeSpendingPrediction({
        monthToDateExpenses: 400, recentExpenses: 1500, recentDays: 30, selectedYear: 2026, selectedMonth: 9, now,
      });
      expect(prediction.dailyAverage).toBe(dailySpendingRate(1500, 30));
      const { forecast } = forecastMonthEndBalance({ balance: 2000, dailyAverage: prediction.dailyAverage, now });
      expect(forecast).toBeCloseTo(2000 - 50 * (31 - 10));
    });

    it('is the balance itself on the month’s last day', () => {
      expect(forecastMonthEndBalance({ balance: 1234.5, dailyAverage: 30, now: new Date(2026, 1, 28) }))
        .toEqual({ forecast: 1234.5, daysLeft: 0 });
    });

    it('goes below zero when the rate outruns the balance', () => {
      const { forecast } = forecastMonthEndBalance({ balance: 100, dailyAverage: 20, now: new Date(2026, 3, 20) });
      expect(forecast).toBe(100 - 20 * 10);
    });

    it('stays at the balance with no spending', () => {
      expect(forecastMonthEndBalance({ balance: 50, dailyAverage: 0, now: new Date(2026, 9, 1) }))
        .toEqual({ forecast: 50, daysLeft: 30 });
    });
  });
});
