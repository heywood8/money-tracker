import { useEffect } from 'react';
import { useAppBlur } from '../contexts/AppBlurContext';

/**
 * Place this component conditionally outside a Modal to activate
 * the root-level blur when the modal is open:
 *
 *   {visible && <ModalBlurOverlay />}
 *   <Modal visible={visible} ...>...</Modal>
 *
 * The actual BlurView lives at the app root (App.js) where it wraps
 * the app content — the only place on Android where blur works.
 */
export default function ModalBlurOverlay() {
  const { increment, decrement } = useAppBlur();

  useEffect(() => {
    increment();
    return () => decrement();
  }, [increment, decrement]);

  return null;
}
