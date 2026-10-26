import { forgetWidget } from './exchangeRateWidgetStore';
import { refreshExchangeRateWidgets, renderExchangeRateWidget } from './exchangeRateWidgetRender';
import { forgetForecastWidget } from './balanceForecastWidgetStore';
import { renderBalanceForecastWidget } from './balanceForecastWidgetRender';
import { BALANCE_FORECAST_WIDGET, EXCHANGE_RATE_WIDGETS, REFRESH_RATES_ACTION } from './widgetConstants';

// The library stops a headless widget task after 30 s. A refresh tapped on a
// slow network waits this long for fresh rates, leaving room to draw the saved
// ones instead.
const REFRESH_WAIT_MS = 20000;

// The promise's value, or null if it fails or outlasts `ms`.
const within = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
};

/**
 * The launcher's entry point into the app's home-screen widgets.
 *
 * Android calls it headless — the app need not be open — when a widget is
 * placed, resized or due its periodic update, and when one is removed. It is
 * registered at bundle load from index.js, alongside the background tasks.
 *
 * A tap on a widget opens the Graphs tab through a deep link (OPEN_URI),
 * which the library hands to Android without a round trip to JS. The one tap
 * that does arrive is "↻ 14:05" (REFRESH_RATES_ACTION): fresh rates, now.
 *
 * @param {import('react-native-android-widget').WidgetTaskHandlerProps} props
 */
export async function widgetTaskHandler(props) {
  const { widgetInfo, widgetAction, clickAction, renderWidget } = props;
  if (widgetInfo.widgetName === BALANCE_FORECAST_WIDGET) {
    await balanceForecastTask(props);
    return;
  }
  if (!EXCHANGE_RATE_WIDGETS.includes(widgetInfo.widgetName)) return;

  switch (widgetAction) {
  case 'WIDGET_ADDED':
  case 'WIDGET_UPDATE':
  case 'WIDGET_RESIZED':
    renderWidget(await renderExchangeRateWidget(widgetInfo));
    break;
  case 'WIDGET_CLICK': {
    if (clickAction !== REFRESH_RATES_ACTION) break;
    // At once, from what is saved, so the tap shows; then from the network.
    renderWidget(await renderExchangeRateWidget(widgetInfo, { cacheOnly: true, refreshing: true }));
    const fresh = await within(renderExchangeRateWidget(widgetInfo, { force: true }), REFRESH_WAIT_MS);
    // Too slow for the task: draw what is saved, so "↻ …" is not left behind.
    renderWidget(fresh || await renderExchangeRateWidget(widgetInfo, { cacheOnly: true }));
    // Every other widget showing these pairs reads the fresh copy too, from
    // the cache: the network was just asked.
    await refreshExchangeRateWidgets({ preferCache: true });
    break;
  }
  case 'WIDGET_DELETED':
    await forgetWidget(widgetInfo.widgetId).catch(() => {});
    break;
  default:
    break;
  }
}

/**
 * The forecast widget's share of the task. Its figures are all on the phone,
 * so there is nothing to refresh on a tap: every tap is the deep link.
 *
 * @param {import('react-native-android-widget').WidgetTaskHandlerProps} props
 */
async function balanceForecastTask({ widgetInfo, widgetAction, renderWidget }) {
  switch (widgetAction) {
  case 'WIDGET_ADDED':
  case 'WIDGET_UPDATE':
  case 'WIDGET_RESIZED':
    renderWidget(await renderBalanceForecastWidget(widgetInfo));
    break;
  case 'WIDGET_DELETED':
    await forgetForecastWidget(widgetInfo.widgetId).catch(() => {});
    break;
  default:
    break;
  }
}
