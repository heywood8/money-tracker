import { widgetTaskHandler } from '../../app/widgets/widgetTaskHandler';
import {
  refreshExchangeRateWidgets,
  renderExchangeRateWidget,
  stepExchangeRateWidgetWindow,
} from '../../app/widgets/exchangeRateWidgetRender';
import { forgetWidget } from '../../app/widgets/exchangeRateWidgetStore';
import { renderBalanceForecastWidget } from '../../app/widgets/balanceForecastWidgetRender';
import { forgetForecastWidget } from '../../app/widgets/balanceForecastWidgetStore';

jest.mock('../../app/widgets/exchangeRateWidgetRender', () => ({
  renderExchangeRateWidget: jest.fn(),
  refreshExchangeRateWidgets: jest.fn(),
  stepExchangeRateWidgetWindow: jest.fn(),
}));
jest.mock('../../app/widgets/exchangeRateWidgetStore', () => ({ forgetWidget: jest.fn() }));
jest.mock('../../app/widgets/balanceForecastWidgetRender', () => ({ renderBalanceForecastWidget: jest.fn() }));
jest.mock('../../app/widgets/balanceForecastWidgetStore', () => ({ forgetForecastWidget: jest.fn() }));

const widgetInfo = { widgetName: 'ExchangeRate', widgetId: 7, width: 250, height: 180 };
const RENDERED = { light: 'light-tree', dark: 'dark-tree' };
const FORECAST = { light: 'forecast-light', dark: 'forecast-dark' };
const forecastInfo = { widgetName: 'BalanceForecast', widgetId: 11, width: 300, height: 180 };

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderExchangeRateWidget.mockResolvedValue(RENDERED);
    forgetWidget.mockResolvedValue(undefined);
    renderBalanceForecastWidget.mockResolvedValue(FORECAST);
    forgetForecastWidget.mockResolvedValue(undefined);
  });

  it.each(['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'])('draws the widget on %s', async (widgetAction) => {
    const renderWidget = jest.fn();

    await widgetTaskHandler({ widgetInfo, widgetAction, renderWidget });

    expect(renderExchangeRateWidget).toHaveBeenCalledWith(widgetInfo);
    expect(renderWidget).toHaveBeenCalledWith(RENDERED);
  });

  it('forgets a removed widget without drawing', async () => {
    const renderWidget = jest.fn();

    await widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_DELETED', renderWidget });

    expect(forgetWidget).toHaveBeenCalledWith(7);
    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('does not fail the task when the store cannot be written', async () => {
    forgetWidget.mockRejectedValue(new Error('io'));
    await expect(widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_DELETED', renderWidget: jest.fn() }))
      .resolves.toBeUndefined();
  });

  it('leaves other clicks to the deep link', async () => {
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'X', renderWidget });
    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('steps the window on a tap of its arrows: saved rates at once, then topped up', async () => {
    const renderWidget = jest.fn();
    stepExchangeRateWidgetWindow.mockResolvedValue('year');
    renderExchangeRateWidget.mockResolvedValueOnce('saved').mockResolvedValueOnce('topped-up');

    await widgetTaskHandler({
      widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'RATE_WINDOW', clickActionData: { step: 1 }, renderWidget,
    });

    expect(stepExchangeRateWidgetWindow).toHaveBeenCalledWith(widgetInfo, 1, { wrap: false });
    // "↻ …" at once, over whatever of the new window is saved.
    expect(renderExchangeRateWidget).toHaveBeenNthCalledWith(1, widgetInfo, { cacheOnly: true, refreshing: true });
    expect(renderExchangeRateWidget).toHaveBeenNthCalledWith(2, widgetInfo);
    expect(renderWidget.mock.calls.map(([tree]) => tree)).toEqual(['saved', 'topped-up']);
    // Only this widget's window changed: the others are left alone.
    expect(refreshExchangeRateWidgets).not.toHaveBeenCalled();
  });

  it('passes a narrow widget’s wrapping step on', async () => {
    stepExchangeRateWidgetWindow.mockResolvedValue('day');

    await widgetTaskHandler({
      widgetInfo,
      widgetAction: 'WIDGET_CLICK',
      clickAction: 'RATE_WINDOW',
      clickActionData: { step: 1, wrap: true },
      renderWidget: jest.fn(),
    });

    expect(stepExchangeRateWidgetWindow).toHaveBeenCalledWith(widgetInfo, 1, { wrap: true });
  });

  it('draws the saved window when the network is too slow for the task', async () => {
    jest.useFakeTimers();
    const renderWidget = jest.fn();
    stepExchangeRateWidgetWindow.mockResolvedValue('all');
    renderExchangeRateWidget
      .mockResolvedValueOnce('loading')
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce('saved');

    const task = widgetTaskHandler({
      widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'RATE_WINDOW', clickActionData: { step: 1 }, renderWidget,
    });
    await jest.advanceTimersByTimeAsync(20000);
    await task;
    jest.useRealTimers();

    expect(renderWidget.mock.calls.map(([tree]) => tree)).toEqual(['loading', 'saved']);
    expect(renderExchangeRateWidget).toHaveBeenLastCalledWith(widgetInfo, { cacheOnly: true });
  });

  it('draws nothing when an arrow at the end of the ranges is tapped', async () => {
    const renderWidget = jest.fn();
    stepExchangeRateWidgetWindow.mockResolvedValue(null);

    await widgetTaskHandler({
      widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'RATE_WINDOW', clickActionData: { step: -1 }, renderWidget,
    });

    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('refreshes on a tap of the refresh area: saved rates at once, then fresh ones', async () => {
    const renderWidget = jest.fn();
    renderExchangeRateWidget
      .mockResolvedValueOnce({ light: 'refreshing', dark: 'refreshing' })
      .mockResolvedValueOnce({ light: 'fresh', dark: 'fresh' });

    await widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'REFRESH_RATES', renderWidget });

    expect(renderExchangeRateWidget).toHaveBeenNthCalledWith(1, widgetInfo, { cacheOnly: true, refreshing: true });
    expect(renderExchangeRateWidget).toHaveBeenNthCalledWith(2, widgetInfo, { force: true });
    expect(renderWidget.mock.calls.map(([tree]) => tree.light)).toEqual(['refreshing', 'fresh']);
    // The others from the copy just fetched, without asking the network again.
    expect(refreshExchangeRateWidgets).toHaveBeenCalledWith({ preferCache: true });
  });

  it('draws the saved rates when the fresh ones take too long for the task', async () => {
    jest.useFakeTimers();
    const renderWidget = jest.fn();
    renderExchangeRateWidget.mockImplementation((info, options) => (options?.force
      ? new Promise(() => {}) // a network that never answers
      : Promise.resolve({ light: options?.refreshing ? 'refreshing' : 'saved', dark: '' })));

    const task = widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'REFRESH_RATES', renderWidget });
    await jest.advanceTimersByTimeAsync(20000);
    await task;

    expect(renderWidget.mock.calls.map(([tree]) => tree.light)).toEqual(['refreshing', 'saved']);
    jest.useRealTimers();
  });

  it('serves the two-rate widget too', async () => {
    const renderWidget = jest.fn();
    const pairInfo = { ...widgetInfo, widgetName: 'ExchangeRatePair' };

    await widgetTaskHandler({ widgetInfo: pairInfo, widgetAction: 'WIDGET_UPDATE', renderWidget });

    expect(renderExchangeRateWidget).toHaveBeenCalledWith(pairInfo);
    expect(renderWidget).toHaveBeenCalledWith(RENDERED);
  });

  it('ignores a widget it does not own', async () => {
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo: { ...widgetInfo, widgetName: 'Other' }, widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(renderExchangeRateWidget).not.toHaveBeenCalled();
    expect(renderWidget).not.toHaveBeenCalled();
  });

  describe('balance-forecast widget', () => {
    it.each(['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'])('draws it on %s', async (widgetAction) => {
      const renderWidget = jest.fn();

      await widgetTaskHandler({ widgetInfo: forecastInfo, widgetAction, renderWidget });

      expect(renderBalanceForecastWidget).toHaveBeenCalledWith(forecastInfo);
      expect(renderExchangeRateWidget).not.toHaveBeenCalled();
      expect(renderWidget).toHaveBeenCalledWith(FORECAST);
    });

    it('forgets it from its own store when removed', async () => {
      await widgetTaskHandler({ widgetInfo: forecastInfo, widgetAction: 'WIDGET_DELETED', renderWidget: jest.fn() });

      expect(forgetForecastWidget).toHaveBeenCalledWith(11);
      expect(forgetWidget).not.toHaveBeenCalled();
    });

    it('does not fail the task when its store cannot be written', async () => {
      forgetForecastWidget.mockRejectedValue(new Error('io'));
      await expect(widgetTaskHandler({ widgetInfo: forecastInfo, widgetAction: 'WIDGET_DELETED', renderWidget: jest.fn() }))
        .resolves.toBeUndefined();
    });

    it('has nothing to refresh on a tap', async () => {
      const renderWidget = jest.fn();
      await widgetTaskHandler({ widgetInfo: forecastInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'REFRESH_RATES', renderWidget });
      expect(renderWidget).not.toHaveBeenCalled();
      expect(refreshExchangeRateWidgets).not.toHaveBeenCalled();
    });
  });
});
