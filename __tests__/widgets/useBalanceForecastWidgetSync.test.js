import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import useBalanceForecastWidgetSync from '../../app/widgets/useBalanceForecastWidgetSync';
import { refreshBalanceForecastWidgets } from '../../app/widgets/balanceForecastWidgetRender';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/widgets/balanceForecastWidgetRender', () => ({ refreshBalanceForecastWidgets: jest.fn() }));

describe('useBalanceForecastWidgetSync', () => {
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
    await renderHook(() => useBalanceForecastWidgetSync());
    expect(refreshBalanceForecastWidgets).not.toHaveBeenCalled();
  });

  it.each([
    ['a restore reloads the data', EVENTS.RELOAD_ALL],
    ['the database is reset', EVENTS.DATABASE_RESET],
    ['an operation changes', EVENTS.OPERATION_CHANGED],
  ])('leaves it to the redraw on leaving the app when %s', async (_label, event) => {
    await renderHook(() => useBalanceForecastWidgetSync());
    await act(async () => { appEvents.emit(event); });
    expect(refreshBalanceForecastWidgets).not.toHaveBeenCalled();
  });

  it('redraws when the app goes to the background, not when it comes back', async () => {
    await renderHook(() => useBalanceForecastWidgetSync());

    await act(async () => { appStateListener('background'); });
    expect(refreshBalanceForecastWidgets).toHaveBeenCalledTimes(1);

    await act(async () => { appStateListener('active'); });
    expect(refreshBalanceForecastWidgets).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await renderHook(() => useBalanceForecastWidgetSync());
    await act(async () => { unmount(); });
    expect(remove).toHaveBeenCalled();
  });
});
