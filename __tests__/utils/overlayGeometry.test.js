/**
 * Regression coverage for the long-press menu anchoring off-screen (#1495 follow-up).
 *
 * The menu draws a lifted clone of the pressed row in the app-wide overlay layer. The
 * row was being measured with `measureLayout(host)`, which reports the row's layout
 * offset inside the list's CONTENT — with the scroll translation missing. Long-pressing
 * anything past the first screenful therefore anchored the clone a full scroll offset
 * below the row, i.e. off the bottom of the screen: the backdrop blurred, but the menu
 * was nowhere to be seen.
 *
 * The fix measures the row and the host in window coordinates and subtracts, which is
 * what this helper does.
 */
import { anchorRectInHost } from '../../app/utils/overlayGeometry';

describe('anchorRectInHost', () => {
  it('re-expresses a window rect in the host space', () => {
    // Host starts 48px down the window (status bar), row sits at 400 on screen.
    const rect = anchorRectInHost(
      { x: 16, y: 400, width: 320, height: 72 },
      { x: 0, y: 48 },
    );
    expect(rect).toEqual({ x: 16, y: 352, width: 320, height: 72 });
  });

  it('keeps a scrolled row on screen — the returned y is where it is drawn, not its offset in the list', () => {
    // The 40th row of a scrolled list: window y is a screen position (300), while its
    // layout offset inside the list content would be thousands of pixels down.
    const rect = anchorRectInHost(
      { x: 0, y: 300, width: 400, height: 64 },
      { x: 0, y: 0 },
    );
    expect(rect.y).toBe(300);
    expect(rect.y).toBeLessThan(1000);
  });

  it('treats a missing host origin as (0, 0)', () => {
    expect(anchorRectInHost({ x: 5, y: 10, width: 100, height: 20 }, null))
      .toEqual({ x: 5, y: 10, width: 100, height: 20 });
  });

  it.each([
    ['a zero-height box', { x: 0, y: 0, width: 100, height: 0 }],
    ['a zero-width box', { x: 0, y: 0, width: 0, height: 40 }],
    ['no rect at all', null],
  ])('returns null for %s so the menu falls back to centred', (_name, rect) => {
    // A collapsed or not-yet-laid-out node reports a zero size; anchoring to it would
    // draw a zero-width clone with the action bar pinned to it.
    expect(anchorRectInHost(rect, { x: 0, y: 0 })).toBeNull();
  });
});
