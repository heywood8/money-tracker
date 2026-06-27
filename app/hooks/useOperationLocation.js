import { useState, useRef, useCallback, useEffect } from 'react';
import { ensureLocationPermission, getCurrentLocation } from '../services/LocationService';

const hasCoords = (loc) => !!(loc && loc.latitude != null && loc.longitude != null);

/**
 * useOperationLocation — owns the geolocation capture lifecycle for the operation
 * modal, kept out of the already-large useOperationForm.
 *
 * Capture happens only for a NEW operation and only when the feature is enabled:
 * on modal open it runs once (permission → fix). Editing an existing operation
 * surfaces whatever coordinates it already has (via `initialLocation`) with a
 * remove affordance, and never silently re-captures.
 *
 * Every path is best-effort: a denied permission or a GPS timeout lands in
 * `status` without throwing and never blocks saving (issue #1091, §5.1 / R1.4).
 *
 * Concurrency: OperationModal is always-mounted (its `visible` prop toggles), so
 * this hook instance persists across opens. A slow fix from a *previous* open
 * must never write into the *current* form — so each open and each capture bump a
 * monotonic generation token (`runIdRef`); a capture only commits its result if
 * its snapshotted token still matches the latest. A boolean "active" flag is
 * insufficient because a later open would re-set it to true and let the stale
 * fix through.
 *
 * @param {Object} params
 * @param {boolean} params.enabled - The `attachLocation` preference
 * @param {boolean} params.isNew - Whether the modal is adding a new operation
 * @param {boolean} params.visible - Whether the modal is open
 * @param {{latitude: string, longitude: string}|null} [params.initialLocation] - Existing coords when editing
 * @returns {{ location: object|null, status: string, capture: Function, clearLocation: Function }}
 *   status is one of 'idle' | 'capturing' | 'ready' | 'denied' | 'error'
 */
const useOperationLocation = ({ enabled = false, isNew = false, visible = false, initialLocation = null } = {}) => {
  const [location, setLocation] = useState(() => (hasCoords(initialLocation) ? initialLocation : null));
  const [status, setStatus] = useState(hasCoords(initialLocation) ? 'ready' : 'idle');

  // Read changing values via refs so the open/capture effects stay stable and
  // don't re-run on every parent render (initialLocation is a fresh object each time).
  const initialRef = useRef(initialLocation);
  initialRef.current = initialLocation;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const isNewRef = useRef(isNew);
  isNewRef.current = isNew;

  // Monotonic generation token. Bumped on every open/close (the effect below) and
  // at the start of every capture/clear. A capture snapshots the token when it
  // starts and discards its result if the token has since advanced — i.e. the
  // modal closed, reopened, cleared, or a newer capture began.
  const runIdRef = useRef(0);

  const capture = useCallback(async () => {
    const runId = ++runIdRef.current;
    setStatus('capturing');
    try {
      const { granted } = await ensureLocationPermission();
      if (runId !== runIdRef.current) return; // superseded — discard
      if (!granted) {
        setStatus('denied');
        return;
      }
      const coords = await getCurrentLocation();
      if (runId !== runIdRef.current) return; // superseded — discard
      if (coords) {
        setLocation(coords);
        setStatus('ready');
      } else {
        // Timed out or fix unavailable — surfaced as a re-triggerable "Add location".
        setStatus('error');
      }
    } catch (error) {
      // Defensive: LocationService already swallows errors, but never let one escape.
      if (runId === runIdRef.current) setStatus('error');
    }
  }, []);

  const clearLocation = useCallback(() => {
    runIdRef.current++; // cancel any in-flight capture so it can't repopulate
    setLocation(null);
    setStatus('idle');
  }, []);

  // On open: seed from the operation's existing coords (null for a new op) and
  // auto-capture for a new op when enabled. On close: just bump the token so a
  // pending capture from this open can't commit later. The token bump also makes
  // this safe under React 18/19 StrictMode double-invoke (the first run's capture
  // is discarded; the second run's wins).
  useEffect(() => {
    runIdRef.current++; // new generation — invalidate any in-flight capture
    if (!visible) {
      return undefined;
    }
    const existing = hasCoords(initialRef.current) ? initialRef.current : null;
    setLocation(existing);
    setStatus(existing ? 'ready' : 'idle');

    if (enabledRef.current && isNewRef.current) {
      capture();
    }
    return () => { runIdRef.current++; };
  }, [visible, capture]);

  return { location, status, capture, clearLocation };
};

export default useOperationLocation;
