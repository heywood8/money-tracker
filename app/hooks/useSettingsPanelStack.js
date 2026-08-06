import { useCallback, useMemo, useReducer } from 'react';

// The settings subpanel navigation, modelled as a stack instead of a flat
// (panel, step) pair.
//
// It used to be four independent state slots — `activeSubPanel`, `exportStep`,
// `importStep`, `notificationView` — and every question the screen asks about
// navigation ("can we go back?", "what's the title?", "what does the back arrow
// do?", "what renders?") was answered by its own chain of conditionals over all
// four. Adding a panel meant editing every chain, and forgetting one produced a
// silent bug in exactly one of the three back paths (header arrow, hardware
// back, swipe). The dead `import` → `'cloud'` step was one of those: it had no
// render branch and no back branch, so reaching it would have shown a blank
// panel with no way out.
//
// A stack answers all four questions from one place: the top entry is where the
// user is, and `length > 1` means there is somewhere to go back to.
//
// Entries are `{ panel, step }`. `panel` is constant for the whole stack — a
// subpanel is only ever swapped wholesale, never stacked on another panel — and
// `step` is the panel's nested view, or `null` for panels that have none.

// The step each panel starts on. A panel absent from this map has no nested
// steps and sits at `step: null` for its whole life.
export const PANEL_ROOT_STEP = {
  export: 'list',
  import: 'source',
  notificationProcessing: 'main',
};

export const EMPTY_STACK = [];

const rootEntry = (panel) => ({ panel, step: PANEL_ROOT_STEP[panel] ?? null });

export function settingsPanelStackReducer(stack, action) {
  switch (action.type) {
  // Open a panel from the settings list: the stack always starts fresh at that
  // panel's root step.
  case 'open':
    return [rootEntry(action.panel)];

  // Swap which panel the (already open) subpanel shows, without stacking. Used
  // by the "set up Sheets export" CTA that dead-ends the Sheets import: the
  // panel is already slid in, so its content is replaced rather than reopened.
  case 'swapPanel':
    return [rootEntry(action.panel)];

  // Step into a nested view of the current panel.
  case 'push':
    if (stack.length === 0) return stack;
    return [...stack, { panel: stack[stack.length - 1].panel, step: action.step }];

  // Replace the current view without deepening the stack — the step the user
  // lands on takes the place of the one they came from.
  case 'replace':
    if (stack.length === 0) return stack;
    return [
      ...stack.slice(0, -1),
      { panel: stack[stack.length - 1].panel, step: action.step },
    ];

  // Step back one level. Popping the last entry is not this reducer's call:
  // the screen dismisses the panel (with its slide-away animation) instead, so
  // a pop at depth 1 is a no-op.
  case 'pop':
    return stack.length > 1 ? stack.slice(0, -1) : stack;

  // Abandon every nested step and return to the panel's root. The cancel and
  // error paths of the long Sheets flows land here: they unwind to the panel's
  // starting view regardless of how deep the user had stepped.
  case 'popToRoot':
    return stack.length ? [rootEntry(stack[stack.length - 1].panel)] : stack;

  // Close the subpanel entirely.
  case 'close':
    return EMPTY_STACK;

  default:
    return stack;
  }
}

export const selectPanel = (stack) => (stack.length ? stack[stack.length - 1].panel : null);
export const selectStep = (stack) => (stack.length ? stack[stack.length - 1].step : null);
export const selectParentStep = (stack) => (stack.length > 1 ? stack[stack.length - 2].step : null);

// Whether a back gesture should step up within the panel rather than dismiss it.
export const selectCanStepBack = (stack) => stack.length > 1;

// The step a panel is currently on, or its root step when the panel isn't open.
// Lets the screen read `stepOf('import')` wherever it used to read `importStep`,
// so the render body keeps working unchanged.
export const selectStepOf = (stack, panel) => (
  selectPanel(stack) === panel ? selectStep(stack) : (PANEL_ROOT_STEP[panel] ?? null)
);

export default function useSettingsPanelStack() {
  const [stack, dispatch] = useReducer(settingsPanelStackReducer, EMPTY_STACK);

  const open = useCallback((panel) => dispatch({ type: 'open', panel }), []);
  const swapPanel = useCallback((panel) => dispatch({ type: 'swapPanel', panel }), []);
  const push = useCallback((step) => dispatch({ type: 'push', step }), []);
  const replace = useCallback((step) => dispatch({ type: 'replace', step }), []);
  const pop = useCallback(() => dispatch({ type: 'pop' }), []);
  const popToRoot = useCallback(() => dispatch({ type: 'popToRoot' }), []);
  const close = useCallback(() => dispatch({ type: 'close' }), []);

  const panel = selectPanel(stack);
  const step = selectStep(stack);
  const canStepBack = selectCanStepBack(stack);
  const parentStep = selectParentStep(stack);

  const stepOf = useCallback((target) => selectStepOf(stack, target), [stack]);

  return useMemo(() => ({
    stack,
    panel,
    step,
    parentStep,
    canStepBack,
    stepOf,
    open,
    swapPanel,
    push,
    replace,
    pop,
    popToRoot,
    close,
  }), [stack, panel, step, parentStep, canStepBack, stepOf, open, swapPanel, push, replace, pop, popToRoot, close]);
}
