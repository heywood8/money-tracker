import { requestWidgetUpdate } from 'react-native-android-widget';
import {
  loadExchangeRateWidgetModel,
  renderExchangeRateWidget,
  refreshExchangeRateWidgets,
} from '../../app/widgets/exchangeRateWidgetRender';
import { loadRateCharts } from '../../app/services/ExchangeRateCharts';
import { fetchRateHistory } from '../../app/services/ExchangeRateHistory';
import { resolveLanguage } from '../../app/services/notifications/notificationStrings';
import { getWidgetChart } from '../../app/widgets/exchangeRateWidgetStore';
import { EXCHANGE_RATE_WIDGET } from '../../app/widgets/widgetConstants';

jest.mock('react-native-android-widget', () => ({
  ...jest.requireActual('react-native-android-widget'),
  requestWidgetUpdate: jest.fn(),
}));
jest.mock('../../app/services/ExchangeRateCharts', () => ({ loadRateCharts: jest.fn() }));
jest.mock('../../app/services/ExchangeRateHistory', () => ({
  ...jest.requireActual('../../app/services/ExchangeRateHistory'),
  fetchRateHistory: jest.fn(),
}));
jest.mock('../../app/services/notifications/notificationStrings', () => ({
  ...jest.requireActual('../../app/services/notifications/notificationStrings'),
  resolveLanguage: jest.fn(),
}));
jest.mock('../../app/widgets/exchangeRateWidgetStore', () => ({
  ...jest.requireActual('../../app/widgets/exchangeRateWidgetStore'),
  getWidgetChart: jest.fn(),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

const USD_RUB = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
const AMD_RUB = { id: 'b', from: 'AMD', to: 'RUB', amount: 100, range: 'week' };
const POINTS = [{ date: '2026-10-22', rate: 81.81 }, { date: '2026-10-23', rate: 81.55 }];

describe('exchangeRateWidgetRender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRateCharts.mockResolvedValue([USD_RUB, AMD_RUB]);
    getWidgetChart.mockResolvedValue(null);
    resolveLanguage.mockResolvedValue('ru');
    fetchRateHistory.mockResolvedValue({ points: POINTS, stale: false });
  });

  describe('loadExchangeRateWidgetModel', () => {
    it('loads the widget’s own chart over the chart’s range', async () => {
      getWidgetChart.mockResolvedValue(AMD_RUB);

      await expect(loadExchangeRateWidgetModel(7)).resolves.toEqual({
        status: 'ready', chart: AMD_RUB, points: POINTS, stale: false, language: 'ru',
      });
      expect(fetchRateHistory).toHaveBeenCalledWith('AMD', 'RUB', 'week');
      expect(getWidgetChart).toHaveBeenCalledWith(7);
    });

    it('shows the first chart on a widget never configured', async () => {
      const model = await loadExchangeRateWidgetModel(7);
      expect(model.chart).toEqual(USD_RUB);
    });

    it('is empty with no charts at all', async () => {
      loadRateCharts.mockResolvedValue([]);
      await expect(loadExchangeRateWidgetModel(7)).resolves.toEqual({ status: 'empty', language: 'ru' });
      expect(fetchRateHistory).not.toHaveBeenCalled();
    });

    it('reports an error rather than throwing when the rates cannot be had', async () => {
      fetchRateHistory.mockRejectedValue(Object.assign(new Error('offline'), { code: 'network' }));
      await expect(loadExchangeRateWidgetModel(7)).resolves.toEqual({ status: 'error', chart: USD_RUB, language: 'ru' });
    });

    it('draws the pair picked while it was loading, not the one it started with', async () => {
      // The launcher's first update of a new widget can run alongside its
      // configuration screen: it read no pair, then the user picked one.
      getWidgetChart.mockResolvedValueOnce(null).mockResolvedValue(AMD_RUB);

      const model = await loadExchangeRateWidgetModel(7);

      expect(model.chart).toEqual(AMD_RUB);
      expect(fetchRateHistory).toHaveBeenLastCalledWith('AMD', 'RUB', 'week');
    });

    it('re-reads the choice only once', async () => {
      getWidgetChart
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(AMD_RUB)
        .mockResolvedValueOnce(AMD_RUB)
        .mockResolvedValue(USD_RUB);

      const model = await loadExchangeRateWidgetModel(7);

      expect(model.chart).toEqual(AMD_RUB);
      expect(getWidgetChart).toHaveBeenCalledTimes(3);
    });

    it('survives an unreadable database and widget store', async () => {
      loadRateCharts.mockRejectedValue(new Error('locked'));
      getWidgetChart.mockRejectedValue(new Error('io'));
      await expect(loadExchangeRateWidgetModel(7)).resolves.toEqual({ status: 'empty', language: 'ru' });
    });
  });

  it('renders both theme variants at the widget’s size', async () => {
    const result = await renderExchangeRateWidget({ widgetId: 7, width: 250, height: 180 });

    expect(Object.keys(result)).toEqual(['light', 'dark']);
    expect(result.light.props).toMatchObject({ theme: 'light', width: 250, height: 180 });
    expect(result.dark.props).toMatchObject({ theme: 'dark', width: 250, height: 180 });
    expect(result.light.props.model.status).toBe('ready');
  });

  describe('refreshExchangeRateWidgets', () => {
    it('asks the library to redraw every exchange-rate widget', async () => {
      requestWidgetUpdate.mockResolvedValue(undefined);

      await refreshExchangeRateWidgets();

      expect(requestWidgetUpdate).toHaveBeenCalledWith({
        widgetName: EXCHANGE_RATE_WIDGET,
        renderWidget: renderExchangeRateWidget,
      });
    });

    it('never throws', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      requestWidgetUpdate.mockRejectedValue(new Error('not linked'));

      await expect(refreshExchangeRateWidgets()).resolves.toBeUndefined();
      console.warn.mockRestore();
    });
  });
});
