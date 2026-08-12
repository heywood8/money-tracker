// __tests__/components/budgets/MonthSummaryCard.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import MonthSummaryCard from '../../../app/components/budgets/MonthSummaryCard';
import { currentMonthKey, addMonths, monthElapsedFraction } from '../../../app/utils/monthUtils';

// Only the elapsed fraction is stubbed, and only where a test needs a specific
// day of the month: the pace mark is the one thing here that depends on what
// day it is, and a suite that can only exercise "some day in the middle" is a
// suite that finds the 31st-of-the-month case in production.
jest.mock('../../../app/utils/monthUtils', () => {
  const actual = jest.requireActual('../../../app/utils/monthUtils');
  return { ...actual, monthElapsedFraction: jest.fn(actual.monthElapsedFraction) };
});

const COLORS = {
  surface: '#1a1d24',
  border: '#252830',
  text: '#e8eaf0',
  mutedText: '#7a7f8e',
  primary: '#4A90D9',
  overspend: '#FF6B6B',
  warning: '#F2A93B',
  glassSurfaceStrong: 'rgba(120,120,120,0.12)',
};

const t = (key) => key;

const THIS_MONTH = currentMonthKey();
const LAST_MONTH = addMonths(THIS_MONTH, -1);
const NEXT_MONTH = addMonths(THIS_MONTH, 1);

// An ordinary month: less allocated than earned, less spent than allocated.
const HEALTHY = {
  remainder: '200.00',
  hasIncomeBasis: true,
  currency: 'USD',
  allocated: '800.00',
  actual: '600.00',
  expectedIncome: '1000.00',
};

const renderCard = (totals = HEALTHY, props = {}) => render(
  <MonthSummaryCard totals={totals} month={LAST_MONTH} colors={COLORS} t={t} {...props} />,
);

const widthOf = (node) => StyleSheet.flatten(node.props.style).width;

