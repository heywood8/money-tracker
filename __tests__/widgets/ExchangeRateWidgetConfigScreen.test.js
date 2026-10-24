import React from 'react';
import { BackHandler } from 'react-native';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import ExchangeRateWidgetConfigScreen from '../../app/widgets/ExchangeRateWidgetConfigScreen';
import { loadRateCharts } from '../../app/services/ExchangeRateCharts';
import { resolveLanguage } from '../../app/services/notifications/notificationStrings';
import { getWidgetChart, getWidgetCharts, setWidgetChart, setWidgetCharts } from '../../app/widgets/exchangeRateWidgetStore';
import { renderExchangeRateWidget, refreshExchangeRateWidgets } from '../../app/widgets/exchangeRateWidgetRender';

jest.mock('../../app/services/ExchangeRateCharts', () => ({
  ...jest.requireActual('../../app/services/ExchangeRateCharts'),
  loadRateCharts: jest.fn(),
}));
jest.mock('../../app/services/notifications/notificationStrings', () => ({
  ...jest.requireActual('../../app/services/notifications/notificationStrings'),
  resolveLanguage: jest.fn(),
}));
jest.mock('../../app/widgets/exchangeRateWidgetStore', () => ({
  getWidgetChart: jest.fn(),
  getWidgetCharts: jest.fn(),
  setWidgetChart: jest.fn(),
  setWidgetCharts: jest.fn(),
}));
jest.mock('../../app/widgets/exchangeRateWidgetRender', () => ({
  renderExchangeRateWidget: jest.fn(),
  refreshExchangeRateWidgets: jest.fn(),
}));

const USD_RUB = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
const AMD_RUB = { id: 'b', from: 'AMD', to: 'RUB', amount: 100, range: 'week' };
const widgetInfo = { widgetName: 'ExchangeRate', widgetId: 7, width: 250, height: 180 };
const RENDERED = { light: 'l', dark: 'd' };

const setup = async (info = widgetInfo) => {
  const props = { widgetInfo: info, renderWidget: jest.fn(), setResult: jest.fn() };
  await render(<ExchangeRateWidgetConfigScreen {...props} />);
  return props;
};

describe('ExchangeRateWidgetConfigScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRateCharts.mockResolvedValue([USD_RUB, AMD_RUB]);
    resolveLanguage.mockResolvedValue('en');
    getWidgetChart.mockResolvedValue(null);
    setWidgetChart.mockResolvedValue(undefined);
    getWidgetCharts.mockResolvedValue([]);
    setWidgetCharts.mockResolvedValue(undefined);
    renderExchangeRateWidget.mockResolvedValue(RENDERED);
  });

  it('lists the configured charts, marking the one the widget shows', async () => {
    getWidgetChart.mockResolvedValue(AMD_RUB);
    await setup();

    await waitFor(() => expect(screen.getByText('1 USD → RUB')).toBeTruthy());
    expect(screen.getByText('100 AMD → RUB')).toBeTruthy();
    expect(screen.getByText('Which rate should the widget show?')).toBeTruthy();
    expect(screen.getByTestId('widget-config-chart-b').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('widget-config-chart-a').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('binds the widget to the picked chart, draws it and finishes', async () => {
    const { renderWidget, setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-config-chart-b')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-config-chart-b'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(setWidgetChart).toHaveBeenCalledWith(7, AMD_RUB);
    expect(renderExchangeRateWidget).toHaveBeenCalledWith(widgetInfo);
    expect(renderWidget).toHaveBeenCalledWith(RENDERED);
  });

  it('still finishes when drawing fails, leaving the draw to a background refresh', async () => {
    renderExchangeRateWidget.mockRejectedValue(new Error('offline'));
    const { renderWidget, setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-config-chart-a')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-config-chart-a'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(renderWidget).not.toHaveBeenCalled();
    expect(refreshExchangeRateWidgets).toHaveBeenCalled();
  });

  it('does not hold the launcher up on a slow network', async () => {
    jest.useFakeTimers();
    renderExchangeRateWidget.mockReturnValue(new Promise(() => {}));
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-config-chart-a')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
    expect(setResult).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(4000); });

    expect(setResult).toHaveBeenCalledWith('ok');
    expect(setWidgetChart).toHaveBeenCalledWith(7, USD_RUB);
    expect(refreshExchangeRateWidgets).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('answers the launcher once, whatever is tapped while a pick is saved', async () => {
    let resolveRender;
    renderExchangeRateWidget.mockReturnValue(new Promise((resolve) => { resolveRender = resolve; }));
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-config-chart-a')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
    await fireEvent.press(screen.getByTestId('widget-config-chart-b'));
    await fireEvent.press(screen.getByTestId('widget-config-cancel'));
    await act(async () => { resolveRender(RENDERED); });

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(setResult).toHaveBeenCalledTimes(1);
    expect(setWidgetChart).toHaveBeenCalledTimes(1);
    expect(setWidgetChart).toHaveBeenCalledWith(7, USD_RUB);
  });

  it('cancels from the cancel button', async () => {
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-config-cancel')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-config-cancel'));

    expect(setResult).toHaveBeenCalledWith('cancel');
    expect(setWidgetChart).not.toHaveBeenCalled();
  });

  it('cancels on hardware back', async () => {
    let backHandler;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      backHandler = handler;
      return { remove: jest.fn() };
    });
    const { setResult } = await setup();

    expect(backHandler()).toBe(true);
    expect(setResult).toHaveBeenCalledWith('cancel');
    BackHandler.addEventListener.mockRestore();
  });

  it('explains where charts come from when there are none, and can add the widget anyway', async () => {
    loadRateCharts.mockResolvedValue([]);
    const { renderWidget, setResult } = await setup();

    await waitFor(() => expect(screen.getByText('Add an exchange rate chart in Settings → Graphs')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('widget-config-add-anyway'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(setWidgetChart).not.toHaveBeenCalled();
    expect(renderWidget).toHaveBeenCalledWith(RENDERED);
  });

  it('speaks the app’s language', async () => {
    resolveLanguage.mockResolvedValue('ru');
    await setup();

    await waitFor(() => expect(screen.getByText('Какой курс показывать в виджете?')).toBeTruthy());
    expect(screen.getByText('Отмена')).toBeTruthy();
  });

  describe('two-rate widget', () => {
    const EUR_RUB = { id: 'c', from: 'EUR', to: 'RUB', amount: 1, range: 'year' };
    const pairInfo = { widgetName: 'ExchangeRatePair', widgetId: 8, width: 380, height: 180 };
    const orderOf = (id) => screen.queryByTestId(`widget-config-order-${id}`);

    beforeEach(() => {
      loadRateCharts.mockResolvedValue([USD_RUB, AMD_RUB, EUR_RUB]);
    });

    it('starts from the first two charts, numbered left and right', async () => {
      await setup(pairInfo);

      await waitFor(() => expect(orderOf('a')).toHaveTextContent('1'));
      expect(orderOf('b')).toHaveTextContent('2');
      expect(orderOf('c')).toBeNull();
      expect(screen.getByText('Which two rates should the widget show? Tap them in order: left, then right')).toBeTruthy();
    });

    it('starts from what the widget shows when it is reconfigured', async () => {
      getWidgetCharts.mockResolvedValue([EUR_RUB, USD_RUB]);
      await setup(pairInfo);

      await waitFor(() => expect(orderOf('c')).toHaveTextContent('1'));
      expect(orderOf('a')).toHaveTextContent('2');
    });

    it('drops a pick on a second tap and replaces the right-hand one with a third chart', async () => {
      await setup(pairInfo);
      await waitFor(() => expect(orderOf('b')).toHaveTextContent('2'));

      await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
      expect(orderOf('a')).toBeNull();
      expect(orderOf('b')).toHaveTextContent('1');

      await fireEvent.press(screen.getByTestId('widget-config-chart-c'));
      await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
      expect(orderOf('b')).toHaveTextContent('1');
      expect(orderOf('a')).toHaveTextContent('2');
      expect(orderOf('c')).toBeNull();
    });

    it('saves the picks in order on Done, draws and finishes', async () => {
      const { renderWidget, setResult } = await setup(pairInfo);
      await waitFor(() => expect(orderOf('b')).toHaveTextContent('2'));
      await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
      await fireEvent.press(screen.getByTestId('widget-config-chart-c'));

      await fireEvent.press(screen.getByTestId('widget-config-done'));

      await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
      expect(setWidgetCharts).toHaveBeenCalledWith(8, [AMD_RUB, EUR_RUB]);
      expect(setWidgetChart).not.toHaveBeenCalled();
      expect(renderExchangeRateWidget).toHaveBeenCalledWith(pairInfo);
      expect(renderWidget).toHaveBeenCalledWith(RENDERED);
    });

    it('keeps a chart since deleted in Settings, listed after the others', async () => {
      const GONE = { id: 'gone', from: 'GBP', to: 'RUB', amount: 1, range: 'month' };
      getWidgetCharts.mockResolvedValue([GONE, USD_RUB]);
      await setup(pairInfo);

      await waitFor(() => expect(orderOf('gone')).toHaveTextContent('1'));
      expect(screen.getByText('1 GBP → RUB')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('widget-config-done'));

      await waitFor(() => expect(setWidgetCharts).toHaveBeenCalledWith(8, [GONE, USD_RUB]));
    });

    it('does not finish with nothing picked', async () => {
      const { setResult } = await setup(pairInfo);
      await waitFor(() => expect(orderOf('b')).toHaveTextContent('2'));
      await fireEvent.press(screen.getByTestId('widget-config-chart-a'));
      await fireEvent.press(screen.getByTestId('widget-config-chart-b'));

      expect(screen.getByTestId('widget-config-done').props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(screen.getByTestId('widget-config-done'));
      expect(setResult).not.toHaveBeenCalled();
    });
  });
});
