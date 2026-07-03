/**
 * operationLocation — the single "should I attach a location, and if so which?"
 * decision, shared by every path that creates an operation (the operation modal,
 * quick-add, and bank-notification ingestion).
 *
 * It layers the user preference on top of the pure expo-location wrapper
 * (LocationService): read the opt-in flag, and only when it is on request a
 * permission + a single fix. Like LocationService, every path is best-effort and
 * degrades to null (feature off, permission missing, timeout, any error) so
 * capturing a location can never block or fail saving an operation (issue #1091).
 *
 * Kept separate from LocationService so that module stays a dependency-free
 * expo-location shim, and separate from the React contexts so non-UI callers
 * (notification processing) share the exact same source of truth as the toggle.
 */

import { getPreference, PREF_KEYS } from './PreferencesDB';
import { ensureLocationPermission, getCurrentLocation } from './LocationService';

/**
 * Whether the "attach location to new operations" opt-in is enabled. Reads the
 * same preference the Settings toggle writes, so UI and background callers never
 * diverge. Defaults off and never throws.
 * @returns {Promise<boolean>}
 */
export const isAttachLocationEnabled = async () => {
  try {
    const value = await getPreference(PREF_KEYS.ATTACH_LOCATION, 'false');
    return value === 'true';
  } catch (error) {
    console.warn('[operationLocation] Failed to read attach-location preference:', error?.message);
    return false;
  }
};

/**
 * Capture the device location for a new operation, but only when the feature is
 * enabled. Returns { latitude, longitude } on a successful fix, or null when the
 * feature is off, permission is missing, or the fix fails/times out. Never
 * prompts beyond the OS permission (already secured by the Settings toggle before
 * the feature can be on) and never throws.
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] - forwarded to getCurrentLocation
 * @returns {Promise<{ latitude: string, longitude: string } | null>}
 */
export const captureLocationIfEnabled = async (opts = {}) => {
  if (!(await isAttachLocationEnabled())) return null;
  const { granted } = await ensureLocationPermission();
  if (!granted) return null;
  return getCurrentLocation(opts);
};

/**
 * Normalize a captured fix into the operation-field overrides to persist, or an
 * empty object when there is nothing to attach. Spread into a createOperation
 * payload: `{ ...operationLocationFields(loc) }`.
 * @param {{ latitude: *, longitude: * }|null|undefined} location
 * @returns {{ latitude: *, longitude: * }|{}}
 */
export const operationLocationFields = (location) =>
  location && location.latitude != null && location.longitude != null
    ? { latitude: location.latitude, longitude: location.longitude }
    : {};
