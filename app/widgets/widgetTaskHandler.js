import { forgetWidget } from './exchangeRateWidgetStore';
import { renderExchangeRateWidget } from './exchangeRateWidgetRender';
import { EXCHANGE_RATE_WIDGET } from './widgetConstants';

/**
 * The launcher's entry point into the app's home-screen widgets.
 *
 * Android calls it headless — the app need not be open — when a widget is
 * placed, resized or due its periodic update, and when one is removed. It is
 * registered at bundle load from index.js, alongside the background tasks.
 *
 * Taps never arrive here: the widget opens the Graphs tab through a deep link
 * (OPEN_URI), which the library hands to Android without a round trip to JS.
 *
 * @param {import('react-native-android-widget').WidgetTaskHandlerProps} props
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }) {
  if (widgetInfo.widgetName !== EXCHANGE_RATE_WIDGET) return;

  switch (widgetAction) {
  case 'WIDGET_ADDED':
  case 'WIDGET_UPDATE':
  case 'WIDGET_RESIZED':
    renderWidget(await renderExchangeRateWidget(widgetInfo));
    break;
  case 'WIDGET_DELETED':
    await forgetWidget(widgetInfo.widgetId).catch(() => {});
    break;
  default:
    break;
  }
}
