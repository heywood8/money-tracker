import { renderHook, act } from '@testing-library/react-native';
import { useNativePredictiveBack } from '../../app/hooks/useNativePredictiveBack';

// Mutable availability flag exposed through a getter so the hook's live binding
// (`import { isPredictiveBackAvailable }`) reflects changes between tests.
// Names are `mock`-prefixed so jest.mock's factory may reference them.
let mockAvailable = true;
const mockSetEnabled = jest.fn();
const mockAddListener = jest.fn();

jest.mock('../../modules/predictive-back', () => ({
  get isPredictiveBackAvailable() {
    return mockAvailable;
  },
  setPredictiveBackEnabled: (...args) => mockSetEnabled(...args),
  addPredictiveBackListener: (...args) => mockAddListener(...args),
}));

describe('useNativePredictiveBack', () => {
  let listeners;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable = true;
    listeners = {};
    mockAddListener.mockImplementation((event, cb) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    });
  });

  describe('when the native module is available', () => {
    it('reports availability', () => {
      const { result } = renderHook(() =>
        useNativePredictiveBack({ enabled: false }),
      );
      expect(result.current.available).toBe(true);
    });

    it('subscribes to all four predictive-back events', () => {
      renderHook(() => useNativePredictiveBack({ enabled: true }));
      const events = mockAddListener.mock.calls.map((c) => c[0]);
      expect(events).toEqual(
        expect.arrayContaining([
          'onBackStart',
          'onBackProgress',
          'onBackInvoke',
          'onBackCancel',
        ]),
      );
    });

    it('enables the bridge while enabled and disables it on unmount', () => {
      const { unmount } = renderHook(() =>
        useNativePredictiveBack({ enabled: true }),
      );
      expect(mockSetEnabled).toHaveBeenCalledWith(true);
      mockSetEnabled.mockClear();
      unmount();
      expect(mockSetEnabled).toHaveBeenCalledWith(false);
    });

    it('forwards progress from start and progress events', () => {
      const onProgress = jest.fn();
      renderHook(() => useNativePredictiveBack({ enabled: true, onProgress }));
      act(() => listeners.onBackStart({ progress: 0.1 }));
      act(() => listeners.onBackProgress({ progress: 0.6 }));
      expect(onProgress).toHaveBeenNthCalledWith(1, 0.1);
      expect(onProgress).toHaveBeenNthCalledWith(2, 0.6);
    });

    it('routes commit and cancel to their callbacks', () => {
      const onCommit = jest.fn();
      const onCancel = jest.fn();
      renderHook(() =>
        useNativePredictiveBack({ enabled: true, onCommit, onCancel }),
      );
      act(() => listeners.onBackInvoke());
      act(() => listeners.onBackCancel());
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('defaults missing progress to 0', () => {
      const onProgress = jest.fn();
      renderHook(() => useNativePredictiveBack({ enabled: true, onProgress }));
      act(() => listeners.onBackProgress(undefined));
      expect(onProgress).toHaveBeenCalledWith(0);
    });
  });

  describe('when the native module is unavailable', () => {
    beforeEach(() => {
      mockAvailable = false;
    });

    it('reports unavailability and never touches the bridge', () => {
      const { result } = renderHook(() =>
        useNativePredictiveBack({ enabled: true }),
      );
      expect(result.current.available).toBe(false);
      expect(mockAddListener).not.toHaveBeenCalled();
      expect(mockSetEnabled).not.toHaveBeenCalled();
    });
  });
});
