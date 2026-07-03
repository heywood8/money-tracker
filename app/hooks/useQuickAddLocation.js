import { useRef, useCallback, useEffect } from 'react';
import { captureLocationIfEnabled } from '../services/operationLocation';

/**
 * useQuickAddLocation — keeps a best-effort current-location fix ready for
 * quick-add saves WITHOUT ever blocking the save.
 *
 * Unlike the operation modal (which has a discrete "open" event to capture on),
 * the quick-add form is always mounted, so the fix is captured ahead of time and
 * stashed in a ref: the caller `prime()`s it as the user starts entering an
 * operation (and after each add) so a fresh fix is usually ready by the time they
 * tap add, then reads the latest via `getLocation()` at save time and attaches
 * whatever is available (possibly null — capture is best-effort, issue #1091).
 *
 * Concurrency: a slower fix from an earlier prime must never overwrite a newer
 * one, so each prime bumps a monotonic token and only commits if it is still the
 * latest. Turning the feature off cancels any in-flight capture and clears the
 * stored fix so a stale coordinate can never attach after opt-out.
 *
 * @param {boolean} enabled - the `attachLocation` preference
 * @returns {{ getLocation: () => ({latitude:string,longitude:string}|null), prime: () => void }}
 */
const useQuickAddLocation = (enabled) => {
  const locationRef = useRef(null);
  const runIdRef = useRef(0);

  const prime = useCallback(() => {
    if (!enabled) return;
    const runId = ++runIdRef.current;
    captureLocationIfEnabled()
      .then((loc) => {
        if (runId === runIdRef.current) locationRef.current = loc;
      })
      .catch(() => {});
  }, [enabled]);

  // Prime once when the feature turns on; clear the stored fix (and invalidate any
  // in-flight capture) when it turns off.
  useEffect(() => {
    if (!enabled) {
      runIdRef.current += 1;
      locationRef.current = null;
      return;
    }
    prime();
  }, [enabled, prime]);

  const getLocation = useCallback(() => locationRef.current, []);

  return { getLocation, prime };
};

export default useQuickAddLocation;
