import { renderHook, act } from '@testing-library/react-native';
import { useBackShrink } from '../../app/hooks/useBackShrink';

// react-native-reanimated is mocked globally in jest.setup.js:
//  - useSharedValue(v) -> { value: v }
//  - useAnimatedStyle(fn) -> {}
//  - withTiming(value, cfg, cb) -> value (callback is not invoked under the mock)

describe('useBackShrink', () => {
  describe('Shape', () => {
    it('exposes the documented API', () => {
      const { result } = renderHook(() => useBackShrink());

      expect(result.current.progress).toBeDefined();
      expect(result.current.animatedStyle).toBeDefined();
      expect(result.current.originStyle).toBeDefined();
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.setProgress).toBe('function');
      expect(typeof result.current.cancel).toBe('function');
      expect(typeof result.current.commit).toBe('function');
    });

    it('starts at rest (progress 0)', () => {
      const { result } = renderHook(() => useBackShrink());
      expect(result.current.progress.value).toBe(0);
    });
  });

  describe('originStyle', () => {
    it('anchors the shrink to the bottom-right by default', () => {
      const { result } = renderHook(() => useBackShrink());
      expect(result.current.originStyle.transformOrigin).toBe('right bottom');
    });

    it('honors a custom origin', () => {
      const { result } = renderHook(() => useBackShrink({ origin: 'left top' }));
      expect(result.current.originStyle.transformOrigin).toBe('left top');
    });
  });

  describe('Controls', () => {
    it('setProgress drives the progress value directly', () => {
      const { result } = renderHook(() => useBackShrink());
      act(() => result.current.setProgress(0.5));
      expect(result.current.progress.value).toBe(0.5);
    });

    it('reset snaps progress back to 0', () => {
      const { result } = renderHook(() => useBackShrink());
      act(() => result.current.setProgress(0.8));
      act(() => result.current.reset());
      expect(result.current.progress.value).toBe(0);
    });

    it('commit animates progress toward 1 (fully shrunk)', () => {
      const { result } = renderHook(() => useBackShrink());
      act(() => result.current.commit());
      expect(result.current.progress.value).toBe(1);
    });

    it('commit accepts an onDone callback without throwing', () => {
      const onDone = jest.fn();
      const { result } = renderHook(() => useBackShrink());
      expect(() => act(() => result.current.commit(onDone))).not.toThrow();
    });

    it('cancel animates progress back toward 0', () => {
      const { result } = renderHook(() => useBackShrink());
      act(() => result.current.setProgress(0.6));
      act(() => result.current.cancel());
      expect(result.current.progress.value).toBe(0);
    });
  });
});
