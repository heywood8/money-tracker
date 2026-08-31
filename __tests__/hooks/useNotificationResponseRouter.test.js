/**
 * Tests for the notification deep-link router hook: it emits
 * OPEN_PENDING_OPERATIONS for a matching tapped notification (cold start and
 * while running), ignores unrelated responses, and cleans up its subscription.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import useNotificationResponseRouter from '../../app/hooks/useNotificationResponseRouter';
import { dismissPendingNotification } from '../../app/services/notifications/processBankNotifications';

jest.mock('../../app/services/notifications/processBankNotifications', () => ({
  dismissPendingNotification: jest.fn(async () => {}),
}));

const matchResponse = {
  notification: { request: { content: { data: { route: 'notificationProcessing' } } } },
};

describe('useNotificationResponseRouter', () => {
  let emitSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    emitSpy = jest.spyOn(appEvents, 'emit').mockImplementation(() => {});
    // mockReset (not just clear) so an implementation set by a previous test
    // cannot leak into the next one.
    Notifications.getLastNotificationResponseAsync.mockReset().mockResolvedValue(null);
    Notifications.addNotificationResponseReceivedListener
      .mockReset()
      .mockReturnValue({ remove: jest.fn() });
    Notifications.dismissNotificationAsync.mockReset().mockResolvedValue();
    dismissPendingNotification.mockReset().mockResolvedValue();
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emits when launched by tapping the alert (cold start)', async () => {
    Notifications.getLastNotificationResponseAsync.mockResolvedValue(matchResponse);

    const { unmount } = await renderHook(() => useNotificationResponseRouter());

    await waitFor(() =>
      expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_PENDING_OPERATIONS),
    );
    await unmount();
  });

  it('emits when the alert is tapped while running', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    // The listener is an external event callback and only calls appEvents.emit
    // (no React state update), so it needs no act() wrapper.
    listener(matchResponse);

    expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_PENDING_OPERATIONS);
    await unmount();
  });

  it('emits the added-operations event for the auto-added receipt', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener({ notification: { request: { content: { data: { route: 'addedOperations' } } } } });

    // Those operations are already booked, so the review deck must stay closed.
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_ADDED_OPERATIONS);
    expect(emitSpy).not.toHaveBeenCalledWith(EVENTS.OPEN_PENDING_OPERATIONS);
    await unmount();
  });

  it('clears the notification and navigates nowhere on "Acknowledged"', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener({
      actionIdentifier: 'acknowledge',
      notification: {
        request: { identifier: 'penny-added-operations-1', content: { data: { route: 'addedOperations' } } },
      },
    });

    // The button means "seen, dismiss it" — pulling the user into the app would
    // defeat its purpose, even though the response carries the added route.
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('penny-added-operations-1');
    expect(emitSpy).not.toHaveBeenCalled();
    await unmount();
  });

  it('opens the review deck and clears the alert on "Select"', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener({
      actionIdentifier: 'select-pending',
      notification: {
        request: {
          identifier: 'penny-pending-operations',
          content: { data: { route: 'notificationProcessing' } },
        },
      },
    });

    expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_PENDING_OPERATIONS);
    // Android auto-cancels a tap on the body but not a button press, so the
    // alert would otherwise outlive the review it asked for.
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('penny-pending-operations');
    await unmount();
  });

  it('drops the queued item and navigates nowhere on "Reject"', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener({
      actionIdentifier: 'reject-pending',
      notification: {
        request: {
          identifier: 'penny-pending-operations',
          content: { data: { route: 'notificationProcessing', pendingIds: ['pending-1'] } },
        },
      },
    });

    await waitFor(() => expect(dismissPendingNotification).toHaveBeenCalledWith('pending-1'));
    // Rejecting is an answer, not a deep link: it must not pull the user in.
    expect(emitSpy).not.toHaveBeenCalled();
    await unmount();
  });

  it('leaves the body tap alone — only the button needs dismissing', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener(matchResponse);

    expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_PENDING_OPERATIONS);
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    await unmount();
  });

  it('ignores a Reject press replayed on cold start', async () => {
    // Reject never launches the app, so the response the launch hands back is
    // always one the headless task already performed. Re-running it would clear
    // whatever review alert is in the tray now, about another transaction.
    Notifications.getLastNotificationResponseAsync.mockResolvedValue({
      actionIdentifier: 'reject-pending',
      notification: {
        request: {
          identifier: 'penny-pending-operations',
          content: { data: { route: 'notificationProcessing', pendingIds: ['pending-1'] } },
        },
      },
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());

    await waitFor(() => expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled());
    expect(dismissPendingNotification).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    await unmount();
  });

  it('ignores an unrelated notification response', async () => {
    let listener;
    Notifications.addNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    listener({ notification: { request: { content: { data: { route: 'other' } } } } });

    expect(emitSpy).not.toHaveBeenCalled();
    await unmount();
  });

  it('removes the response listener on unmount', async () => {
    const remove = jest.fn();
    Notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove });

    const { unmount } = await renderHook(() => useNotificationResponseRouter());
    await unmount();

    expect(remove).toHaveBeenCalled();
  });
});
