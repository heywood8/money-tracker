import { useState, useEffect, useCallback, useRef } from 'react';
import { getPendingNotifications } from '../services/PendingNotificationsDB';
import {
  processBankNotifications,
  resolvePendingNotification,
  dismissPendingNotification,
  resolveAtmTargetAccount,
} from '../services/notifications/processBankNotifications';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Pending "suggested operations from notifications" for the main operations page.
 *
 * Mirrors the review queue shown in Settings → Notification processing, but as a
 * lightweight surface: it loads the queued items, keeps them in sync via the
 * app-wide RELOAD_ALL event (the ingestion pipeline emits it whenever it books or
 * enqueues something), and exposes accept/dismiss/refresh actions for the stacked
 * cards rendered above the quick-add form.
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
      if (!mountedRef.current) return;
      setSuggestions(Array.isArray(items) ? items : []);
      setAtmTargetAccountId(atmAccount ? atmAccount.id : null);
    } catch (error) {
      // Non-fatal (e.g. storage not ready) — keep the last known state.
    }
  }, []);

  // Initial load, then stay in sync with every app-wide data change: the
  // ingestion pipeline and the settings review panel both emit RELOAD_ALL after
  // enqueueing/booking/dismissing notifications.
  useEffect(() => {
    reload();
    return appEvents.on(EVENTS.RELOAD_ALL, reload);
  }, [reload]);

  // Drop save flags for items that left the queue (accepted or dismissed —
  // possibly from the settings panel), so the map only tracks live cards.
  useEffect(() => {
    setSavingIds((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const live = new Set(suggestions.map((s) => s.id));
      let changed = false;
      const next = {};
      keys.forEach((id) => {
        if (live.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    });
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
   * One-tap accept: book the suggestion with its pre-resolved account/category.
   * Transfer (ATM) items are booked into the bound cash target account. Callers
   * gate on this being possible (see canAcceptSuggestion in the stack component).
   */
  const accept = useCallback(async (item) => {
    if (savingRef.current.has(item.id)) return;
    savingRef.current.add(item.id);
    setSavingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      await resolvePendingNotification(
        item.id,
        item.type === 'transfer' ? { toAccountId: atmTargetAccountId } : {},
      );
      // resolve emits RELOAD_ALL, but reload explicitly so the card leaves the
      // stack even if no listener chain is mounted (and to keep tests direct).
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
  }, [reload, atmTargetAccountId]);

  /** Dismiss a suggestion without creating an operation. */
  const dismiss = useCallback(async (item) => {
    try {
      await dismissPendingNotification(item.id);
    } catch (error) {
      return; // Row still exists; leave the card in place.
    }
    await reload();
  }, [reload]);

  return {
    suggestions,
    savingIds,
    atmTargetAccountId,
    reload,
    refresh,
    accept,
    dismiss,
  };
}
