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
import usePlanLineAmounts from '../../hooks/usePlanLineAmounts';
import { SPACING } from '../../styles/layout';
import { envelopeHue } from '../../styles/envelopePalette';
import BudgetPlanLineModal from './BudgetPlanLineModal';
import BudgetLineGroupModal from './BudgetLineGroupModal';
import PlanLineRow from './PlanLineRow';
import PlanGroupRow from './PlanGroupRow';
import { currentMonthKey, addMonths, formatMonthLabel } from '../../utils/monthUtils';

const CLOSED_MODAL = { visible: false, line: null, kind: 'expense' };
const CLOSED_GROUP_MODAL = { visible: false, group: null };

// Key under which a group's own (override) amount rides along in the shared
// conversion map — see the `amountSources` memo. Groups and lines have separate
// ID spaces, so the prefix is what keeps a group from ever shadowing a line.
const groupAmountKey = (groupId) => `group:${groupId}`;

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
  onTotalsChange = null,
}, ref) {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();
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
    getLineGroups,
    addLineGroup,
    updateLineGroup,
    deleteLineGroup,
    reorderLineGroups,
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
  // Groups are global (not month-scoped), but they are loaded alongside the
  // month's lines: the two are read together on every render below, and fetching
  // them from separate effects would let the list render a group's children under
  // a header that has not arrived yet.
  const [groups, setGroups] = useState([]);
  const [modal, setModal] = useState(CLOSED_MODAL);
  const [groupModal, setGroupModal] = useState(CLOSED_GROUP_MODAL);
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
  // The currency the section READS in, which is the one the host's chip names —
  // not the one the plan happens to be stored in. Those are different things: a
  // plan created back when the only account was in RUB stays a RUB row forever,
  // while the person looking at it today wants the month in AMD. Reading the
  // stored currency first made the chip decorative — every figure kept coming out
  // in the plan's currency however the chip was set. `plan?.currency` survives
  // only as the fallback for a host that names no currency at all.
  const planCurrency = currency || plan?.currency || '';

  // The screen shows one currency and the host header names it, next to the
  // control that changes it. Repeating the code on the summary strip, the income
  // header and both totals printed "RUB" five times on one screen for a fact
  // that cannot vary within it. Uncontrolled mode has no host header, so there
  // the code stays — it would otherwise appear nowhere at all.
  const currencySuffix = controlledMonth ? '' : ` ${planCurrency}`;

  // Plan-vs-actual status for the shown month (may be null while computing).
  const storedPlanStatus = (planId && planStatuses && planStatuses.get(planId)) || null;
  // A status computed in another currency is not this section's status. The
  // context recomputes them whenever the display currency changes, but that is
  // async: for a render or two after the chip is switched the map still holds the
  // previous currency's figures, and printing those under rows already converted
  // to the new one is the mixed-units bug the conversion exists to prevent. Treat
  // a currency mismatch exactly like "not computed yet" — the local same-currency
  // estimate below covers the gap.
  const planStatus = storedPlanStatus && storedPlanStatus.currency === planCurrency
    ? storedPlanStatus
    : null;

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

  // Group statuses arrive on the same object and go stale the same way, so they
  // read off `planStatus` exactly as the line ones do.
  const groupStatusById = useMemo(() => {
    const map = new Map();
    for (const groupStatus of planStatus?.groups || []) {
      map.set(groupStatus.groupId, groupStatus);
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
      const [data, groupData] = await Promise.all([getLinesForMonth(month), getLineGroups()]);
      setLines(data);
      setGroups(groupData);
    } catch (error) {
      console.error('Failed to load plan lines:', error);
      setLines([]);
      setGroups([]);
    }
  }, [getLinesForMonth, getLineGroups, month]);

  // Load lines whenever the shown month changes (navigation, plan create/copy).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, groupData] = await Promise.all([getLinesForMonth(month), getLineGroups()]);
        if (!cancelled) {
          setLines(data);
          setGroups(groupData);
        }
      } catch (error) {
        console.error('Failed to load plan lines:', error);
        if (!cancelled) {
          setLines([]);
          setGroups([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [month, getLinesForMonth, getLineGroups]);

  // Income lines declare the expected income; the rest allocate it. Recurring
  // (global template) lines and this month's one-off lines are edited and
  // reordered independently — each has its own sort_order sequence at the DB
  // layer (see BudgetPlansDB) — so allocations are split for move actions.
  const incomeLines = useMemo(() => lines.filter(l => l.kind === 'income'), [lines]);
  const allocationLines = useMemo(() => lines.filter(l => l.kind !== 'income'), [lines]);

  // Group membership (migration 0022). A line pointing at a group this screen
  // doesn't know about is treated as ungrouped rather than vanishing into a
  // header that never renders.
  const groupIdSet = useMemo(() => new Set(groups.map(g => g.id)), [groups]);
  const isGrouped = useCallback(
    (line) => line.groupId != null && groupIdSet.has(line.groupId),
    [groupIdSet],
  );
  const recurringLines = useMemo(
    () => allocationLines.filter(l => l.isRecurring && !isGrouped(l)),
    [allocationLines, isGrouped],
  );
  const oneOffLines = useMemo(
    () => allocationLines.filter(l => !l.isRecurring && !isGrouped(l)),
    [allocationLines, isGrouped],
  );

  // Every line's target amount expressed in the screen's single currency — plus
  // each OVERRIDE group's own figure, which is priced in a currency of its own
  // for the same reason a recurring line is (a group belongs to no plan). Sharing
  // one conversion pass is what keeps a group's row and its children in the same
  // units. The array keeps `lines`' identity when no group overrides exist, so
  // the common case adds no work and no extra render.
  const amountSources = useMemo(() => {
    const overrides = groups
      .filter(g => !g.isDerived && g.amount != null)
      .map(g => ({ id: groupAmountKey(g.id), amount: g.amount, currency: g.currency }));
    return overrides.length > 0 ? [...lines, ...overrides] : lines;
  }, [lines, groups]);
  const { amountById, converting } = usePlanLineAmounts(amountSources, planCurrency);

  // Live totals: allocated = Σ allocation amounts, expected = Σ income lines,
  // remainder = expected − allocated. Same precise decimal math as
  // BudgetPlansDB.getPlanTotals, computed locally so the numbers update
  // immediately as lines change, BEFORE the async plan status lands. A line
  // whose currency has no rate is absent from `amountById` and drops out of the
  // estimate — the render below prefers planStatus.totals once available, and
  // those flag the currency via the unconvertible warning.
  const totals = useMemo(() => {
    let allocated = '0';
    let income = '0';
    let hasIncomeLine = false;
    // Per-group child sums, so an override group can swap its own figure in for
    // them below — the same correction calculatePlanStatus makes server-side.
    const childSumByGroup = new Map();
    for (const line of lines) {
      const amount = amountById.get(line.id);
      if (amount == null) continue;
      if (line.kind === 'income') {
        hasIncomeLine = true;
        income = Currency.add(income, amount, planCurrency);
        continue;
      }
      allocated = Currency.add(allocated, amount, planCurrency);
      if (line.groupId != null) {
        childSumByGroup.set(
          line.groupId,
          Currency.add(childSumByGroup.get(line.groupId) ?? '0', amount, planCurrency),
        );
      }
    }
    // An override REPLACES its children's sum: the user said the envelope is
    // worth this much whatever its parts add up to (see the migration's note).
    // A group with no line in this month contributes nothing either way.
    for (const group of groups) {
      if (group.isDerived) continue;
      const childSum = childSumByGroup.get(group.id);
      const groupAmount = amountById.get(groupAmountKey(group.id));
      if (childSum == null || groupAmount == null) continue;
      allocated = Currency.add(
        Currency.subtract(allocated, childSum, planCurrency),
        groupAmount,
        planCurrency,
      );
    }
    // Fallback for a plan whose expected income was never bridged into lines
    // (migration 0020 only skips that when income templates already exist).
    if (!hasIncomeLine && plan?.expectedIncome) {
      income = Currency.add(plan.expectedIncome, '0', planCurrency);
    }
    const remainder = Currency.subtract(income, allocated, planCurrency);
    return { income, allocated, remainder };
  }, [plan, lines, groups, amountById, planCurrency]);

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

  // The remainder is `expected income − allocated`. With no income declared yet
  // there is nothing to allocate FROM, so the figure degenerates into "minus
  // everything you planned" and renders in alarm red the moment a first-time user
  // adds their first line — even while the month's REAL income sits in the header
  // right above it. Gate on the very figure the income header prints, so the two
  // can never disagree (deriving it from the lines separately would count an
  // income line in another currency that `totals` deliberately skipped).
  const hasIncomeBasis = !Currency.isZero(displayExpectedIncome);

  // The remainder is the one figure on this screen a person acts on — "what can
  // I still commit this month" — so the host lifts it into the sticky header
  // rather than leaving it in muted 14px at the bottom of a long scrolling card.
  // Reported rather than lifted wholesale: computing it needs the lines, the
  // plan status and the staleness gate above, all of which live here.
  // `allocated` and `actual` ride along for the same reason: they used to sit in
  // 12px muted type at the very bottom of the card, which on a plan of any
  // length means below the fold and half-covered by the FAB. They are the
  // month's two orientation figures, so they belong beside the one figure the
  // remainder answers with.
  const displayActual = freshPlanStatus ? freshPlanStatus.totals.totalActual : null;
  useEffect(() => {
    onTotalsChange?.({
      remainder: displayRemainder,
      hasIncomeBasis,
      currency: planCurrency,
      allocated: displayAllocated,
      actual: displayActual,
    });
  }, [onTotalsChange, displayRemainder, hasIncomeBasis, planCurrency, displayAllocated, displayActual]);

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
      showDialog(t('error'), message, [{ text: t('ok') }]);
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
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
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

  // The label a row shows — a line's own `label` is optional, so it is not a
  // usable title on its own. Hoisted above the handlers that consume it.
  const lineDisplayName = useCallback((line) => {
    if (line.label) return line.label;
    const categoryIds = line.categoryIds ?? (line.categoryId != null ? [line.categoryId] : []);
    if (categoryIds.length > 0) {
      const first = categoriesById.get(categoryIds[0])?.name || t('allocation_unlinked');
      // A multi-category line names its first category and counts the rest, the
      // same shorthand the editor's target row uses. The label field is right
      // there for anyone who wants "Eating out" instead of "Groceries +2".
      return categoryIds.length > 1 ? `${first} +${categoryIds.length - 1}` : first;
    }
    if (line.toAccountId != null) return accountsById.get(line.toAccountId)?.name || t('allocation_unlinked');
    if (line.kind === 'income') return t('expected_income');
    return t('allocation_unlinked');
  }, [categoriesById, accountsById, t]);

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

  // The name to persist on the created operation, so it is recognisable in the
  // operations list instead of landing there blank whenever the line has no
  // explicit label (the common case — the label field is optional). Deliberately
  // NOT lineDisplayName: that falls back to translated UI strings, and writing
  // one into the database would freeze today's language into stored data.
  const lineOperationName = useCallback((line) => (
    line.label
    || (line.categoryId != null ? categoriesById.get(line.categoryId)?.name : null)
    || (line.toAccountId != null ? accountsById.get(line.toAccountId)?.name : null)
    || null
  ), [categoriesById, accountsById]);

  const handleExecute = useCallback((line) => (
    runExecutionAction(() => executeLine(line, lineOperationName(line)), 'added_to_operations')
  ), [runExecutionAction, executeLine, lineOperationName]);

  const handleMarkExecuted = useCallback((line) => (
    runExecutionAction(() => markLineExecuted(line), 'marked_as_executed')
  ), [runExecutionAction, markLineExecuted]);

  const handleUndoExecuted = useCallback((line) => (
    runExecutionAction(() => unmarkLineExecuted(line.id), 'marked_as_pending')
  ), [runExecutionAction, unmarkLineExecuted]);

  // `context` carries the line's position in its own block plus that block's move
  // handler — reordering used to be a pair of chevrons on every row, which cost
  // 40dp of horizontal space next to the amount on all of them and took one tap
  // per position moved. It lives here now, where it is out of the way until asked
  // for and sits next to the other whole-row actions.
  const handleLongPressLine = useCallback((line, index, listLength, onMove) => {
    const executed = line.lastExecutedMonth === month;
    const executionActions = [];
    if (line.hasTemplate && isCurrentMonth) {
      if (executed) {
        // `undo_execution`, not the bare `undo`: in several languages (Russian
        // among them) "Undo" and "Cancel" collapse into near-identical words,
        // and this sheet shows both right next to each other.
        executionActions.push({ text: t('undo_execution'), onPress: () => handleUndoExecuted(line) });
      } else {
        executionActions.push(
          { text: t('execute'), onPress: () => handleExecute(line) },
          { text: t('mark_as_executed'), onPress: () => handleMarkExecuted(line) },
        );
      }
    }
    const moveActions = [];
    if (onMove) {
      // Offered only where the move can actually land, so the sheet never shows
      // an action that silently does nothing.
      if (index > 0) {
        moveActions.push({ text: t('move_up'), onPress: () => onMove(index, -1) });
      }
      if (index < listLength - 1) {
        moveActions.push({ text: t('move_down'), onPress: () => onMove(index, 1) });
      }
    }
    showDialog(
      t('select_action'),
      lineDisplayName(line),
      [
        ...executionActions,
        { text: t('edit'), onPress: () => openEditLine(line) },
        ...moveActions,
        { text: t('delete'), style: 'destructive', onPress: () => confirmDeleteLine(line) },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [month, isCurrentMonth, t, showDialog, handleExecute, handleMarkExecuted, handleUndoExecuted,
    openEditLine, confirmDeleteLine, lineDisplayName]);

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

  /* ── Groups (migration 0022) ─────────────────────────────────────────────── */

  // The groups that have something to show THIS month, each with its children
  // split by scope — recurring and one-off lines keep separate sort_order
  // sequences at the DB layer, so they also move within separate blocks here.
  const groupViews = useMemo(() => {
    const childrenByGroup = new Map();
    for (const line of allocationLines) {
      if (!isGrouped(line)) continue;
      const current = childrenByGroup.get(line.groupId);
      if (current) current.push(line);
      else childrenByGroup.set(line.groupId, [line]);
    }
    return groups
      .filter(group => childrenByGroup.has(group.id))
      .map((group) => {
        const children = childrenByGroup.get(group.id);
        // The derived figure the group shows until (and unless) the async status
        // lands: the same sum, from the same converted amounts the rows print.
        let derived = '0';
        for (const child of children) {
          const amount = amountById.get(child.id);
          if (amount != null) derived = Currency.add(derived, amount, planCurrency);
        }
        const override = amountById.get(groupAmountKey(group.id));
        return {
          group,
          children,
          recurring: children.filter(l => l.isRecurring),
          oneOff: children.filter(l => !l.isRecurring),
          displayAmount: group.isDerived ? derived : (override ?? null),
          derived,
        };
      });
  }, [groups, allocationLines, isGrouped, amountById, planCurrency]);

  // One stable pair of movers per group, rebuilt only when the blocks themselves
  // change — building them inline in the render would hand every child row a new
  // `onMove` on each pass and defeat PlanLineRow's memo.
  const groupMovers = useMemo(() => {
    const map = new Map();
    for (const view of groupViews) {
      map.set(`${view.group.id}|r`, (index, direction) => moveInBlock(view.recurring, index, direction, true));
      map.set(`${view.group.id}|o`, (index, direction) => moveInBlock(view.oneOff, index, direction, false));
    }
    return map;
  }, [groupViews, moveInBlock]);

  const moveGroup = useCallback(async (index, direction) => {
    if (moveGuardRef.current) return;
    const target = index + direction;
    const ordered = groupViews.map(v => v.group);
    if (target < 0 || target >= ordered.length) return;
    moveGuardRef.current = true;
    const reordered = ordered.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    // Optimistic, then reconciled from the DB either way — same contract as
    // moveInBlock. Groups not shown this month keep their stored order: only the
    // visible ones are renumbered, and their relative order is all that shows.
    const movedIds = new Set(reordered.map(g => g.id));
    setGroups(prev => [...reordered, ...prev.filter(g => !movedIds.has(g.id))]);
    try {
      await reorderLineGroups(reordered.map(g => g.id));
      await reloadLines();
    } catch (error) {
      console.error('Failed to reorder budget line groups:', error);
      await reloadLines();
    } finally {
      moveGuardRef.current = false;
    }
  }, [groupViews, reorderLineGroups, reloadLines]);

  const openEditGroup = useCallback((group) => setGroupModal({ visible: true, group }), []);
  const closeGroupModal = useCallback(() => setGroupModal(CLOSED_GROUP_MODAL), []);

  const handleSaveGroup = useCallback(async (groupData) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (groupModal.group) {
        await updateLineGroup(groupModal.group.id, groupData);
      } else {
        await addLineGroup(groupData);
      }
      await reloadLines();
      setStatusStale(true);
      refreshPlanStatuses?.();
      closeGroupModal();
    } catch (error) {
      // Error dialog already shown by the context.
      console.error('Failed to save budget line group:', error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [groupModal.group, updateLineGroup, addLineGroup, reloadLines, refreshPlanStatuses, closeGroupModal]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    try {
      await deleteLineGroup(groupId);
      // The lines inside are ungrouped, not deleted (ON DELETE SET NULL), so they
      // reappear in the ungrouped blocks after this reload.
      await reloadLines();
      setStatusStale(true);
      refreshPlanStatuses?.();
      closeGroupModal();
    } catch (error) {
      console.error('Failed to delete budget line group:', error);
    }
  }, [deleteLineGroup, reloadLines, refreshPlanStatuses, closeGroupModal]);

  // Creating a group from inside the line editor, so a line can join an envelope
  // that doesn't exist yet without the form being abandoned.
  const handleCreateGroupInline = useCallback(async (label) => {
    const created = await addLineGroup({ label, sortOrder: groups.length });
    if (created) setGroups(prev => [...prev, created]);
    return created;
  }, [addLineGroup, groups.length]);

  const handleLongPressGroup = useCallback((group, index, listLength, onMove) => {
    const moveActions = [];
    if (onMove) {
      if (index > 0) moveActions.push({ text: t('move_up'), onPress: () => onMove(index, -1) });
      if (index < listLength - 1) moveActions.push({ text: t('move_down'), onPress: () => onMove(index, 1) });
    }
    showDialog(
      t('select_action'),
      group.label,
      [
        { text: t('edit_group'), onPress: () => openEditGroup(group) },
        ...moveActions,
        {
          text: t('delete_group'),
          style: 'destructive',
          onPress: () => showDialog(
            t('delete_group'),
            t('delete_group_confirm'),
            [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive', onPress: () => handleDeleteGroup(group.id) },
            ],
          ),
        },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [t, showDialog, openEditGroup, handleDeleteGroup]);

  /* ── Rendering ───────────────────────────────────────────────────────────── */

  const lineIcon = useCallback((line) => {
    if (line.isBroken) return 'link-off';
    if (line.toAccountId != null) return 'bank-transfer';
    const categoryIcon = categoriesById.get(line.categoryId)?.icon;
    if (categoryIcon) return categoryIcon;
    return line.kind === 'income' ? 'cash-plus' : 'shape-outline';
  }, [categoriesById]);

  // Shared row renderer for every block — each list moves independently (own
  // sort_order sequence), so `list` and `onMove` are passed in per block.
  const renderLine = useCallback((line, index, list, onMove, indented = false, envelopeColor = null) => {
    const executed = line.lastExecutedMonth === month;
    return (
      <PlanLineRow
        key={line.id}
        line={line}
        index={index}
        indented={indented}
        envelopeColor={envelopeColor}
        name={lineDisplayName(line)}
        icon={lineIcon(line)}
        status={lineStatusById.get(line.id) || null}
        planCurrency={planCurrency}
        displayAmount={amountById.get(line.id) ?? null}
        converting={converting}
        colors={colors}
        t={t}
        executed={executed}
        canExecute={line.hasTemplate && isCurrentMonth && !executed}
        canUndo={line.hasTemplate && isCurrentMonth && executed}
        showProgress={line.kind !== 'income'}
        listLength={list.length}
        onMove={onMove}
        onPress={openEditLine}
        onLongPress={handleLongPressLine}
        onExecute={handleExecute}
        onMarkExecuted={handleMarkExecuted}
        onUndo={handleUndoExecuted}
      />
    );
  }, [colors, t, month, isCurrentMonth, lineStatusById, planCurrency, amountById, converting,
    openEditLine, handleLongPressLine, lineDisplayName, lineIcon, handleExecute,
    handleMarkExecuted, handleUndoExecuted]);

  const hasAnyLines = lines.length > 0;

  // Currencies the group editor may price an override in: the same set the line
  // editor offers, for the same reason (a group belongs to no plan, so it needs
  // to name its own).
  const currencyOptions = useMemo(() => {
    const set = new Set(accounts.map(a => a.currency));
    if (planCurrency) set.add(planCurrency);
    return [...set];
  }, [accounts, planCurrency]);

  // What the group being edited adds up to right now, shown next to the
  // custom-budget toggle so an override is typed with the number it replaces in
  // view.
  const editedGroupDerivedTotal = groupModal.group
    ? (groupViews.find(v => v.group.id === groupModal.group.id)?.derived ?? null)
    : null;

  return (
    <>
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
              {formatMonthLabel(month, language)}
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
        <View style={styles.sectionHeader} testID="plan-income-header">
          <View style={styles.sectionTitleGroup}>
            <Icon name="cash-plus" size={20} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('income')}</Text>
          </View>
          {/* Compact magnitudes, not exact figures: this is a context number
              ("am I roughly on track for the month"), and two 6-digit amounts
              plus a currency code did not fit beside the section title. The
              exact income is one tap away on the lines themselves. */}
          <Text style={[styles.sectionAmount, { color: colors.text }]} testID="plan-income-total">
            {planStatus
              ? `${Currency.formatCompact(planStatus.totals.actualIncome)} / ${Currency.formatCompact(displayExpectedIncome)}${currencySuffix}`
              : `${Currency.formatCompact(displayExpectedIncome)}${currencySuffix}`}
          </Text>
        </View>

        {incomeLines.map((line, index) => renderLine(line, index, incomeLines, null))}

        {/* Allocations: recurring (global) ones apply to every month, one-off ones
            belong to this month's plan. */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]} testID="plan-allocations-header">
          <View style={styles.sectionTitleGroup}>
            <Icon name="chart-donut" size={20} color={colors.text} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('allocations')}</Text>
          </View>
        </View>

        {/* Groups first, each followed by its own lines one indent deeper. A
            group is an envelope over allocations that need share nothing
            structurally — categories from unrelated trees, a transfer target, a
            recurring line next to a one-off one — so it sits above the loose
            ones rather than among them. */}
        {groupViews.map((view, groupIndex) => {
          // Assigned by position, and handed to the header and every child so
          // one envelope reads as one object: the folder glyph, the rail beside
          // the header and the rail beside each row below it are all the same
          // colour. See envelopePalette for why colour identifies an envelope
          // here rather than flagging a status.
          const hue = envelopeHue(groupIndex);
          return (
            <React.Fragment key={view.group.id}>
              <PlanGroupRow
                group={view.group}
                index={groupIndex}
                listLength={groupViews.length}
                status={groupStatusById.get(view.group.id) || null}
                displayAmount={view.displayAmount}
                converting={converting}
                childCount={view.children.length}
                envelopeColor={hue}
                planCurrency={planCurrency}
                colors={colors}
                t={t}
                onMove={moveGroup}
                onPress={openEditGroup}
                onLongPress={handleLongPressGroup}
              />
              {view.recurring.map((line, index) => renderLine(
                line, index, view.recurring, groupMovers.get(`${view.group.id}|r`), true, hue,
              ))}
              {view.oneOff.map((line, index) => renderLine(
                line, index, view.oneOff, groupMovers.get(`${view.group.id}|o`), true, hue,
              ))}
            </React.Fragment>
          );
        })}

        {recurringLines.map((line, index) => renderLine(line, index, recurringLines, handleMoveRecurring))}
        {oneOffLines.map((line, index) => renderLine(line, index, oneOffLines, handleMoveOneOff))}

        {/* No add rows here: the screen's single FAB opens this same editor, and
            the editor's own income/expense/transfer segment picks the kind — two
            dashed "+ Add …" buttons inside a card that already sits under a FAB
            were a third way to do one thing. Adding a line is always available:
            a recurring one needs no plan, a one-off one lazily creates the
            month's plan on save. */}

        {!plan && (
          <View style={styles.emptyPlan} testID="plan-empty-state">
            {/* "No plan yet" is only true when the month is genuinely blank.
                Recurring lines render even without a plan row, so with lines
                already on screen (and a totals row below them) the message
                contradicted everything around it — keep just the bootstrap
                actions in that case. */}
            {!hasAnyLines && (
              <>
                <Icon name="clipboard-text-outline" size={40} color={colors.mutedText} />
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>{t('no_plan_for_month')}</Text>
              </>
            )}
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
            {/* Allocated / actual / remainder are all reported to the host,
                which prints them in the sticky header: they are the month's
                orientation figures, and at the bottom of a card this long they
                were below the fold and half-covered by the FAB. Rendered here
                only in uncontrolled mode (no host header to carry them), so the
                two can never appear at once.

                Both labels get flexShrink + a gap: in Russian they are long
                enough that a bare space-between row let them collide into
                "…800.00 USDФактический: …". */}
            {!controlledMonth && (
              <View style={[styles.totalsRow, { borderTopColor: colors.border }]} testID="plan-totals">
                <Text style={[styles.totalsLabel, { color: colors.mutedText }]} numberOfLines={1}>
                  {t('allocated')}: {Currency.formatCompact(displayAllocated)}{currencySuffix}
                </Text>
                {planStatus && (
                  <Text
                    style={[styles.totalsLabel, styles.totalsLabelRight, { color: colors.mutedText }]}
                    numberOfLines={1}
                    testID="plan-actual-total"
                  >
                    {t('actual')}: {Currency.formatCompact(planStatus.totals.totalActual)}{currencySuffix}
                  </Text>
                )}
              </View>
            )}
            {!controlledMonth && (
              <View style={styles.remainderRow}>
                {hasIncomeBasis ? (
                  <Text
                    style={[styles.totalsRemainder, {
                      color: Currency.isNegative(displayRemainder) ? colors.danger : colors.text,
                    }]}
                    testID="plan-remainder"
                  >
                    {t('remainder')}: {Currency.formatAmount(displayRemainder, planCurrency)} {planCurrency}
                  </Text>
                ) : (
                  <Text style={[styles.totalsHint, { color: colors.mutedText }]} testID="plan-remainder-hint">
                    {t('add_income_for_remainder')}
                  </Text>
                )}
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
          groups={groups}
          saving={busy}
          onSaveLine={handleSaveLine}
          onDeleteLine={handleDeleteLine}
          onCreateGroup={handleCreateGroupInline}
          onClose={closeModal}
        />

        <BudgetLineGroupModal
          visible={groupModal.visible}
          group={groupModal.group}
          currency={planCurrency}
          currencyOptions={currencyOptions}
          derivedTotal={editedGroupDerivedTotal}
          saving={busy}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
          onClose={closeGroupModal}
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
  onTotalsChange: PropTypes.func,
};

export default MonthlyPlanSection;

const styles = StyleSheet.create({
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
    // No rule under the title. At the card's border colour it was barely visible
    // — enough to register as a stray line, not enough to separate anything the
    // uppercase title and the spacing above it don't already separate.
    alignItems: 'center',
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
  totalsHint: {
    fontSize: 12,
  },
  totalsLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  totalsLabelRight: {
    textAlign: 'right',
  },
  totalsRemainder: {
    fontSize: 14,
    fontWeight: '700',
  },
  totalsRow: {
    borderTopWidth: 1,
    columnGap: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
});
