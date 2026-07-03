/**
 * Tests for the background "transactions to review" checker: the periodic-run
 * work, the enable/disable preference, and OS task registration/reconciliation.
 *
 * The expo-task-manager / expo-background-task native modules are mocked globally
 * in jest.setup.js; the pipeline, notification, and copy ports are mocked here so
 * the orchestration is exercised in isolation.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as backgroundBankTask from '../../../app/services/notifications/backgroundBankTask';
import * as processMod from '../../../app/services/notifications/processBankNotifications';
import * as localNotifications from '../../../app/services/notifications/localNotifications';
import * as notificationStrings from '../../../app/services/notifications/notificationStrings';
import { getPendingCount } from '../../../app/services/PendingNotificationsDB';
import * as PreferencesDB from '../../../app/services/PreferencesDB';

jest.mock('../../../app/services/notifications/processBankNotifications', () => ({
  isBankNotificationsEnabled: jest.fn(),
  processBankNotifications: jest.fn(),
}));
jest.mock('../../../app/services/notifications/localNotifications', () => ({
  areNotificationsGranted: jest.fn(),
  presentPendingOperationsAlert: jest.fn(),
}));
jest.mock('../../../app/services/notifications/notificationStrings', () => ({
  getPendingAlertCopy: jest.fn(),
}));
jest.mock('../../../app/services/PendingNotificationsDB', () => ({
  getPendingCount: jest.fn(),
}));
jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { BANK_NOTIFICATIONS_BACKGROUND_ALERTS: 'bank_notifications_background_alerts' },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

// Capture the executor registered at import time, before any mock is cleared.
const defineCall = TaskManager.defineTask.mock.calls.find(
  (c) => c[0] === backgroundBankTask.BACKGROUND_BANK_TASK,
);
const taskExecutor = defineCall ? defineCall[1] : null;

// Enable both gates unless a test overrides them.
const enableBothGates = () => {
  processMod.isBankNotificationsEnabled.mockResolvedValue(true);
  PreferencesDB.getPreference.mockResolvedValue('1'); // background alerts on
};

describe('backgroundBankTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    BackgroundTask.getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
    TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
    localNotifications.areNotificationsGranted.mockResolvedValue(true);
    notificationStrings.getPendingAlertCopy.mockResolvedValue({
      title: 'Transactions to review',
      body: '2 transactions are waiting to be added',
      channelName: 'Bank operations',
    });
    getPendingCount.mockResolvedValue(2);
  });

  describe('task definition', () => {
    it('registers a task executor at module load', () => {
      expect(taskExecutor).toEqual(expect.any(Function));
    });

    it('executor returns Success on a normal run', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 0, pending: 0, skipped: 0 });

      const result = await taskExecutor();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    });

    it('executor returns Failed when the run throws', async () => {
      processMod.isBankNotificationsEnabled.mockRejectedValue(new Error('boom'));

      const result = await taskExecutor();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    });
  });

  describe('isBackgroundAlertsEnabled / setBackgroundAlertsEnabled', () => {
    it('reads the stored flag ("1" is on)', async () => {
      PreferencesDB.getPreference.mockResolvedValue('1');
      await expect(backgroundBankTask.isBackgroundAlertsEnabled()).resolves.toBe(true);
      expect(PreferencesDB.getPreference).toHaveBeenCalledWith(
        'bank_notifications_background_alerts',
        '0',
      );
    });

    it('defaults to off', async () => {
      PreferencesDB.getPreference.mockResolvedValue('0');
      await expect(backgroundBankTask.isBackgroundAlertsEnabled()).resolves.toBe(false);
    });

    it('persists "1"/"0"', async () => {
      await backgroundBankTask.setBackgroundAlertsEnabled(true);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        'bank_notifications_background_alerts',
        '1',
      );
      await backgroundBankTask.setBackgroundAlertsEnabled(false);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        'bank_notifications_background_alerts',
        '0',
      );
    });
  });

  describe('runBackgroundBankCheck', () => {
    it('is a no-op when bank processing is disabled', async () => {
      processMod.isBankNotificationsEnabled.mockResolvedValue(false);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(processMod.processBankNotifications).not.toHaveBeenCalled();
      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
    });

    it('is a no-op when background alerts are off', async () => {
      processMod.isBankNotificationsEnabled.mockResolvedValue(true);
      PreferencesDB.getPreference.mockResolvedValue('0');

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(processMod.processBankNotifications).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
    });

    it('posts an alert when the run queues new items and permission is granted', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 1, pending: 2, skipped: 0 });

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(getPendingCount).toHaveBeenCalled();
      expect(notificationStrings.getPendingAlertCopy).toHaveBeenCalledWith(2);
      expect(localNotifications.presentPendingOperationsAlert).toHaveBeenCalledWith({
        title: 'Transactions to review',
        body: '2 transactions are waiting to be added',
        channelName: 'Bank operations',
      });
      expect(result.notified).toBe(true);
    });

    it('does not alert when the run queued nothing new', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 3, pending: 0, skipped: 1 });

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
    });

    it('does not alert when notification permission is missing', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 0, pending: 1, skipped: 0 });
      localNotifications.areNotificationsGranted.mockResolvedValue(false);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
    });
  });

  describe('registerBackgroundBankTaskAsync', () => {
    it('registers with a 15-minute minimum interval when not yet registered', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
        backgroundBankTask.BACKGROUND_BANK_TASK,
        { minimumInterval: 15 },
      );
      expect(ok).toBe(true);
    });

    it('does not re-register an already-registered task', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
      expect(ok).toBe(true);
    });

    it('does nothing when background execution is restricted', async () => {
      BackgroundTask.getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Restricted);

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
      expect(ok).toBe(false);
    });
  });

  describe('unregisterBackgroundBankTaskAsync', () => {
    it('unregisters a registered task', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      await backgroundBankTask.unregisterBackgroundBankTaskAsync();

      expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(
        backgroundBankTask.BACKGROUND_BANK_TASK,
      );
    });

    it('is a no-op when not registered', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      await backgroundBankTask.unregisterBackgroundBankTaskAsync();

      expect(BackgroundTask.unregisterTaskAsync).not.toHaveBeenCalled();
    });
  });

  describe('syncBackgroundBankTaskRegistrationAsync', () => {
    it('registers when both gates are on', async () => {
      enableBothGates();
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      const registered = await backgroundBankTask.syncBackgroundBankTaskRegistrationAsync();

      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalled();
      expect(registered).toBe(true);
    });

    it('unregisters when a gate is off', async () => {
      processMod.isBankNotificationsEnabled.mockResolvedValue(true);
      PreferencesDB.getPreference.mockResolvedValue('0'); // alerts off
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      const registered = await backgroundBankTask.syncBackgroundBankTaskRegistrationAsync();

      expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalled();
      expect(registered).toBe(false);
    });
  });
});
