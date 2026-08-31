/**
 * Tests for the "Acknowledged" button's background handler: which payloads it
 * acts on, that it clears exactly the pressed notification, and that a failure
 * never escapes the task.
 *
 * expo-task-manager / expo-notifications are mocked globally in jest.setup.js.
 */

import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  ACKNOWLEDGE_TASK,
  handleAcknowledgePayload,
  registerAcknowledgeTaskAsync,
} from '../../../app/services/notifications/acknowledgeTask';
import { dismissPendingNotification } from '../../../app/services/notifications/processBankNotifications';

jest.mock('../../../app/services/notifications/processBankNotifications', () => ({
  dismissPendingNotification: jest.fn(async () => {}),
}));

// Capture the executor registered at import time, before any mock is cleared.
const defineCall = TaskManager.defineTask.mock.calls.find((c) => c[0] === ACKNOWLEDGE_TASK);
const taskExecutor = defineCall ? defineCall[1] : null;

const ackResponse = (identifier = 'penny-added-operations-1000') => ({
  actionIdentifier: 'acknowledge',
  notification: { request: { identifier, content: { data: { route: 'addedOperations' } } } },
});

describe('acknowledgeTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.dismissNotificationAsync.mockResolvedValue();
    Notifications.registerTaskAsync.mockResolvedValue();
    dismissPendingNotification.mockResolvedValue();
  });

  it('defines the task at module load', () => {
    expect(taskExecutor).toEqual(expect.any(Function));
  });

  describe('handleAcknowledgePayload', () => {
    it('dismisses the notification whose button was pressed', async () => {
      await expect(handleAcknowledgePayload(ackResponse('abc'))).resolves.toBe(true);

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('abc');
    });

    it('ignores a plain tap on the notification body', async () => {
      const tap = {
        ...ackResponse(),
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      };

      await expect(handleAcknowledgePayload(tap)).resolves.toBe(false);
      // A tap routes into the app, and the OS clears it — not our job here.
      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    });

    it('ignores a received-notification payload (no actionIdentifier)', async () => {
      await expect(handleAcknowledgePayload({ notification: {}, data: {} })).resolves.toBe(false);
      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    });

    it('ignores null / malformed payloads', async () => {
      await expect(handleAcknowledgePayload(null)).resolves.toBe(false);
      await expect(handleAcknowledgePayload({})).resolves.toBe(false);
      // Right action, but nothing identifying which notification to clear.
      await expect(handleAcknowledgePayload({ actionIdentifier: 'acknowledge' })).resolves.toBe(false);
      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    });

    it('never throws when the dismissal fails', async () => {
      Notifications.dismissNotificationAsync.mockRejectedValue(new Error('boom'));

      await expect(handleAcknowledgePayload(ackResponse())).resolves.toBe(true);
    });
  });

  describe('task executor', () => {
    it('handles an acknowledge press', async () => {
      await taskExecutor({ data: ackResponse('xyz') });

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('xyz');
    });

    it('handles a review-alert reject press through the same task', async () => {
      // expo-notifications registers one response task, so this executor is the
      // headless entry point for every button that does not open the app.
      await taskExecutor({
        data: {
          actionIdentifier: 'reject-pending',
          notification: {
            request: {
              identifier: 'penny-pending-operations',
              content: { data: { route: 'notificationProcessing', pendingIds: ['pending-1'] } },
            },
          },
        },
      });

      expect(dismissPendingNotification).toHaveBeenCalledWith('pending-1');
      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
        'penny-pending-operations',
      );
    });

    it('does nothing when the task is invoked with an error', async () => {
      await taskExecutor({ data: ackResponse(), error: new Error('nope') });

      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not reject when handling throws', async () => {
      // A payload whose getter throws models a malformed native bundle.
      const hostile = {
        get actionIdentifier() {
          throw new Error('bad parcel');
        },
      };

      await expect(taskExecutor({ data: hostile })).resolves.toBeUndefined();
    });
  });

  describe('registerAcknowledgeTaskAsync', () => {
    it('registers the task with expo-notifications', async () => {
      await expect(registerAcknowledgeTaskAsync()).resolves.toBe(true);

      expect(Notifications.registerTaskAsync).toHaveBeenCalledWith(ACKNOWLEDGE_TASK);
    });

    it('reports failure instead of throwing', async () => {
      Notifications.registerTaskAsync.mockRejectedValue(new Error('unavailable'));

      await expect(registerAcknowledgeTaskAsync()).resolves.toBe(false);
    });
  });
});
