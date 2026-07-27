// Geometry of the income/expense panel's chart transitions.
//
// The two charts overlap absolutely inside one panel, so a transition is a pair
// of offsets: where the incoming chart travels from, and where the outgoing one
// travels to. Both are expressed at progress 0 — the animated style interpolates
// each towards {x: 0, y: 0} as its progress reaches 1.

// Opening or closing moves the chart vertically, as if it slid out from under
// the tab strip. Switching tabs moves it sideways, like a pager.
export const CHART_DROP = 16;
export const CHART_SLIDE = 28;

// Income is the left tab, expense the right one.
const TAB_ORDER = { income: 0, expense: 1 };

/**
 * Offsets for a transition between tabs.
 *
 * @param {'income'|'expense'|null} from - tab that was open, null if collapsed
 * @param {'income'|'expense'|null} to - tab being opened, null when collapsing
 * @returns {{ enter: {x: number, y: number}|null, exit: {x: number, y: number}|null }}
 */
export const chartTransitionOffsets = (from, to) => {
  // Collapsing: the open chart sinks back under the strip, nothing enters.
  if (to === null) {
    return { enter: null, exit: from ? { x: 0, y: CHART_DROP } : null };
  }

  // Opening from collapsed: the chart drops down, nothing leaves.
  if (from === null || from === to) {
    return { enter: { x: 0, y: CHART_DROP }, exit: null };
  }

  // Switching: move in the direction of travel — right when going from the left
  // tab to the right one, so the new chart arrives from the right edge and the
  // old one leaves through the left.
  const direction = TAB_ORDER[to] > TAB_ORDER[from] ? 1 : -1;
  return {
    enter: { x: direction * CHART_SLIDE, y: 0 },
    exit: { x: -direction * CHART_SLIDE, y: 0 },
  };
};
