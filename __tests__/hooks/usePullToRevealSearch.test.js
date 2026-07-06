import { renderHook, act } from '@testing-library/react-native';
import usePullToRevealSearch from '../../app/hooks/usePullToRevealSearch';

// react-native-reanimated + react-native-gesture-handler are mocked globally in
// jest.setup.js:
//  - useSharedValue(v) -> { value: v }
//  - useAnimatedStyle(fn) -> {}
//  - withTiming(value, cfg) -> value
//  - Gesture.Pan()/.Native()/.Simultaneous() -> chainable no-op mocks
// The Pan worklets (onStart/onUpdate/onEnd) are never invoked under the mock, so
// these tests cover the hook's derived state and public API, not the native drag.

describe('usePullToRevealSearch', () => {
  describe('Shape', () => {
    it('exposes the documented API', async () => {
      const { result } = await renderHook(() => usePullToRevealSearch({ pinned: false }));

      expect(result.current.revealPanGesture).toBeDefined();
      expect(result.current.pillAnimatedStyle).toBeDefined();
      expect(typeof result.current.pillShown).toBe('boolean');
      expect(typeof result.current.setPeeked).toBe('function');
      expect(typeof result.current.setScrollY).toBe('function');
      expect(typeof result.current.setRevealHeight).toBe('function');
    });
  });

  describe('pillShown', () => {
    it('is hidden by default when not pinned', async () => {
      const { result } = await renderHook(() => usePullToRevealSearch({ pinned: false }));
      expect(result.current.pillShown).toBe(false);
    });

    it('is shown when pinned (search open / filters active)', async () => {
      const { result } = await renderHook(() => usePullToRevealSearch({ pinned: true }));
      expect(result.current.pillShown).toBe(true);
    });

    it('reveals when peeked and hides again when the peek is cleared', async () => {
      const { result } = await renderHook(() => usePullToRevealSearch({ pinned: false }));

      expect(result.current.pillShown).toBe(false);

      await act(async () => {
        result.current.setPeeked(true);
      });
      expect(result.current.pillShown).toBe(true);

      await act(async () => {
        result.current.setPeeked(false);
      });
      expect(result.current.pillShown).toBe(false);
    });

    it('stays shown while pinned even without a peek', async () => {
      const { result, rerender } = await renderHook(
        ({ pinned }) => usePullToRevealSearch({ pinned }),
        { initialProps: { pinned: true } },
      );

      expect(result.current.pillShown).toBe(true);

      // Unpinning with no peek returns it to hidden.
      await act(async () => {
        rerender({ pinned: false });
      });
      expect(result.current.pillShown).toBe(false);
    });
  });

  describe('imperative setters', () => {
    it('setScrollY and setRevealHeight are safe no-throw updates', async () => {
      const { result } = await renderHook(() => usePullToRevealSearch({ pinned: false }));

      expect(() => {
        act(() => {
          result.current.setScrollY(120);
          result.current.setRevealHeight(48);
          result.current.setRevealHeight(0); // ignored: non-positive height
        });
      }).not.toThrow();
    });
  });
});
