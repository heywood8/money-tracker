import { useRef, useSyncExternalStore } from 'react';

/**
 * A tiny external store for the quick-add form's values.
 *
 * The quick-add form lives in the Operations list header, and its values used to
 * be `useState` on OperationsScreen. Every character typed into the amount
 * therefore re-rendered the ~60-hook screen body, rebuilt the header element,
 * and made the SectionList reconcile a new header on each keystroke — visible
 * input lag on mid-range phones with a long list behind the form.
 *
 * Keeping the values here instead splits two jobs that `useState` conflates:
 *
 * - Anything that must *re-render* when a character is typed (the form itself)
 *   subscribes with {@link useQuickAddValues}, so the re-render starts at the
 *   form, not at the screen.
 * - Anything that only needs to *read* the values at the moment of an action
 *   (the save path, the picker's auto-add shortcuts) calls `getSnapshot()` and
 *   never subscribes at all.
 *
 * Structural fields (type, account, category) still live in React state — see
 * `useQuickAddForm` — because the screen genuinely has to re-render for those,
 * and they change on a tap rather than on a keystroke.
 */
export const createQuickAddValuesStore = (initialValues) => {
  let snapshot = initialValues;
  const listeners = new Set();

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /**
     * Apply a value or an updater function, exactly like a `useState` setter.
     * Unlike one, the new snapshot is readable immediately on return, so a
     * caller that writes and then reads within the same tick sees its own write
     * — callers that relied on reading the *pre*-write values must capture a
     * snapshot first (see `handleAutoAddWithCategory` in OperationsScreen).
     * Returns the new snapshot.
     */
    setValues: (updater) => {
      const next = typeof updater === 'function' ? updater(snapshot) : updater;
      if (next === snapshot) return snapshot;
      snapshot = next;
      listeners.forEach(listener => listener());
      return snapshot;
    },
  };
};

/**
 * Subscribe a component to every change of the quick-add values.
 * Only components that must repaint as the user types should call this.
 */
export const useQuickAddValues = (store) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot);

/**
 * Create a store that lives for the lifetime of the calling component.
 */
export const useQuickAddValuesStore = (initialValues) => {
  const storeRef = useRef(null);
  if (storeRef.current === null) {
    storeRef.current = createQuickAddValuesStore(initialValues);
  }
  return storeRef.current;
};
