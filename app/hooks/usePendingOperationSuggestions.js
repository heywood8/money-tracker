import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import { getPendingNotifications } from '../services/PendingNotificationsDB';
import {
  processBankNotifications,
  resolvePendingNotification,
  dismissPendingNotification,
  resolveAtmTargetAccount,
} from '../services/notifications/processBankNotifications';
import { kindRequiresCategory } from '../services/notifications/parseBankNotification';
import { getLabelForMerchant } from '../services/NotificationRulesDB';
import { getAccountByCardMask } from '../services/AccountsDB';
import { resolveAccountBinding } from '../services/notifications/accountBindings';
import { appEvents, EVENTS } from '../services/eventEmitter';

// Enable LayoutAnimation on the classic Android renderer (a no-op on Fabric, where
// the New Architecture drives layout animations natively). Guarded so it never
// throws when the method is absent. Mirrors NotificationProcessingContentPanel.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// A short ease so a card leaving the stack (accepted/dismissed) reads as a smooth
// collapse and the quick-add form below slides up, instead of an abrupt jump.
// Matches the settings review panel's CARD_COLLAPSE_ANIMATION timing.
const CARD_LEAVE_ANIMATION = {
  duration: 220,
  create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeIn, property: LayoutAnimation.Properties.opacity },
};

/**
 * Whether a suggestion is bookable with the user's current choice: an account,
 * a category when the kind demands one, and — for ATM-withdrawal transfers — a
 * target account distinct from the source. Mirrors the settings review panel's
 * canSave logic, but validates the editable `choice` rather than the raw item.
 */
export const canSaveSuggestion = (item, choice = {}) => {
  if (item.type === 'transfer') {
    return (
      choice.accountId != null &&
      choice.toAccountId != null &&
      choice.toAccountId !== choice.accountId
    );
  }
  return (
    choice.accountId != null &&
    (!kindRequiresCategory(item.kind, item.packageName) || choice.categoryId != null)
  );
};

/**
 * Pending "suggested operations from notifications" for the main operations page.
 *
 * Mirrors the review queue shown in Settings → Notification processing, but as a
 * lightweight surface: it loads the queued items, keeps them in sync via the
 * app-wide RELOAD_ALL event (the ingestion pipeline emits it whenever it books or
 * enqueues something), and exposes per-item binding choices (account, category,
 * transfer target, custom label) plus save/dismiss/refresh actions for the
 * stacked binding cards rendered over the quick-add form.
 *
 * There is intentionally no polling here — the pipeline already runs on app
 * open/foreground (AppInitializer) and on the pull-to-refresh gesture (refresh),
 * so the main page stays cheap while idle.
 */
