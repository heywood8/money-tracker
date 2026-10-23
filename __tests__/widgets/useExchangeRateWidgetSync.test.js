import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import useExchangeRateWidgetSync from '../../app/widgets/useExchangeRateWidgetSync';
import { refreshExchangeRateWidgets } from '../../app/widgets/exchangeRateWidgetRender';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/widgets/exchangeRateWidgetRender', () => ({ refreshExchangeRateWidgets: jest.fn() }));

describe('useExchangeRateWidgetSync', () => {
  let appStateListener;
  const remove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      appStateListener = listener;
      return { remove };
    });
  });

  afterEach(() => {
    AppState.addEventListener.mockRestore();
  });

  it('does not redraw at start-up', async () => {
    await renderHook(() => useExchangeRateWidgetSync());
    expect(refreshExchangeRateWidgets).not.toHaveBeenCalled();
  });

  it.each([
    ['the charts change', EVENTS.EXCHANGE_RATE_CHARTS_CHANGED],
    ['a restore reloads the data', EVENTS.RELOAD_ALL],
    ['the database is reset', EVENTS.DATABASE_RESET],
  ])('redraws when %s', async (_label, event) => {
    await renderHook(() => useExchangeRateWidgetSync());

    await act(async () => { appEvents.emit(event, []); });

    expect(refreshExchangeRateWidgets).toHaveBeenCalledTimes(1);
  });

  it('redraws when the app goes to the background, not when it comes back', async () => {
    await renderHook(() => useExchangeRateWidgetSync());

    await act(async () => { appStateListener('background'); });
    expect(refreshExchangeRateWidgets).toHaveBeenCalledTimes(1);

    await act(async () => { appStateListener('active'); });
    expect(refreshExchangeRateWidgets).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await renderHook(() => useExchangeRateWidgetSync());
    await unmount();

    appEvents.emit(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, []);
    expect(refreshExchangeRateWidgets).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
