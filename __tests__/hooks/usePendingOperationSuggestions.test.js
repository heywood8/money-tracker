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
import * as AccountsDB from '../../app/services/AccountsDB';
import { kindRequiresCategory } from '../../app/services/notifications/parseBankNotification';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/PendingNotificationsDB');
jest.mock('../../app/services/NotificationRulesDB', () => ({
  getLabelForMerchant: jest.fn(),
}));
jest.mock('../../app/services/AccountsDB', () => ({
  getAccountByCardMask: jest.fn(),
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
// labelDirty is false until the user actually types a custom name.
const EXPENSE_CHOICE = {
  accountId: 1, categoryId: 'c1', toAccountId: null, labelOverride: '', labelDirty: false,
};
const TRANSFER_CHOICE = {
  accountId: 1, categoryId: null, toAccountId: 2, labelOverride: '', labelDirty: false,
};
// The resolve payload for an untouched card: the label is omitted (not authoritative)
// so the resolver applies and preserves the learned merchant label at resolve time.
const EXPENSE_RESOLVE = { accountId: 1, categoryId: 'c1', toAccountId: null };
const TRANSFER_RESOLVE = { accountId: 1, categoryId: null, toAccountId: 2 };

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
    AccountsDB.getAccountByCardMask.mockResolvedValue(null);
    kindRequiresCategory.mockReturnValue(false);
  });

  it('loads pending suggestions on mount', async () => {
    const { result } = await renderHook(() => usePendingOperationSuggestions());
    await waitFor(() => expect(result.current.suggestions).toEqual([EXPENSE]));
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

    it('re-resolves the account for a card-bound item the pipeline left unresolved', async () => {
      // The card was bound after this item was enqueued (or only became matchable
      // once matching went last-4): the empty account must fill in from the card.
      const UNRESOLVED = { ...EXPENSE, id: 'p9', accountId: null, cardMask: '*7027' };
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([UNRESOLVED]);
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 9, name: 'T-bank' });

      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p9?.accountId).toBe(9));
      expect(AccountsDB.getAccountByCardMask).toHaveBeenCalledWith('*7027');
    });

    it('leaves the account null when the card resolves to nothing', async () => {
      const UNRESOLVED = { ...EXPENSE, id: 'p9', accountId: null, cardMask: '*0000' };
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([UNRESOLVED]);
      AccountsDB.getAccountByCardMask.mockResolvedValue(null);

      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p9).toBeTruthy());
      expect(result.current.choices.p9.accountId).toBeNull();
    });

    it('does not look up a card for an item that already has an account', async () => {
      // EXPENSE ships with accountId: 1, so the card lookup is skipped entirely.
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toBeTruthy());
      expect(AccountsDB.getAccountByCardMask).not.toHaveBeenCalled();
    });

    it('backfills a resolved account onto an existing unresolved choice on reload', async () => {
      const UNRESOLVED = { ...EXPENSE, id: 'p9', accountId: null, cardMask: '*7027' };
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([UNRESOLVED]);
      AccountsDB.getAccountByCardMask.mockResolvedValueOnce(null); // not bound yet
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p9?.accountId).toBeNull());

      // The card gets bound; the next reload should pick up the account.
      AccountsDB.getAccountByCardMask.mockResolvedValue({ id: 9 });
      await act(async () => {
        appEvents.emit(EVENTS.RELOAD_ALL);
      });
      await waitFor(() => expect(result.current.choices.p9?.accountId).toBe(9));
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
        ...EXPENSE_CHOICE, categoryId: 'c9', labelOverride: 'My shop', labelDirty: true,
      }));
    });

    it('keeps a user-cleared label cleared across reload (does not re-seed it)', async () => {
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Coffee Bros');
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1?.labelOverride).toBe('Coffee Bros'));

      // User deliberately clears the field to revert to the raw shop name.
      await act(async () => {
        result.current.setChoice('p1', { labelOverride: '' });
      });
      await act(async () => {
        appEvents.emit(EVENTS.RELOAD_ALL);
      });
      // The learned label must NOT be refilled — the clear is authoritative.
      await waitFor(() => expect(result.current.choices.p1).toEqual({
        ...EXPENSE_CHOICE, labelOverride: '', labelDirty: true,
      }));
    });

    it('backfills a transfer target with a newly-bound ATM account on reload', async () => {
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([TRANSFER]);
      pipeline.resolveAtmTargetAccount.mockResolvedValueOnce(null); // none bound yet
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p2?.toAccountId).toBeNull());

      // A sibling ATM save binds the target; the next reload should pick it up.
      pipeline.resolveAtmTargetAccount.mockResolvedValue({ id: 2, name: 'Cash', currency: 'AMD' });
      await act(async () => {
        appEvents.emit(EVENTS.RELOAD_ALL);
      });
      await waitFor(() => expect(result.current.choices.p2?.toAccountId).toBe(2));
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
    it('resolves an untouched expense WITHOUT a label override and drops it from the deck', async () => {
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      // labelOverride is omitted so the resolver keeps the learned merchant label.
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p1', EXPENSE_RESOLVE);
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.savingIds).toEqual({});
    });

    it('does not send a label override even when a label was seeded from the learned name', async () => {
      NotificationRulesDB.getLabelForMerchant.mockResolvedValue('Groceries');
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1?.labelOverride).toBe('Groceries'));

      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      // The seed is best-effort — never authoritative — so it must not be sent as
      // an override (which would wipe the learned label on a failed seed lookup).
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p1', EXPENSE_RESOLVE);
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
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith('p2', TRANSFER_RESOLVE);
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

    it('restores the card and flags an inline error when the save fails', async () => {
      pipeline.resolvePendingNotification.mockRejectedValue(new Error('no exchange rate'));
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      expect(result.current.savingIds).toEqual({});
      expect(result.current.suggestions).toEqual([EXPENSE]);
      // The failure is surfaced, not swallowed, so the card can show an error.
      expect(result.current.saveErrors).toEqual({ p1: true });
      // Choices survive the failure so the user can retry or adjust.
      expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE);
    });

    it('clears a card save-error when the user edits it', async () => {
      pipeline.resolvePendingNotification.mockRejectedValue(new Error('no exchange rate'));
      const { result } = await renderHook(() => usePendingOperationSuggestions());
      await waitFor(() => expect(result.current.choices.p1).toEqual(EXPENSE_CHOICE));

      await act(async () => {
        await result.current.accept(EXPENSE);
      });
      await waitFor(() => expect(result.current.saveErrors).toEqual({ p1: true }));

      await act(async () => {
        result.current.setChoice('p1', { accountId: 3 });
      });
      expect(result.current.saveErrors).toEqual({});
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
