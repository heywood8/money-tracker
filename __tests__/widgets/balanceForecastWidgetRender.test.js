import { getWidgetInfo, requestWidgetUpdateById } from 'react-native-android-widget';
import {
  loadBalanceForecastModel,
  renderBalanceForecastWidget,
  refreshBalanceForecastWidgets,
} from '../../app/widgets/balanceForecastWidgetRender';
import { BalanceForecastWidget } from '../../app/widgets/BalanceForecastWidget';
import { getAllAccounts } from '../../app/services/AccountsDB';
import { getFirstOperationDate, getTotalExpenses } from '../../app/services/OperationsDB';
import { getPreference } from '../../app/services/PreferencesDB';
import { resolveLanguage } from '../../app/services/notifications/notificationStrings';
import { getWidgetConfig } from '../../app/widgets/balanceForecastWidgetStore';

jest.mock('react-native-android-widget', () => ({
  ...jest.requireActual('react-native-android-widget'),
  getWidgetInfo: jest.fn(),
  requestWidgetUpdateById: jest.fn(),
}));
jest.mock('../../app/services/AccountsDB', () => ({ getAllAccounts: jest.fn() }));
jest.mock('../../app/services/OperationsDB', () => ({
  getTotalExpenses: jest.fn(),
  getFirstOperationDate: jest.fn(),
}));
jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { HIDE_BALANCES: 'hide_balances' },
  getPreference: jest.fn(),
}));
jest.mock('../../app/services/notifications/notificationStrings', () => ({
  ...jest.requireActual('../../app/services/notifications/notificationStrings'),
  resolveLanguage: jest.fn(),
}));
jest.mock('../../app/widgets/balanceForecastWidgetStore', () => ({
  ...jest.requireActual('../../app/widgets/balanceForecastWidgetStore'),
  getWidgetConfig: jest.fn(),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

const CARD = { id: 1, name: 'Card', currency: 'USD', balance: '1000.50', hidden: 0 };
const CASH = { id: 2, name: 'Cash', currency: 'EUR', balance: '300', hidden: 0 };
const OLD = { id: 3, name: 'Old', currency: 'USD', balance: '10', hidden: 1 };
const ALL_COLUMNS = ['balance', 'daily', 'forecast'];
// The widget's settings, every column unless given.
const config = (accountIds, columns = ALL_COLUMNS) => ({ accountIds, columns });
// 26 October 2026, mid-afternoon: five days left after today.
const NOW = new Date(2026, 9, 26, 15);

describe('balanceForecastWidgetRender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllAccounts.mockResolvedValue([CARD, CASH, OLD]);
    getWidgetConfig.mockResolvedValue(config(null));
    resolveLanguage.mockResolvedValue('ru');
    getPreference.mockResolvedValue('false');
    // 3000 spent over a full 30-day window: 100 a day.
    getTotalExpenses.mockResolvedValue('3000');
    getFirstOperationDate.mockResolvedValue('2025-01-01');
  });

  describe('loadBalanceForecastModel', () => {
    it('forecasts every active account on a widget never configured', async () => {
      const model = await loadBalanceForecastModel(7, { now: NOW });

      expect(model).toEqual({
        status: 'ready',
        language: 'ru',
        hideBalances: false,
        monthEnd: '2026-10-31',
        columns: ALL_COLUMNS,
        rows: [
          { id: '1', name: 'Card', currency: 'USD', balance: 1000.5, forecast: 500.5, dailyAverage: 100 },
          { id: '2', name: 'Cash', currency: 'EUR', balance: 300, forecast: -200, dailyAverage: 100 },
        ],
      });
    });

    it('reads each account’s spending over the trailing 30 days, today included', async () => {
      await loadBalanceForecastModel(7, { now: NOW });

      expect(getTotalExpenses).toHaveBeenCalledWith(1, '2026-09-27', '2026-10-26');
      expect(getTotalExpenses).toHaveBeenCalledWith(2, '2026-09-27', '2026-10-26');
      expect(getFirstOperationDate).toHaveBeenCalledWith(1);
    });

    it('spreads a young account’s spending over the days it has existed', async () => {
      // First operation ten days ago, today included: 3000 / 10.
      getFirstOperationDate.mockResolvedValue('2026-10-17');
      getWidgetConfig.mockResolvedValue(config(['1']));

      const model = await loadBalanceForecastModel(7, { now: NOW });

      expect(model.rows).toEqual([expect.objectContaining({ dailyAverage: 300, forecast: 1000.5 - 300 * 5 })]);
    });

    it('shows only the widget’s own accounts', async () => {
      getWidgetConfig.mockResolvedValue(config(['2']));
      const model = await loadBalanceForecastModel(7, { now: NOW });
      expect(model.rows.map((row) => row.id)).toEqual(['2']);
      expect(getWidgetConfig).toHaveBeenCalledWith(7);
    });

    it('passes on the widget’s columns', async () => {
      getWidgetConfig.mockResolvedValue(config(null, ['forecast']));
      const model = await loadBalanceForecastModel(7, { now: NOW });
      expect(model.columns).toEqual(['forecast']);
    });

    it('draws the columns picked while it was loading, without reading the forecasts again', async () => {
      getWidgetConfig.mockResolvedValueOnce(config(null)).mockResolvedValue(config(null, ['daily']));
      const model = await loadBalanceForecastModel(7, { now: NOW });
      expect(model.columns).toEqual(['daily']);
      // Two accounts, read once each.
      expect(getTotalExpenses).toHaveBeenCalledTimes(2);
    });

    it('passes on the setting to hide balances', async () => {
      getPreference.mockResolvedValue('true');
      const model = await loadBalanceForecastModel(7, { now: NOW });
      expect(model.hideBalances).toBe(true);
      expect(getPreference).toHaveBeenCalledWith('hide_balances', 'false');
    });

    it('is empty with no accounts to show', async () => {
      getWidgetConfig.mockResolvedValue(config(['3']));
      await expect(loadBalanceForecastModel(7, { now: NOW })).resolves.toEqual({ status: 'empty', language: 'ru' });
      expect(getTotalExpenses).not.toHaveBeenCalled();
    });

    it('reports an error rather than throwing when the accounts cannot be read', async () => {
      getAllAccounts.mockRejectedValue(new Error('db closed'));
      await expect(loadBalanceForecastModel(7, { now: NOW })).resolves.toEqual({ status: 'error', language: 'ru' });
    });

    it('keeps an account whose spending cannot be read, without a forecast', async () => {
      getTotalExpenses.mockImplementation(async (id) => {
        if (id === 2) throw new Error('locked');
        return '3000';
      });

      const model = await loadBalanceForecastModel(7, { now: NOW });

      expect(model.rows[0].forecast).toBe(500.5);
      expect(model.rows[1]).toEqual({ id: '2', name: 'Cash', currency: 'EUR', balance: 300, forecast: null, dailyAverage: null });
    });

    it('degrades unreadable picks and preferences to the defaults', async () => {
      getWidgetConfig.mockRejectedValue(new Error('io'));
      getPreference.mockRejectedValue(new Error('io'));

      const model = await loadBalanceForecastModel(7, { now: NOW });

      expect(model.rows).toHaveLength(2);
      expect(model.columns).toEqual(ALL_COLUMNS);
      expect(model.hideBalances).toBe(false);
    });

    it('draws the accounts picked while it was loading, not the ones it started with', async () => {
      // The launcher's first update of a new widget can run alongside its
      // configuration screen: it read no picks, then the user saved some.
      getWidgetConfig.mockResolvedValueOnce(config(null)).mockResolvedValue(config(['2']));

      const model = await loadBalanceForecastModel(7, { now: NOW });

      expect(model.rows.map((row) => row.id)).toEqual(['2']);
    });

    it('reads the picks only twice when they have not changed', async () => {
      getWidgetConfig.mockResolvedValue(config(['1', '2']));
      await loadBalanceForecastModel(7, { now: NOW });
      expect(getWidgetConfig).toHaveBeenCalledTimes(2);
    });
  });

  describe('renderBalanceForecastWidget', () => {
    it('draws the widget in both themes at the launcher’s size', async () => {
      const rendered = await renderBalanceForecastWidget({ widgetId: 7, width: 300, height: 180 }, { now: NOW });

      expect(rendered.light.type).toBe(BalanceForecastWidget);
      expect(rendered.light.props).toMatchObject({ theme: 'light', width: 300, height: 180 });
      expect(rendered.dark.props).toMatchObject({ theme: 'dark', width: 300, height: 180 });
      expect(rendered.light.props.model.rows).toHaveLength(2);
    });

    it('passes on the system font scale', async () => {
      const rendered = await renderBalanceForecastWidget(
        { widgetId: 7, width: 300, height: 180, screenInfo: { fontScale: 1.3 } },
        { now: NOW },
      );
      expect(rendered.light.props.fontScale).toBe(1.3);
      expect(rendered.dark.props.fontScale).toBe(1.3);
    });
  });

  describe('refreshBalanceForecastWidgets', () => {
    beforeEach(() => {
      getWidgetInfo.mockResolvedValue([{ widgetId: 7 }, { widgetId: 9 }]);
      requestWidgetUpdateById.mockResolvedValue(undefined);
    });

    it('redraws every placed forecast widget', async () => {
      await refreshBalanceForecastWidgets();

      expect(getWidgetInfo).toHaveBeenCalledWith('BalanceForecast');
      expect(requestWidgetUpdateById).toHaveBeenCalledTimes(2);
      expect(requestWidgetUpdateById).toHaveBeenCalledWith({
        widgetName: 'BalanceForecast', widgetId: 7, renderWidget: renderBalanceForecastWidget,
      });
      expect(requestWidgetUpdateById).toHaveBeenCalledWith({
        widgetName: 'BalanceForecast', widgetId: 9, renderWidget: renderBalanceForecastWidget,
      });
    });

    it('resolves only once every widget is drawn', async () => {
      // The headless bank task ends right after this; a draw still running
      // then may never land.
      let drawn;
      requestWidgetUpdateById.mockReturnValueOnce(new Promise((resolve) => { drawn = resolve; }));
      let finished = false;
      const refresh = refreshBalanceForecastWidgets().then(() => { finished = true; });

      await new Promise((resolve) => setImmediate(resolve));
      expect(finished).toBe(false);

      drawn();
      await refresh;
      expect(finished).toBe(true);
    });

    it('still draws the others when one fails, and never throws', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      requestWidgetUpdateById.mockRejectedValueOnce(new Error('tree'));

      await expect(refreshBalanceForecastWidgets()).resolves.toBeUndefined();

      expect(requestWidgetUpdateById).toHaveBeenCalledTimes(2);
      console.warn.mockRestore();
    });

    it('never throws when the widgets cannot be listed', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      getWidgetInfo.mockRejectedValue(new Error('no native module'));
      await expect(refreshBalanceForecastWidgets()).resolves.toBeUndefined();
      console.warn.mockRestore();
    });
  });
});
