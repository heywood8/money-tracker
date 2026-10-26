import React from 'react';
import { getWidgetInfo, requestWidgetUpdateById } from 'react-native-android-widget';
import { getAllAccounts } from '../services/AccountsDB';
import { getFirstOperationDate, getTotalExpenses } from '../services/OperationsDB';
import { getPreference, PREF_KEYS } from '../services/PreferencesDB';
import { resolveLanguage } from '../services/notifications/notificationStrings';
import { formatLocalDate } from '../utils/dateUtils';
import {
  dailySpendingRate, forecastMonthEndBalance, spendingWindowDays, spendingWindowStart,
} from '../utils/spendingPrediction';
import { getWidgetConfig, normalizeColumns, resolveForecastAccounts } from './balanceForecastWidgetStore';
import { BalanceForecastWidget } from './BalanceForecastWidget';
import { BALANCE_FORECAST_WIDGET } from './widgetConstants';

const sameList = (a, b) => (a === b) || (
  !!a && !!b && a.length === b.length && a.every((item, i) => item === b[i])
);

/**
 * One account's forecast, read the way the balance chart reads it for the
 * running month: spending over the trailing window, spread over the days the
 * account has existed in it (utils/spendingPrediction). An account whose
 * spending cannot be read keeps its balance and gets no forecast.
 *
 * @param {Object} account
 * @param {Date} now
 * @returns {Promise<Object>} A row of the widget's model
 */
const forecastRow = async (account, now) => {
  const balance = parseFloat(account.balance);
  const row = {
    id: String(account.id),
    name: account.name,
    currency: account.currency,
    balance: Number.isFinite(balance) ? balance : 0,
    forecast: null,
    dailyAverage: null,
  };
  try {
    const [spent, firstOperationDate] = await Promise.all([
      getTotalExpenses(account.id, formatLocalDate(spendingWindowStart(now)), formatLocalDate(now)),
      getFirstOperationDate(account.id),
    ]);
    const dailyAverage = dailySpendingRate(parseFloat(spent) || 0, spendingWindowDays(now, firstOperationDate));
    const { forecast } = forecastMonthEndBalance({ balance: row.balance, dailyAverage, now });
    return { ...row, forecast, dailyAverage };
  } catch {
    return row;
  }
};

/**
 * Everything the forecast widget needs to draw: its accounts' balances and
 * forecasts, the columns it shows, the month's last day, the app's language and
 * whether balances are hidden.
 *
 * Runs headless (the launcher asks for updates with the app closed), so every
 * read degrades instead of throwing: no accounts reads as "empty", an
 * unreadable database as "error". A widget that fails to render keeps showing
 * whatever it last drew, which is worse than saying what is wrong.
 *
 * The accounts and columns can be picked while this loads: on some launchers
 * the first update of a new widget runs alongside its configuration screen.
 * Whichever draw lands last wins, so a stale one re-reads the settings once and
 * draws those.
 *
 * @param {number} widgetId
 * @param {Object} [options]
 * @param {Date} [options.now]
 * @param {boolean} [options.recheck=true] - Re-read the widget's settings after loading
 * @returns {Promise<{status: 'ready'|'error'|'empty', language: string, hideBalances?: boolean,
 *   monthEnd?: string, columns?: string[], rows?: Array<Object>}>}
 */
export const loadBalanceForecastModel = async (widgetId, { now = new Date(), recheck = true } = {}) => {
  const readConfig = () => getWidgetConfig(widgetId)
    .catch(() => ({ accountIds: null, columns: normalizeColumns(null) }));
  const [language, hideBalances, config] = await Promise.all([
    resolveLanguage(),
    getPreference(PREF_KEYS.HIDE_BALANCES, 'false').then((value) => value === 'true').catch(() => false),
    readConfig(),
  ]);
  let accounts;
  try {
    accounts = resolveForecastAccounts(await getAllAccounts(), config.accountIds);
  } catch {
    return { status: 'error', language };
  }
  if (accounts.length === 0) return { status: 'empty', language };

  const rows = await Promise.all(accounts.map((account) => forecastRow(account, now)));
  let { columns } = config;
  if (recheck) {
    const latest = await readConfig();
    if (!sameList(latest.accountIds, config.accountIds)) {
      return loadBalanceForecastModel(widgetId, { now, recheck: false });
    }
    // Only the columns changed: the forecasts already read still hold.
    ({ columns } = latest);
  }
  return {
    status: 'ready',
    language,
    hideBalances,
    monthEnd: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    columns,
    rows,
  };
};

/**
 * The forecast widget in both system themes; the launcher shows the one that
 * matches.
 *
 * @param {{widgetId: number, width: number, height: number}} widgetInfo
 * @param {Object} [options] - As loadBalanceForecastModel's
 * @returns {Promise<{light: JSX.Element, dark: JSX.Element}>}
 */
export const renderBalanceForecastWidget = async (widgetInfo, options) => {
  const model = await loadBalanceForecastModel(widgetInfo.widgetId, options);
  const size = { width: widgetInfo.width, height: widgetInfo.height, fontScale: widgetInfo.screenInfo?.fontScale };
  return {
    light: <BalanceForecastWidget model={model} {...size} theme="light" />,
    dark: <BalanceForecastWidget model={model} {...size} theme="dark" />,
  };
};

/**
 * Redraw every forecast widget on the home screen. Called when the money under
 * them may have moved (the app going to the background after the user booked
 * something, operations booked from a bank notification with the app closed);
 * the launcher's own hourly update covers the turn of the day.
 *
 * Resolves only once every widget is drawn, unlike the library's
 * requestWidgetUpdate, which starts the draws and returns: the headless bank
 * task ends right after this, and a draw still running then may never land.
 * Never throws: a widget that could not be redrawn now will be on the next
 * update.
 *
 * @returns {Promise<void>}
 */
export const refreshBalanceForecastWidgets = async () => {
  const warn = (error) => {
    console.warn(`[widgets] Could not refresh ${BALANCE_FORECAST_WIDGET} widgets:`, error?.message);
  };
  try {
    const widgets = await getWidgetInfo(BALANCE_FORECAST_WIDGET);
    await Promise.all(widgets.map(({ widgetId }) => requestWidgetUpdateById({
      widgetName: BALANCE_FORECAST_WIDGET,
      widgetId,
      renderWidget: renderBalanceForecastWidget,
    }).catch(warn)));
  } catch (error) {
    warn(error);
  }
};
