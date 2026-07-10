/**
 * Tests for usePendingOperationSuggestions — the pending "suggested operation
 * from notification" state behind the binding-card deck on the main operations
 * page. The pipeline and DB services are mocked so outcomes are driven directly.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import usePendingOperationSuggestions, { canSaveSuggestion } from '../../app/hooks/usePendingOperationSuggestions';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
import * as PendingNotificationsDB from '../../app/services/PendingNotificationsDB';
import * as NotificationRulesDB from '../../app/services/NotificationRulesDB';
import { kindRequiresCategory } from '../../app/services/notifications/parseBankNotification';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/PendingNotificationsDB');
jest.mock('../../app/services/NotificationRulesDB', () => ({
  getLabelForMerchant: jest.fn(),
}));
jest.mock('../../app/services/notifications/parseBankNotification', () => ({
  kindRequiresCategory: jest.fn(),
}));

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

// The full choices the hook seeds for EXPENSE/TRANSFER with no learned label.
const EXPENSE_CHOICE = { accountId: 1, categoryId: 'c1', toAccountId: null, labelOverride: '' };
const TRANSFER_CHOICE = { accountId: 1, categoryId: null, toAccountId: 2, labelOverride: '' };

describe('canSaveSuggestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kindRequiresCategory.mockReturnValue(false);
  });

  it('allows an expense with an account when no category is required', () => {
    expect(canSaveSuggestion(EXPENSE, { accountId: 1, categoryId: null })).toBe(true);
  });

  it('rejects an expense without an account', () => {
    expect(canSaveSuggestion(EXPENSE, { accountId: null, categoryId: 'c1' })).toBe(false);
  });

  it('requires a category for kinds that demand one', () => {
    kindRequiresCategory.mockReturnValue(true);
    expect(canSaveSuggestion(EXPENSE, { accountId: 1, categoryId: null })).toBe(false);
    expect(canSaveSuggestion(EXPENSE, { accountId: 1, categoryId: 'c1' })).toBe(true);
  });

  it('allows a transfer only with a target distinct from the source', () => {
    expect(canSaveSuggestion(TRANSFER, { accountId: 1, toAccountId: null })).toBe(false);
    expect(canSaveSuggestion(TRANSFER, { accountId: 1, toAccountId: 1 })).toBe(false);
    expect(canSaveSuggestion(TRANSFER, { accountId: 1, toAccountId: 2 })).toBe(true);
  });
});

describe('usePendingOperationSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([EXPENSE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue({ id: 2, name: 'Cash', currency: 'AMD' });
    pipeline.processBankNotifications.mockResolvedValue({ created: 0, pending: 0, skipped: 0 });
    pipeline.resolvePendingNotification.mockResolvedValue({ id: 'op1' });
    pipeline.dismissPendingNotification.mockResolvedValue();
    NotificationRulesDB.getLabelForMerchant.mockResolvedValue(null);
    kindRequiresCategory.mockReturnValue(false);
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

  describe('choices', () => {
    it('seeds each item with its suggested account/category and a blank label', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices).toEqual({ p1: EXPENSE_CHOICE }));
    });

    it('seeds a transfer with the bound ATM target account', async () => {
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([TRANSFER]);
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices).toEqual({ p2: TRANSFER_CHOICE }));
    });

    it('seeds the label from the learned merchant override', async () => {
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Groceries');
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1?.labelOverride).toBe('Groceries'));
      expect(NotificationRulesDB.getLabelForMerchant).toHaveBeenCalledWith('SAS SUPERMARKET', 'am.bank');
    });

    it('does not clobber a user-edited choice on reload', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        result.current.setChoice('p1', { categoryId: 'c9', labelOverride: 'My shop' });
      });
      await act(async () => {
        appEvents.emit(EVENTS.RELOAD_ALL);
      });
      await waitFor(() => expect(result.current.choices.p1).toEqual({
        ...EXPENSE_CHOICE, categoryId: 'c9', labelOverride: 'My shop',
      }));
    });

    it('patches a single field via setChoice', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        result.current.setChoice('p1', { accountId: 5 });
      });
      expect(result.current.choices.p1).toEqual({ ...EXPENSE_CHOICE, accountId: 5 });
    });

    it('prunes choices for items that left the queue', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toBeTruthy());

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        appEvents.emit(EVENTS.RELOAD_ALL);
      });
      await waitFor(() => expect(result.current.choices).toEqual({}));
    });
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
    it('resolves an expense with its full seeded bindings and drops it from the deck', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p1', EXPENSE_CHOICE);
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.savingIds).toEqual({});
    });

    it('passes the user-edited bindings (account, category, label) to resolve', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        result.current.setChoice('p1', { accountId: 7, categoryId: 'c3', labelOverride: 'Corner shop' });
      });
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p1', {
        accountId: 7, categoryId: 'c3', toAccountId: null, labelOverride: 'Corner shop',
      });
    });

    it('books a transfer into the bound ATM cash account', async () => {
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([TRANSFER]);
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p2).toEqual(TRANSFER_CHOICE));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(TRANSFER);
      });
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p2', TRANSFER_CHOICE);
    });

    it('no-ops while the choice is invalid (missing account)', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        result.current.setChoice('p1', { accountId: null });
      });
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(pipeline.resolvePendingNotification).not.toHaveBeenCalled();
      expect(result.current.suggestions).toEqual([EXPENSE]);
    });

    it('ignores repeat taps while a save is in flight', async () => {
      let resolveSave;
      pipeline.resolvePendingNotification.mockImplementation(
        () => new Promise((resolve) => { resolveSave = resolve; }),
      );
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

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
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(result.current.savingIds).toEqual({});
      expect(result.current.suggestions).toEqual([EXPENSE]);
      // Choices survive the failure so the user can retry or adjust.
      expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE);
    });

    it('drops the card even if the post-accept reload fails (no stuck "Adding…" state)', async () => {
      // resolve succeeds (operation booked, row deleted) but the follow-up reload
      // throws transiently. The card must still leave the deck, not strand.
      pipeline.resolvePendingNotification.mockResolvedValue({ id: 'op1' });
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

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
