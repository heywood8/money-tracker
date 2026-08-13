/**
 * Tests for the expo-notifications wrapper: permission checks, the Android
 * channel, presenting the pending-operations alert, and the deep-link matcher.
 *
 * expo-notifications is mocked globally in jest.setup.js.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as localNotifications from '../../../app/services/notifications/localNotifications';

// The handler is installed as a module-load side effect; capture before clears.
const handlerInstalledAtLoad = Notifications.setNotificationHandler.mock.calls.length;

describe('localNotifications', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Notifications.scheduleNotificationAsync.mockResolvedValue('id');
    Notifications.setNotificationChannelAsync.mockResolvedValue(null);
    // Re-stub every mock a test may switch to rejecting: clearAllMocks resets
    // calls, not implementations, so a leaked rejection would silently run every
    // later test against the error path.
    Notifications.setNotificationCategoryAsync.mockResolvedValue(null);
    Notifications.dismissNotificationAsync.mockResolvedValue();
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('installs a foreground notification handler at module load', () => {
    expect(handlerInstalledAtLoad).toBeGreaterThan(0);
  });

  describe('isPendingOperationsResponse', () => {
    it('matches a review-queue deep-link response', () => {
      const response = {
        notification: { request: { content: { data: { route: 'notificationProcessing' } } } },
      };
      expect(localNotifications.isPendingOperationsResponse(response)).toBe(true);
    });

    it('rejects null / unrelated responses', () => {
      expect(localNotifications.isPendingOperationsResponse(null)).toBe(false);
      expect(localNotifications.isPendingOperationsResponse({})).toBe(false);
      expect(
        localNotifications.isPendingOperationsResponse({
          notification: { request: { content: { data: { route: 'somethingElse' } } } },
        }),
      ).toBe(false);
      expect(
        localNotifications.isPendingOperationsResponse({
          notification: { request: { content: { data: {} } } },
        }),
      ).toBe(false);
    });
  });

  describe('areNotificationsGranted', () => {
    it('is true when permission is granted', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await expect(localNotifications.areNotificationsGranted()).resolves.toBe(true);
    });

    it('is false when permission is denied', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await expect(localNotifications.areNotificationsGranted()).resolves.toBe(false);
    });

    it('is false (never throws) when the lookup fails', async () => {
      Notifications.getPermissionsAsync.mockRejectedValue(new Error('nope'));
      await expect(localNotifications.areNotificationsGranted()).resolves.toBe(false);
    });
  });

  describe('requestNotificationsPermission', () => {
    it('returns true without prompting when already granted', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await expect(localNotifications.requestNotificationsPermission()).resolves.toBe(true);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('prompts and returns true when the request is granted', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await expect(localNotifications.requestNotificationsPermission()).resolves.toBe(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    it('returns false when the request is denied', async () => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await expect(localNotifications.requestNotificationsPermission()).resolves.toBe(false);
    });
  });

  describe('ensureBankAlertsChannelAsync', () => {
    it('creates the Android channel with the given name', async () => {
      await localNotifications.ensureBankAlertsChannelAsync('Bank operations');
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        localNotifications.BANK_ALERTS_CHANNEL_ID,
        expect.objectContaining({
          name: 'Bank operations',
          importance: Notifications.AndroidImportance.DEFAULT,
        }),
      );
    });

    it('is a no-op on non-Android platforms', async () => {
      Platform.OS = 'ios';
      await localNotifications.ensureBankAlertsChannelAsync('Bank operations');
      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  describe('presentPendingOperationsAlert', () => {
    it('schedules a notification carrying the review-queue deep link', async () => {
      await localNotifications.presentPendingOperationsAlert({
        title: 'Transactions to review',
        body: '2 transactions are waiting to be added',
        channelName: 'Bank operations',
      });

      // Channel is ensured first.
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();

      const request = Notifications.scheduleNotificationAsync.mock.calls[0][0];
      expect(request.content.title).toBe('Transactions to review');
      expect(request.content.body).toBe('2 transactions are waiting to be added');
      expect(request.content.data).toEqual({ route: 'notificationProcessing' });
      // Stable identifier so repeated alerts replace instead of stacking.
      expect(request.identifier).toBeDefined();
    });

    it('never throws when scheduling fails', async () => {
      Notifications.scheduleNotificationAsync.mockRejectedValue(new Error('boom'));
      await expect(
        localNotifications.presentPendingOperationsAlert({ title: 't', body: 'b' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('presentAddedOperationsAlert', () => {
    it('schedules a notification carrying the added-operations deep link', async () => {
      await localNotifications.presentAddedOperationsAlert({
        title: '1299 AMD · Sas',
        body: 'Added automatically',
        channelName: 'Bank operations',
      });

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();

      const request = Notifications.scheduleNotificationAsync.mock.calls[0][0];
      expect(request.content.title).toBe('1299 AMD · Sas');
      expect(request.content.data).toEqual({ route: 'addedOperations' });
    });

    it('uses its own identifier so it never replaces the review alert', async () => {
      await localNotifications.presentPendingOperationsAlert({ title: 'p', body: 'p' });
      await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'a' });

      const [pendingRequest] = Notifications.scheduleNotificationAsync.mock.calls[0];
      const [addedRequest] = Notifications.scheduleNotificationAsync.mock.calls[1];
      expect(pendingRequest.identifier).toBeTruthy();
      expect(addedRequest.identifier).toBeTruthy();
      expect(addedRequest.identifier).not.toBe(pendingRequest.identifier);
    });

    it('stacks instead of replacing, so an unread receipt is never erased', async () => {
      // Each run books different operations; reusing one id would let a later
      // booking silently overwrite the notice of an earlier, unread one.
      await localNotifications.presentAddedOperationsAlert({ title: 'first', body: 'b' }, [1]);
      await localNotifications.presentAddedOperationsAlert({ title: 'second', body: 'b' }, [2]);

      const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
      const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
      expect(first.identifier).not.toBe(second.identifier);
    });

    it('stacks per batch when the operations cannot be identified', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

      await localNotifications.presentAddedOperationsAlert({ title: 'first', body: 'b' });
      await localNotifications.presentAddedOperationsAlert({ title: 'second', body: 'b' });

      const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
      const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
      expect(first.identifier).not.toBe(second.identifier);
      nowSpy.mockRestore();
    });

    describe('Regression Tests', () => {
      it('collapses a repeat report of the same booking onto one notification', async () => {
        // Two callers observing the same run (a delayed background wakeup
        // overlapping another) each posted a receipt, so one purchase showed up
        // in the shade twice. Keyed on the operations, the second lands on the
        // first instead of stacking.
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [7]);
        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [7]);

        const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
        const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
        expect(first.identifier).toBe(second.identifier);
        nowSpy.mockRestore();
      });

      it('ignores the order the operation ids arrive in', async () => {
        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [3, 11]);
        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [11, 3]);

        const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
        const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
        expect(first.identifier).toBe(second.identifier);
      });

      it('falls back to a per-post id when every operation id is missing', async () => {
        // A batch of unidentifiable operations must not collapse onto a single
        // shared id — that would erase an earlier unread receipt.
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [null]);
        await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' }, [null]);

        const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
        const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
        expect(first.identifier).not.toBe(second.identifier);
        nowSpy.mockRestore();
      });
    });

    it('keeps the review alert replace-in-place', async () => {
      await localNotifications.presentPendingOperationsAlert({ title: 'p1', body: 'b' });
      await localNotifications.presentPendingOperationsAlert({ title: 'p2', body: 'b' });

      const [first] = Notifications.scheduleNotificationAsync.mock.calls[0];
      const [second] = Notifications.scheduleNotificationAsync.mock.calls[1];
      expect(first.identifier).toBe(second.identifier);
    });

    it('never throws when scheduling fails', async () => {
      Notifications.scheduleNotificationAsync.mockRejectedValue(new Error('boom'));
      await expect(
        localNotifications.presentAddedOperationsAlert({ title: 't', body: 'b' }),
      ).resolves.toBeUndefined();
    });

    it('attaches the acknowledge category, registered with the localized label', async () => {
      await localNotifications.presentAddedOperationsAlert({
        title: 'a', body: 'b', actionLabel: 'Прочитано',
      });

      expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
        localNotifications.ADDED_ALERT_CATEGORY_ID,
        [
          expect.objectContaining({
            identifier: localNotifications.ACKNOWLEDGE_ACTION_ID,
            buttonTitle: 'Прочитано',
            // Pressing it must never launch the app.
            options: { opensAppToForeground: false },
          }),
        ],
      );
      const [request] = Notifications.scheduleNotificationAsync.mock.calls[0];
      expect(request.content.categoryIdentifier).toBe(localNotifications.ADDED_ALERT_CATEGORY_ID);
    });

    it('still posts when the category cannot be registered', async () => {
      Notifications.setNotificationCategoryAsync.mockRejectedValue(new Error('nope'));

      await localNotifications.presentAddedOperationsAlert({ title: 'a', body: 'b' });

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });

    it('leaves the review alert without action buttons', async () => {
      await localNotifications.presentPendingOperationsAlert({ title: 'p', body: 'b' });

      const [request] = Notifications.scheduleNotificationAsync.mock.calls[0];
      expect(request.content.categoryIdentifier).toBeUndefined();
    });
  });

  describe('isAcknowledgeResponse / responseNotificationId', () => {
    const response = (actionIdentifier) => ({
      actionIdentifier,
      notification: { request: { identifier: 'penny-added-operations-1', content: { data: {} } } },
    });

    it('matches only the acknowledge action', () => {
      expect(localNotifications.isAcknowledgeResponse(response('acknowledge'))).toBe(true);
      expect(
        localNotifications.isAcknowledgeResponse(
          response('expo.modules.notifications.actions.DEFAULT'),
        ),
      ).toBe(false);
      expect(localNotifications.isAcknowledgeResponse(null)).toBe(false);
      expect(localNotifications.isAcknowledgeResponse({})).toBe(false);
    });

    it('reads the tray id a response belongs to', () => {
      expect(localNotifications.responseNotificationId(response('acknowledge'))).toBe(
        'penny-added-operations-1',
      );
      expect(localNotifications.responseNotificationId(null)).toBeNull();
      expect(localNotifications.responseNotificationId({})).toBeNull();
    });
  });

  describe('dismissNotificationById', () => {
    it('dismisses by identifier', async () => {
      await localNotifications.dismissNotificationById('abc');
      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('abc');
    });

    it('is a no-op without an identifier', async () => {
      await localNotifications.dismissNotificationById(null);
      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    });

    it('never throws when the dismissal fails', async () => {
      Notifications.dismissNotificationAsync.mockRejectedValue(new Error('boom'));
      await expect(localNotifications.dismissNotificationById('abc')).resolves.toBeUndefined();
    });
  });

  describe('isAddedOperationsResponse', () => {
    it('matches the added-operations deep link only', async () => {
      const withRoute = (route) => ({
        notification: { request: { content: { data: { route } } } },
      });
      expect(localNotifications.isAddedOperationsResponse(withRoute('addedOperations'))).toBe(true);
      expect(localNotifications.isAddedOperationsResponse(withRoute('notificationProcessing'))).toBe(false);
      expect(localNotifications.isAddedOperationsResponse(null)).toBe(false);
      expect(localNotifications.isAddedOperationsResponse({})).toBe(false);
    });
  });
});
