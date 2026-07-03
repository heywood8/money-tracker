/**
 * Tests for the notification deep-link router hook: it emits
 * OPEN_NOTIFICATION_PROCESSING for a matching tapped notification (cold start and
 * while running), ignores unrelated responses, and cleans up its subscription.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import useNotificationResponseRouter from '../../app/hooks/useNotificationResponseRouter';

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
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emits when launched by tapping the alert (cold start)', async () => {
    Notifications.getLastNotificationResponseAsync.mockResolvedValue(matchResponse);

    const { unmount } = await renderHook(() => useNotificationResponseRouter());

    await waitFor(() =>
      expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_NOTIFICATION_PROCESSING),
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

    expect(emitSpy).toHaveBeenCalledWith(EVENTS.OPEN_NOTIFICATION_PROCESSING);
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
