/**
 * LocationService — thin, defensive wrapper around expo-location.
 *
 * The rest of the app never touches expo-location directly: it asks this module
 * for a foreground permission and a single GPS fix. Both functions are fully
 * try/caught and degrade to safe values ({ granted: false } / null) on ANY
 * failure, because location capture is best-effort and must never block saving
 * an operation (see issue #1091, §3.2). No background location, no geocoding.
 */

import * as Location from 'expo-location';

/**
 * Request (or read) the foreground location permission, surfacing the OS prompt
 * in the caller's context. Never throws.
 * @returns {Promise<{ granted: boolean, canAskAgain: boolean }>}
 */
export const ensureLocationPermission = async () => {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    return {
      granted: status === 'granted',
      // Default canAskAgain to true when the field is absent so callers don't
      // wrongly treat a normal denial as "permanently denied".
      canAskAgain: canAskAgain !== false,
    };
  } catch (error) {
    console.warn('[LocationService] Permission request failed:', error?.message);
    return { granted: false, canAskAgain: false };
  }
};

/**
 * Get a single current-position fix, bounded by a timeout. Returns the bare
 * coordinates (as strings, to match the schema's "numbers as strings"
 * convention) or null on denied permission, timeout, or any error. Never throws.
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=8000] - Abort the fix after this many ms
 * @returns {Promise<{ latitude: string, longitude: string } | null>}
 */
export const getCurrentLocation = async ({ timeoutMs = 8000 } = {}) => {
  let timer;
  try {
    // Race the GPS fix against a timeout so a slow/hanging fix can never wedge the
    // capture flow. A timeout resolves to null (not a rejection) — same safe path
    // as a hard failure. The timer is cleared in `finally` so a fast fix never
    // leaves an 8 s timer dangling.
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);

    const coords = fix?.coords;
    if (!coords || coords.latitude == null || coords.longitude == null) {
      return null;
    }

    return {
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
    };
  } catch (error) {
    console.warn('[LocationService] Failed to get current location:', error?.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
