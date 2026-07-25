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
import PlanLineRow from './PlanLineRow';
import PlanTemplateSummary from './PlanTemplateSummary';
import { currentMonthKey, addMonths, formatMonthLabel } from '../../utils/monthUtils';

const CLOSED_MODAL = { visible: false, line: null, kind: 'expense' };

/**
 * MonthlyPlanSection — the unified Budgets list: one month-scoped envelope view
 * with an income section (expected vs actual, with one-tap executable income
 * templates), an allocation section (per-category / transfer targets with
 * plan-vs-actual progress bars and their own executable templates), and the
 * month's totals.
 *
 * Month can be controlled by the host (Budgets screen) via the `month` prop so a
 * single shared ‹ Month › header drives the whole screen; in that mode the
 * section's own header is hidden and the host owns navigation. When `month` is
 * omitted the section stays self-contained and renders its own month header
 * (uncontrolled, used in isolation/tests).
 *
 * Budgets v3 phase 2 consolidated the old per-category `budgets` (v1) model into
 * RECURRING lines here: a recurring line is a global template (not scoped to any
 * one month's plan) that applies to every calendar month automatically. Lines
 * shown for a month are the union of every recurring line and the month's own
 * one-off lines (see BudgetPlansDB.getLinesForMonth).
 *
 * Phase 3 then absorbed the standalone planned operations: a line may carry an
 * EXECUTABLE TEMPLATE (an account to create the operation in), so "Rent 65 000/mo,
 * recurring, paid from the Ameria card" is declared once and is simultaneously the
 * cap, the allocation and the one-tap payable. Income lines replace the plan's
 * single stored expected-income figure — their sum IS the expected income.
 * Exposes `openAddLine` via ref so a host FAB can open the "add allocation" flow
 * without lifting the modal's state.
 */
