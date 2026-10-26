import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

// How long a configuration screen waits to draw its widget before handing back
// to the launcher. What the widget shows is usually at hand and the draw is
// instant; when it is not (rates on a slow network), the widget is finished in
// the background instead of holding the screen up, and tempting a back press
// that would remove the widget.
export const RENDER_WAIT_MS = 4000;

// The draw, or null if it fails or outlasts `ms`.
const drawWithin = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
};

/**
 * The answer a widget's configuration screen owes the launcher, shared by every
 * widget's screen.
 *
 * The launcher takes exactly one answer. A second one (a double tap, or a
 * cancel landing while a pick is still being drawn) could remove a widget the
 * user had just set up, so everything after the first is dropped. Hardware back
 * is the cancel, as everywhere else in the app; a widget that was just placed
 * is then taken off the home screen again by the launcher. While a pick is
 * being saved, back is swallowed rather than undoing it.
 *
 * `complete(key, save)` runs `save` (unless it is null), draws the widget and
 * answers 'ok'; `savingKey` is `key` meanwhile, for the screen to show which
 * pick is being saved, and `busyRef` lets taps check it without a re-render.
 *
 * @param {Object} params
 * @param {Object} params.widgetInfo - The screen's prop
 * @param {Function} params.renderWidget - The screen's prop: draws the widget
 * @param {Function} params.setResult - The screen's prop: answers the launcher
 * @param {Function} params.draw - widgetInfo → Promise of the widget's { light, dark }
 * @param {Function} params.redrawLater - Redraws every such widget in the background
 * @returns {{complete: Function, cancel: Function, savingKey: *, busyRef: {current: boolean}}}
 */
export default function useWidgetConfigAnswer({ widgetInfo, renderWidget, setResult, draw, redrawLater }) {
  const [savingKey, setSavingKey] = useState(null);
  const settledRef = useRef(false);
  const busyRef = useRef(false);

  const settle = useCallback((result) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setResult(result);
  }, [setResult]);

  const cancel = useCallback(() => {
    if (!busyRef.current) settle('cancel');
  }, [settle]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => subscription.remove();
  }, [cancel]);

  const complete = useCallback(async (key, save) => {
    if (busyRef.current || settledRef.current) return;
    busyRef.current = true;
    setSavingKey(key);
    try {
      if (save) await save();
    } catch (error) {
      console.warn('[widgets] Could not save the widget\'s settings:', error?.message);
    }
    const rendered = await drawWithin(draw(widgetInfo), RENDER_WAIT_MS);
    if (rendered) {
      renderWidget(rendered);
    } else {
      redrawLater();
    }
    settle('ok');
  }, [widgetInfo, renderWidget, settle, draw, redrawLater]);

  return { complete, cancel, savingKey, busyRef };
}
