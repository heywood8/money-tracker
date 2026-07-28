import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import PropTypes from 'prop-types';

/**
 * A screen-wide overlay layer that shares its coordinate space with the app content.
 *
 * Why this exists: an overlay that has to line up with something already on screen
 * (a lifted clone of a long-pressed row, a spotlight, a coach mark) needs the target's
 * position. A core `<Modal>` cannot be trusted for that — it owns a *separate native
 * window* whose origin may or may not match the app's, depending on edge-to-edge, the
 * system bars and the vendor's Android skin. Positioning window-measured coordinates
 * inside that window is a guess that happens to be right on some devices.
 *
 * So the layer lives in the same tree instead:
 *
 *   <View style={container}>              ← the shared origin
 *     <View ref={hostRef} style={container}>  ← app content (blurred when a modal is up)
 *       ...screens, lists, rows...
 *     </View>
 *     <OverlayOutlet />                   ← absolute fill, same origin, not blurred
 *   </View>
 *
 * Both children fill the same parent, so `(0, 0)` means the same point for each. A row
 * measured with `measureLayout(hostRef.current)` therefore lands exactly where it was
 * drawn — no status-bar or inset arithmetic anywhere, and nothing left to drift.
 *
 * The outlet is a sibling of the content rather than a child so the root-level blur
 * (`filter` in App.js) does not bleed into the overlay: the lifted row must stay sharp
 * while everything behind it goes soft.
 *
 * Usage: render `<OverlayPortal>` anywhere below the provider; its children are mounted
 * into the outlet. Read `hostRef` via `useOverlayHost()` to measure against the layer.
 */

const DEFAULT_HOST = {
  hostRef: { current: null },
  mountOverlay: () => {},
  unmountOverlay: () => {},
};

const OverlayHostContext = createContext(DEFAULT_HOST);
// Slots live in their own context so mounting/updating an overlay re-renders the outlet
// only — not every consumer that merely wants `hostRef` to measure against.
const OverlaySlotsContext = createContext(null);

export function OverlayHostProvider({ children }) {
  const hostRef = useRef(null);
  const [slots, setSlots] = useState(() => new Map());

  const mountOverlay = useCallback((id, node) => {
    setSlots((prev) => {
      const next = new Map(prev);
      next.set(id, node);
      return next;
    });
  }, []);

  const unmountOverlay = useCallback((id) => {
    setSlots((prev) => {
      // Returning `prev` untouched keeps an unmount of something that was never
      // mounted from scheduling a pointless render of the outlet.
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const host = useMemo(
    () => ({ hostRef, mountOverlay, unmountOverlay }),
    [mountOverlay, unmountOverlay],
  );

  return (
    <OverlayHostContext.Provider value={host}>
      <OverlaySlotsContext.Provider value={slots}>
        {children}
      </OverlaySlotsContext.Provider>
    </OverlayHostContext.Provider>
  );
}

OverlayHostProvider.propTypes = { children: PropTypes.node };

export const useOverlayHost = () => useContext(OverlayHostContext);

/**
 * Renders the mounted overlays. Place as a sibling of the view carrying `hostRef`,
 * inside the same parent — that shared parent is what makes the coordinates line up.
 */
export function OverlayOutlet() {
  const slots = useContext(OverlaySlotsContext);

  if (!slots || slots.size === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="overlay-outlet">
      {Array.from(slots.entries(), ([id, node]) => (
        <React.Fragment key={id}>{node}</React.Fragment>
      ))}
    </View>
  );
}

/**
 * Teleports its children into the overlay outlet. Renders nothing in place.
 */
export function OverlayPortal({ children }) {
  const id = useId();
  const { mountOverlay, unmountOverlay } = useOverlayHost();

  useEffect(() => {
    mountOverlay(id, children);
  }, [id, children, mountOverlay]);

  // Unmount only when the portal itself goes away. Tying this to the effect above
  // would tear the overlay down and rebuild it on every content update, which reads
  // as a flicker mid-animation.
  useEffect(() => () => unmountOverlay(id), [id, unmountOverlay]);

  return null;
}

OverlayPortal.propTypes = { children: PropTypes.node };
