import { renderHook, act } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import { withSpring } from 'react-native-reanimated';
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

  describe('Release behaviour', () => {
    const WIDTH = 400;
    // useSwipeDismiss defaults `width` to the window width; pass it explicitly so
    // the distance threshold (32% of width) is predictable here.
    const PAST_THRESHOLD = WIDTH * 0.5;
    const SHORT_OF_THRESHOLD = WIDTH * 0.1;

    // Drives a full gesture against the mocked Pan builder and returns every
    // withSpring call it produced.
    const release = async ({ translationX, velocityX, ...options }) => {
      const panBuilder = Gesture.Pan();
      Gesture.Pan.mockClear();
      Gesture.Pan.mockReturnValueOnce(panBuilder);

      await renderHook(() =>
        useSwipeDismiss({ onDismiss: jest.fn(), width: WIDTH, ...options }),
      );

      const onStart = panBuilder.onStart.mock.calls.at(-1)[0];
      const onEnd = panBuilder.onEnd.mock.calls.at(-1)[0];
      withSpring.mockClear();

      const event = { x: 0, translationX, velocityX };
      await act(() => {
        onStart({ ...event, translationX: 0 });
        onEnd(event);
      });

      return withSpring.mock.calls;
    };

    it('hands the release velocity to the spring instead of a fixed curve', async () => {
      const calls = await release({ translationX: PAST_THRESHOLD, velocityX: 1500 });

      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ velocity: 1500 });
    });

    it('slides the panel off when the drag passes the distance threshold', async () => {
      const calls = await release({ translationX: PAST_THRESHOLD, velocityX: 0 });

      expect(calls[0][0]).toBe(WIDTH);
    });

    it('springs back to rest when the drag falls short', async () => {
      const calls = await release({ translationX: SHORT_OF_THRESHOLD, velocityX: 0 });

      expect(calls[0][0]).toBe(0);
    });

    it('dismisses on a flick even when the drag distance is short', async () => {
      const calls = await release({ translationX: SHORT_OF_THRESHOLD, velocityX: 2000 });

      expect(calls[0][0]).toBe(WIDTH);
    });

    it('carries the velocity into a spring-back too, so a recalled panel keeps moving', async () => {
      const calls = await release({ translationX: SHORT_OF_THRESHOLD, velocityX: -400 });

      expect(calls[0][0]).toBe(0);
      expect(calls[0][1]).toMatchObject({ velocity: -400 });
    });

    describe('Regression: direction of travel outranks distance travelled', () => {
      it('recalls a panel released while heading back, despite being past the threshold', async () => {
        const calls = await release({ translationX: PAST_THRESHOLD, velocityX: -2000 });

        // Position alone said "dismiss"; the finger was moving the other way.
        expect(calls[0][0]).toBe(0);
      });

      it('does not step back either when the panel is being pulled home', async () => {
        const onStepBack = jest.fn();
        await release({
          translationX: PAST_THRESHOLD,
          velocityX: -2000,
          canStepBack: true,
          onStepBack,
        });

        expect(onStepBack).not.toHaveBeenCalled();
      });

      it('still steps back on a genuine completed swipe', async () => {
        const onStepBack = jest.fn();
        await release({
          translationX: PAST_THRESHOLD,
          velocityX: 0,
          canStepBack: true,
          onStepBack,
        });

        expect(onStepBack).toHaveBeenCalled();
      });
    });
  });
});
