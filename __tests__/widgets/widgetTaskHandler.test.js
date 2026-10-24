import { widgetTaskHandler } from '../../app/widgets/widgetTaskHandler';
import { refreshExchangeRateWidgets, renderExchangeRateWidget } from '../../app/widgets/exchangeRateWidgetRender';
import { forgetWidget } from '../../app/widgets/exchangeRateWidgetStore';

jest.mock('../../app/widgets/exchangeRateWidgetRender', () => ({
  renderExchangeRateWidget: jest.fn(),
  refreshExchangeRateWidgets: jest.fn(),
}));
jest.mock('../../app/widgets/exchangeRateWidgetStore', () => ({ forgetWidget: jest.fn() }));

const widgetInfo = { widgetName: 'ExchangeRate', widgetId: 7, width: 250, height: 180 };
const RENDERED = { light: 'light-tree', dark: 'dark-tree' };

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderExchangeRateWidget.mockResolvedValue(RENDERED);
    forgetWidget.mockResolvedValue(undefined);
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
});
