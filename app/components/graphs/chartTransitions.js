// Motion of the income/expense panel's chart transitions.
//
// The two charts overlap absolutely inside one panel, so a transition is a pair
// of descriptors: how the incoming chart arrives, and how the outgoing one
// leaves. Both describe the state at progress 0 — the animated style
// interpolates towards the resting state (no offset, full size) as progress
// reaches 1 — plus the timing to get there.

// Opening and closing move the chart vertically, as if it slid out from under
// the tab strip that owns it.
export const CHART_DROP = 16;
export const OPEN_DURATION = 320;
export const CLOSE_DURATION = 200;

// Switching tabs is a fade through: the old chart dips out, and only once it is
// gone does the new one grow in. No direction of travel — the tabs sit side by
// side, but the panel below them is one surface whose contents are replaced,
// and sliding it horizontally fought with the vertical open/close motion.
export const FADE_ENTER_SCALE = 0.94;
export const FADE_EXIT_SCALE = 0.98;
export const FADE_EXIT_DURATION = 120;
export const FADE_ENTER_DURATION = 260;
// The incoming chart waits for the outgoing one to clear, so the two are never
// visible at once — the defining property of a fade through.
export const FADE_ENTER_DELAY = 80;

/**
 * Describes a transition between panel tabs.
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

  // Switching between tabs: fade through, no travel.
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
