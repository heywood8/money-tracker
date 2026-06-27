/**
 * Tests for useOperationLocation — the geolocation capture lifecycle hook
 * (issue #1091, §5.1). LocationService is mocked so we drive permission/fix
 * outcomes directly.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import useOperationLocation from '../../app/hooks/useOperationLocation';
import { ensureLocationPermission, getCurrentLocation } from '../../app/services/LocationService';

jest.mock('../../app/services/LocationService', () => ({
  ensureLocationPermission: jest.fn(),
  getCurrentLocation: jest.fn(),
}));

describe('useOperationLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureLocationPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    getCurrentLocation.mockResolvedValue({ latitude: '40.1', longitude: '44.2' });
  });

  it('auto-captures once on open for a new operation when enabled', async () => {
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: true, visible: true }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.location).toEqual({ latitude: '40.1', longitude: '44.2' });
    expect(ensureLocationPermission).toHaveBeenCalledTimes(1);
    expect(getCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it('does not capture when the feature is disabled', async () => {
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: false, isNew: true, visible: true }),
    );

    // Give any (unexpected) async effect a chance to run.
    await act(async () => { await Promise.resolve(); });
    expect(ensureLocationPermission).not.toHaveBeenCalled();
    expect(getCurrentLocation).not.toHaveBeenCalled();
    expect(result.current.location).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('does not capture when editing, and surfaces the existing coordinates', async () => {
    const initialLocation = { latitude: '1.5', longitude: '2.5' };
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: false, visible: true, initialLocation }),
    );

    await act(async () => { await Promise.resolve(); });
    expect(getCurrentLocation).not.toHaveBeenCalled();
    expect(result.current.location).toEqual(initialLocation);
    expect(result.current.status).toBe('ready');
  });

  it('lands in "denied" when permission is not granted (location stays null)', async () => {
    ensureLocationPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: true, visible: true }),
    );

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.location).toBeNull();
    expect(getCurrentLocation).not.toHaveBeenCalled();
  });

  it('lands in "error" when the fix is unavailable (timeout/null)', async () => {
    getCurrentLocation.mockResolvedValue(null);
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: true, visible: true }),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.location).toBeNull();
  });

  it('clearLocation wipes the captured coordinates', async () => {
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: true, visible: true }),
    );
    await waitFor(() => expect(result.current.location).not.toBeNull());

    await act(async () => { result.current.clearLocation(); });
    expect(result.current.location).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('manual capture fetches a fix on demand (e.g. the "Add location" button)', async () => {
    // Editing → no auto-capture; the user taps to capture manually.
    const { result } = await renderHook(() =>
      useOperationLocation({ enabled: true, isNew: false, visible: true }),
    );
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(getCurrentLocation).not.toHaveBeenCalled();

    await act(async () => { await result.current.capture(); });
    expect(result.current.status).toBe('ready');
    expect(result.current.location).toEqual({ latitude: '40.1', longitude: '44.2' });
  });

  it('does not auto-capture for a new op while the modal is closed', async () => {
    await renderHook(() => useOperationLocation({ enabled: true, isNew: true, visible: false }));
    await act(async () => { await Promise.resolve(); });
    expect(ensureLocationPermission).not.toHaveBeenCalled();
  });
});
