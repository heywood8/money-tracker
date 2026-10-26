/**
 * Settings → Graphs: the list of exchange-rate charts and the editor it pushes
 * as a step. The draft lives in the panel, so the list and editor are tested
 * together through the panel the way the host drives it (step + push/pop).
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import GraphsPanel, { accountCurrencies, defaultNewChart } from '../../../app/components/settings/GraphsPanel';
import { pickCurrency } from '../../../app/components/settings/RateChartEditor';
import { upsertRateChart, removeRateChart, loadRateCharts } from '../../../app/services/ExchangeRateCharts';
import { fetchLiveExchangeRate } from '../../../app/services/currency';
import { requestPinWidget } from 'react-native-android-widget';

const mockAccounts = { list: [] };

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000000', mutedText: '#888888', border: '#dddddd', primary: '#6200ee',
      primaryFill: '#0062cc', onPrimaryFill: '#ffffff', destructive: '#d9534f',
      background: '#ffffff', surface: '#ffffff',
    },
  }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key, language: 'en' }),
}));
jest.mock('../../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({ accounts: mockAccounts.list }),
}));
jest.mock('../../../app/services/ExchangeRateCharts', () => ({
  ...jest.requireActual('../../../app/services/ExchangeRateCharts'),
  loadRateCharts: jest.fn(),
  upsertRateChart: jest.fn(),
  removeRateChart: jest.fn(),
}));
jest.mock('react-native-android-widget', () => ({ requestPinWidget: jest.fn() }));
jest.mock('../../../app/services/currency', () => ({
  ...jest.requireActual('../../../app/services/currency'),
  fetchLiveExchangeRate: jest.fn(),
}));

const ACCOUNTS = [
  { id: 1, currency: 'RUB' },
  { id: 2, currency: 'USD' },
  { id: 3, currency: 'RUB' },
  { id: 4, currency: 'AMD' },
];

const USD_RUB = { id: 'c1', from: 'USD', to: 'RUB', amount: 1, range: 'month' };

// Drives the panel the way SettingsScreen does: it owns the step and hands
// push/pop to the panel, and the back hook the panel registers.
const Host = () => {
  const [step, setStep] = React.useState('list');
  const backRef = React.useRef(null);
  return (
    <>
      <GraphsPanel
        step={step}
        onPushStep={(next) => setStep(next)}
        onPopStep={() => setStep('list')}
        onRegisterBack={(fn) => { backRef.current = fn; }}
        bottomInset={0}
      />
      <TestBack onPress={() => { backRef.current?.(); setStep('list'); }} />
    </>
  );
};

const TestBack = ({ onPress }) => {
  const { Pressable } = require('react-native');
  return <Pressable testID="test-back" onPress={onPress} />;
};
TestBack.propTypes = { onPress: require('prop-types').func };

describe('GraphsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccounts.list = ACCOUNTS;
    loadRateCharts.mockResolvedValue([]);
    upsertRateChart.mockImplementation(async (chart) => [chart]);
    removeRateChart.mockResolvedValue([]);
    fetchLiveExchangeRate.mockResolvedValue({ rate: '81.55', source: 'live' });
  });

  it('shows the empty state and an add row', async () => {
    await render(<Host />);

    await waitFor(() => expect(screen.getByTestId('rate-charts-empty')).toBeTruthy());
    expect(screen.getByTestId('rate-chart-add')).toBeTruthy();
    expect(screen.getByText('rate_source_note')).toBeTruthy();
  });

  it('lists the configured charts', async () => {
    loadRateCharts.mockResolvedValue([USD_RUB, { id: 'c2', from: 'AMD', to: 'RUB', amount: 100, range: 'week' }]);

    await render(<Host />);

    await waitFor(() => expect(screen.getByText('1 USD → RUB')).toBeTruthy());
    expect(screen.getByText('100 AMD → RUB')).toBeTruthy();
    expect(screen.queryByTestId('rate-charts-empty')).toBeNull();
  });

  it('adds a chart for an account currency priced in the first one', async () => {
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('rate-chart-add'));

    // Defaults: USD priced in RUB, per 1, opening on a month.
    expect(screen.getByTestId('rate-editor-from-USD').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('rate-editor-to-RUB').props.accessibilityState).toEqual({ selected: true });
    // Only the account currencies are offered.
    expect(screen.queryByTestId('rate-editor-from-EUR')).toBeNull();
    expect(screen.getByTestId('rate-editor-from-AMD')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 USD = ₽81.55')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rate-editor-amount-100'));
    await fireEvent.press(screen.getByTestId('rate-editor-range-year'));
    await fireEvent.press(screen.getByTestId('rate-editor-save'));

    await waitFor(() => expect(upsertRateChart).toHaveBeenCalledTimes(1));
    expect(upsertRateChart.mock.calls[0][0]).toEqual(
      expect.objectContaining({ from: 'USD', to: 'RUB', amount: 100, range: 'year' }),
    );
    // Back on the list once stored.
    await waitFor(() => expect(screen.getByTestId('rate-chart-add')).toBeTruthy());
  });

  it('marks a bundled offline rate in the preview', async () => {
    fetchLiveExchangeRate.mockResolvedValue({ rate: '88.5', source: 'offline' });
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('rate-chart-add'));

    await waitFor(() => expect(screen.getByText('1 USD = ₽88.50 · rate_offline')).toBeTruthy());
  });

  it('reverses the direction of a chart', async () => {
    loadRateCharts.mockResolvedValue([USD_RUB]);
    await render(<Host />);
    await waitFor(() => expect(screen.getByTestId('rate-chart-row-c1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rate-chart-row-c1'));
    await fireEvent.press(screen.getByTestId('rate-editor-reverse'));
    await fireEvent.press(screen.getByTestId('rate-editor-save'));

    await waitFor(() => expect(upsertRateChart).toHaveBeenCalledWith(
      { id: 'c1', from: 'RUB', to: 'USD', amount: 1, range: 'month' },
    ));
  });

  it('deletes a chart from its editor', async () => {
    loadRateCharts.mockResolvedValue([USD_RUB]);
    await render(<Host />);
    await waitFor(() => expect(screen.getByTestId('rate-chart-row-c1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rate-chart-row-c1'));
    await fireEvent.press(screen.getByTestId('rate-editor-delete'));

    await waitFor(() => expect(removeRateChart).toHaveBeenCalledWith('c1'));
  });

  it('offers no delete for a chart that is not saved yet', async () => {
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('rate-chart-add'));

    expect(screen.queryByTestId('rate-editor-delete')).toBeNull();
  });

  it('keeps the editor open with a note when the save fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    upsertRateChart.mockRejectedValueOnce(new Error('disk full'));
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('rate-chart-add'));
    await fireEvent.press(screen.getByTestId('rate-editor-save'));

    await waitFor(() => expect(screen.getByTestId('rate-editor-save-failed')).toBeTruthy());
    expect(screen.getByTestId('rate-editor-save')).toBeTruthy();
    console.error.mockRestore();
  });

  it('discards the draft on back', async () => {
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('rate-chart-add'));
    await fireEvent.press(screen.getByTestId('test-back'));

    expect(screen.getByTestId('rate-chart-add')).toBeTruthy();
    expect(upsertRateChart).not.toHaveBeenCalled();
  });

  it('disables adding with fewer than two account currencies', async () => {
    mockAccounts.list = [{ id: 1, currency: 'RUB' }, { id: 2, currency: 'RUB' }];
    await render(<Host />);
    await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());

    expect(screen.getByText('rate_chart_need_two_currencies')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('rate-chart-add'));
    expect(screen.queryByTestId('rate-editor-save')).toBeNull();
  });

  describe('home-screen widget', () => {
    it('offers the widget only once there is a chart to show', async () => {
      await render(<Host />);
      await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());
      expect(screen.queryByTestId('rate-widget-pin')).toBeNull();
      expect(screen.queryByTestId('rate-widget-pin-pair')).toBeNull();
    });

    it('asks the launcher to place the two-rate widget', async () => {
      loadRateCharts.mockResolvedValue([USD_RUB]);
      requestPinWidget.mockResolvedValue(true);
      await render(<Host />);
      await waitFor(() => expect(screen.getByTestId('rate-widget-pin-pair')).toBeTruthy());
      expect(screen.getByText('widget_pair_add_hint')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('rate-widget-pin-pair'));

      expect(requestPinWidget).toHaveBeenCalledWith({ widgetName: 'ExchangeRatePair' });
    });

    it('asks the launcher to place the widget', async () => {
      loadRateCharts.mockResolvedValue([USD_RUB]);
      requestPinWidget.mockResolvedValue(true);
      await render(<Host />);
      await waitFor(() => expect(screen.getByTestId('rate-widget-pin')).toBeTruthy());
      expect(screen.getByText('widget_add_hint')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('rate-widget-pin'));

      expect(requestPinWidget).toHaveBeenCalledWith({ widgetName: 'ExchangeRate' });
      await waitFor(() => expect(screen.getByText('widget_add_hint')).toBeTruthy());
    });

    it('says where to find the widget when the launcher cannot pin it', async () => {
      loadRateCharts.mockResolvedValue([USD_RUB]);
      requestPinWidget.mockResolvedValue(false);
      await render(<Host />);
      await waitFor(() => expect(screen.getByTestId('rate-widget-pin')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('rate-widget-pin'));

      // Under every row: a launcher that cannot pin one widget cannot pin the
      // others (the two rate widgets and the forecast one; mockAccounts has
      // accounts here).
      await waitFor(() => expect(screen.getAllByText('widget_pin_unsupported')).toHaveLength(3));
    });

    it('treats a failed pin request like an unsupported launcher', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      loadRateCharts.mockResolvedValue([USD_RUB]);
      requestPinWidget.mockRejectedValue(new Error('not linked'));
      await render(<Host />);
      await waitFor(() => expect(screen.getByTestId('rate-widget-pin')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('rate-widget-pin'));

      await waitFor(() => expect(screen.getAllByText('widget_pin_unsupported')).toHaveLength(3));
      console.warn.mockRestore();
    });
  });

  describe('balance-forecast widget', () => {
    it('offers it once there are accounts, with or without rate charts', async () => {
      requestPinWidget.mockResolvedValue(true);
      await render(<Host />);
      await waitFor(() => expect(screen.getByTestId('forecast-widget-pin')).toBeTruthy());
      expect(screen.getByText('widget_forecast_add_hint')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('forecast-widget-pin'));

      expect(requestPinWidget).toHaveBeenCalledWith({ widgetName: 'BalanceForecast' });
    });

    it.each([
      ['no accounts', []],
      ['only archived accounts', [{ id: 1, currency: 'RUB', hidden: 1 }]],
    ])('is not offered with %s to forecast', async (_label, list) => {
      mockAccounts.list = list;
      await render(<Host />);
      await waitFor(() => expect(loadRateCharts).toHaveBeenCalled());
      expect(screen.queryByTestId('forecast-widget-pin')).toBeNull();
    });
  });

  describe('helpers', () => {
    it('accountCurrencies keeps each currency once, in account order', () => {
      expect(accountCurrencies(ACCOUNTS)).toEqual(['RUB', 'USD', 'AMD']);
      expect(accountCurrencies(undefined)).toEqual([]);
    });

    it('defaultNewChart prices another currency in the first, skipping pairs in use', () => {
      expect(defaultNewChart(['RUB', 'USD', 'AMD'], [])).toEqual({ from: 'USD', to: 'RUB', amount: 1, range: 'month' });
      expect(defaultNewChart(['RUB', 'USD', 'AMD'], [USD_RUB])).toMatchObject({ from: 'AMD', to: 'RUB' });
      expect(defaultNewChart(['RUB'], [])).toBeNull();
    });

    it('pickCurrency swaps the sides instead of pairing a currency with itself', () => {
      expect(pickCurrency(USD_RUB, 'from', 'AMD')).toMatchObject({ from: 'AMD', to: 'RUB' });
      expect(pickCurrency(USD_RUB, 'from', 'RUB')).toMatchObject({ from: 'RUB', to: 'USD' });
      expect(pickCurrency(USD_RUB, 'to', 'USD')).toMatchObject({ from: 'RUB', to: 'USD' });
    });
  });
});
