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

  // Auto-capture at most once per modal open.
  const autoCapturedRef = useRef(false);
  // Guard against state updates after the modal closes / unmounts.
  const activeRef = useRef(false);

  const capture = useCallback(async () => {
    activeRef.current = true;
    setStatus('capturing');
    try {
      const { granted } = await ensureLocationPermission();
      if (!granted) {
        if (activeRef.current) setStatus('denied');
        return;
      }
      const coords = await getCurrentLocation();
      if (!activeRef.current) return;
      if (coords) {
        setLocation(coords);
        setStatus('ready');
      } else {
        // Timed out or fix unavailable — surfaced as a re-triggerable "Add location".
        setStatus('error');
      }
    } catch (error) {
      // Defensive: LocationService already swallows errors, but never let one escape.
      if (activeRef.current) setStatus('error');
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setStatus('idle');
  }, []);

  // On open: seed from the operation's existing coords (null for a new op) and
  // auto-capture once for a new op when enabled. On close: drop the guards.
  useEffect(() => {
    if (!visible) {
      activeRef.current = false;
      autoCapturedRef.current = false;
      return undefined;
    }
    activeRef.current = true;
    const existing = hasCoords(initialRef.current) ? initialRef.current : null;
    setLocation(existing);
    setStatus(existing ? 'ready' : 'idle');

    if (enabledRef.current && isNewRef.current && !autoCapturedRef.current) {
      autoCapturedRef.current = true;
      capture();
    }
    return () => { activeRef.current = false; };
  }, [visible, capture]);

  return { location, status, capture, clearLocation };
};

export default useOperationLocation;
