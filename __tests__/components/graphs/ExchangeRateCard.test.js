import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import ExchangeRateCard, {
  formatRateDate,
  formatAxisDate,
  xTickIndices,
} from '../../../app/components/graphs/ExchangeRateCard';
import { fetchRateHistory } from '../../../app/services/ExchangeRateHistory';
import { TabFocusProvider } from '../../../app/contexts/TabFocusContext';

jest.mock('../../../app/services/ExchangeRateHistory', () => ({
  ...jest.requireActual('../../../app/services/ExchangeRateHistory'),
  fetchRateHistory: jest.fn(),
}));

const colors = {
  surface: '#ffffff',
  border: '#dddddd',
  text: '#000000',
  mutedText: '#777777',
  primary: '#007aff',
  primaryStrong: '#0057b8',
  altRow: '#ffffff',
};

const t = (key) => ({
  rate_range_day: 'Day',
  rate_range_week: 'Week',
  rate_range_month: 'Month',
  rate_range_year: 'Year',
  rate_range_all: 'All',
  rate_change_since: 'since',
  rate_offline: 'offline',
  rate_load_failed: 'Could not load rates',
  rate_not_available_pair: 'No rates for this pair',
  retry: 'Retry',
}[key] || key);

const chart = { id: 'c1', from: 'USD', to: 'RUB', amount: 1, range: 'month' };

const series = (rates) => ({
  points: rates.map(([date, rate]) => ({ date, rate })),
  stale: false,
});

const renderCard = async (props = {}) => render(
  <ExchangeRateCard chart={chart} colors={colors} t={t} language="en" {...props} />,
);

describe('ExchangeRateCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchRateHistory.mockResolvedValue(series([['2026-09-23', 80], ['2026-10-23', 81.55]]));
  });

  it('loads the chart on its default range and shows the latest rate and its move', async () => {
    let resolve;
    fetchRateHistory.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await renderCard();

    expect(screen.getByTestId('exchange-rate-loading')).toBeTruthy();
    expect(fetchRateHistory).toHaveBeenCalledWith('USD', 'RUB', 'month');

    resolve(series([['2026-09-23', 80], ['2026-10-23', 81.55]]));
    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
    expect(screen.getByText('+1.55 (+1.94%)')).toBeTruthy();
    expect(screen.getByText('Oct 23, 2026 · since Sep 23, 2026')).toBeTruthy();
    expect(screen.getByText('1 USD → RUB')).toBeTruthy();
  });

  it('prices the configured amount', async () => {
    fetchRateHistory.mockResolvedValue(series([['2026-10-22', 0.2259], ['2026-10-23', 0.2246]]));

    await renderCard({ chart: { id: 'c2', from: 'AMD', to: 'RUB', amount: 100, range: 'day' } });

    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽22.46'));
    expect(screen.getByText('100 AMD → RUB')).toBeTruthy();
    expect(screen.getByText('-0.13 (-0.58%)')).toBeTruthy();
    expect(fetchRateHistory).toHaveBeenCalledWith('AMD', 'RUB', 'day');
  });

  it('switches range from the chip row', async () => {
    await renderCard();
    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));

    fetchRateHistory.mockResolvedValueOnce(series([['2025-10-23', 95], ['2026-10-23', 81.55]]));
    await fireEvent.press(screen.getByTestId('exchange-rate-range-year'));

    expect(fetchRateHistory).toHaveBeenLastCalledWith('USD', 'RUB', 'year');
    await waitFor(() => expect(screen.getByText('-13.45 (-14.16%)')).toBeTruthy());
    expect(screen.getByTestId('exchange-rate-range-year').props.accessibilityState).toEqual({ selected: true });
  });

  it('follows a new default range from Settings', async () => {
    const { rerender } = await renderCard();
    await waitFor(() => expect(fetchRateHistory).toHaveBeenCalledTimes(1));

    await rerender(<ExchangeRateCard chart={{ ...chart, range: 'week' }} colors={colors} t={t} language="en" />);

    await waitFor(() => expect(fetchRateHistory).toHaveBeenLastCalledWith('USD', 'RUB', 'week'));
  });

  it('marks a series served from the saved copy while offline', async () => {
    fetchRateHistory.mockResolvedValue({ ...series([['2026-10-23', 81.55]]), stale: true });

    await renderCard();

    await waitFor(() => expect(screen.getByText('Oct 23, 2026 · since Oct 23, 2026 · offline')).toBeTruthy());
  });

  it('offers a retry when nothing could be loaded', async () => {
    fetchRateHistory.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'network' }));

    await renderCard();

    await waitFor(() => expect(screen.getByTestId('exchange-rate-error')).toHaveTextContent('Could not load rates'));
    await fireEvent.press(screen.getByTestId('exchange-rate-retry'));

    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
    expect(fetchRateHistory).toHaveBeenCalledTimes(2);
  });

  it('says when the source has no rates for the pair', async () => {
    fetchRateHistory.mockRejectedValueOnce(Object.assign(new Error('422'), { code: 'unsupported' }));

    await renderCard();

    await waitFor(() => expect(screen.getByTestId('exchange-rate-error')).toHaveTextContent('No rates for this pair'));
  });

  it('waits for the Graphs tab to be on screen before asking for rates', async () => {
    await render(
      <TabFocusProvider>
        <ExchangeRateCard chart={chart} colors={colors} t={t} language="en" />
      </TabFocusProvider>,
    );

    // The app opens on Operations; the Graphs tab is mounted but hidden.
    expect(fetchRateHistory).not.toHaveBeenCalled();
  });

  describe('helpers', () => {
    it('formatRateDate names the day, or only the month for a monthly average', () => {
      expect(formatRateDate('2026-10-03', 'en')).toBe('Oct 3, 2026');
      expect(formatRateDate('2026-10-01', 'en', true)).toBe('Oct 2026');
      expect(formatRateDate('2026-10-03', 'ru')).toBe('3 окт. 2026 г.');
    });

    it('formatAxisDate labels by range', () => {
      expect(formatAxisDate('2026-10-03', 'month', 'en')).toBe('Oct 3');
      expect(formatAxisDate('2026-10-03', 'year', 'en')).toBe('Oct');
      expect(formatAxisDate('2026-10-03', 'all', 'en')).toBe('2026');
    });

    it('xTickIndices spreads four ticks with both ends', () => {
      expect(xTickIndices(0)).toEqual([]);
      expect(xTickIndices(2)).toEqual([0, 1]);
      expect(xTickIndices(31)).toEqual([0, 10, 20, 30]);
      expect(xTickIndices(5)).toEqual([0, 1, 3, 4]);
    });
  });
});