describe('MonthSummaryCard', () => {
  beforeEach(() => {
    monthElapsedFraction.mockImplementation(
      jest.requireActual('../../../app/utils/monthUtils').monthElapsedFraction,
    );
  });

  describe('The remainder figure', () => {
    it('prints the remainder trimmed of an all-zero decimal part', async () => {
      const { getByTestId } = await renderCard();
      expect(getByTestId('budget-remainder')).toHaveTextContent(/^200$/);
    });

    it('leaves the currency code off when the header carries one', async () => {
      const { getByTestId } = await renderCard();
      expect(getByTestId('budget-remainder')).not.toHaveTextContent('USD');
    });

    it('keeps the code on the figure when there is no chip to carry it', async () => {
      const { getByTestId } = await renderCard(HEALTHY, { showCurrencyCode: true });
      expect(getByTestId('budget-remainder')).toHaveTextContent('200 USD');
    });

    it('colours a negative remainder with the overspend colour', async () => {
      const { getByTestId } = await renderCard({ ...HEALTHY, remainder: '-50.00' });
      expect(StyleSheet.flatten(getByTestId('budget-remainder').props.style).color)
        .toBe(COLORS.overspend);
    });

    // With nothing to allocate FROM, the remainder degenerates into "minus
    // everything you planned" — a number in alarm red is worse than a prompt.
    it('shows the add-income prompt instead of a figure with no income declared', async () => {
      const { queryByTestId, getByText } = await renderCard({
        ...HEALTHY, hasIncomeBasis: false, expectedIncome: '0.00', remainder: '-800.00',
      });
      expect(getByText('add_income_for_remainder')).toBeTruthy();
      expect(queryByTestId('budget-remainder')).toBeNull();
    });

    it('reserves the line for the figure until the plan section has reported', async () => {
      const { getByTestId, queryByTestId } = await renderCard(null);
      expect(getByTestId('budget-remainder')).toHaveTextContent('—');
      expect(queryByTestId('budget-summary-legend')).toBeNull();
    });
  });

  describe('The flow bar', () => {
    it('splits an ordinary month into spent, committed and free', async () => {
      const { getByTestId, queryByTestId } = await renderCard();
      // 600 spent and 200 still committed of a 1000 income: the free 200 is the
      // bare track, drawn by nothing.
      expect(widthOf(getByTestId('budget-flow-spent'))).toBe('60%');
      expect(widthOf(getByTestId('budget-flow-committed'))).toBe('20%');
      expect(queryByTestId('budget-flow-overspent')).toBeNull();
      expect(queryByTestId('budget-flow-over-committed')).toBeNull();
    });

    // The bar's width is the sum of its parts rather than a fixed maximum, so
    // spending past the plan lengthens the bar instead of saturating it.
    it('carries the part spent past the plan in the overspend colour', async () => {
      const { getByTestId } = await renderCard({
        ...HEALTHY, allocated: '800.00', actual: '900.00',
      });
      // 800 + 100 over + 200 free = 1100.
      expect(widthOf(getByTestId('budget-flow-spent'))).toBe('72.7273%');
      expect(widthOf(getByTestId('budget-flow-overspent'))).toBe('9.0909%');
      expect(StyleSheet.flatten(getByTestId('budget-flow-overspent').props.style).backgroundColor)
        .toBe(COLORS.overspend);
    });

    it('marks the allocation that runs past the income', async () => {
      const { getByTestId, queryByTestId } = await renderCard({
        ...HEALTHY, expectedIncome: '500.00', allocated: '800.00', actual: '300.00',
        remainder: '-300.00',
      });
      // 300 spent, 200 committed inside the income, 300 committed past it.
      expect(widthOf(getByTestId('budget-flow-spent'))).toBe('37.5%');
      expect(widthOf(getByTestId('budget-flow-committed'))).toBe('25%');
      expect(widthOf(getByTestId('budget-flow-over-committed'))).toBe('37.5%');
      expect(StyleSheet.flatten(getByTestId('budget-flow-over-committed').props.style).backgroundColor)
        .toBe(COLORS.warning);
      // The income is fully claimed, so there is no free zone left.
      expect(queryByTestId('budget-legend-free')).toBeNull();
    });

    // A plan made before any income was declared would otherwise render entirely
    // in the alarm colours — the same degenerate reading the remainder guards
    // against.
    it('does not call an allocation an overrun when no income is declared', async () => {
      const { getByTestId, queryByTestId } = await renderCard({
        ...HEALTHY, hasIncomeBasis: false, expectedIncome: '0.00', remainder: '-800.00',
      });
      expect(widthOf(getByTestId('budget-flow-spent'))).toBe('75%');
      expect(widthOf(getByTestId('budget-flow-committed'))).toBe('25%');
      expect(queryByTestId('budget-flow-over-committed')).toBeNull();
    });

    it('draws a bare track with nothing to show yet', async () => {
      const { getByTestId, queryByTestId } = await renderCard(null);
      expect(getByTestId('budget-flow-bar')).toBeTruthy();
      expect(queryByTestId('budget-flow-spent')).toBeNull();
    });
  });

  describe('The pace mark', () => {
    // A finished month has nothing to be ahead or behind of, and one that has
    // not started has no pace at all.
    it('is drawn only for the month in progress', async () => {
      const past = await renderCard(HEALTHY, { month: LAST_MONTH });
      expect(past.queryByTestId('budget-flow-pace')).toBeNull();
      const future = await renderCard(HEALTHY, { month: NEXT_MONTH });
      expect(future.queryByTestId('budget-flow-pace')).toBeNull();
      const current = await renderCard(HEALTHY, { month: THIS_MONTH });
      expect(current.getByTestId('budget-flow-pace')).toBeTruthy();
    });

    it('sits somewhere inside the allocated part of the bar', async () => {
      const { getByTestId } = await renderCard(HEALTHY, { month: THIS_MONTH });
      const left = parseFloat(StyleSheet.flatten(getByTestId('budget-flow-pace').props.style).left);
      // An evenly paced month reaches the whole allocation (80% of this bar) on
      // the last day, and never passes it.
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(80);
    });

    // The last day of a month is fully elapsed, and a fraction-based gate would
    // take the mark away on the one day it is most worth having.
    it('still marks the pace on the last day of the month', async () => {
      monthElapsedFraction.mockReturnValue(1);
      const { getByTestId } = await renderCard(HEALTHY, { month: THIS_MONTH });
      // The whole allocation: 800 of the bar's 1000.
      expect(StyleSheet.flatten(getByTestId('budget-flow-pace').props.style).left).toBe('80%');
    });

    it('is skipped when there is no plan to pace against', async () => {
      const { queryByTestId } = await renderCard(
        { ...HEALTHY, allocated: '0.00', actual: '0.00', remainder: '1000.00' },
        { month: THIS_MONTH },
      );
      expect(queryByTestId('budget-flow-pace')).toBeNull();
    });
  });

  describe('The legend', () => {
    it('names the three parts of an ordinary month with their amounts', async () => {
      const { getByTestId, queryByTestId } = await renderCard();
      expect(getByTestId('budget-legend-spent')).toHaveTextContent(/spent_amount600/);
      expect(getByTestId('budget-legend-committed')).toHaveTextContent(/budget_committed200/);
      expect(getByTestId('budget-legend-free')).toHaveTextContent(/budget_free200/);
      expect(queryByTestId('budget-legend-overspent')).toBeNull();
    });

    it('replaces the committed entry with the overrun once the plan is passed', async () => {
      const { getByTestId, queryByTestId } = await renderCard({
        ...HEALTHY, allocated: '800.00', actual: '900.00',
      });
      expect(getByTestId('budget-legend-overspent')).toHaveTextContent(/budget_overspent100/);
      expect(queryByTestId('budget-legend-committed')).toBeNull();
      // The two entries sum to the 900 actually spent — the spent key names its
      // own segment, which stops at the plan, rather than the whole figure.
      expect(getByTestId('budget-legend-spent')).toHaveTextContent(/spent_amount800/);
    });

    // The segment stops at the income, so calling it "allocated" would put the
    // wrong number under the word: the plan is 800, this part of it is 500.
    it('does not call the capped segment the allocation when the plan runs past the income', async () => {
      const { getByTestId } = await renderCard({
        ...HEALTHY, expectedIncome: '500.00', allocated: '800.00', actual: null,
        remainder: '-300.00',
      });
      expect(getByTestId('budget-legend-committed')).toHaveTextContent(/budget_committed500/);
    });

    // The free zone is bare track — nothing is painted over it — so a solid key
    // would name a colour that is not on the bar.
    it('keys the free zone with an outline rather than a filled dot', async () => {
      const { getByTestId } = await renderCard();
      const free = StyleSheet.flatten(getByTestId('budget-legend-dot-free').props.style);
      expect(free.backgroundColor).toBeUndefined();
      expect(free.borderWidth).toBe(1.5);
      // Every other key IS a colour on the bar, so those stay solid.
      expect(StyleSheet.flatten(getByTestId('budget-legend-dot-spent').props.style).backgroundColor)
        .toBe(COLORS.primary);
    });

    it('states the allocation itself while no actual has been computed', async () => {
      const { getByTestId, queryByTestId } = await renderCard({ ...HEALTHY, actual: null });
      // Nothing has been spent against the plan yet, so "left in plan" would be
      // claiming a remainder of something nothing has happened to.
      expect(getByTestId('budget-legend-committed')).toHaveTextContent(/allocated800/);
      expect(queryByTestId('budget-legend-spent')).toBeNull();
    });

    it('counts the committed part only up to the income when the plan runs past it', async () => {
      const { getByTestId } = await renderCard({
        ...HEALTHY, expectedIncome: '500.00', allocated: '800.00', actual: '300.00',
        remainder: '-300.00',
      });
      expect(getByTestId('budget-legend-committed')).toHaveTextContent(/budget_committed200/);
      expect(getByTestId('budget-legend-over-committed')).toHaveTextContent(/budget_over_allocated300/);
    });
  });

  describe('The fill percentage', () => {
    it('states how much of the plan is spent', async () => {
      const { getByTestId } = await renderCard();
      expect(getByTestId('budget-summary-percent')).toHaveTextContent(/75%budget_of_plan/);
    });

    it('turns to the overspend colour past the plan', async () => {
      const { getByTestId } = await renderCard({ ...HEALTHY, actual: '900.00' });
      const percent = getByTestId('budget-summary-percent');
      expect(percent).toHaveTextContent(/113%/);
      expect(StyleSheet.flatten(percent.props.style).backgroundColor).toBe(`${COLORS.overspend}1F`);
    });

    it('is withheld until there is an actual to state', async () => {
      const { queryByTestId } = await renderCard({ ...HEALTHY, actual: null });
      expect(queryByTestId('budget-summary-percent')).toBeNull();
    });
  });
});
