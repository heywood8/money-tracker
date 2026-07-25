import React, {
  useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle,
} from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useBudgetPlans } from '../../contexts/BudgetPlansContext';
import * as Currency from '../../services/currency';
import { SPACING } from '../../styles/layout';
import BudgetPlanLineModal from './BudgetPlanLineModal';
import StatusProgressBar from '../StatusProgressBar';
import { currentMonthKey, addMonths, formatMonthLabel } from '../../utils/monthUtils';

const CLOSED_MODAL = { visible: false, mode: 'line', line: null };

/**
 * MonthlyPlanSection — the envelope-style monthly plan editor that sits at the
 * top of the Budget tab: month header with ‹ › navigation, expected income,
 * allocation lines (category- or transfer-target-linked) with live-computed
 * remainder, add/reorder/delete actions, and plan-vs-actual tracking: per-line
 * progress against real spending / incoming transfers, actual vs expected
 * income, and status coloring (statuses come from BudgetPlansDataContext, which
 * follows the Budget tab's shared convert-all toggle).
 *
 * Month can be controlled by the host (Budgets screen) via the `month` prop so a
 * single shared ‹ Month › header drives the whole screen; in that mode the
 * section's own header is hidden and the host owns navigation. When `month` is
 * omitted the section stays self-contained and renders its own month header
 * (uncontrolled, used in isolation/tests).
 *
 * Budgets v3 phase 2 consolidated the old per-category `budgets` (v1) model into
 * RECURRING lines here: a recurring line is a global template (not scoped to any
 * one month's plan) that applies to every calendar month automatically, exactly
 * like a v1 budget did. Lines shown for a month are the union of every recurring
 * line and the month's own one-off lines (see BudgetPlansDB.getLinesForMonth) —
 * recurring lines show even for a month that has no plan created yet; income and
 * one-off allocations still need a plan, which is created lazily the first time
 * one is saved. Exposes `openAddLine` via ref so a host FAB can open the "add
 * allocation" flow without lifting the modal's state.
 */
