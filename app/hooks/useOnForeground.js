import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs `callback` each time the app returns to the foreground — an AppState
 * transition from background/inactive to active. Not on mount: a freshly
 * launched app is already active, and mount work belongs to the caller.
 *
 * The latest callback is always the one invoked, so a caller can pass an
 * inline function, or one whose identity changes, without re-subscribing.
 *
 * @param {() => void} callback
 */
export default function useOnForeground(callback) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let appState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appState;
      appState = nextState;
      if (nextState === 'active' && previous && /inactive|background/.test(previous)) {
        callbackRef.current();
      }
    });
    // Optional: a stubbed AppState (unit environments) hands back nothing to
    // unsubscribe from, and a throw here would break the whole cleanup pass.
    return () => subscription?.remove?.();
  }, []);
}
