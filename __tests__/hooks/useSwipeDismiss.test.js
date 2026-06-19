import { renderHook, act } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useSwipeDismiss } from '../../app/hooks/useSwipeDismiss';

// react-native-reanimated and react-native-gesture-handler are mocked globally
// in jest.setup.js:
//  - useSharedValue(v) -> { value: v }
//  - useAnimatedStyle(fn) -> {}
//  - withTiming(value, cfg, cb) -> value (callback is not invoked under the mock)
//  - Gesture.Pan() -> chainable mock whose builder methods return `this`

describe('useSwipeDismiss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Shape', () => {
    it('exposes the documented API', async () => {
      const { result } = await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn() }),
      );

      expect(result.current.gesture).toBeDefined();
      expect(result.current.animatedStyle).toBeDefined();
      expect(typeof result.current.open).toBe('function');
      expect(typeof result.current.dismiss).toBe('function');
    });
  });

  describe('Gesture construction', () => {
    it('builds a Pan gesture', async () => {
      await renderHook(() => useSwipeDismiss({ onDismiss: jest.fn() }));
      expect(Gesture.Pan).toHaveBeenCalled();
    });

    it('configures rightward-only activation and vertical fail offsets', async () => {
      const panBuilder = Gesture.Pan();
      Gesture.Pan.mockClear();
      Gesture.Pan.mockReturnValueOnce(panBuilder);

      await renderHook(() => useSwipeDismiss({ onDismiss: jest.fn() }));

      expect(panBuilder.activeOffsetX).toHaveBeenCalledWith(16);
      expect(panBuilder.failOffsetY).toHaveBeenCalledWith([-18, 18]);
    });

    it('does not throw when disabled (gating is via a shared value, not .enabled())', async () => {
      const { result } = await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn(), enabled: false }),
      );
      expect(result.current.gesture).toBeDefined();
    });

    it('accepts an edgeWidth for edge-only dismissal', async () => {
      const { result } = await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn(), edgeWidth: 48 }),
      );
      expect(result.current.gesture).toBeDefined();
    });

    it('accepts canStepBack / onStepBack for one-level-up navigation', async () => {
      const onStepBack = jest.fn();
      const { result } = await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn(), canStepBack: true, onStepBack }),
      );
      expect(result.current.gesture).toBeDefined();
    });
  });

  describe('Controls', () => {
    it('open() runs without throwing', async () => {
      const { result } = await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn() }),
      );
      await act(() => result.current.open());
    });

    it('dismiss() runs without throwing and accepts an onDismiss', async () => {
      const onDismiss = jest.fn();
      const { result } = await renderHook(() => useSwipeDismiss({ onDismiss }));
      await act(() => result.current.dismiss());
    });
  });
});