export default function usePendingOperationSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  // Per-item accept-in-flight flags, so the card can collapse into an
  // "Adding operation…" row and repeat taps can't book duplicates.
  const [savingIds, setSavingIds] = useState({});
  // Per-item save-failure flags (e.g. no exchange rate for a cross-currency
  // booking), so the card can show an inline error instead of failing silently.
  const [saveErrors, setSaveErrors] = useState({});
  // Per-item chosen { accountId, categoryId, toAccountId, labelOverride,
  // labelDirty } keyed by pending id — the editable bindings behind the inline
  // review cards. `labelDirty` marks a label the user has actually typed, so a
  // best-effort learned-label seed is never mistaken for a deliberate value.
  const [choices, setChoices] = useState({});
  // Mirror of `choices` so reload/accept can read the latest values without
  // depending on `choices` (which would re-create them on every keystroke).
  const choicesRef = useRef(choices);
  useEffect(() => { choicesRef.current = choices; }, [choices]);
  // Synchronous mirror of the in-flight set — state updates are async, so the
  // double-tap guard must not rely on `savingIds` alone.
  const savingRef = useRef(new Set());
  // Guards async setters from firing after unmount.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const reload = useCallback(async () => {
    try {
      const [items, atmAccount] = await Promise.all([
        getPendingNotifications(),
        resolveAtmTargetAccount().catch(() => null),
      ]);
      const list = Array.isArray(items) ? items : [];
      const atmId = atmAccount ? atmAccount.id : null;
      // Pre-fill the custom-name field with any override already learned for the
      // merchant. A field the user has edited (labelDirty) is authoritative and
      // never re-queried or overwritten; other cards are looked up so a name just
      // learned on one card surfaces on its siblings. On a transient lookup
      // failure keep the current display value rather than blanking it — the seed
      // is best-effort and the save path no longer depends on it.
      const prevChoices = choicesRef.current;
      const overrides = await Promise.all(
        list.map((item) => {
          const existing = prevChoices[item.id];
          if (existing?.labelDirty) return Promise.resolve(existing.labelOverride ?? '');
          if (!item.merchant) return Promise.resolve(existing?.labelOverride ?? '');
          return getLabelForMerchant(item.merchant, item.packageName)
            .catch(() => existing?.labelOverride ?? '');
        }),
      );
      // Re-resolve the account for any item the pipeline enqueued without one: a
      // binding created (or made matchable) after the item was queued should
      // backfill its account instead of leaving the field blank. A card item
      // re-resolves via its card mask; a card-less item (SBP / account-level, no
      // mask) re-resolves via the learned (source app + currency) binding — so
      // binding one sibling unblocks the rest of the queued batch.
      const resolvedAccountIds = await Promise.all(
        list.map((item) => {
          if (item.accountId != null) return Promise.resolve(item.accountId);
          if (item.cardMask) {
            return getAccountByCardMask(item.cardMask)
              .then((account) => (account ? account.id : null))
              .catch(() => null);
          }
          return resolveAccountBinding(item.packageName, item.currency)
            .then((account) => (account ? account.id : null))
            .catch(() => null);
        }),
      );
      if (!mountedRef.current) return;
      setSuggestions(list);
      // Seed choices with any suggested account/category, the bound ATM target
      // for transfers, and the learned label.
      setChoices((prev) => {
        const next = { ...prev };
        list.forEach((item, i) => {
          const learned = overrides[i] ?? '';
          const resolvedAccountId = resolvedAccountIds[i];
          const existing = next[item.id];
          if (!existing) {
            next[item.id] = {
              accountId: item.accountId ?? resolvedAccountId ?? null,
              categoryId: item.categoryId ?? null,
              toAccountId: item.type === 'transfer' ? atmId : null,
              labelOverride: learned,
              labelDirty: false,
            };
            return;
          }
          let updated = existing;
          // Backfill a transfer target the user hasn't set yet with the now-bound
          // ATM cash account, so a target learned after this card first appeared
          // (e.g. by saving a sibling ATM card) unblocks Save without a re-pick.
          if (item.type === 'transfer' && existing.toAccountId == null && atmId != null) {
            updated = { ...updated, toAccountId: atmId };
          }
          // Backfill an unresolved account with one now matched from the card mask
          // (a binding created after this card first appeared), mirroring the ATM
          // target backfill. Never overrides an account already chosen/suggested.
          if (existing.accountId == null && resolvedAccountId != null) {
            updated = { ...updated, accountId: resolvedAccountId };
          }
          // Refresh a non-edited label with the latest learned name (e.g. a
          // sibling just renamed this shop); never touch a field being edited.
          if (!existing.labelDirty && learned !== existing.labelOverride) {
            updated = { ...updated, labelOverride: learned };
          }
          if (updated !== existing) next[item.id] = updated;
        });
        return next;
      });
    } catch (error) {
      // Non-fatal (e.g. storage not ready) — keep the last known state.
    }
  }, []);

  /** Patch one item's binding choice (account, category, target, label). */
  const setChoice = useCallback((id, patch) => {
    setChoices((prev) => {
      const merged = { ...prev[id], ...patch };
      // A typed label is authoritative from now on — mark it so reload never
      // re-seeds it from the learned merchant label (and a cleared field stays
      // cleared instead of being refilled).
      if ('labelOverride' in patch) merged.labelDirty = true;
      return { ...prev, [id]: merged };
    });
    // Editing a card clears its stale save-error banner.
    setSaveErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Initial load, then stay in sync with every app-wide data change: the
  // ingestion pipeline and the settings review panel both emit RELOAD_ALL after
  // enqueueing/booking/dismissing notifications.
  useEffect(() => {
    reload();
    return appEvents.on(EVENTS.RELOAD_ALL, reload);
  }, [reload]);

  // Drop save flags and choices for items that left the queue (accepted or
  // dismissed — possibly from the settings panel), so the maps only track live
  // cards.
  useEffect(() => {
    const live = new Set(suggestions.map((s) => s.id));
    const prune = (prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = {};
      keys.forEach((id) => {
        if (live.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    };
    setSavingIds(prune);
    setChoices(prune);
    setSaveErrors(prune);
  }, [suggestions]);

  /**
   * Pull-to-refresh entry point: re-run the ingestion pipeline (a no-op when the
   * feature is disabled; already-seen notifications are skipped) and reload the
   * queue. Operations created by the run surface via its RELOAD_ALL emit.
   */
  const refresh = useCallback(async () => {
    try {
      await processBankNotifications();
    } catch (error) {
      // Ingestion failure is non-fatal — still reload whatever is queued.
    }
    await reload();
  }, [reload]);

  /**
   * Book the suggestion with the bindings the user picked (or the seeded
   * defaults): account, category, transfer target, custom label. No-ops while
   * the choice is still invalid — the card's Save button gates on the same
   * canSaveSuggestion check.
   */
  const accept = useCallback(async (item) => {
    const choice = choicesRef.current[item.id] || {};
    if (!canSaveSuggestion(item, choice)) return;
    if (savingRef.current.has(item.id)) return;
    savingRef.current.add(item.id);
    setSavingIds((prev) => ({ ...prev, [item.id]: true }));
    // Clear any stale error from a prior failed attempt on this card.
    setSaveErrors((prev) => {
      if (!prev[item.id]) return prev;
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    try {
      const resolveChoices = {
        accountId: choice.accountId,
        categoryId: choice.categoryId || null,
        toAccountId: choice.toAccountId ?? null,
      };
      // Only override the label when the user actually typed one. Otherwise omit
      // it so the resolver applies (and preserves) the learned merchant label at
      // resolve time — sending a best-effort-seeded value would, on a failed seed
      // lookup, book the raw shop name and wipe the learned label.
      if (choice.labelDirty) {
        resolveChoices.labelOverride = choice.labelOverride ?? '';
      }
      await resolvePendingNotification(item.id, resolveChoices);
      // The operation is booked and the pending row deleted. Drop the card from
      // the stack optimistically: reload() below swallows its own errors, so a
      // transient post-write read failure must not strand the card in the
      // buttonless "Adding…" state (the saving flag is only pruned when the item
      // actually leaves `suggestions`). Animate the collapse.
      LayoutAnimation.configureNext(CARD_LEAVE_ANIMATION);
      if (mountedRef.current) {
        setSuggestions((prev) => prev.filter((s) => s.id !== item.id));
      }
      // resolve emits RELOAD_ALL, but reload explicitly so the stack reconciles
      // with the DB even if no listener chain is mounted (and to keep tests direct).
      await reload();
    } catch (error) {
      // The save failed (e.g. no exchange rate for a cross-currency booking) —
      // restore the card and surface an inline error so the user can adjust their
      // choices and retry instead of tapping Save into a silent void.
      if (mountedRef.current) {
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        setSaveErrors((prev) => ({ ...prev, [item.id]: true }));
      }
    } finally {
      savingRef.current.delete(item.id);
    }
  }, [reload]);

  /** Dismiss a suggestion without creating an operation. */
  const dismiss = useCallback(async (item) => {
    try {
      await dismissPendingNotification(item.id);
    } catch (error) {
      // Row still exists; leave the card in place. Log so a persistent failure
      // (rather than a silently unresponsive Dismiss) is diagnosable.
      console.warn('[usePendingOperationSuggestions] Failed to dismiss suggestion:', error);
      return;
    }
    // Animate the removal so the card collapses and the form below slides up.
    LayoutAnimation.configureNext(CARD_LEAVE_ANIMATION);
    await reload();
  }, [reload]);

  return {
    suggestions,
    savingIds,
    saveErrors,
    choices,
    setChoice,
    reload,
    refresh,
    accept,
    dismiss,
  };
}
