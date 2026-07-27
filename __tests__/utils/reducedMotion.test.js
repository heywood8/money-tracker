import { AccessibilityInfo } from 'react-native';

// Each test re-imports the module so the lazy subscription runs against that
// test's mocks — the cache is module-level by design, so a shared instance would
// carry the first test's answer into every later one.
const loadModule = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require('../../app/utils/reducedMotion');
  });
  return mod;
};

describe('reducedMotion', () => {
  let listeners;

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = {};
    AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.resolve(false));
    AccessibilityInfo.addEventListener = jest.fn((event, handler) => {
      listeners[event] = handler;
      return { remove: jest.fn() };
    });
  });

  describe('Initialization', () => {
    it('reports motion as allowed before the async read resolves', () => {
      const { isReduceMotionEnabled } = loadModule();
      // Synchronous first call: the OS answer has not arrived yet, and the
      // honest default is to animate rather than to freeze the whole UI.
      expect(isReduceMotionEnabled()).toBe(false);
    });

    it('does not touch AccessibilityInfo until something asks', () => {
      loadModule();
      expect(AccessibilityInfo.isReduceMotionEnabled).not.toHaveBeenCalled();
      expect(AccessibilityInfo.addEventListener).not.toHaveBeenCalled();
    });

    it('subscribes exactly once across repeated queries', () => {
      const { isReduceMotionEnabled } = loadModule();
      isReduceMotionEnabled();
      isReduceMotionEnabled();
      isReduceMotionEnabled();
      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(1);
      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
        'reduceMotionChanged',
        expect.any(Function),
      );
    });

    it('picks up the value the OS reports', async () => {
      AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.resolve(true));
      const { isReduceMotionEnabled } = loadModule();
      isReduceMotionEnabled();
      await Promise.resolve();
      expect(isReduceMotionEnabled()).toBe(true);
    });
  });

  describe('motionDuration', () => {
    it('passes the duration through when motion is allowed', () => {
      const { motionDuration } = loadModule();
      expect(motionDuration(260)).toBe(260);
      expect(motionDuration(0)).toBe(0);
    });

    it('collapses the duration to zero under reduced motion', () => {
      const { motionDuration, __setReduceMotionForTests } = loadModule();
      __setReduceMotionForTests(true);
      expect(motionDuration(260)).toBe(0);
      expect(motionDuration(1500)).toBe(0);
    });
  });

  describe('Live changes', () => {
    it('follows the setting being turned on and off while running', async () => {
      const { isReduceMotionEnabled, motionDuration } = loadModule();
      isReduceMotionEnabled();
      await Promise.resolve();

      listeners.reduceMotionChanged(true);
      expect(isReduceMotionEnabled()).toBe(true);
      expect(motionDuration(200)).toBe(0);

      listeners.reduceMotionChanged(false);
      expect(isReduceMotionEnabled()).toBe(false);
      expect(motionDuration(200)).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    it('animates normally when the platform has no accessibility module', () => {
      AccessibilityInfo.isReduceMotionEnabled = undefined;
      AccessibilityInfo.addEventListener = undefined;
      const { isReduceMotionEnabled, motionDuration } = loadModule();
      expect(isReduceMotionEnabled()).toBe(false);
      expect(motionDuration(260)).toBe(260);
    });

    it('animates normally when the OS query rejects', async () => {
      AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.reject(new Error('nope')));
      const { isReduceMotionEnabled, motionDuration } = loadModule();
      expect(isReduceMotionEnabled()).toBe(false);
      await Promise.resolve();
      expect(motionDuration(260)).toBe(260);
    });

    it('survives a query that returns something other than a promise', () => {
      AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => undefined);
      const { isReduceMotionEnabled } = loadModule();
      expect(() => isReduceMotionEnabled()).not.toThrow();
      expect(isReduceMotionEnabled()).toBe(false);
    });
  });
});
