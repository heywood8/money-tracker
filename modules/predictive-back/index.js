import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Local Expo module that bridges Android's predictive-back gesture to JS.
 *
 * The native side registers an `OnBackPressedCallback` on the host Activity's
 * `OnBackPressedDispatcher`. On Android 14+ (with gesture navigation) this
 * receives the predictive-back progress stream — `handleOnBackStarted`,
 * `handleOnBackProgressed`, `handleOnBackPressed`, `handleOnBackCancelled` —
 * which we forward to JS as events so a panel can shrink LIVE as the finger
 * moves, then commit (close) on release or ease back on cancel.
 *
 * `requireOptionalNativeModule` returns `null` when the native module isn't
 * present (Expo Go, the Jest environment, or a build that predates this module),
 * so every export degrades gracefully to a no-op and callers can fall back to
 * the JS `BackHandler` path.
 *
 * Events:
 *   onBackStart    { progress, swipeEdge, touchX, touchY }
 *   onBackProgress { progress, swipeEdge, touchX, touchY }
 *   onBackInvoke   {}   gesture committed — proceed with the close
 *   onBackCancel   {}   gesture abandoned — ease the panel back to rest
 */
const PredictiveBack = requireOptionalNativeModule('PredictiveBack');

/** True when the native predictive-back bridge is available on this build. */
export const isPredictiveBackAvailable = PredictiveBack != null;

/**
 * Enable/disable interception of the system back gesture. While enabled, the
 * native callback consumes the gesture so we can drive a JS animation; while
 * disabled, back behaves normally (RN BackHandler / exit the app).
 */
export function setPredictiveBackEnabled(enabled) {
  PredictiveBack?.setEnabled(!!enabled);
}

/**
 * Subscribe to a predictive-back event. Returns a subscription with `.remove()`.
 * No-ops (returns a dummy subscription) when the native module is unavailable.
 */
export function addPredictiveBackListener(event, listener) {
  if (!PredictiveBack) {
    return { remove() {} };
  }
  return PredictiveBack.addListener(event, listener);
}

export default PredictiveBack;
