import { useEffect } from 'react';
import { AppState } from 'react-native';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { refreshExchangeRateWidgets } from './exchangeRateWidgetRender';

/**
 * Keep the exchange-rate widgets on the home screen in step with the app.
 *
 * They are redrawn when the configured charts change (an edited pair should
 * not wait an hour to reach the widget showing it), when a backup restore or a
 * reset replaces the data under them, and when the app goes to the background:
 * by then the Graphs tab has usually just topped up the saved rates, and the
 * home screen is what the user is about to look at. Not at start-up, where the
 * launcher's own updates already cover it and the app has its own loading to
 * do. None of it costs anything with no widget placed: the library only renders
 * the widgets that exist.
 *
 * Mounted once, by the navigator that lives for the whole session.
 */
export default function useExchangeRateWidgetSync() {
  useEffect(() => {
    const offEvents = [
      EVENTS.EXCHANGE_RATE_CHARTS_CHANGED,
      EVENTS.RELOAD_ALL,
      EVENTS.DATABASE_RESET,
    ].map((event) => appEvents.on(event, () => { refreshExchangeRateWidgets(); }));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') refreshExchangeRateWidgets();
    });
    return () => {
      offEvents.forEach((off) => off());
      subscription?.remove?.();
    };
  }, []);
}
