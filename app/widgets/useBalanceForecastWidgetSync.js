import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshBalanceForecastWidgets } from './balanceForecastWidgetRender';

/**
 * Keep the balance-forecast widgets on the home screen in step with the app.
 *
 * They are redrawn once, when the app goes to the background: whatever moved
 * the money while it was open (operations booked by hand or from a bank
 * notification, a balance corrected, a restore, the setting to hide balances
 * flipped) is about to be looked at on the home screen. Not as each of those
 * happens: the home screen is out of sight then, and one redraw on leaving
 * covers them all. Costs nothing with no widget placed: the library only
 * renders the widgets that exist.
 *
 * Mounted once, by the navigator that lives for the whole session.
 */
export default function useBalanceForecastWidgetSync() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') refreshBalanceForecastWidgets();
    });
    return () => subscription?.remove?.();
  }, []);
}
