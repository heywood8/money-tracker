/**
 * Tests for useQuickAddLocation — the non-blocking, best-effort location capture
 * for the quick-add form (issue #1091). operationLocation is mocked so we drive
 * capture outcomes directly.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import useQuickAddLocation from '../../app/hooks/useQuickAddLocation';
import { captureLocationIfEnabled } from '../../app/services/operationLocation';

jest.mock('../../app/services/operationLocation', () => ({
  captureLocationIfEnabled: jest.fn(),
}));

const flush = () => act(async () => { await Promise.resolve(); });

describe('useQuickAddLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captureLocationIfEnabled.mockResolvedValue({ latitude: '40.1', longitude: '44.2' });
  });

  it('primes a fix when the feature turns on and exposes it via getLocation', async () => {
    const { result } = await renderHook(() => useQuickAddLocation(true));
    await waitFor(() => expect(captureLocationIfEnabled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.getLocation()).toEqual({ latitude: '40.1', longitude: '44.2' }));
  });

  it('does not capture when disabled, and getLocation stays null', async () => {
    const { result } = await renderHook(() => useQuickAddLocation(false));
    await flush();
    expect(captureLocationIfEnabled).not.toHaveBeenCalled();
    expect(result.current.getLocation()).toBeNull();
  });

  it('prime() is a no-op while disabled', async () => {
    const { result } = await renderHook(() => useQuickAddLocation(false));
    await act(async () => { result.current.prime(); });
    await flush();
    expect(captureLocationIfEnabled).not.toHaveBeenCalled();
    expect(result.current.getLocation()).toBeNull();
  });

  it('clears the stored fix when the feature is turned off', async () => {
    const { result, rerender } = await renderHook(({ on }) => useQuickAddLocation(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.getLocation()).not.toBeNull());

    await act(async () => { rerender({ on: false }); });
    await flush();
    expect(result.current.getLocation()).toBeNull();
  });

  it('a superseded (slower) capture never overwrites a newer fix', async () => {
    // First prime resolves slowly with a stale fix; a second prime resolves fast
    // with the fresh fix. Only the newest fix must win.
    let resolveStale;
    captureLocationIfEnabled
      .mockImplementationOnce(() => new Promise((res) => { resolveStale = res; }))
      .mockResolvedValueOnce({ latitude: '10', longitude: '20' });

    const { result } = await renderHook(() => useQuickAddLocation(true));
    // The mount effect fired the first (stale, pending) capture.
    await act(async () => { result.current.prime(); }); // second capture — resolves immediately
    await waitFor(() => expect(result.current.getLocation()).toEqual({ latitude: '10', longitude: '20' }));

    // Now let the stale capture resolve late — it must be discarded.
    await act(async () => { resolveStale({ latitude: '99', longitude: '99' }); await Promise.resolve(); });
    expect(result.current.getLocation()).toEqual({ latitude: '10', longitude: '20' });
  });
});
