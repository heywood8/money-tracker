import { createContext, useContext } from 'react';

// Shares the screen-swipe Pan gesture (created in SimpleTabs) with descendants
// so nested horizontal scrollables can declare priority over it via
// `blocksExternalGesture`. Defaults to null when there is no swipe navigation
// in the tree (e.g. in isolation tests).
const SwipeNavigationGestureContext = createContext(null);

export const SwipeNavigationGestureProvider = SwipeNavigationGestureContext.Provider;

// Returns the active swipe-navigation Pan gesture, or null when unavailable.
export const useSwipeNavigationGesture = () => useContext(SwipeNavigationGestureContext);

export default SwipeNavigationGestureContext;
