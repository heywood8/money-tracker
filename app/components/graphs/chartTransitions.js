// Geometry and timing of the income/expense panel's chart transitions.
//
// The two charts overlap absolutely inside one panel, so a transition is a pair
// of animations: how the incoming chart arrives and how the outgoing one leaves.
// Positions are expressed at progress 0 — the animated style interpolates each
// towards {y: 0, scale: 1} as its progress reaches 1.

// Opening or closing moves the chart vertically, as if it slid out from under
// the tab strip. No scaling there: the panel height is already animating, and a
// second size change on top of it reads as wobble.
export const CHART_DROP = 16;
export const OPEN_DURATION = 320;
export const CLOSE_DURATION = 220;

// Switching tabs is a fade through: the outgoing chart dims and shrinks a hair,
// and only once it is fully gone does the incoming one grow back in. Sliding
// sideways implied a pager, which the tab strip does not deliver — nothing else
// on the panel moves horizontally.
export const FADE_EXIT_SCALE = 0.98;
export const FADE_EXIT_DURATION = 120;
export const FADE_ENTER_SCALE = 0.94;
export const FADE_ENTER_DURATION = 260;
// The handoff point. Must stay >= FADE_EXIT_DURATION — the moment the two charts
// overlap on screen, this stops being a fade through and becomes a cross-fade.
export const FADE_ENTER_DELAY = 120;

/**
 * The animation pair for a transition between tabs.
 *
 * @param {'income'|'expense'|null} from - tab that was open, null if collapsed
 * @param {'income'|'expense'|null} to - tab being opened, null when collapsing
 * @returns {{
 *   enter: {y: number, scale: number, delay: number, duration: number}|null,
 *   exit: {y: number, scale: number, duration: number}|null,
 * }}
 */
export const chartTransition = (from, to) => {
  // Collapsing: the open chart sinks back under the strip, nothing enters.
  if (to === null) {
    return {
      enter: null,
      exit: from ? { y: CHART_DROP, scale: 1, duration: CLOSE_DURATION } : null,
    };
  }

  // Opening from collapsed: the chart drops down, nothing leaves.
  if (from === null || from === to) {
    return {
      enter: { y: CHART_DROP, scale: 1, delay: 0, duration: OPEN_DURATION },
      exit: null,
    };
  }

  // Switching: the same fade through whichever way you go. Direction of travel
  // is deliberately not encoded — the charts never share the screen, so there is
  // no relative movement for the eye to read a direction from anyway.
  return {
    enter: {
      y: 0,
      scale: FADE_ENTER_SCALE,
      delay: FADE_ENTER_DELAY,
      duration: FADE_ENTER_DURATION,
    },
    exit: { y: 0, scale: FADE_EXIT_SCALE, duration: FADE_EXIT_DURATION },
  };
};
