/**
 * Tests for the background bank checker: the periodic-run work, both alerts it
 * posts (queued-for-review and auto-added), the enable/disable preference, and OS
 * task registration/reconciliation.
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
import { collectPendingAlertDetails } from '../../../app/services/notifications/pendingAlertItems';
import { collectAddedAlertDetails } from '../../../app/services/notifications/addedAlertItems';
import { getPendingCount } from '../../../app/services/PendingNotificationsDB';
import * as PreferencesDB from '../../../app/services/PreferencesDB';

jest.mock('../../../app/services/notifications/processBankNotifications', () => ({
  isBankNotificationsEnabled: jest.fn(),
  processBankNotifications: jest.fn(),
}));
jest.mock('../../../app/services/notifications/localNotifications', () => ({
  areNotificationsGranted: jest.fn(),
  presentPendingOperationsAlert: jest.fn(),
  presentAddedOperationsAlert: jest.fn(),
}));
jest.mock('../../../app/services/notifications/notificationStrings', () => ({
  getPendingAlertCopy: jest.fn(),
  getAddedAlertCopy: jest.fn(),
}));
jest.mock('../../../app/services/notifications/pendingAlertItems', () => ({
  collectPendingAlertDetails: jest.fn(),
}));
jest.mock('../../../app/services/notifications/addedAlertItems', () => ({
  collectAddedAlertDetails: jest.fn(),
}));
jest.mock('../../../app/services/PendingNotificationsDB', () => ({
  getPendingCount: jest.fn(),
}));
jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    BANK_NOTIFICATIONS_BACKGROUND_ALERTS: 'bank_notifications_background_alerts',
    BANK_NOTIFICATIONS_TASK_INTERVAL: 'bank_notifications_task_interval',
  },
  getPreference: jest.fn(),
  getNumberPreference: jest.fn(),
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
    notificationStrings.getAddedAlertCopy.mockResolvedValue({
      title: 'Operation added',
      body: 'Added automatically',
      channelName: 'Bank operations',
    });
    getPendingCount.mockResolvedValue(2);
    collectPendingAlertDetails.mockResolvedValue([]);
    collectAddedAlertDetails.mockResolvedValue([]);
    // No interval recorded → nothing has been registered by this build yet.
    PreferencesDB.getNumberPreference.mockResolvedValue(null);
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
      expect(localNotifications.presentAddedOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
      expect(result.notifiedAdded).toBe(false);
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
      expect(notificationStrings.getPendingAlertCopy).toHaveBeenCalledWith(2, []);
      expect(localNotifications.presentPendingOperationsAlert).toHaveBeenCalledWith({
        title: 'Transactions to review',
        body: '2 transactions are waiting to be added',
        channelName: 'Bank operations',
      });
      expect(result.notified).toBe(true);
    });

    it('describes the items this run queued and passes them to the copy', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 0, pending: 2, skipped: 0 });
      const details = [
        { amount: '1299', currency: 'AMD', merchant: 'SAS', missing: 'category' },
        { amount: '4500', currency: 'AMD', merchant: null, missing: 'account_category' },
      ];
      collectPendingAlertDetails.mockResolvedValue(details);

      await backgroundBankTask.runBackgroundBankCheck();

      // Detail collection is scoped to the items this run added, not the queue.
      expect(collectPendingAlertDetails).toHaveBeenCalledWith(2);
      expect(notificationStrings.getPendingAlertCopy).toHaveBeenCalledWith(2, details);
    });

    it('still alerts when no details could be described', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 0, pending: 1, skipped: 0 });
      collectPendingAlertDetails.mockResolvedValue([]);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(notificationStrings.getPendingAlertCopy).toHaveBeenCalledWith(2, []);
      expect(localNotifications.presentPendingOperationsAlert).toHaveBeenCalled();
      expect(result.notified).toBe(true);
    });

    it('does not raise the review alert when the run queued nothing new', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 3, pending: 0, skipped: 1, createdItems: [],
      });

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
    });

    it('does not alert when notification permission is missing', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({ created: 1, pending: 1, skipped: 0 });
      localNotifications.areNotificationsGranted.mockResolvedValue(false);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
      expect(localNotifications.presentAddedOperationsAlert).not.toHaveBeenCalled();
      expect(result.notified).toBe(false);
      expect(result.notifiedAdded).toBe(false);
    });

    it('does not check permission at all on a run with nothing to report', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 0, pending: 0, skipped: 4, createdItems: [],
      });

      await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.areNotificationsGranted).not.toHaveBeenCalled();
    });
  });

  describe('runBackgroundBankCheck — auto-added alert', () => {
    const createdItem = {
      type: 'expense',
      amount: '1299.00',
      currency: 'AMD',
      merchant: 'Sas',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      date: '2026-08-12',
    };

    it('posts a receipt for operations the run auto-created', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 1, pending: 0, skipped: 0, createdItems: [createdItem],
      });
      const details = [{ amount: '1299.00', currency: 'AMD', merchant: 'Sas' }];
      collectAddedAlertDetails.mockResolvedValue(details);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(collectAddedAlertDetails).toHaveBeenCalledWith([createdItem]);
      expect(notificationStrings.getAddedAlertCopy).toHaveBeenCalledWith(1, details);
      expect(localNotifications.presentAddedOperationsAlert).toHaveBeenCalledWith({
        title: 'Operation added',
        body: 'Added automatically',
        channelName: 'Bank operations',
      });
      expect(result.notifiedAdded).toBe(true);
      // Nothing was queued, so the review alert stays silent.
      expect(localNotifications.presentPendingOperationsAlert).not.toHaveBeenCalled();
    });

    it('does not post a receipt when nothing was auto-created', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 0, pending: 1, skipped: 0, createdItems: [],
      });

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentAddedOperationsAlert).not.toHaveBeenCalled();
      expect(result.notifiedAdded).toBe(false);
    });

    it('posts both alerts when a run books some and queues others', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 2, pending: 1, skipped: 0, createdItems: [createdItem, createdItem],
      });

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(localNotifications.presentAddedOperationsAlert).toHaveBeenCalled();
      expect(localNotifications.presentPendingOperationsAlert).toHaveBeenCalled();
      expect(notificationStrings.getAddedAlertCopy).toHaveBeenCalledWith(2, []);
      expect(result).toMatchObject({ notified: true, notifiedAdded: true });
    });

    it('still posts the receipt when no details could be described', async () => {
      enableBothGates();
      processMod.processBankNotifications.mockResolvedValue({
        created: 1, pending: 0, skipped: 0, createdItems: [createdItem],
      });
      collectAddedAlertDetails.mockResolvedValue([]);

      const result = await backgroundBankTask.runBackgroundBankCheck();

      expect(notificationStrings.getAddedAlertCopy).toHaveBeenCalledWith(1, []);
      expect(localNotifications.presentAddedOperationsAlert).toHaveBeenCalled();
      expect(result.notifiedAdded).toBe(true);
    });
  });

  describe('registerBackgroundBankTaskAsync', () => {
    // The interval is a request for "as soon as the OS is willing"; WorkManager
    // still enforces its own 15-minute floor on periodic work.
    it('registers with a 1-minute minimum interval when not yet registered', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
        backgroundBankTask.BACKGROUND_BANK_TASK,
        { minimumInterval: 1 },
      );
      expect(ok).toBe(true);
    });

    it('records the interval it registered with', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        'bank_notifications_task_interval',
        '1',
      );
    });

    it('does not re-register a task already running at the current interval', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
      PreferencesDB.getNumberPreference.mockResolvedValue(1);

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
      expect(BackgroundTask.unregisterTaskAsync).not.toHaveBeenCalled();
      expect(ok).toBe(true);
    });

    // The OS persists the registration across app updates, so a build that
    // changes the cadence has to tear down the old registration or existing
    // installs keep the old interval forever.
    it('re-registers when the stored interval differs from the current one', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
      PreferencesDB.getNumberPreference.mockResolvedValue(15); // previous build

      const ok = await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(
        backgroundBankTask.BACKGROUND_BANK_TASK,
      );
      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
        backgroundBankTask.BACKGROUND_BANK_TASK,
        { minimumInterval: 1 },
      );
      expect(ok).toBe(true);
    });

    it('re-registers a task registered before the interval was ever recorded', async () => {
      TaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
      PreferencesDB.getNumberPreference.mockResolvedValue(null);

      await backgroundBankTask.registerBackgroundBankTaskAsync();

      expect(BackgroundTask.registerTaskAsync).toHaveBeenCalled();
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
