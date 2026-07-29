/**
 * Geometry helpers for anchoring an overlay (see OverlayHostContext) to something
 * already drawn on screen.
 */

/**
 * Turn a WINDOW-measured rect into one expressed in the overlay host's space.
 *
 * Why window coordinates and not `measureLayout(host)`: `measureLayout` walks
 * layout positions, and a row's layout position inside a VirtualizedList is its
 * offset within the list's CONTENT — the scroll translation is not part of it. On
 * a scrolled list that anchors the overlay a full scroll offset below the row,
 * i.e. off-screen for anything past the first screenful. `measureInWindow` already
 * accounts for the scroll, so measuring both the row and the host that way and
 * subtracting gives a rect the overlay can use directly.
 *
 * @param {{x: number, y: number, width: number, height: number}|null} rowRect - row, measured in window coordinates
 * @param {{x: number, y: number}|null} hostOrigin - overlay host's window origin
 * @returns {{x: number, y: number, width: number, height: number}|null} rect in host space,
 *   or null when the row has no usable box (a collapsed or not-yet-laid-out node
 *   reports a zero size; anchoring to that would draw a zero-width clone).
 */
export const anchorRectInHost = (rowRect, hostOrigin) => {
  if (!rowRect || !rowRect.width || !rowRect.height) return null;
  return {
    x: rowRect.x - (hostOrigin?.x || 0),
    y: rowRect.y - (hostOrigin?.y || 0),
    width: rowRect.width,
    height: rowRect.height,
  };
};