const MonthlyPlanSection = forwardRef(function MonthlyPlanSection({
  currency = 'USD',
  expenseCategories = [],
  incomeCategories = [],
  accounts = [],
  month: monthProp = null,
  onNotify = null,
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
    addLine,
    addRecurringLine,
    updateLine,
    deleteLine,
    reorderLines,
    reorderRecurringLines,
    getLinesForMonth,
    executeLine,
    markLineExecuted,
    unmarkLineExecuted,
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
  // And one for the execute/mark/undo actions: executing twice would create the
  // operation twice, which is precisely the double-charge executeAndMark exists
  // to prevent.
  const executeGuardRef = useRef(false);

  const plan = useMemo(() => plans.find(p => p.month === month) || null, [plans, month]);
  const prevMonth = useMemo(() => addMonths(month, -1), [month]);
  const prevPlanExists = useMemo(() => plans.some(p => p.month === prevMonth), [plans, prevMonth]);
  // Execution creates an operation dated today, so it is only offered while the
  // shown month IS the current one; other months still show the templates and
  // their (historical) done state.
  const isCurrentMonth = month === currentMonthKey();

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
    () => new Map([...expenseCategories, ...incomeCategories].map(c => [c.id, c])),
    [expenseCategories, incomeCategories],
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

  // Income lines declare the expected income; the rest allocate it. Recurring
  // (global template) lines and this month's one-off lines are edited and
  // reordered independently — each has its own sort_order sequence at the DB
  // layer (see BudgetPlansDB) — so allocations are split for move actions.
  const incomeLines = useMemo(() => lines.filter(l => l.kind === 'income'), [lines]);
  const allocationLines = useMemo(() => lines.filter(l => l.kind !== 'income'), [lines]);
  const recurringLines = useMemo(() => allocationLines.filter(l => l.isRecurring), [allocationLines]);
  const oneOffLines = useMemo(() => allocationLines.filter(l => !l.isRecurring), [allocationLines]);

  // Live totals: allocated = Σ allocation amounts, expected = Σ income lines,
  // remainder = expected − allocated. Same precise decimal math as
  // BudgetPlansDB.getPlanTotals, computed locally so the numbers update
  // immediately as lines change, BEFORE the async plan status lands. A line in
  // another currency is skipped in this local estimate (converting it needs an
  // exchange-rate lookup, which is exactly what planStatus already did
  // asynchronously) — the render below prefers planStatus.totals once available.
  const totals = useMemo(() => {
    let allocated = '0';
    let income = '0';
    let hasIncomeLine = false;
    for (const line of lines) {
      const lineCurrency = line.currency || planCurrency;
      if (lineCurrency !== planCurrency) continue;
      if (line.kind === 'income') {
        hasIncomeLine = true;
        income = Currency.add(income, line.amount, planCurrency);
        continue;
      }
      allocated = Currency.add(allocated, line.amount, planCurrency);
    }
    // Fallback for a plan whose expected income was never bridged into lines
    // (migration 0020 only skips that when income templates already exist).
    if (!hasIncomeLine && plan?.expectedIncome) {
      income = Currency.add(plan.expectedIncome, '0', planCurrency);
    }
    const remainder = Currency.subtract(income, allocated, planCurrency);
    return { income, allocated, remainder };
  }, [plan, lines, planCurrency]);

  // Once the plan status has resolved (and is not stale — see freshPlanStatus
  // above), prefer its totals: those are computed with correct cross-currency
  // conversion for lines whose currency differs from the plan's (see
  // BudgetPlansDB.calculatePlanStatus). The local `totals` memo above is only a
  // same-currency estimate and undercounts a mixed-currency plan; showing it
  // after planStatus is ready would silently contradict the more accurate number
  // the app already computed. But a STALE planStatus is worse than either — it
  // would contradict the mutation just saved — so a stale one is treated as "not
  // ready yet" and the fresh local estimate is shown instead.
  const displayAllocated = freshPlanStatus ? freshPlanStatus.totals.allocated : totals.allocated;
  const displayExpectedIncome = freshPlanStatus ? freshPlanStatus.totals.expectedIncome : totals.income;
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

  const openAddLine = useCallback(() => {
    setModal({ visible: true, line: null, kind: 'expense' });
  }, []);
  const openAddIncome = useCallback(() => {
    setModal({ visible: true, line: null, kind: 'income' });
  }, []);
  const openEditLine = useCallback((line) => {
    setModal({ visible: true, line, kind: line.kind });
  }, []);
  const closeModal = useCallback(() => setModal(CLOSED_MODAL), []);

  // Let a host FAB (BudgetScreen) open the "add allocation" flow without
  // lifting this section's modal state up.
  useImperativeHandle(ref, () => ({ openAddLine, openAddIncome }), [openAddLine, openAddIncome]);

  // A one-off line needs a plan to hang off; auto-create an empty one for the
  // shown month the first time one is saved, so recurring lines showing for a
  // plan-less month don't block entry.
  const ensurePlan = useCallback(async () => {
    if (plan) return plan;
    return addPlan({ month, currency: currency || 'USD' });
  }, [plan, addPlan, month, currency]);

  // Line-level context actions don't surface their own errors (unlike plan-level
  // ones), so report failures here and keep the editor open on error rather than
  // silently dropping the user's input.
  //
  // Currency conversion note: the recurring<->one-off scope toggle and a direct
  // currency edit both change what a line's amount MEANS, and that invariant
  // lives in BudgetPlansDB.updateLine (the single choke point for every
  // currency-affecting update) — this handler just forwards the raw
  // amount/currency the user entered and lets the DB layer convert (or reject
  // with `exchange_rate_unavailable` when no rate exists, translated below).
  const handleSaveLine = useCallback(async (lineData) => {
    // Same double-tap guard as handleCreateEmpty: the one-off branch below
    // lazily creates the plan via ensurePlan(), which races the same way a bare
    // "create empty plan" tap does.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { isRecurring: wantsRecurring, currency: lineCurrency, ...core } = lineData;
      const wasRecurring = modal.line?.isRecurring ?? false;
      const scopeChanged = !!modal.line && wasRecurring !== wantsRecurring;
      const sameKindLines = core.kind === 'income' ? incomeLines : allocationLines;

      if (wantsRecurring) {
        if (modal.line) {
          const updates = { ...core, currency: lineCurrency };
          if (scopeChanged) updates.isRecurring = true;
          await updateLine(modal.line.id, updates);
        } else {
          await addRecurringLine({
            ...core,
            currency: lineCurrency,
            sortOrder: sameKindLines.filter(l => l.isRecurring).length,
          });
        }
      } else {
        const targetPlan = await ensurePlan();
        if (modal.line) {
          const updates = { ...core, currency: lineCurrency };
          if (scopeChanged) {
            updates.isRecurring = false;
            updates.planId = targetPlan.id;
          }
          await updateLine(modal.line.id, updates);
        } else {
          await addLine(targetPlan.id, {
            ...core,
            currency: lineCurrency,
            sortOrder: sameKindLines.filter(l => !l.isRecurring).length,
          });
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
  }, [modal.line, updateLine, addLine, addRecurringLine, incomeLines, allocationLines,
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

  const confirmDeleteLine = useCallback((line) => {
    showDialog(
      t('delete_allocation'),
      t('delete_allocation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => handleDeleteLine(line.id) },
      ],
    );
  }, [showDialog, t, handleDeleteLine]);

  /* ── Executable templates (former Planned tab mechanics) ─────────────────── */

  // Every execution path funnels through here so the double-tap guard, the line
  // reload and the user feedback can't drift apart between them.
  const runExecutionAction = useCallback(async (action, notifyKey) => {
    if (executeGuardRef.current) return;
    executeGuardRef.current = true;
    try {
      await action();
      await reloadLines();
      setStatusStale(true);
      refreshPlanStatuses?.();
      onNotify?.(t(notifyKey));
    } catch (error) {
      // Error dialog already shown by the actions context.
    } finally {
      executeGuardRef.current = false;
    }
  }, [reloadLines, refreshPlanStatuses, onNotify, t]);

  const handleExecute = useCallback((line) => (
    runExecutionAction(() => executeLine(line), 'added_to_operations')
  ), [runExecutionAction, executeLine]);

  const handleMarkExecuted = useCallback((line) => (
    runExecutionAction(() => markLineExecuted(line), 'marked_as_executed')
  ), [runExecutionAction, markLineExecuted]);

  const handleUndoExecuted = useCallback((line) => (
    runExecutionAction(() => unmarkLineExecuted(line.id), 'marked_as_pending')
  ), [runExecutionAction, unmarkLineExecuted]);

  const handleLongPressLine = useCallback((line) => {
    const executed = line.lastExecutedMonth === month;
    const executionActions = [];
    if (line.hasTemplate && isCurrentMonth) {
      if (executed) {
        executionActions.push({ text: t('undo'), onPress: () => handleUndoExecuted(line) });
      } else {
        executionActions.push(
          { text: t('execute'), onPress: () => handleExecute(line) },
          { text: t('mark_as_executed'), onPress: () => handleMarkExecuted(line) },
        );
      }
    }
    showDialog(
      t('select_action'),
      line.label || '',
      [
        ...executionActions,
        { text: t('edit'), onPress: () => openEditLine(line) },
        { text: t('delete'), style: 'destructive', onPress: () => confirmDeleteLine(line) },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [month, isCurrentMonth, t, showDialog, handleExecute, handleMarkExecuted, handleUndoExecuted,
    openEditLine, confirmDeleteLine]);

  /* ── Reordering ──────────────────────────────────────────────────────────── */

  // Move a line up/down within its block and persist the order. Updates `lines`
  // optimistically first so the reorder is visible immediately (no lag waiting on
  // the round-trip), then reconciles with the DB truth via reloadLines() either
  // way — on success to pick up any server-side normalization, on failure to
  // revert a reorder that didn't actually persist.
  // moveGuardRef (Fix 3, adversarial review round 2): without a guard, two fast
  // taps on the same arrow (or one tap each on the recurring and one-off lists)
  // could both read the same pre-move snapshot and fire two overlapping reorder
  // calls, the second clobbering the first's optimistic update and persisting a
  // wrong order. A synchronous ref (not `busy` state, and not shared with the
  // save guard above — a move shouldn't be blocked by an unrelated in-flight
  // save) closes that off.
  const moveInBlock = useCallback(async (block, index, direction, recurringBlock) => {
    if (moveGuardRef.current) return;
    const target = index + direction;
    if (target < 0 || target >= block.length) return;
    if (!recurringBlock && !plan) return;
    moveGuardRef.current = true;
    const reordered = block.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    // Blocks are derived by filtering `lines`, so only the relative order WITHIN
    // the moved block matters; the other lines keep theirs.
    const blockIds = new Set(block.map(l => l.id));
    setLines(prev => [...reordered, ...prev.filter(l => !blockIds.has(l.id))]);
    try {
      const orderedIds = reordered.map(l => l.id);
      if (recurringBlock) {
        await reorderRecurringLines(orderedIds);
      } else {
        await reorderLines(plan.id, orderedIds);
      }
      await reloadLines();
    } catch (error) {
      console.error('Failed to reorder plan lines:', error);
      await reloadLines();
    } finally {
      moveGuardRef.current = false;
    }
  }, [plan, reorderRecurringLines, reorderLines, reloadLines]);

  const handleMoveRecurring = useCallback(
    (index, direction) => moveInBlock(recurringLines, index, direction, true),
    [moveInBlock, recurringLines],
  );
  const handleMoveOneOff = useCallback(
    (index, direction) => moveInBlock(oneOffLines, index, direction, false),
    [moveInBlock, oneOffLines],
  );

  /* ── Rendering ───────────────────────────────────────────────────────────── */

  const lineDisplayName = useCallback((line) => {
    if (line.label) return line.label;
    if (line.categoryId != null) return categoriesById.get(line.categoryId)?.name || t('allocation_unlinked');
    if (line.toAccountId != null) return accountsById.get(line.toAccountId)?.name || t('allocation_unlinked');
    if (line.kind === 'income') return t('expected_income');
    return t('allocation_unlinked');
  }, [categoriesById, accountsById, t]);

  const lineIcon = useCallback((line) => {
    if (line.isBroken) return 'link-off';
    if (line.toAccountId != null) return 'bank-transfer';
    const categoryIcon = categoriesById.get(line.categoryId)?.icon;
    if (categoryIcon) return categoryIcon;
    return line.kind === 'income' ? 'cash-plus' : 'shape-outline';
  }, [categoriesById]);

  // Shared row renderer for every block — each list moves independently (own
  // sort_order sequence), so `list` and `onMove` are passed in per block.
  const renderLine = useCallback((line, index, list, onMove) => {
    const executed = line.lastExecutedMonth === month;
    return (
      <PlanLineRow
        key={line.id}
        line={line}
        index={index}
        listLength={list.length}
        name={lineDisplayName(line)}
        icon={lineIcon(line)}
        status={lineStatusById.get(line.id) || null}
        planCurrency={planCurrency}
        colors={colors}
        t={t}
        executed={executed}
        canExecute={line.hasTemplate && isCurrentMonth && !executed}
        canUndo={line.hasTemplate && isCurrentMonth && executed}
        showProgress={line.kind !== 'income'}
        showMove={!!onMove}
        onPress={openEditLine}
        onLongPress={handleLongPressLine}
        onMove={onMove}
        onExecute={handleExecute}
        onMarkExecuted={handleMarkExecuted}
        onUndo={handleUndoExecuted}
      />
    );
  }, [colors, t, month, isCurrentMonth, lineStatusById, planCurrency, openEditLine,
    handleLongPressLine, lineDisplayName, lineIcon, handleExecute, handleMarkExecuted,
    handleUndoExecuted]);

  const hasAnyLines = lines.length > 0;

  const renderAddRow = (label, onPress, testID) => (
    <Pressable
      style={[styles.addRow, { borderColor: colors.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name="plus" size={20} color={colors.primary} />
      <Text style={[styles.addText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <PlanTemplateSummary lines={lines} month={month} colors={colors} t={t} />

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

        {/* Income: the month's expected income is the sum of these lines, shown
            against the income actually received. */}
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]} testID="plan-income-header">
          <View style={styles.sectionTitleGroup}>
            <Icon name="cash-plus" size={20} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('income')}</Text>
          </View>
          <Text style={[styles.sectionAmount, { color: colors.text }]} testID="plan-income-total">
            {planStatus
              ? `${Currency.formatAmount(planStatus.totals.actualIncome, planCurrency)} / ${Currency.formatAmount(displayExpectedIncome, planCurrency)} ${planCurrency}`
              : `${Currency.formatAmount(displayExpectedIncome, planCurrency)} ${planCurrency}`}
          </Text>
        </View>

        {incomeLines.map((line, index) => renderLine(line, index, incomeLines, null))}

        {renderAddRow(t('add_income'), openAddIncome, 'plan-add-income')}

        {/* Allocations: recurring (global) ones apply to every month, one-off ones
            belong to this month's plan. */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpaced, { borderBottomColor: colors.border }]} testID="plan-allocations-header">
          <View style={styles.sectionTitleGroup}>
            <Icon name="chart-donut" size={20} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('allocations')}</Text>
          </View>
        </View>

        {recurringLines.map((line, index) => renderLine(line, index, recurringLines, handleMoveRecurring))}
        {oneOffLines.map((line, index) => renderLine(line, index, oneOffLines, handleMoveOneOff))}

        {/* Add allocation — always available: a recurring line needs no plan, a
            one-off one lazily creates the month's plan on save. */}
        {renderAddRow(t('add_allocation'), openAddLine, 'plan-add-line')}

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
          line={modal.line}
          initialKind={modal.kind}
          currency={planCurrency}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          accounts={accounts}
          saving={busy}
          onSaveLine={handleSaveLine}
          onDeleteLine={handleDeleteLine}
          onClose={closeModal}
        />
      </View>
    </>
  );
});

MonthlyPlanSection.displayName = 'MonthlyPlanSection';
MonthlyPlanSection.propTypes = {
  currency: PropTypes.string,
  expenseCategories: PropTypes.array,
  incomeCategories: PropTypes.array,
  accounts: PropTypes.array,
  month: PropTypes.string,
  onNotify: PropTypes.func,
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
  sectionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  sectionHeaderSpaced: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
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
