/**
 * Tests for usePendingOperationSuggestions — the pending "suggested operation
 * from notification" state behind the stacked cards on the main operations page.
 * The pipeline and DB services are mocked so outcomes are driven directly.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import usePendingOperationSuggestions from '../../app/hooks/usePendingOperationSuggestions';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
import * as PendingNotificationsDB from '../../app/services/PendingNotificationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/PendingNotificationsDB');

const EXPENSE = {
  id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'SAS SUPERMARKET', date: '2026-06-28',
  accountId: 1, categoryId: 'c1', packageName: 'am.bank',
};

const TRANSFER = {
  id: 'p2', kind: 'ATM CASH', type: 'transfer', amount: '50000.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'ATM YEREVAN', date: '2026-06-28',
  accountId: 1, categoryId: null, packageName: 'am.bank',
};

describe('usePendingOperationSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([EXPENSE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue({ id: 2, name: 'Cash', currency: 'AMD' });
    pipeline.processBankNotifications.mockResolvedValue({ created: 0, pending: 0, skipped: 0 });
    pipeline.resolvePendingNotification.mockResolvedValue({ id: 'op1' });
    pipeline.dismissPendingNotification.mockResolvedValue();
  });

  it('loads pending suggestions and the bound ATM target on mount', async () => {
    const { result } = await renderHook(() => usePendingOperationSuggestions());
    await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));
    expect(result.current.atmTargetAccountId).toBe(2);
  });

  it('survives a failing load and keeps the last known state', async () => {
    PendingNotificationsDB.getPendingNotifications.mockRejectedValue(new Error('db not ready'));
    const { result } = await renderHook(() => usePendingOperationSuggestions());
    await waitFor(() => expect(PendingNotificationsDB.getPendingNotifications).toHaveBeenCalled());
    expect(result.current.suggestions).toEqual([]);
  });

  it('reloads when RELOAD_ALL is emitted (pipeline booked or enqueued something)', async () => {
    const { result } = await renderHook(() => usePendingOperationSuggestions());
    await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([EXPENSE, TRANSFER]);
    await act(async () => {
      appEvents.emit(EVENTS.RELOAD_ALL);
    });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
  });

  it('unsubscribes from RELOAD_ALL on unmount', async () => {
    const { unmount } = await renderHook(() => usePendingOperationSuggestions());
    await waitFor(() => expect(PendingNotificationsDB.getPendingNotifications).toHaveBeenCalled());
    const callsBefore = PendingNotificationsDB.getPendingNotifications.mock.calls.length;
    await unmount();
    appEvents.emit(EVENTS.RELOAD_ALL);
    await act(async () => { await Promise.resolve(); });
    expect(PendingNotificationsDB.getPendingNotifications.mock.calls.length).toBe(callsBefore);
  });

  describe('refresh (pull-to-refresh)', () => {
    it('re-runs the ingestion pipeline then reloads the queue', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([EXPENSE, TRANSFER]);
      await act(async () => {
        await result.current.refresh();
      });
      expect(pipeline.processBankNotifications).toHaveBeenCalledTimes(1);
      expect(result.current.suggestions).toHaveLength(2);
    });

    it('still reloads when the pipeline run fails', async () => {
      pipeline.processBankNotifications.mockRejectedValue(new Error('listener gone'));
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe('accept', () => {
    it('resolves an expense with its pre-filled choices and drops it from the stack', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p1', {});
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.savingIds).toEqual({});
    });

    it('books a transfer into the bound ATM cash account', async () => {
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([TRANSFER]);
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([TRANSFER]));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(TRANSFER);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p2', { toAccountId: 2 });
    });

    it('ignores repeat taps while a save is in flight', async () => {
      let resolveSave;
      pipeline.resolvePendingNotification.mockImplementation(
        () => new Promise((resolve) => { resolveSave = resolve; }),
      );
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      await act(async () => {
        result.current.accept(EXPENSE);
        result.current.accept(EXPENSE);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(result.current.savingIds).toEqual({ p1: true }));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        resolveSave({ id: 'op1' });
      });
      await waitFor(() => expect(result.current.suggestions).toEqual([]));
    });

    it('restores the card when the save fails', async () => {
      pipeline.resolvePendingNotification.mockRejectedValue(new Error('no exchange rate'));
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(result.current.savingIds).toEqual({});
      expect(result.current.suggestions).toEqual([EXPENSE]);
    });

    it('drops the card even if the post-accept reload fails (no stuck "Adding…" state)', async () => {
      // resolve succeeds (operation booked, row deleted) but the follow-up reload
      // throws transiently. The card must still leave the stack, not strand.
      pipeline.resolvePendingNotification.mockResolvedValue({ id: 'op1' });
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      PendingNotificationsDB.getPendingNotifications.mockRejectedValue(new Error('db busy'));
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.savingIds).toEqual({});
    });
  });

  describe('dismiss', () => {
    it('deletes the pending row and reloads', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.dismiss(EXPENSE);
      });
      expect(pipeline.dismissPendingNotification).toHaveBeenCalledWith('p1');
      expect(result.current.suggestions).toEqual([]);
    });

    it('keeps the card when the delete fails', async () => {
      pipeline.dismissPendingNotification.mockRejectedValue(new Error('locked'));
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));

      await act(async () => {
        await result.current.dismiss(EXPENSE);
      });
      expect(result.current.suggestions).toEqual([EXPENSE]);
    });
  });
});
