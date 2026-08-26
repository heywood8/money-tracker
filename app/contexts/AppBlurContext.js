import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * App-wide blur, reference-counted.
 *
 * The count is split across two contexts on purpose. Toggling the blur changes
 * `blurCount`, and every consumer of that value re-renders — which is exactly
 * what the one view that draws the blur needs, and exactly what nothing else
 * does. Consumers that only raise/lower the count (ModalBlurOverlay) or merely
 * read it inside a callback (AppInitializer's update poller) subscribe to the
 * controls context instead, whose value never changes, so opening or closing a
 * modal no longer re-renders the app tree while the blur is being applied or
 * removed — that re-render is what made the blur outlive the modal by a
 * visible beat.
 */
const AppBlurStateContext = createContext(0);
const AppBlurControlsContext = createContext({
  increment: () => {},
  decrement: () => {},
  blurCountRef: { current: 0 },
});

export function AppBlurProvider({ children }) {
  const [blurCount, setBlurCount] = useState(0);
  // Mirror of the count for readers that need the current value inside a
  // long-lived callback (an interval, a promise continuation) without
  // subscribing to it.
  const blurCountRef = useRef(0);

  const increment = useCallback(() => {
    blurCountRef.current += 1;
    setBlurCount(c => c + 1);
  }, []);
  const decrement = useCallback(() => {
    blurCountRef.current = Math.max(0, blurCountRef.current - 1);
    setBlurCount(c => Math.max(0, c - 1));
  }, []);

  const controls = useMemo(
    () => ({ increment, decrement, blurCountRef }),
    [increment, decrement],
  );

  return (
    <AppBlurControlsContext.Provider value={controls}>
      <AppBlurStateContext.Provider value={blurCount}>
        {children}
      </AppBlurStateContext.Provider>
    </AppBlurControlsContext.Provider>
  );
}

AppBlurProvider.propTypes = { children: PropTypes.node };

/** Current blur count. Re-renders the caller on every change — use sparingly. */
export const useAppBlurState = () => useContext(AppBlurStateContext);

/** Stable `{ increment, decrement, blurCountRef }` — never re-renders the caller. */
export const useAppBlurControls = () => useContext(AppBlurControlsContext);
