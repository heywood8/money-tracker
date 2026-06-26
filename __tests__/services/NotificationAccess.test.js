import * as IntentLauncher from 'expo-intent-launcher';

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

const mockIsEnabled = jest.fn();
const mockGetRecent = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    PennyNotifications: {
      isNotificationAccessEnabled: (...args) => mockIsEnabled(...args),
      getRecentNotifications: (...args) => mockGetRecent(...args),
    },
  },
}));

const {
  NOTIFICATION_LISTENER_SETTINGS_ACTION,
  openNotificationAccessSettings,
  isNotificationAccessEnabled,
  getRecentNotifications,
} = require('../../app/services/NotificationAccess');

describe('NotificationAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NOTIFICATION_LISTENER_SETTINGS_ACTION', () => {
    it('is the Android notification listener settings action', () => {
      expect(NOTIFICATION_LISTENER_SETTINGS_ACTION).toBe(
        'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
      );
    });
  });

  describe('openNotificationAccessSettings', () => {
    it('opens the system notification access settings screen', async () => {
      IntentLauncher.startActivityAsync.mockResolvedValue(undefined);

      await openNotificationAccessSettings();

      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledTimes(1);
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
        NOTIFICATION_LISTENER_SETTINGS_ACTION,
      );
    });

    it('propagates errors from the intent launcher', async () => {
      const error = new Error('No activity found');
      IntentLauncher.startActivityAsync.mockRejectedValue(error);

      await expect(openNotificationAccessSettings()).rejects.toThrow(
        'No activity found',
      );
    });
  });

  describe('isNotificationAccessEnabled', () => {
    it('returns the value from the native module', async () => {
      mockIsEnabled.mockResolvedValue(true);
      await expect(isNotificationAccessEnabled()).resolves.toBe(true);
      expect(mockIsEnabled).toHaveBeenCalledTimes(1);
    });

    it('returns false when the native module rejects', async () => {
      mockIsEnabled.mockRejectedValue(new Error('boom'));
      await expect(isNotificationAccessEnabled()).resolves.toBe(false);
    });
  });

  describe('getRecentNotifications', () => {
    it('returns the array from the native module', async () => {
      const items = [{ title: 'Hi', text: 'There', packageName: 'com.x', postTime: 1 }];
      mockGetRecent.mockResolvedValue(items);
      await expect(getRecentNotifications()).resolves.toEqual(items);
    });

    it('returns an empty array when the native module rejects', async () => {
      mockGetRecent.mockRejectedValue(new Error('boom'));
      await expect(getRecentNotifications()).resolves.toEqual([]);
    });

    it('returns an empty array when the result is not an array', async () => {
      mockGetRecent.mockResolvedValue(null);
      await expect(getRecentNotifications()).resolves.toEqual([]);
    });
  });
});
