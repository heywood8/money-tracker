import React from 'react';
import { act, render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { NumberFlow } from 'number-flow-react-native';
import ExchangeRateCard, { xTickIndices } from '../../../app/components/graphs/ExchangeRateCard';
import { formatRateDate, formatAxisDate } from '../../../app/services/ExchangeRateHistory';
import { fetchRateSeries } from '../../../app/services/ExchangeRateHistory';
import { TabFocusProvider } from '../../../app/contexts/TabFocusContext';

jest.mock('../../../app/services/ExchangeRateHistory', () => ({
  ...jest.requireActual('../../../app/services/ExchangeRateHistory'),
  fetchRateSeries: jest.fn(),
}));

const colors = {
  surface: '#ffffff',
  border: '#dddddd',
  text: '#000000',
  mutedText: '#777777',
  primary: '#007aff',
  primaryStrong: '#0057b8',
  altRow: '#ffffff',
  success: '#2e7d32',
  overspend: '#c62828',
};

// The colour the move's text is drawn in.
const changeColorOf = (text) => [screen.getByText(text).props.style].flat().reduce(
  (merged, style) => ({ ...merged, ...style }), {},
).color;

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
    fetchRateSeries.mockResolvedValue(series([['2026-09-23', 80], ['2026-10-23', 81.55]]));
  });

  it('loads the chart on its default range and shows the latest rate and its move', async () => {
    let resolve;
    fetchRateSeries.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await renderCard();

    expect(screen.getByTestId('exchange-rate-loading')).toBeTruthy();
    expect(fetchRateSeries).toHaveBeenCalledWith('USD', 'RUB', 'month');

    resolve(series([['2026-09-23', 80], ['2026-10-23', 81.55]]));
    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
    expect(screen.getByText('+1.55 (+1.94%)')).toBeTruthy();
    expect(changeColorOf('+1.55 (+1.94%)')).toBe(colors.success);
    expect(screen.getByText('Oct 23, 2026 · since Sep 23, 2026')).toBeTruthy();
    expect(screen.getByText('1 USD → RUB')).toBeTruthy();
  });

  it('prices the configured amount', async () => {
    fetchRateSeries.mockResolvedValue(series([['2026-10-22', 0.2259], ['2026-10-23', 0.2246]]));

    await renderCard({ chart: { id: 'c2', from: 'AMD', to: 'RUB', amount: 100, range: 'day' } });

    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽22.46'));
    expect(screen.getByText('100 AMD → RUB')).toBeTruthy();
    expect(screen.getByText('-0.13 (-0.58%)')).toBeTruthy();
    expect(changeColorOf('-0.13 (-0.58%)')).toBe(colors.overspend);
    expect(fetchRateSeries).toHaveBeenCalledWith('AMD', 'RUB', 'day');
  });

  it('leaves a rate that did not move in the muted colour', async () => {
    fetchRateSeries.mockResolvedValue(series([['2026-10-22', 81.55], ['2026-10-23', 81.55]]));

    await renderCard();

    await waitFor(() => expect(screen.getByText('0.00 (0.00%)')).toBeTruthy());
    expect(changeColorOf('0.00 (0.00%)')).toBe(colors.mutedText);
  });

  it('treats a move too small to print as no move', async () => {
    // Two fixings a digit apart past the two decimals the rate is shown to.
    fetchRateSeries.mockResolvedValue(series([['2026-10-22', 81.55], ['2026-10-23', 81.551]]));

    await renderCard();

    await waitFor(() => expect(screen.getByText('0.00 (0.00%)')).toBeTruthy());
    expect(changeColorOf('0.00 (0.00%)')).toBe(colors.mutedText);
  });

  it('opens the pair on Google from beside the title', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderCard({ chart: { ...chart, from: 'RUB', to: 'AMD' } });

    const link = screen.getByTestId('exchange-rate-google');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toBe('rate_open_google');
    fireEvent.press(link);

    expect(openURL).toHaveBeenCalledWith('https://www.google.com/search?q=1%20rub%20to%20amd');
    openURL.mockRestore();
  });

  it('switches range from the chip row', async () => {
    await renderCard();
    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));

    fetchRateSeries.mockResolvedValueOnce(series([['2025-10-23', 95], ['2026-10-23', 81.55]]));
    await fireEvent.press(screen.getByTestId('exchange-rate-range-year'));

    expect(fetchRateSeries).toHaveBeenLastCalledWith('USD', 'RUB', 'year');
    await waitFor(() => expect(screen.getByText('-13.45 (-14.16%)')).toBeTruthy());
    expect(screen.getByTestId('exchange-rate-range-year').props.accessibilityState).toEqual({ selected: true });
  });

  it('follows a new default range from Settings', async () => {
    const { rerender } = await renderCard();
    await waitFor(() => expect(fetchRateSeries).toHaveBeenCalledTimes(1));

    await rerender(<ExchangeRateCard chart={{ ...chart, range: 'week' }} colors={colors} t={t} language="en" />);

    await waitFor(() => expect(fetchRateSeries).toHaveBeenLastCalledWith('USD', 'RUB', 'week'));
  });

  it('marks a series served from the saved copy while offline', async () => {
    fetchRateSeries.mockResolvedValue({ ...series([['2026-10-23', 81.55]]), stale: true });

    await renderCard();

    await waitFor(() => expect(screen.getByText('Oct 23, 2026 · since Oct 23, 2026 · offline')).toBeTruthy());
  });

  it('offers a retry when nothing could be loaded', async () => {
    fetchRateSeries.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'network' }));

    await renderCard();

    await waitFor(() => expect(screen.getByTestId('exchange-rate-error')).toHaveTextContent('Could not load rates'));
    await fireEvent.press(screen.getByTestId('exchange-rate-retry'));

    await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
    expect(fetchRateSeries).toHaveBeenCalledTimes(2);
  });

  it('says when the source has no rates for the pair', async () => {
    fetchRateSeries.mockRejectedValueOnce(Object.assign(new Error('422'), { code: 'unsupported' }));

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
    expect(fetchRateSeries).not.toHaveBeenCalled();
  });

  describe('Rolling headline', () => {
    const originalState = AppState.currentState;
    let appStateChange;
    let scrubbed;

    // The props the headline's wheels were last drawn with.
    const lastFlow = () => NumberFlow.mock.calls.at(-1)[0];

    // The chart's scrub reaction, as Reanimated would run it on the UI thread:
    // the index under the finger, or null once it lifts, after the last one.
    const scrubTo = (index) => act(() => {
      const react = useAnimatedReaction.mock.calls.at(-1)[1];
      react(index, scrubbed);
      scrubbed = index;
    });

    // A return to the foreground, which reloads the rates.
    const returnToApp = () => act(() => {
      appStateChange('background');
      appStateChange('active');
    });

    beforeEach(() => {
      scrubbed = null;
      AppState.currentState = 'active';
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, callback) => {
        if (event === 'change') appStateChange = callback;
        return { remove: jest.fn() };
      });
    });

    afterEach(() => {
      AppState.addEventListener.mockRestore();
      AppState.currentState = originalState;
    });

    it('rolls the digits through the rates between when fresh rates arrive', async () => {
      await renderCard();
      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));

      fetchRateSeries.mockResolvedValue(series([['2026-09-23', 80], ['2026-10-23', 81.9]]));
      await returnToApp();

      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.90'));
      expect(lastFlow()).toEqual(expect.objectContaining({
        value: 81.9,
        prefix: '₽',
        locales: 'en',
        format: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        animated: true,
        continuous: true,
      }));
    });

    it('hands the wheels the rate rounded to the digits it shows', async () => {
      fetchRateSeries.mockResolvedValue(series([['2026-09-23', 4.3], ['2026-10-23', 4.45949]]));

      await renderCard({ chart: { ...chart, from: 'RUB', to: 'AMD' } });

      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('֏4.459'));
      // Not 4.45949: a refresh to 4.4591 would otherwise roll down to the same digits.
      expect(lastFlow().value).toBe(4.459);
    });

    it('follows a scrubbing finger without rolling, and springs back the same way', async () => {
      await renderCard();
      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
      expect(lastFlow()).toEqual(expect.objectContaining({ animated: true, continuous: true }));

      await scrubTo(0);
      expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽80.00');
      expect(lastFlow()).toEqual(expect.objectContaining({ value: 80, animated: false, continuous: false }));

      await scrubTo(null);
      expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55');
      expect(lastFlow()).toEqual(expect.objectContaining({ value: 81.55, animated: false }));

      // The next fresh rates roll again.
      fetchRateSeries.mockResolvedValue(series([['2026-09-23', 80], ['2026-10-23', 81.2]]));
      await returnToApp();

      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.20'));
      expect(lastFlow().animated).toBe(true);
    });

    it('does not roll under a finger when fresh rates land mid-scrub', async () => {
      await renderCard();
      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));
      await scrubTo(0);

      // The topped-up series moves the point under the finger.
      fetchRateSeries.mockResolvedValue(series([['2026-09-23', 79.5], ['2026-10-23', 81.9]]));
      await returnToApp();

      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽79.50'));
      expect(lastFlow()).toEqual(expect.objectContaining({ value: 79.5, animated: false }));
    });

    it('takes the wheels down while another range loads', async () => {
      await renderCard();
      await waitFor(() => expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.55'));

      let resolve;
      fetchRateSeries.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
      await fireEvent.press(screen.getByTestId('exchange-rate-range-year'));

      // The previous range's rate is not left standing to roll from.
      expect(screen.getByTestId('exchange-rate-value')).not.toHaveTextContent('₽');

      await act(async () => resolve(series([['2025-10-23', 95], ['2026-10-23', 81.2]])));
      expect(screen.getByTestId('exchange-rate-value')).toHaveTextContent('₽81.20');
    });
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
