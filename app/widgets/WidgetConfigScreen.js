import React from 'react';
import PropTypes from 'prop-types';
import ExchangeRateWidgetConfigScreen from './ExchangeRateWidgetConfigScreen';
import BalanceForecastWidgetConfigScreen from './BalanceForecastWidgetConfigScreen';
import { BALANCE_FORECAST_WIDGET } from './widgetConstants';

/**
 * The one configuration screen the widget library lets an app register, shared
 * by every widget: it hands each widget the screen of its own, told apart by
 * `widgetInfo.widgetName`.
 */
export default function WidgetConfigScreen(props) {
  if (props.widgetInfo?.widgetName === BALANCE_FORECAST_WIDGET) {
    return <BalanceForecastWidgetConfigScreen {...props} />;
  }
  return <ExchangeRateWidgetConfigScreen {...props} />;
}

WidgetConfigScreen.propTypes = {
  renderWidget: PropTypes.func.isRequired,
  setResult: PropTypes.func.isRequired,
  widgetInfo: PropTypes.shape({
    widgetId: PropTypes.number.isRequired,
    widgetName: PropTypes.string,
  }).isRequired,
};
