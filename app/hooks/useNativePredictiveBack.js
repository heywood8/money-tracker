import { useEffect, useRef } from 'react';
import {
  isPredictiveBackAvailable,
  setPredictiveBackEnabled,
  addPredictiveBackListener,
} from '../../modules/predictive-back';

/**
 * useNativePredictiveBack — drive a back-shrink animation LIVE from Android's
 * predictive-back gesture.
 *
 * Pairs with `useBackShrink`: this hook subscribes to the native predictive-back
 * progress stream (see modules/predictive-back) and forwards it to the shrink
 * controller so the panel follows the finger as the back gesture is dragged,
 * commits (closes) on release, and eases back if the gesture is cancelled.
 *
 * When the native module isn't available (Expo Go, the Jest environment, or a
 * build that predates the module) every callback is skipped and `available` is
 * `false`, so callers keep their existing JS `BackHandler` fallback.
 *
 * @param {object}   params
 * @param {boolean}  params.enabled     Intercept the system back gesture while true.
 * @param {(p:number)=>void} params.onProgress  Called with progress 0..1 during the drag.
 * @param {()=>void} params.onCommit    Called when the gesture is released/committed.
 * @param {()=>void} params.onCancel    Called when the gesture is abandoned.
 * @returns {{ available: boolean }}
 */
export function useNativePredictiveBack({ enabled, onProgress, onCommit, onCancel }) {
  // Keep the latest callbacks in a ref so the event subscriptions are set up
  // once and never need to re-subscribe when a callback identity changes.
  const handlers = useRef({ onProgress, onCommit, onCancel });
  handlers.current = { onProgress, onCommit, onCancel };

  useEffect(() => {
    if (!isPredictiveBackAvailable) return undefined;
    const onMove = (event) => handlers.current.onProgress?.(event?.progress ?? 0);
    const subscriptions = [
      addPredictiveBackListener('onBackStart', onMove),
      addPredictiveBackListener('onBackProgress', onMove),
      addPredictiveBackListener('onBackInvoke', () => handlers.current.onCommit?.()),
      addPredictiveBackListener('onBackCancel', () => handlers.current.onCancel?.()),
    ];
    return () => subscriptions.forEach((sub) => sub?.remove?.());
  }, []);

  useEffect(() => {
    if (!isPredictiveBackAvailable) return undefined;
    setPredictiveBackEnabled(!!enabled);
    return () => setPredictiveBackEnabled(false);
  }, [enabled]);

  return { available: isPredictiveBackAvailable };
}

export default useNativePredictiveBack;
