/**
 * Tests for the review alert's "Reject" button handler: it drops the queued rows
 * the alert named, clears the tray row, and ignores every other response.
 */

import * as Notifications from 'expo-notifications';
import { handleRejectPendingResponse } from '../../../app/services/notifications/rejectPendingAction';
import { dismissPendingNotification } from '../../../app/services/notifications/processBankNotifications';
import { presentPendingOperationsAlert } from '../../../app/services/notifications/localNotifications';
import { collectPendingAlertDetails } from '../../../app/services/notifications/pendingAlertItems';
import { getPendingAlertCopy } from '../../../app/services/notifications/notificationStrings';
import { getPendingCount } from '../../../app/services/PendingNotificationsDB';

jest.mock('../../../app/services/notifications/processBankNotifications', () => ({
  dismissPendingNotification: jest.fn(async () => {}),
}));
jest.mock('../../../app/services/notifications/localNotifications', () => ({
  ...jest.requireActual('../../../app/services/notifications/localNotifications'),
  presentPendingOperationsAlert: jest.fn(async () => {}),
}));
jest.mock('../../../app/services/notifications/pendingAlertItems', () => ({
  collectPendingAlertDetails: jest.fn(async () => []),
}));
jest.mock('../../../app/services/notifications/notificationStrings', () => ({
  ...jest.requireActual('../../../app/services/notifications/notificationStrings'),
  getPendingAlertCopy: jest.fn(async () => ({ title: 't', body: 'b' })),
}));
jest.mock('../../../app/services/PendingNotificationsDB', () => ({
  getPendingCount: jest.fn(async () => 0),
}));

const rejectResponse = (pendingIds) => ({
  actionIdentifier: 'reject-pending',
  notification: {
    request: {
      identifier: 'penny-pending-operations',
      content: { data: { route: 'notificationProcessing', pendingIds } },
    },
  },
});

describe('rejectPendingAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dismissPendingNotification.mockResolvedValue();
    Notifications.dismissNotificationAsync.mockResolvedValue();
    // The common case: the rejected transaction was the only one waiting.
    getPendingCount.mockResolvedValue(0);
    collectPendingAlertDetails.mockResolvedValue([]);
    getPendingAlertCopy.mockResolvedValue({ title: 't', body: 'b' });
    presentPendingOperationsAlert.mockResolvedValue();
  });

  it('rejects the queued row the alert was about and clears the tray row', async () => {
    await expect(handleRejectPendingResponse(rejectResponse(['pending-1']))).resolves.toBe(true);

    expect(dismissPendingNotification).toHaveBeenCalledWith('pending-1');
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'penny-pending-operations',
    );
  });

  it('ignores a response that is not the Reject button', async () => {
    const tap = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: { request: { identifier: 'penny-pending-operations', content: { data: {} } } },
    };

    await expect(handleRejectPendingResponse(tap)).resolves.toBe(false);
    await expect(handleRejectPendingResponse(null)).resolves.toBe(false);
    await expect(handleRejectPendingResponse({})).resolves.toBe(false);

    expect(dismissPendingNotification).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('still clears the alert when it carried no ids', async () => {
    // An older build's alert, or one posted before the ids were attached: there
    // is nothing to drop, but the notification must not survive the press.
    await expect(handleRejectPendingResponse(rejectResponse(undefined))).resolves.toBe(true);

    expect(dismissPendingNotification).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'penny-pending-operations',
    );
  });

  it('clears the alert even when the rejection itself fails', async () => {
    // The user has made the decision; a stale row naming the rejected
    // transaction is the one outcome the button must not leave behind.
    dismissPendingNotification.mockRejectedValue(new Error('db down'));

    await expect(handleRejectPendingResponse(rejectResponse(['pending-1']))).resolves.toBe(true);

    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'penny-pending-operations',
    );
  });

  it('refreshes the alert instead of clearing it when others are still waiting', async () => {
    // The background task only re-notifies for newly queued rows, so clearing
    // the alert here would leave the remaining transactions with no reminder.
    getPendingCount.mockResolvedValue(2);
    const details = [
      { id: 'pending-2', amount: '1299', currency: 'AMD', merchant: 'SAS' },
      { id: 'pending-3', amount: '4500', currency: 'AMD', merchant: null },
    ];
    collectPendingAlertDetails.mockResolvedValue(details);
    getPendingAlertCopy.mockResolvedValue({ title: '2 waiting', body: 'lines' });

    await handleRejectPendingResponse(rejectResponse(['pending-1']));

    expect(getPendingAlertCopy).toHaveBeenCalledWith(2, details);
    // Two remain, so the refreshed alert summarizes and carries no reject target.
    expect(presentPendingOperationsAlert).toHaveBeenCalledWith(
      { title: '2 waiting', body: 'lines' },
      [],
    );
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('offers Reject again when exactly one transaction is left', async () => {
    getPendingCount.mockResolvedValue(1);
    collectPendingAlertDetails.mockResolvedValue([
      { id: 'pending-2', amount: '1299', currency: 'AMD', merchant: 'SAS' },
    ]);

    await handleRejectPendingResponse(rejectResponse(['pending-1']));

    expect(presentPendingOperationsAlert).toHaveBeenCalledWith(expect.any(Object), ['pending-2']);
  });

  it('clears the alert when the refresh cannot be built', async () => {
    getPendingCount.mockResolvedValue(2);
    collectPendingAlertDetails.mockRejectedValue(new Error('db down'));

    await handleRejectPendingResponse(rejectResponse(['pending-1']));

    expect(presentPendingOperationsAlert).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'penny-pending-operations',
    );
  });

  it('clears the alert when the queue size cannot be read', async () => {
    getPendingCount.mockRejectedValue(new Error('db down'));

    await handleRejectPendingResponse(rejectResponse(['pending-1']));

    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'penny-pending-operations',
    );
  });

  describe('Regression Tests', () => {
    it('is idempotent when the running app and the headless task both handle it', async () => {
      // A backgrounded-but-alive app receives the press through its listener and
      // through the task; the second pass must not blow up on an already-gone row.
      const response = rejectResponse(['pending-1']);

      await handleRejectPendingResponse(response);
      await handleRejectPendingResponse(response);

      expect(dismissPendingNotification).toHaveBeenCalledTimes(2);
      expect(dismissPendingNotification).toHaveBeenNthCalledWith(2, 'pending-1');
    });
  });
});
