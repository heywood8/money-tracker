/**
 * Tests for LocationService — the defensive expo-location wrapper (issue #1091).
 *
 * The whole point of this module is graceful degradation: a denied permission,
 * a GPS timeout, or any thrown error must resolve to a safe value and NEVER
 * throw, so location capture can never block saving an operation.
 */

import * as Location from 'expo-location';
import { ensureLocationPermission, getCurrentLocation } from '../../app/services/LocationService';

describe('LocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-establish permissive defaults (overridden per-test as needed).
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 40.0, longitude: 44.0 } });
  });

  describe('ensureLocationPermission', () => {
    it('reports granted when the OS grants permission', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
      await expect(ensureLocationPermission()).resolves.toEqual({ granted: true, canAskAgain: true });
    });

    it('reports not granted when the OS denies permission', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
      const result = await ensureLocationPermission();
      expect(result.granted).toBe(false);
      expect(result.canAskAgain).toBe(true);
    });

    it('treats a permanently-denied permission as not granted / cannot ask again', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
      const result = await ensureLocationPermission();
      expect(result.granted).toBe(false);
      expect(result.canAskAgain).toBe(false);
    });

    it('never throws — a rejected request resolves to { granted: false }', async () => {
      Location.requestForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
      await expect(ensureLocationPermission()).resolves.toEqual({ granted: false, canAskAgain: false });
    });
  });

  describe('getCurrentLocation', () => {
    it('returns coordinates as strings on success', async () => {
      Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 12.34, longitude: 56.78 } });
      const coords = await getCurrentLocation();
      expect(coords).toEqual({ latitude: '12.34', longitude: '56.78' });
    });

    it('returns null when the fix is missing coords', async () => {
      Location.getCurrentPositionAsync.mockResolvedValue({ coords: null });
      await expect(getCurrentLocation()).resolves.toBeNull();
    });

    it('never throws — a rejected fix resolves to null', async () => {
      Location.getCurrentPositionAsync.mockRejectedValue(new Error('no gps'));
      await expect(getCurrentLocation()).resolves.toBeNull();
    });

    it('resolves to null on timeout without throwing', async () => {
      // A fix that never resolves must not wedge the caller: the race's timeout wins.
      Location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
      await expect(getCurrentLocation({ timeoutMs: 20 })).resolves.toBeNull();
    });
  });
});
