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
  // The bound ATM cash account: transfer (ATM withdrawal) suggestions can only be
  // one-tap accepted when a target account is already bound.
  const [atmTargetAccountId, setAtmTargetAccountId] = useState(null);
  // Per-item accept-in-flight flags, so the card can collapse into an
  // "Adding operation…" row and repeat taps can't book duplicates.
  const [savingIds, setSavingIds] = useState({});
  // Per-item chosen { accountId, categoryId, toAccountId, labelOverride } keyed
  // by pending id — the editable bindings behind the inline review cards.
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
      // merchant. Cards whose field already holds a name are settled and skipped —
      // RELOAD_ALL fires after every operation add on this screen, so the guard
      // keeps reloads from fanning out an O(N) lookup each time. New and
      // still-blank cards are looked up, so a name just learned on one card
      // surfaces on its siblings from the same shop.
      const prevChoices = choicesRef.current;
      const overrides = await Promise.all(
        list.map((item) => {
          const settled = prevChoices[item.id]?.labelOverride;
          if (settled) return Promise.resolve(settled);
          return item.merchant
            ? getLabelForMerchant(item.merchant, item.packageName).catch(() => null)
            : Promise.resolve(null);
        }),
      );
      if (!mountedRef.current) return;
      setSuggestions(list);
      setAtmTargetAccountId(atmId);
      // Seed choices with any suggested account/category, the bound ATM target
      // for transfers, and the learned label.
      setChoices((prev) => {
        const next = { ...prev };
        list.forEach((item, i) => {
          const learned = overrides[i] ?? '';
          if (!next[item.id]) {
            next[item.id] = {
              accountId: item.accountId ?? null,
              categoryId: item.categoryId ?? null,
              toAccountId: item.type === 'transfer' ? atmId : null,
              labelOverride: learned,
            };
          } else if (learned && !next[item.id].labelOverride) {
            // A sibling save just learned this shop's name — surface it on a
            // still-blank card without clobbering a value the user is editing.
            next[item.id] = { ...next[item.id], labelOverride: learned };
          }
        });
        return next;
      });
    } catch (error) {
      // Non-fatal (e.g. storage not ready) — keep the last known state.
    }
  }, []);

  /** Patch one item's binding choice (account, category, target, label). */
  const setChoice = useCallback((id, patch) => {
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
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
    try {
      await resolvePendingNotification(item.id, {
        accountId: choice.accountId,
        categoryId: choice.categoryId || null,
        toAccountId: choice.toAccountId ?? null,
        // Send the field verbatim (string, possibly blank) so resolve treats it
        // as authoritative — a cleared field reverts to the raw shop name.
        labelOverride: choice.labelOverride ?? '',
      });
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
      // restore the card so the user can retry or review it in settings.
      if (mountedRef.current) {
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
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
    atmTargetAccountId,
    choices,
    setChoice,
    reload,
    refresh,
    accept,
    dismiss,
  };
}
