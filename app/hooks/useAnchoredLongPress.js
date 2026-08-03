import { useCallback, useRef } from 'react';
import { useOverlayHost } from '../contexts/OverlayHostContext';
import { measureAnchorRect } from '../utils/overlayGeometry';

/**
 * Wiring for a row that lifts itself into an action menu on long press.
 *
 * A row that wants RowActionMenu to float over it has to report where it is,
 * measured against the overlay host — the shared ancestor of the row and of the
 * layer the lifted copy is drawn in. Doing that by hand is a ref, a context read
 * and a measure call in a specific order, restated identically by every such row;
 * this keeps the correct wiring in one place, so a new liftable row cannot
 * rediscover the version that measures against the window (or with
 * `measureLayout`, which ignores a list's scroll offset) instead.
 *
 *   const [rowRef, handleLongPress] = useAnchoredLongPress(
 *     (layout) => onLongPress(item, layout),
 *   );
 *   return <Pressable ref={rowRef} onLongPress={handleLongPress} … />;
 *
 * `onMeasured` receives the row's rect in the host's coordinates, or null when
 * there is nothing to measure against (no host mounted, or the test renderer) —
 * the menu still opens then, just centred instead of anchored.
 */
export default function useAnchoredLongPress(onMeasured) {
  const rowRef = useRef(null);
  const { hostRef } = useOverlayHost();

  const handleLongPress = useCallback(() => {
    measureAnchorRect(rowRef.current, hostRef?.current, onMeasured);
  }, [hostRef, onMeasured]);

  return [rowRef, handleLongPress];
}