const MonthlyPlanSection = forwardRef(function MonthlyPlanSection({
  currency = 'USD',
  expenseCategories = [],
  accounts = [],
  month: monthProp = null,
}, ref) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    plans,
    planStatuses,
    refreshPlanStatuses,
    addPlan,
    copyPlan,
    updatePlan,
    addLine,
    addRecurringLine,
    updateLine,
    deleteLine,
    reorderLines,
    reorderRecurringLines,
    getLinesForMonth,
  } = useBudgetPlans();

  // Month is controlled by the host when `monthProp` is provided; otherwise the
  // section owns it via internal state (uncontrolled).
  const controlledMonth = monthProp != null;
  const [internalMonth, setInternalMonth] = useState(currentMonthKey);
  const month = controlledMonth ? monthProp : internalMonth;
  const [lines, setLines] = useState([]);
  const [modal, setModal] = useState(CLOSED_MODAL);
  const [busy, setBusy] = useState(false);
  // Synchronous double-tap guard (Fix 3, adversarial review round 2): `busy`
  // (React state) only reflects reality AFTER a re-render commits, so two taps
  // landing in the same JS task/microtask both read `busy === false` before
  // either's setBusy(true) has flushed — a state-only guard does not actually
  // stop the race, it just makes it less likely. A ref is mutated synchronously,
  // so the second tap in the same task sees the first tap's guard immediately.
  // `busy` (state) is kept alongside it purely to drive the UI (disabled
  // buttons/spinner) — it is not relied on for correctness anymore.
  const busyRef = useRef(false);
  // Separate guard for the reorder (move) handlers below, which have no
  // save-in-flight UI to disable and shouldn't be blocked by an unrelated save.
  const moveGuardRef = useRef(false);

  const plan = useMemo(() => plans.find(p => p.month === month) || null, [plans, month]);
  const prevMonth = useMemo(() => addMonths(month, -1), [month]);
  const prevPlanExists = useMemo(() => plans.some(p => p.month === prevMonth), [plans, prevMonth]);

  const planId = plan?.id ?? null;
  const planCurrency = plan?.currency || currency;

  // Plan-vs-actual status for the shown month (may be null while computing).
  const planStatus = (planId && planStatuses && planStatuses.get(planId)) || null;

  // Freshness tracking (Fix 2, adversarial review round 2 — mirrors Bug 3):
  // refreshPlanStatuses() is fired-and-forgotten by the mutation handlers below
  // (it's async and NOT awaited), while this component's own `lines`/`plan`
  // state is already fresh by the time a save/delete resolves (reloadLines()
  // IS awaited, and plan-level edits update context state synchronously). That
  // means `planStatus` can lag behind the local state for one or more renders
  // right after a mutation — showing its (now stale) totals would contradict
  // the numbers the user just saved. Each successful mutation below marks
  // `statusStale`; it clears the moment a NEW planStatus object lands (context
  // always produces a fresh object/Map on every recompute, so a reference
  // change reliably means "the recompute finished").
  const [statusStale, setStatusStale] = useState(false);
  const planStatusRef = useRef(planStatus);
  useEffect(() => {
    if (planStatus !== planStatusRef.current) {
      planStatusRef.current = planStatus;
      setStatusStale(false);
    }
  }, [planStatus]);
  const freshPlanStatus = statusStale ? null : planStatus;

  const lineStatusById = useMemo(() => {
    const map = new Map();
    for (const lineStatus of planStatus?.lines || []) {
      map.set(lineStatus.lineId, lineStatus);
    }
    return map;
  }, [planStatus]);

  const categoriesById = useMemo(
    () => new Map(expenseCategories.map(c => [c.id, c])),
    [expenseCategories],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  );

  // Lines shown for the month are the union of every recurring (global) line and
  // the month's own one-off lines — recurring lines render even for a month with
  // no plan created yet (see BudgetPlansDB.getLinesForMonth).
  const reloadLines = useCallback(async () => {
    try {
      const data = await getLinesForMonth(month);
      setLines(data);
    } catch (error) {
      console.error('Failed to load plan lines:', error);
      setLines([]);
    }
  }, [getLinesForMonth, month]);

  // Load lines whenever the shown month changes (navigation, plan create/copy).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getLinesForMonth(month);
        if (!cancelled) setLines(data);
      } catch (error) {
        console.error('Failed to load plan lines:', error);
        if (!cancelled) setLines([]);
      }
    })();
    return () => { cancelled = true; };
  }, [month, getLinesForMonth]);

  // Recurring (global template) lines and this month's one-off lines are edited
  // and reordered independently — each has its own sort_order sequence at the DB
  // layer (see BudgetPlansDB) — so they're split for rendering/move actions.
  const recurringLines = useMemo(() => lines.filter(l => l.isRecurring), [lines]);
  const oneOffLines = useMemo(() => lines.filter(l => !l.isRecurring), [lines]);

  // Live totals: allocated = Σ line amounts, remainder = income − allocated.
  // Same precise decimal math as BudgetPlansDB.getPlanTotals, computed locally so
  // the remainder updates immediately as lines/income change, BEFORE the async
  // plan status lands. One-off lines always share the plan's currency; a
  // recurring line carries its own and is only added here when it matches —
  // mixed-currency recurring lines are simply skipped in this local estimate
  // (converting them needs an exchange-rate lookup, which is exactly what
  // planStatus.totals.allocated already did asynchronously). This local memo is
  // ONLY the instant placeholder shown before planStatus resolves; the actual
  // render below prefers planStatus.totals once it's available (see
  // displayAllocated/displayRemainder).
  const totals = useMemo(() => {
    const income = plan?.expectedIncome ?? '0';
    let allocated = '0';
    for (const line of lines) {
      const lineCurrency = line.currency || planCurrency;
      if (lineCurrency !== planCurrency) continue;
      allocated = Currency.add(allocated, line.amount, planCurrency);
    }
    const remainder = Currency.subtract(income, allocated, planCurrency);
    return { income, allocated, remainder };
  }, [plan, lines, planCurrency]);

  // Once the plan status has resolved (and is not stale — see freshPlanStatus
  // above), prefer its allocated/remainder — those are computed with correct
  // cross-currency conversion for recurring lines whose currency differs from
  // the plan's (see BudgetPlansDB.calculatePlanStatus). The local `totals` memo
  // above is only a same-currency estimate and undercounts a mixed-currency
  // plan; showing it after planStatus is ready would silently contradict the
  // more accurate number the app already computed. But a STALE planStatus is
  // worse than either — it would contradict the mutation just saved — so a
  // stale one is treated as "not ready yet" and the fresh local estimate is
  // shown instead until the recompute lands.
  const displayAllocated = freshPlanStatus ? freshPlanStatus.totals.allocated : totals.allocated;
  const displayRemainder = freshPlanStatus ? freshPlanStatus.totals.plannedRemainder : totals.remainder;

  const remainderNegative = Currency.isNegative(displayRemainder);

  // Single definition of the remainder line, rendered either inline in the
  // totals row (no actuals yet) or on its own row below (once actuals show).
  const remainderNode = (
    <Text
      style={[styles.totalsRemainder, { color: remainderNegative ? colors.danger : colors.text }]}
      testID="plan-remainder"
    >
      {t('remainder')}: {Currency.formatAmount(displayRemainder, planCurrency)} {planCurrency}
    </Text>
  );

  // Only invoked from the section's own header, which renders in uncontrolled
  // mode only; in controlled mode the host header drives month navigation.
  const handlePrev = useCallback(() => setInternalMonth(m => addMonths(m, -1)), []);
  const handleNext = useCallback(() => setInternalMonth(m => addMonths(m, 1)), []);

  const handleCreateEmpty = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await addPlan({ month, currency: currency || 'USD' });
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [addPlan, month, currency]);

  const handleCopyLast = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await copyPlan(prevMonth, month);
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [copyPlan, prevMonth, month]);

  const openIncomeEditor = useCallback(() => {
    setModal({ visible: true, mode: 'income', line: null });
  }, []);
  const openAddLine = useCallback(() => {
    setModal({ visible: true, mode: 'line', line: null });
  }, []);
  const openEditLine = useCallback((line) => {
    setModal({ visible: true, mode: 'line', line });
  }, []);
  const closeModal = useCallback(() => setModal(CLOSED_MODAL), []);

  // Let a host FAB (BudgetScreen) open the "add allocation" flow without
  // lifting this section's modal state up.
  useImperativeHandle(ref, () => ({ openAddLine }), [openAddLine]);

  // Income needs a real plan to attach to; auto-create an empty one for the
  // shown month the first time the user sets an income figure, so recurring
  // lines showing for a plan-less month don't block income entry.
  const ensurePlan = useCallback(async () => {
    if (plan) return plan;
    return addPlan({ month, currency: currency || 'USD' });
  }, [plan, addPlan, month, currency]);

  const handleSaveIncome = useCallback(async (amount) => {
    // Guards the same race handleCreateEmpty guards against: ensurePlan() lazily
    // creates the plan when there isn't one yet, and a double-tap Save (two
    // fingers, or a slow first response) can fire this handler twice before
    // either commit lands, racing two createPlan calls for the same month.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const targetPlan = await ensurePlan();
      await updatePlan(targetPlan.id, { expectedIncome: amount });
      // The plans-list update above triggers BudgetPlansDataContext's own
      // effect to recompute planStatus asynchronously (unawaited from here) —
      // see the freshness tracking above displayAllocated/displayRemainder.
      setStatusStale(true);
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      busyRef.current = false;
      setBusy(false);
      closeModal();
    }
  }, [ensurePlan, updatePlan, closeModal]);

  // Line-level context actions don't surface their own errors (unlike plan-level
  // ones), so report failures here and keep the editor open on error rather than
  // silently dropping the user's input.
  //
  // Currency conversion note: this handler used to convert the amount itself
  // whenever the recurring<->one-off SCOPE toggle changed, but left a direct
  // currency-chip edit on an already-recurring line (no scope change) totally
  // unconverted — same digits silently repriced into a different currency.
  // That invariant now lives in BudgetPlansDB.updateLine itself (the single
  // choke point for every currency-affecting update, not just this one caller)
  // — this handler just forwards the raw amount/currency the user entered and
  // lets the DB layer convert (or reject with `exchange_rate_unavailable` when
  // no rate exists, translated for display below).
  const handleSaveLine = useCallback(async (lineData) => {
    // Same double-tap guard as handleCreateEmpty/handleSaveIncome: the one-off
    // branch below lazily creates the plan via ensurePlan(), which races the same
    // way a bare "create empty plan" tap does.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { isRecurring: wantsRecurring, currency: lineCurrency, ...core } = lineData;
      const wasRecurring = modal.line?.isRecurring ?? false;
      const scopeChanged = !!modal.line && wasRecurring !== wantsRecurring;

      if (wantsRecurring) {
        if (modal.line) {
          const updates = { ...core, currency: lineCurrency };
          if (scopeChanged) updates.isRecurring = true;
          await updateLine(modal.line.id, updates);
        } else {
          await addRecurringLine({ ...core, currency: lineCurrency, sortOrder: recurringLines.length });
        }
      } else {
        const targetPlan = await ensurePlan();
        if (modal.line) {
          const updates = { ...core };
          if (scopeChanged) {
            updates.isRecurring = false;
            updates.planId = targetPlan.id;
          }
          await updateLine(modal.line.id, updates);
        } else {
          await addLine(targetPlan.id, { ...core, sortOrder: oneOffLines.length });
        }
      }
      await reloadLines();
      setStatusStale(true);
      // Line mutations don't touch the plans list, so trigger the status
      // recompute explicitly (plan-level edits refresh via the context effect).
      refreshPlanStatuses?.();
      closeModal();
    } catch (error) {
      console.error('Failed to save plan line:', error);
      // BudgetPlansDB.updateLine throws this specific (untranslated) message
      // when a currency change has no rate to convert through — translate it
      // for display; other errors are already user-facing English strings.
      const message = error.message === 'exchange_rate_unavailable' ? t('exchange_rate_unavailable') : error.message;
      showDialog('Error', message, [{ text: t('ok') }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [modal.line, updateLine, addLine, addRecurringLine, recurringLines.length, oneOffLines.length,
    ensurePlan, reloadLines, refreshPlanStatuses, closeModal, showDialog, t]);

  const handleDeleteLine = useCallback(async (lineId) => {
    try {
      await deleteLine(lineId);
      await reloadLines();
      setStatusStale(true);
      refreshPlanStatuses?.();
      closeModal();
    } catch (error) {
      console.error('Failed to delete plan line:', error);
      showDialog('Error', error.message, [{ text: t('ok') }]);
    }
  }, [deleteLine, reloadLines, refreshPlanStatuses, closeModal, showDialog, t]);

  const handleLongPressLine = useCallback((line) => {
    showDialog(
      t('delete_allocation'),
      t('delete_allocation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => handleDeleteLine(line.id) },
      ],
    );
  }, [showDialog, t, handleDeleteLine]);

  // Move a recurring line up/down within the recurring block and persist order.
  // Updates `lines` optimistically first so the reorder is visible immediately
  // (no lag waiting on the round-trip), then reconciles with the DB truth via
  // reloadLines() either way — on success to pick up any server-side
  // normalization, on failure to revert a reorder that didn't actually persist.
  // moveGuardRef (Fix 3, adversarial review round 2): neither move handler had
  // ANY double-tap guard before — two fast taps on the same arrow (or one tap
  // each on the recurring and one-off lists) could both read the same
  // pre-move `lines`/`recurringLines`/`oneOffLines` snapshot and fire two
  // overlapping reorder calls, the second clobbering the first's optimistic
  // update and persisting a wrong order. A synchronous ref (not `busy` state,
  // and not shared with the save guard above — a move shouldn't be blocked by
  // an unrelated in-flight save) closes that off the same way busyRef does.
  const handleMoveRecurring = useCallback(async (index, direction) => {
    if (moveGuardRef.current) return;
    const target = index + direction;
    if (target < 0 || target >= recurringLines.length) return;
    moveGuardRef.current = true;
    const reordered = recurringLines.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setLines([...reordered, ...oneOffLines]);
    try {
      await reorderRecurringLines(reordered.map(l => l.id));
      await reloadLines();
    } catch (error) {
      console.error('Failed to reorder recurring plan lines:', error);
      await reloadLines();
    } finally {
      moveGuardRef.current = false;
    }
  }, [recurringLines, oneOffLines, reorderRecurringLines, reloadLines]);

  // Move a one-off line up/down within this month's block and persist order.
  // Same optimistic-then-reconcile approach as handleMoveRecurring above.
  const handleMoveOneOff = useCallback(async (index, direction) => {
    if (moveGuardRef.current) return;
    if (!plan) return;
    const target = index + direction;
    if (target < 0 || target >= oneOffLines.length) return;
    moveGuardRef.current = true;
    const reordered = oneOffLines.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setLines([...recurringLines, ...reordered]);
    try {
      await reorderLines(plan.id, reordered.map(l => l.id));
      await reloadLines();
    } catch (error) {
      console.error('Failed to reorder plan lines:', error);
      await reloadLines();
    } finally {
      moveGuardRef.current = false;
    }
  }, [plan, oneOffLines, recurringLines, reorderLines, reloadLines]);

  const lineDisplayName = useCallback((line) => {
    if (line.label) return line.label;
    if (line.categoryId != null) return categoriesById.get(line.categoryId)?.name || t('allocation_unlinked');
    if (line.toAccountId != null) return accountsById.get(line.toAccountId)?.name || t('allocation_unlinked');
    return t('allocation_unlinked');
  }, [categoriesById, accountsById, t]);

  const lineIcon = useCallback((line) => {
    if (line.isBroken) return 'link-off';
    if (line.toAccountId != null) return 'bank-transfer';
    return categoriesById.get(line.categoryId)?.icon || 'shape-outline';
  }, [categoriesById]);

  // Shared row renderer for both the recurring block and this month's one-off
  // block — each list moves independently (own sort_order sequence), so `list`
  // and `onMove` are passed in per block.
  const renderLine = useCallback((line, index, list, onMove) => {
    const lineStatus = lineStatusById.get(line.id);
    const isBroken = line.isBroken || lineStatus?.broken;
    const lineCurrency = line.currency || planCurrency;
    return (
      <Pressable
        key={line.id}
        style={[styles.lineRow, index % 2 === 1 && { backgroundColor: colors.altRow }]}
        onPress={() => openEditLine(line)}
        onLongPress={() => handleLongPressLine(line)}
        accessibilityRole="button"
        accessibilityLabel={`${t('edit_allocation')}: ${lineDisplayName(line)}`}
        testID={`plan-line-${line.id}`}
      >
        <View style={styles.lineTop}>
          <Icon name={lineIcon(line)} size={20} color={colors.text} />
          <View style={styles.lineBody}>
            <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
              {lineDisplayName(line)}
            </Text>
            {line.isRecurring && (
              <Text style={[styles.recurringBadge, { color: colors.mutedText }]} numberOfLines={1}>
                {t('recurring_allocation')}
              </Text>
            )}
            {!!line.comment && (
              <Text style={[styles.lineComment, { color: colors.mutedText }]} numberOfLines={1}>
                {line.comment}
              </Text>
            )}
          </View>
          <Text style={[styles.lineAmount, { color: colors.text }]}>
            {Currency.formatAmount(line.amount, lineCurrency)} {line.isRecurring ? lineCurrency : ''}
          </Text>
          <View style={styles.moveButtons}>
            <Pressable
              onPress={() => onMove(index, -1)}
              disabled={index === 0}
              hitSlop={6}
              style={styles.moveButton}
              accessibilityRole="button"
              accessibilityLabel={t('move_up')}
              testID={`plan-line-up-${line.id}`}
            >
              <Icon name="chevron-up" size={20} color={index === 0 ? colors.border : colors.mutedText} />
            </Pressable>
            <Pressable
              onPress={() => onMove(index, 1)}
              disabled={index === list.length - 1}
              hitSlop={6}
              style={styles.moveButton}
              accessibilityRole="button"
              accessibilityLabel={t('move_down')}
              testID={`plan-line-down-${line.id}`}
            >
              <Icon name="chevron-down" size={20} color={index === list.length - 1 ? colors.border : colors.mutedText} />
            </Pressable>
          </View>
        </View>
        {isBroken ? (
          <View style={styles.brokenRow} testID={`plan-line-broken-${line.id}`}>
            <Icon name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={[styles.brokenText, { color: colors.danger }]} numberOfLines={1}>
              {t('relink_target')}
            </Text>
          </View>
        ) : lineStatus?.status === 'unconvertible' ? (
          // calculatePlanStatus couldn't find a rate to express this recurring
          // line's own currency in the plan's currency — showing its amount
          // formatted/labeled as planCurrency (like the progress bar below does)
          // would silently mislabel the real value. Show it in its OWN currency
          // instead, with the same unconvertible-warning language used elsewhere.
          <View style={styles.brokenRow} testID={`plan-line-unconvertible-${line.id}`}>
            <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
            <Text style={[styles.brokenText, { color: colors.mutedText }]} numberOfLines={1}>
              {t('graphs_currencies_not_converted')}: {Currency.formatAmount(lineStatus.amount, lineCurrency)} {lineCurrency}
            </Text>
          </View>
        ) : lineStatus ? (
          <StatusProgressBar
            status={{ ...lineStatus, spent: lineStatus.actual, currency: planCurrency }}
            compact
            showDetails
            style={styles.lineProgress}
          />
        ) : null}
      </Pressable>
    );
  }, [colors, t, lineStatusById, planCurrency, openEditLine, handleLongPressLine, lineDisplayName, lineIcon]);

  const hasAnyLines = recurringLines.length > 0 || oneOffLines.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="monthly-plan-section">
      {/* Month header with ‹ › navigation — rendered only when the section owns
          the month; when the host controls it a single shared header sits above. */}
      {!controlledMonth && (
        <View style={styles.monthHeader}>
          <Pressable
            onPress={handlePrev}
            hitSlop={8}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={t('previous_month')}
            testID="plan-prev-month"
          >
            <Icon name="chevron-left" size={26} color={colors.text} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]} testID="plan-month-label">
            {formatMonthLabel(month)}
          </Text>
          <Pressable
            onPress={handleNext}
            hitSlop={8}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel={t('next_month')}
            testID="plan-next-month"
          >
            <Icon name="chevron-right" size={26} color={colors.text} />
          </Pressable>
        </View>
      )}

      {/* Expected income (tap to edit) — only meaningful once a plan exists for
          this month; a plan-less month with only recurring lines gets one lazily
          the first time income or a one-off allocation is saved. */}
      {plan && (
        <Pressable
          style={[styles.incomeRow, { borderColor: colors.border }]}
          onPress={openIncomeEditor}
          accessibilityRole="button"
          accessibilityLabel={t('expected_income')}
          testID="plan-income-row"
        >
          <View style={styles.incomeLabel}>
            <Icon name="cash-plus" size={20} color={colors.text} />
            <Text style={[styles.incomeText, { color: colors.text }]}>{t('expected_income')}</Text>
          </View>
          <Text style={[styles.incomeAmount, { color: colors.text }]}>
            {planStatus
              ? `${Currency.formatAmount(planStatus.totals.actualIncome, planCurrency)} / ${Currency.formatAmount(totals.income, planCurrency)} ${planCurrency}`
              : `${Currency.formatAmount(totals.income, planCurrency)} ${planCurrency}`}
          </Text>
        </Pressable>
      )}

      {/* Recurring (global) allocations — shown for every month regardless of
          whether a plan was created for it. */}
      {recurringLines.map((line, index) => renderLine(line, index, recurringLines, handleMoveRecurring))}

      {/* This month's one-off allocations */}
      {oneOffLines.map((line, index) => renderLine(line, index, oneOffLines, handleMoveOneOff))}

      {/* Add allocation — always available: a recurring line needs no plan, a
          one-off one lazily creates the month's plan on save. */}
      <Pressable
        style={[styles.addRow, { borderColor: colors.border }]}
        onPress={openAddLine}
        accessibilityRole="button"
        accessibilityLabel={t('add_allocation')}
        testID="plan-add-line"
      >
        <Icon name="plus" size={20} color={colors.primary} />
        <Text style={[styles.addText, { color: colors.primary }]}>{t('add_allocation')}</Text>
      </Pressable>

      {!plan && (
        <View style={styles.emptyPlan} testID="plan-empty-state">
          <Icon name="clipboard-text-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>{t('no_plan_for_month')}</Text>
          <View style={styles.emptyActions}>
            <Pressable
              style={[styles.primaryAction, { backgroundColor: colors.primary }]}
              onPress={handleCreateEmpty}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('create_empty_plan')}
              testID="plan-create-empty"
            >
              <Icon name="plus" size={18} color={colors.text} />
              <Text style={[styles.primaryActionText, { color: colors.text }]}>{t('create_empty_plan')}</Text>
            </Pressable>
            {prevPlanExists && (
              <Pressable
                style={[styles.secondaryAction, { borderColor: colors.border }]}
                onPress={handleCopyLast}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('copy_from_last_month')}
                testID="plan-copy-last"
              >
                <Icon name="content-copy" size={18} color={colors.text} />
                <Text style={[styles.secondaryActionText, { color: colors.text }]}>{t('copy_from_last_month')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {(plan || hasAnyLines) && (
        <>
          {/* Totals: allocated vs actual, then the planned remainder */}
          <View style={[styles.totalsRow, { borderTopColor: colors.border }]} testID="plan-totals">
            <Text style={[styles.totalsLabel, { color: colors.mutedText }]}>
              {t('allocated')}: {Currency.formatAmount(displayAllocated, planCurrency)} {planCurrency}
            </Text>
            {planStatus ? (
              <Text style={[styles.totalsLabel, { color: colors.mutedText }]} testID="plan-actual-total">
                {t('actual')}: {Currency.formatAmount(planStatus.totals.totalActual, planCurrency)} {planCurrency}
              </Text>
            ) : (
              remainderNode
            )}
          </View>
          {planStatus && (
            <View style={styles.remainderRow}>
              {remainderNode}
            </View>
          )}
          {planStatus?.unconvertible?.length > 0 && (
            <View style={styles.convertWarning} testID="plan-unconverted-warning">
              <Icon name="alert-circle-outline" size={14} color={colors.mutedText} />
              <Text style={[styles.convertWarningText, { color: colors.mutedText }]}>
                {t('graphs_currencies_not_converted')}: {planStatus.unconvertible.join(', ')}
              </Text>
            </View>
          )}
        </>
      )}

      <BudgetPlanLineModal
        visible={modal.visible}
        mode={modal.mode}
        line={modal.line}
        currency={planCurrency}
        initialIncome={totals.income}
        expenseCategories={expenseCategories}
        accounts={accounts}
        saving={busy}
        onSaveLine={handleSaveLine}
        onSaveIncome={handleSaveIncome}
        onDeleteLine={handleDeleteLine}
        onClose={closeModal}
      />
    </View>
  );
});

MonthlyPlanSection.displayName = 'MonthlyPlanSection';
MonthlyPlanSection.propTypes = {
  currency: PropTypes.string,
  expenseCategories: PropTypes.array,
  accounts: PropTypes.array,
  month: PropTypes.string,
};

export default MonthlyPlanSection;

const styles = StyleSheet.create({
  addRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  addText: {
    fontSize: 15,
    fontWeight: '600',
  },
  brokenRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  brokenText: {
    flex: 1,
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  convertWarning: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.sm,
  },
  convertWarningText: {
    flex: 1,
    fontSize: 12,
  },
  emptyActions: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
    width: '100%',
  },
  emptyPlan: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  emptyText: {
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  incomeAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  incomeLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  incomeRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  incomeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  lineAmount: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  lineBody: {
    flex: 1,
    marginLeft: 10,
  },
  lineComment: {
    fontSize: 12,
    marginTop: 1,
  },
  lineName: {
    fontSize: 15,
  },
  lineProgress: {
    marginBottom: 0,
    marginTop: 6,
  },
  lineRow: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: SPACING.sm,
  },
  lineTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  moveButton: {
    paddingHorizontal: 2,
  },
  moveButtons: {
    flexDirection: 'row',
    marginLeft: 6,
  },
  navButton: {
    padding: 4,
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  recurringBadge: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  remainderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalsLabel: {
    fontSize: 14,
  },
  totalsRemainder: {
    fontSize: 14,
    fontWeight: '700',
  },
  totalsRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
});
