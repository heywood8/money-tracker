// app/hooks/useKeyboardOffset.js
import { useRef, useEffect } from 'react';
import { Animated, Keyboard } from 'react-native';

/**
 * Keyboard avoidance for content inside a `Modal`, as an animated bottom inset.
 *
 * `KeyboardAvoidingView` must not be used for this. With edge-to-edge enabled
 * (SDK 54) the Modal's own window no longer resizes for the IME, so the
 * `behavior="height"` variant keeps shrinking its container from JS while the
 * window height it measures never changes: the shrink triggers a fresh
 * `onLayout`, which triggers another shrink, and the modal visibly judders and
 * can wedge the layout pass entirely — with nothing in the logs, since nothing
 * throws. It only ever shows up once a keyboard is open, which is why it reads
 * as "editing a text field breaks saving".
 *
 * Lifting the content ourselves is what {@link ModalShell} already does (see the
 * note there); this hook is that logic, so the modals still on their own
 * `Modal` + overlay markup can share it rather than each growing a copy.
 *
 * Apply the returned value as `paddingBottom` on the overlay that centres (or
 * bottom-aligns) the card:
 *
 *   const keyboardOffset = useKeyboardOffset(visible);
 *   <AnimatedPressable style={[styles.modalOverlay, { paddingBottom: keyboardOffset }]} />
 *
 * The card's own `maxHeight: '85%'` then resolves against the shortened overlay,
 * so a tall form shrinks and scrolls instead of hiding behind the keyboard.
 *
 * @param {boolean} visible - Whether the owning modal is on screen. A closed
 *   modal stays subscribed to nothing: these components stay mounted for the
 *   session, and every one of them animating on every app-wide keyboard event
 *   would be pure waste.
 * @returns {Animated.Value} Current keyboard height, animated.
 */
export default function useKeyboardOffset(visible) {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      // Back to zero for the next open, so a modal reopened after being closed
      // mid-typing doesn't start with a stale inset.
      offset.setValue(0);
      return undefined;
    }

    // A keyboard may already be up when the modal appears (focus carried over
    // from the screen behind it). `keyboardDidShow` has already fired by then
    // and will not fire again for this subscription, so seed from the current
    // metrics or the card sits under the keyboard until the user refocuses.
    const metrics = Keyboard.metrics?.();
    if (metrics?.height) offset.setValue(metrics.height);

    const onShow = (e) => {
      Animated.timing(offset, {
        toValue: e?.endCoordinates?.height ?? 0,
        duration: e?.duration || 220,
        // paddingBottom is a layout prop — the native driver cannot animate it.
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e) => {
      Animated.timing(offset, {
        toValue: 0,
        duration: e?.duration || 180,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [offset, visible]);

  return offset;
}
