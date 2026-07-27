import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import useKeyboardOffset from '../../app/hooks/useKeyboardOffset';

// Regression cover for the bug this hook replaced: a `KeyboardAvoidingView`
// with behavior="height" inside a Modal. With edge-to-edge enabled the Modal
// window no longer resizes for the IME, so that component shrank its container
// forever — the budget editors visibly juddered up and down and only a back
// swipe got out of it. Lifting the card with an explicit inset is what fixes it,
// so what matters here is that the inset tracks the keyboard and, critically,
// always returns to 0.

const listeners = new Map();

const emit = (event, payload) => {
  const handler = listeners.get(event);
  if (handler) handler(payload);
};

describe('useKeyboardOffset', () => {
  let removeSpies;

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    removeSpies = [];
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
      listeners.set(event, handler);
      const remove = jest.fn(() => listeners.delete(event));
      removeSpies.push(remove);
      return { remove };
    });
    jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Subscription', () => {
    it('subscribes only while the owning modal is visible', async () => {
      const { rerender } = await renderHook(({ visible }) => useKeyboardOffset(visible), {
        initialProps: { visible: false },
      });
      expect(Keyboard.addListener).not.toHaveBeenCalled();

      await act(async () => { rerender({ visible: true }); });
      expect(listeners.has('keyboardDidShow')).toBe(true);
      expect(listeners.has('keyboardDidHide')).toBe(true);
    });

    it('unsubscribes when the modal closes', async () => {
      const { rerender } = await renderHook(({ visible }) => useKeyboardOffset(visible), {
        initialProps: { visible: true },
      });
      await act(async () => { rerender({ visible: false }); });

      expect(removeSpies).toHaveLength(2);
      removeSpies.forEach(remove => expect(remove).toHaveBeenCalled());
      expect(listeners.size).toBe(0);
    });

    it('unsubscribes on unmount', async () => {
      const { unmount } = await renderHook(() => useKeyboardOffset(true));
      await act(async () => { unmount(); });
      removeSpies.forEach(remove => expect(remove).toHaveBeenCalled());
    });
  });

  describe('Offset', () => {
    it('starts at zero', async () => {
      const { result } = await renderHook(() => useKeyboardOffset(true));
      expect(result.current.__getValue()).toBe(0);
    });

    it('seeds from a keyboard that is already open when the modal appears', async () => {
      Keyboard.metrics.mockReturnValue({ height: 312 });
      const { result } = await renderHook(() => useKeyboardOffset(true));
      expect(result.current.__getValue()).toBe(312);
    });

    it('rises to the keyboard height on show', async () => {
      const { result } = await renderHook(() => useKeyboardOffset(true));
      await act(async () => {
        emit('keyboardDidShow', { endCoordinates: { height: 280 } });
      });
      await waitFor(() => expect(result.current.__getValue()).toBe(280));
    });

    it('returns to zero on hide', async () => {
      const { result } = await renderHook(() => useKeyboardOffset(true));
      await act(async () => {
        emit('keyboardDidShow', { endCoordinates: { height: 280 } });
      });
      await waitFor(() => expect(result.current.__getValue()).toBe(280));

      await act(async () => { emit('keyboardDidHide', {}); });
      await waitFor(() => expect(result.current.__getValue()).toBe(0));
    });

    it('clears a stale inset when the modal closes mid-typing', async () => {
      const { result, rerender } = await renderHook(({ visible }) => useKeyboardOffset(visible), {
        initialProps: { visible: true },
      });
      await act(async () => {
        emit('keyboardDidShow', { endCoordinates: { height: 280 } });
      });
      await waitFor(() => expect(result.current.__getValue()).toBe(280));

      await act(async () => { rerender({ visible: false }); });
      expect(result.current.__getValue()).toBe(0);
    });
  });
});
