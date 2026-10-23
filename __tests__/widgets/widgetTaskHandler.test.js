import { widgetTaskHandler } from '../../app/widgets/widgetTaskHandler';
import { renderExchangeRateWidget } from '../../app/widgets/exchangeRateWidgetRender';
import { forgetWidget } from '../../app/widgets/exchangeRateWidgetStore';

jest.mock('../../app/widgets/exchangeRateWidgetRender', () => ({ renderExchangeRateWidget: jest.fn() }));
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

  it('leaves clicks to the deep link', async () => {
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_CLICK', clickAction: 'X', renderWidget });
    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('ignores a widget it does not own', async () => {
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo: { ...widgetInfo, widgetName: 'Other' }, widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(renderExchangeRateWidget).not.toHaveBeenCalled();
    expect(renderWidget).not.toHaveBeenCalled();
  });
});
