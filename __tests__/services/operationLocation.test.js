/**
 * Tests for operationLocation — the preference-gated location capture shared by
 * every operation-creating path (modal, quick-add, notification ingestion).
 *
 * The contract: capture only when the opt-in is on AND permission is granted,
 * and degrade to null on every other path (off, denied, failed fix) so it can
 * never block saving an operation (issue #1091).
 */

import {
  isAttachLocationEnabled,
  captureLocationIfEnabled,
  operationLocationFields,
} from '../../app/services/operationLocation';
import { ensureLocationPermission, getCurrentLocation } from '../../app/services/LocationService';
import { getPreference } from '../../app/services/PreferencesDB';

jest.mock('../../app/services/LocationService');
jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { ATTACH_LOCATION: 'attach_location' },
  getPreference: jest.fn(),
}));

describe('operationLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPreference.mockResolvedValue('true');
    ensureLocationPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    getCurrentLocation.mockResolvedValue({ latitude: '40.1', longitude: '44.2' });
  });

  describe('isAttachLocationEnabled', () => {
    it('is true only when the preference is exactly "true"', async () => {
      getPreference.mockResolvedValue('true');
      await expect(isAttachLocationEnabled()).resolves.toBe(true);
    });

    it('is false for any other stored value', async () => {
      getPreference.mockResolvedValue('false');
      await expect(isAttachLocationEnabled()).resolves.toBe(false);
      getPreference.mockResolvedValue('1');
      await expect(isAttachLocationEnabled()).resolves.toBe(false);
    });

    it('never throws — a rejected read resolves to false', async () => {
      getPreference.mockRejectedValue(new Error('db down'));
      await expect(isAttachLocationEnabled()).resolves.toBe(false);
    });
  });

  describe('captureLocationIfEnabled', () => {
    it('returns coordinates when enabled, permitted, and the fix succeeds', async () => {
      const coords = await captureLocationIfEnabled();
      expect(coords).toEqual({ latitude: '40.1', longitude: '44.2' });
      expect(ensureLocationPermission).toHaveBeenCalledTimes(1);
      expect(getCurrentLocation).toHaveBeenCalledTimes(1);
    });

    it('short-circuits to null when the feature is off — no permission prompt, no fix', async () => {
      getPreference.mockResolvedValue('false');
      const coords = await captureLocationIfEnabled();
      expect(coords).toBeNull();
      expect(ensureLocationPermission).not.toHaveBeenCalled();
      expect(getCurrentLocation).not.toHaveBeenCalled();
    });

    it('returns null when permission is not granted — no fix attempted', async () => {
      ensureLocationPermission.mockResolvedValue({ granted: false, canAskAgain: true });
      const coords = await captureLocationIfEnabled();
      expect(coords).toBeNull();
      expect(getCurrentLocation).not.toHaveBeenCalled();
    });

    it('returns null when the fix itself fails (timeout / unavailable)', async () => {
      getCurrentLocation.mockResolvedValue(null);
      await expect(captureLocationIfEnabled()).resolves.toBeNull();
    });

    it('forwards options to getCurrentLocation', async () => {
      await captureLocationIfEnabled({ timeoutMs: 1234 });
      expect(getCurrentLocation).toHaveBeenCalledWith({ timeoutMs: 1234 });
    });
  });

  describe('operationLocationFields', () => {
    it('returns lat/lng overrides for a valid fix', () => {
      expect(operationLocationFields({ latitude: '1', longitude: '2' })).toEqual({
        latitude: '1',
        longitude: '2',
      });
    });

    it('keeps a valid 0 coordinate', () => {
      expect(operationLocationFields({ latitude: 0, longitude: 0 })).toEqual({
        latitude: 0,
        longitude: 0,
      });
    });

    it('returns an empty object for null / partial input', () => {
      expect(operationLocationFields(null)).toEqual({});
      expect(operationLocationFields(undefined)).toEqual({});
      expect(operationLocationFields({ latitude: '1' })).toEqual({});
      expect(operationLocationFields({ longitude: '2' })).toEqual({});
    });
  });
});
