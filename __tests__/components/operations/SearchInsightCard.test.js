import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import SearchInsightCard from '../../../app/components/operations/SearchInsightCard';

const colors = {
  surface: '#fff',
  border: '#ddd',
  text: '#111',
  mutedText: '#666',
  primary: '#007AFF',
  expense: '#5a3030',
  income: '#4a8a4a',
};

const t = (key) => ({
  operations_count: 'Transactions: {count}',
  clear_filters: 'Clear Filters',
  month_short_june: 'Jun',
  month_short_july: 'Jul',
  month_short_august: 'Aug',
  month_short_september: 'Sep',
  month_short_october: 'Oct',
  month_short_november: 'Nov',
}[key] || key);

const months = (amounts) => ['06', '07', '08', '09', '10', '11'].map((m, i) => ({
  key: `2026-${m}`,
  year: 2026,
  month: Number(m) - 1,
  amount: amounts[i],
}));

const insight = (overrides = {}) => ({
  count: 4,
  totals: { expense: { RUB: '2040' }, income: {} },
  chart: { type: 'expense', currency: 'RUB', months: months(['2400', '2900', '0', '3500', '3180', '2040']) },
  ...overrides,
});

const renderCard = (props = {}) => render(
  <SearchInsightCard
    subject={{ name: 'кофе', icon: 'tag-outline' }}
    insight={insight()}
    colors={colors}
    t={t}
    language="en"
    onClear={jest.fn()}
    {...props}
  />,
);

describe('SearchInsightCard', () => {
  it('names what the search is about', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('search-insight-title')).toHaveTextContent('кофе');
  });

  it('shows the count through the shared translation', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('search-insight-count')).toHaveTextContent('Transactions: 4');
  });

  it('signs expenses with a minus and income with a plus, each in its colour', async () => {
    const { getByTestId, getByText } = await renderCard({
      insight: insight({ totals: { expense: { USD: '12.5' }, income: { USD: '100' } } }),
    });
    expect(getByTestId('search-insight-totals')).toHaveTextContent(/-\$12\.50\s+\+\$100\.00/);
    expect(StyleSheet.flatten(getByText(/-\$12\.50/).props.style).color).toBe(colors.expense);
    expect(StyleSheet.flatten(getByText(/\+\$100\.00/).props.style).color).toBe(colors.income);
  });

  it('leaves the totals out when nothing was summed (transfers only)', async () => {
    const { queryByTestId } = await renderCard({
      insight: insight({ totals: { expense: {}, income: {} }, chart: null }),
    });
    expect(queryByTestId('search-insight-totals')).toBeNull();
  });

  it('draws one bar per month, the current one in the accent and the tallest at full height', async () => {
    const { getByTestId } = await renderCard();
    const style = (key) => StyleSheet.flatten(getByTestId(`search-insight-bar-${key}`).props.style);

    expect(style('2026-11').backgroundColor).toBe(colors.primary);
    expect(style('2026-10').backgroundColor).toBe(colors.mutedText);
    expect(style('2026-09').height).toBe(36);
    expect(style('2026-08').height).toBe(2); // an empty month keeps a stub
    expect(style('2026-11').height).toBe(Math.round((2040 / 3500) * 36));
  });

  it('reads the months and their amounts to a screen reader', async () => {
    const { getByTestId } = await renderCard();
    const label = getByTestId('search-insight-chart').props.accessibilityLabel;
    expect(label).toMatch(/^Jun .*2,400/);
    expect(label).toMatch(/Nov .*2,040$/);
  });

  it('draws no chart when there is none', async () => {
    const { queryByTestId } = await renderCard({ insight: insight({ chart: null }) });
    expect(queryByTestId('search-insight-chart')).toBeNull();
  });

  it('clears the search from the ✕', async () => {
    const onClear = jest.fn();
    const { getByTestId } = await renderCard({ onClear });
    fireEvent.press(getByTestId('search-insight-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('has no title and no ✕ for a search about more than one thing', async () => {
    const { queryByTestId, getByTestId } = await renderCard({ subject: null, insight: insight({ chart: null }) });
    expect(queryByTestId('search-insight-title')).toBeNull();
    expect(queryByTestId('search-insight-clear')).toBeNull();
    expect(getByTestId('search-insight-count')).toBeTruthy();
  });
});
