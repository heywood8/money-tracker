import { renderHook, waitFor, act } from '@testing-library/react-native';
import useExchangeRateCharts from '../../app/hooks/useExchangeRateCharts';
import { loadRateCharts, upsertRateChart, removeRateChart } from '../../app/services/ExchangeRateCharts';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/ExchangeRateCharts', () => ({
  loadRateCharts: jest.fn(),
  upsertRateChart: jest.fn(),
  removeRateChart: jest.fn(),
}));

const USD_RUB = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
const AMD_RUB = { id: 'b', from: 'AMD', to: 'RUB', amount: 100, range: 'week' };

describe('useExchangeRateCharts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRateCharts.mockResolvedValue([USD_RUB]);
  });

  it('loads the stored charts', async () => {
    const { result } = await renderHook(() => useExchangeRateCharts());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.charts).toEqual([USD_RUB]);
  });

  it('follows a save broadcast from another holder', async () => {
    const { result } = await renderHook(() => useExchangeRateCharts());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      appEvents.emit(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, [USD_RUB, AMD_RUB]);
    });

    expect(result.current.charts).toEqual([USD_RUB, AMD_RUB]);
  });

  it.each([EVENTS.RELOAD_ALL, EVENTS.DATABASE_RESET])('rereads the stored list on %s', async (event) => {
    const { result } = await renderHook(() => useExchangeRateCharts());
    await waitFor(() => expect(result.current.charts).toEqual([USD_RUB]));

    loadRateCharts.mockResolvedValue([]);
    await act(async () => {
      appEvents.emit(event);
    });

    await waitFor(() => expect(result.current.charts).toEqual([]));
  });

  it('still reports loaded when the read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    loadRateCharts.mockRejectedValue(new Error('db closed'));

    const { result } = await renderHook(() => useExchangeRateCharts());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.charts).toEqual([]);
    console.error.mockRestore();
  });

  it('keeps a broadcast list over a read that started before it', async () => {
    let resolveRead;
    loadRateCharts.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { result } = await renderHook(() => useExchangeRateCharts());

    await act(async () => {
      appEvents.emit(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, [USD_RUB, AMD_RUB]);
    });
    await act(async () => {
      resolveRead([USD_RUB]);
    });

    expect(result.current.charts).toEqual([USD_RUB, AMD_RUB]);
    expect(result.current.loaded).toBe(true);
  });

  it('edits through the stored list', async () => {
    const { result } = await renderHook(() => useExchangeRateCharts());

    expect(result.current.upsertChart).toBe(upsertRateChart);
    expect(result.current.removeChart).toBe(removeRateChart);
  });

  it('stops listening once unmounted', async () => {
    const { result, unmount } = await renderHook(() => useExchangeRateCharts());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await unmount();

    loadRateCharts.mockClear();
    appEvents.emit(EVENTS.RELOAD_ALL);
    expect(loadRateCharts).not.toHaveBeenCalled();
  });
});
