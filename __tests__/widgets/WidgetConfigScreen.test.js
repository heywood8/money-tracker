/* eslint-disable react/prop-types */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import WidgetConfigScreen from '../../app/widgets/WidgetConfigScreen';

jest.mock('../../app/widgets/ExchangeRateWidgetConfigScreen', () => {
  const { Text } = require('react-native');
  return function MockRateScreen({ widgetInfo }) {
    return <Text>{`rates:${widgetInfo.widgetName}`}</Text>;
  };
});
jest.mock('../../app/widgets/BalanceForecastWidgetConfigScreen', () => {
  const { Text } = require('react-native');
  return function MockForecastScreen({ widgetInfo }) {
    return <Text>{`forecast:${widgetInfo.widgetId}`}</Text>;
  };
});

const props = (widgetName) => ({
  widgetInfo: { widgetName, widgetId: 7, width: 300, height: 180 },
  renderWidget: jest.fn(),
  setResult: jest.fn(),
});

describe('WidgetConfigScreen', () => {
  it('opens the forecast widget’s own screen', async () => {
    await render(<WidgetConfigScreen {...props('BalanceForecast')} />);
    expect(screen.getByText('forecast:7')).toBeTruthy();
  });

  it.each(['ExchangeRate', 'ExchangeRatePair'])('opens the rate screen for %s', async (widgetName) => {
    await render(<WidgetConfigScreen {...props(widgetName)} />);
    expect(screen.getByText(`rates:${widgetName}`)).toBeTruthy();
  });
});
