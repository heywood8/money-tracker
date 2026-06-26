import * as IntentLauncher from 'expo-intent-launcher';
import {
  NOTIFICATION_LISTENER_SETTINGS_ACTION,
  openNotificationAccessSettings,
} from '../../app/services/NotificationAccess';

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

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
});
