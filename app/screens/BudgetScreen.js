import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { View, StyleSheet, FlatList, Pressable, TouchableOpacity } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { Swipeable } from 'react-native-gesture-handler';
import PropTypes from 'prop-types';
import WheelPicker from '@quidone/react-native-wheel-picker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBudgetsData } from '../contexts/BudgetsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { usePlannedOperations } from '../contexts/PlannedOperationsContext';
import { useDialog } from '../contexts/DialogContext';
import PlannedOperationModal from '../modals/PlannedOperationModal';
import MonthlyPlanSection from '../components/budgets/MonthlyPlanSection';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import { SPACING } from '../styles/layout';
import { currentMonthKey, addMonths, formatMonthLabel } from '../utils/monthUtils';
import currenciesData from '../../assets/currencies.json';

const CLOSED_PLANNED_MODAL = { visible: false, plannedOperation: null, isNew: true };
// The old per-category budgets list (and its FlatList data) is gone (Budgets v3
// phase 2 — consolidated into MonthlyPlanSection's recurring lines); the
// FlatList here now exists purely to host the sticky ListHeaderComponent, so its
// own data is always empty. Module-level so the reference never changes.
const EMPTY_LIST = [];
const renderNothing = () => null;

// Type → theme color / fallback icon for hosted planned templates.
const TYPE_COLORS = { expense: 'expense', income: 'income', transfer: 'transfer' };
const TYPE_ICONS = { expense: 'arrow-up', income: 'arrow-down', transfer: 'swap-horizontal' };

// Fix 3 (low-risk perf pass, see BudgetScreen's Hosted planned templates
// section below): a Swipeable row is nontrivial to build (gesture handler +
// animated values), and PlannedOperationsContext replaces the whole
// `plannedOperations` array on every execute/mark/undo while keeping
// unaffected items referentially identical (`prev.map(op => op.id === id ?
// {...} : op)`). Wrapping the row in a real memoized component — rather than
// inlining it via `ops.map(renderPlannedRow)` — lets React skip rebuilding
// every sibling row when only one op's executed state changes. Folding
// planned rows and budgets into a single virtualized SectionList (true
// windowing) would need reworking the month-scoping/totals architecture built
// for MonthlyPlanSection; not worth the risk for the current at-most-tens-of-
// rows volume, so this targeted memo is the extent of the optimization here.
const PlannedRow = memo(({
  op, executed, category, colors, t, accountName, currencySymbol,
  onEdit, onLongPress, onExecute, onMarkExecuted, onUndo,
}) => {
  const typeColor = colors[TYPE_COLORS[op.type]] || colors.text;
  const mutedTypeColor = typeColor + '60';

  const rowContent = (
    <Pressable
      style={styles.plannedRow}
      onPress={() => onEdit(op)}
      onLongPress={() => onLongPress(op)}
      accessibilityRole="button"
      accessibilityLabel={op.name}
      testID={`planned-row-${op.id}`}
    >
      <View style={[styles.plannedIcon, { backgroundColor: typeColor + '1A' }]}>
        <Icon
          name={category?.icon || TYPE_ICONS[op.type]}
          size={20}
          color={executed ? mutedTypeColor : typeColor}
        />
        {executed && (
          <View
            testID={`planned-check-${op.id}`}
            style={[styles.checkBadge, { borderColor: colors.background, backgroundColor: colors.income }]}
          >
            <Icon name="check" size={7} color="white" />
          </View>
        )}
      </View>
      <View style={styles.plannedDetails}>
        <Text style={[styles.plannedName, { color: executed ? colors.mutedText : colors.text }]} numberOfLines={1}>
          {op.name}
        </Text>
        <Text style={[styles.plannedMeta, { color: colors.mutedText }]} numberOfLines={1}>
          {accountName}
          {category?.name ? ` · ${category.name}` : ''}
          {op.isRecurring ? ` · ${t('recurring')}` : ` · ${t('one_time')}`}
        </Text>
      </View>
      <Text style={[styles.plannedAmount, { color: executed ? mutedTypeColor : typeColor }]} numberOfLines={1}>
        {currencySymbol}{op.amount}
      </Text>
    </Pressable>
  );

  const rightActions = executed
    ? () => (
      <Pressable
        testID={`undo-action-${op.id}`}
        style={[styles.swipeAction, { backgroundColor: colors.mutedText }]}
        onPress={() => onUndo(op)}
        accessibilityRole="button"
        accessibilityLabel={t('undo')}
      >
        <Icon name="undo" size={20} color="white" />
        <Text style={styles.swipeActionText}>{t('undo')}</Text>
      </Pressable>
    )
    : () => (
      <View style={styles.swipeActionsRow}>
        <Pressable
          testID={`execute-action-${op.id}`}
          style={[styles.swipeAction, { backgroundColor: colors.primary }]}
          onPress={() => onExecute(op)}
          accessibilityRole="button"
          accessibilityLabel={t('execute')}
        >
          <Icon name="play" size={20} color="white" />
          <Text style={styles.swipeActionText}>{t('execute')}</Text>
        </Pressable>
        <Pressable
          testID={`mark-executed-action-${op.id}`}
          style={[styles.swipeAction, { backgroundColor: colors.income }]}
          onPress={() => onMarkExecuted(op)}
          accessibilityRole="button"
          accessibilityLabel={t('mark_as_executed')}
        >
          <Icon name="check-bold" size={20} color="white" />
          <Text style={styles.swipeActionText}>{t('done')}</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={executed ? styles.executedWrapper : undefined}>
      <Swipeable
        renderRightActions={rightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={60}
        // Only leftward drags reveal actions; leave rightward unrecognized so a
        // rightward swipe passes through to the tab-strip swipe navigation.
        dragOffsetFromLeftEdge={Number.MAX_SAFE_INTEGER}
      >
        <View style={[styles.swipeRowCover, { backgroundColor: colors.background }]}>
          {rowContent}
        </View>
      </Swipeable>
    </View>
  );
});

PlannedRow.displayName = 'PlannedRow';
PlannedRow.propTypes = {
  op: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    type: PropTypes.string.isRequired,
    amount: PropTypes.string,
    accountId: PropTypes.string,
    categoryId: PropTypes.string,
    isRecurring: PropTypes.bool,
  }).isRequired,
  executed: PropTypes.bool.isRequired,
  category: PropTypes.shape({
    icon: PropTypes.string,
    name: PropTypes.string,
  }),
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  accountName: PropTypes.string.isRequired,
  currencySymbol: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
  onLongPress: PropTypes.func.isRequired,
  onExecute: PropTypes.func.isRequired,
  onMarkExecuted: PropTypes.func.isRequired,
  onUndo: PropTypes.func.isRequired,
};

const BudgetScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  // convertAllBudgets/setConvertAllBudgets is the shared multi-currency toggle:
  // owned here (BudgetsDataContext) and consumed by BudgetPlansDataContext, so
  // the whole merged screen converts consistently. `loading` is a proxy for "DB
  // ready" (BudgetsDataContext still loads the legacy `budgets` table on mount).
  const { loading, convertAllBudgets, setConvertAllBudgets } = useBudgetsData();
  const { categories } = useCategories();
  const { accounts } = useAccountsData();
  const { showDialog } = useDialog();
  const {
    plannedOperations,
    executePlannedOperation,
    markPlannedOperationExecuted,
    updatePlannedOperation,
    deletePlannedOperation,
    isExecutedThisMonth,
  } = usePlannedOperations();

  // The whole screen is scoped to one month via a single shared ‹ Month › header;
  // MonthlyPlanSection is controlled from here.
  const [month, setMonth] = useState(currentMonthKey);
  const isCurrentMonth = month === currentMonthKey();

  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [plannedModal, setPlannedModal] = useState(CLOSED_PLANNED_MODAL);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Lets the FAB open the monthly plan's "add allocation" flow without lifting
  // that section's modal state up into this screen.
  const monthlyPlanRef = useRef(null);
  const handleOpenAddAllocation = useCallback(() => monthlyPlanRef.current?.openAddLine(), []);

  const handlePrevMonth = useCallback(() => setMonth(m => addMonths(m, -1)), []);
  const handleNextMonth = useCallback(() => setMonth(m => addMonths(m, 1)), []);
  // Explicit affordance for Fix 4: the screen stays mounted across tab
  // switches, so a user who navigates away from the current month and comes
  // back later would otherwise land on a stale month with the executable
  // planned sections hidden (isCurrentMonth === false) and no obvious way
  // back. Surface a visible "jump to current month" control instead of
  // silently auto-resetting the month on focus.
  const handleJumpToCurrentMonth = useCallback(() => setMonth(currentMonthKey()), []);

  // Memoize unique currencies from accounts
  const currencies = useMemo(() =>
    [...new Set(accounts.map(acc => acc.currency))],
  [accounts],
  );

  const currencyItems = useMemo(() =>
    currencies.map(cur => ({ label: cur, value: cur })),
  [currencies],
  );

  // Initialize default currency from first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedCurrency) {
      setSelectedCurrency(accounts[0].currency);
    } else if (accounts.length === 0 && selectedCurrency) {
      setSelectedCurrency('');
    }
  }, [accounts, selectedCurrency]);

  const categoriesById = useMemo(() =>
    new Map(categories.map(cat => [cat.id, cat])),
  [categories],
  );

  const expenseCategories = useMemo(() =>
    categories.filter(cat => cat.categoryType === 'expense'),
  [categories],
  );

  const accountsById = useMemo(() =>
    new Map(accounts.map(acc => [acc.id, acc])),
  [accounts],
  );

  // ── Planned templates (hosted from the former Planned tab) ──────────────────
  // Execution is inherently "this month", so the executable template sections
  // only render for the current month; other months still recompute budgets and
  // monthly-plan allocations for their range.
  const sortByExecution = useCallback((ops) => {
    return [...ops].sort((a, b) => {
      const aEx = isExecutedThisMonth(a);
      const bEx = isExecutedThisMonth(b);
      if (aEx === bEx) return 0;
      return aEx ? 1 : -1;
    });
  }, [isExecutedThisMonth]);

  const incomeTemplates = useMemo(
    () => sortByExecution(plannedOperations.filter(op => op.type === 'income')),
    [plannedOperations, sortByExecution],
  );
  const expenseTemplates = useMemo(
    () => sortByExecution(plannedOperations.filter(op => op.type === 'expense' || op.type === 'transfer')),
    [plannedOperations, sortByExecution],
  );

  // Summary strip (ported from the former Planned tab): pending/total amounts
  // and execution progress across ALL planned templates (income + expense +
  // transfer), scoped to the current month's execution state.
  const summary = useMemo(() => {
    let pendingOut = 0;
    let pendingIn = 0;
    let totalOut = 0;
    let totalIn = 0;
    let doneCount = 0;
    for (const op of plannedOperations) {
      const amount = parseFloat(op.amount || '0');
      const isOut = op.type === 'expense' || op.type === 'transfer';
      const isIn = op.type === 'income';
      if (isOut) {
        totalOut += amount;
      } else if (isIn) {
        totalIn += amount;
      }
      if (isExecutedThisMonth(op)) {
        doneCount++;
      } else if (isOut) {
        pendingOut += amount;
      } else if (isIn) {
        pendingIn += amount;
      }
    }
    const total = plannedOperations.length;
    return {
      pendingOut,
      pendingIn,
      totalOut,
      totalIn,
      doneCount,
      total,
      progressFraction: total > 0 ? doneCount / total : 0,
    };
  }, [plannedOperations, isExecutedThisMonth]);

  const formatSummaryAmount = useCallback((amount) => {
    if (amount === 0) return '0';
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
    return String(Math.round(amount));
  }, []);

  const renderSummaryStrip = useCallback(() => (
    <View style={[styles.summaryStrip, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="planned-summary-strip">
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text
            testID="summary-pending-out"
            style={[styles.summaryValue, { color: colors.expense }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${formatSummaryAmount(summary.pendingOut)} / ${formatSummaryAmount(summary.totalOut)}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('pending_out')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            testID="summary-done-count"
            style={[styles.summaryValue, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${summary.doneCount} / ${summary.total}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('done_this_month')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text
            testID="summary-pending-in"
            style={[styles.summaryValue, { color: colors.income }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {`${formatSummaryAmount(summary.pendingIn)} / ${formatSummaryAmount(summary.totalIn)}`}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
            {t('pending_in')}
          </Text>
        </View>
      </View>
      <View
        testID="summary-progress-bar"
        style={[styles.progressTrack, { backgroundColor: colors.border }]}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(summary.progressFraction * 100)}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>
      <View style={styles.progressLabels}>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${summary.doneCount} ${t('done')}`}
        </Text>
        <Text style={[styles.progressLabel, { color: colors.mutedText }]}>
          {`${summary.total - summary.doneCount} ${t('remaining')}`}
        </Text>
      </View>
    </View>
  ), [colors, summary, t, formatSummaryAmount]);

  const getAccountName = useCallback((accountId) => accountsById.get(accountId)?.name || '?', [accountsById]);
  const getCurrencySymbol = useCallback((accountId) => {
    const code = accountsById.get(accountId)?.currency;
    if (!code) return '';
    const currency = currenciesData[code];
    return currency ? currency.symbol : code;
  }, [accountsById]);

  const handleExecute = useCallback(async (op) => {
    try {
      await executePlannedOperation(op);
      setSnackbarMessage(t('added_to_operations'));
      setSnackbarVisible(true);
    } catch (error) {
      // Error handled by context
    }
  }, [executePlannedOperation, t]);

  const handleMarkExecuted = useCallback(async (op) => {
    try {
      await markPlannedOperationExecuted(op);
      setSnackbarMessage(t('marked_as_executed'));
      setSnackbarVisible(true);
    } catch (error) {
      // Error handled by context
    }
  }, [markPlannedOperationExecuted, t]);

  const handleUndoExecuted = useCallback(async (op) => {
    try {
      await updatePlannedOperation(op.id, { lastExecutedMonth: null });
      setSnackbarMessage(t('marked_as_pending'));
      setSnackbarVisible(true);
    } catch (error) {
      // Error handled by context
    }
  }, [updatePlannedOperation, t]);

  const handleAddPlanned = useCallback(() => {
    setPlannedModal({ visible: true, plannedOperation: null, isNew: true });
  }, []);
  const handleEditPlanned = useCallback((op) => {
    setPlannedModal({ visible: true, plannedOperation: op, isNew: false });
  }, []);
  const handleClosePlannedModal = useCallback(() => setPlannedModal(CLOSED_PLANNED_MODAL), []);

  const handleLongPressPlanned = useCallback((op) => {
    const executed = isExecutedThisMonth(op);
    const executionActions = executed
      ? [{ text: t('undo'), onPress: () => handleUndoExecuted(op) }]
      : [
        { text: t('execute'), onPress: () => handleExecute(op) },
        { text: t('mark_as_executed'), onPress: () => handleMarkExecuted(op) },
      ];
    showDialog(
      t('select_action'),
      op.name,
      [
        ...executionActions,
        { text: t('edit'), onPress: () => handleEditPlanned(op) },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            showDialog(
              t('delete_planned_operation'),
              t('delete_planned_confirm'),
              [
                { text: t('cancel'), style: 'cancel' },
                { text: t('delete'), style: 'destructive', onPress: () => deletePlannedOperation(op.id) },
              ],
            );
          },
        },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [isExecutedThisMonth, t, showDialog, handleExecute, handleMarkExecuted, handleUndoExecuted, handleEditPlanned, deletePlannedOperation]);

  // Fix 3: thin per-row wrapper around the memoized <PlannedRow> (defined above
  // the component) — see the comment there for why this is memoized instead of
  // inlined, and why full virtualization isn't attempted.
  const renderPlannedRow = useCallback((op) => (
    <PlannedRow
      key={op.id}
      op={op}
      executed={isExecutedThisMonth(op)}
      category={categoriesById.get(op.categoryId)}
      colors={colors}
      t={t}
      accountName={getAccountName(op.accountId)}
      currencySymbol={getCurrencySymbol(op.accountId)}
      onEdit={handleEditPlanned}
      onLongPress={handleLongPressPlanned}
      onExecute={handleExecute}
      onMarkExecuted={handleMarkExecuted}
      onUndo={handleUndoExecuted}
    />
  ), [isExecutedThisMonth, categoriesById, colors, getCurrencySymbol, getAccountName, t,
    handleEditPlanned, handleLongPressPlanned, handleUndoExecuted, handleExecute, handleMarkExecuted]);

  const renderPlannedCard = useCallback((title, ops, testID) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <Text variant="titleMedium" style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      {ops.map(renderPlannedRow)}
      <Pressable
        style={[styles.addRow, { borderColor: colors.border }]}
        onPress={handleAddPlanned}
        accessibilityRole="button"
        accessibilityLabel={t('add_planned_operation')}
        testID={`${testID}-add`}
      >
        <Icon name="plus" size={20} color={colors.primary} />
        <Text style={[styles.addText, { color: colors.primary }]}>{t('add_planned_operation')}</Text>
      </Pressable>
    </View>
  ), [colors, renderPlannedRow, handleAddPlanned, t]);

  const handleToggleConvert = useCallback(() => setConvertAllBudgets(prev => !prev), [setConvertAllBudgets]);

  // Sticky month header — kept outside the FlatList so it stays visible while the
  // plan content below scrolls. Drives the monthly plan section.
  const monthHeader = useMemo(() => (
    <View style={[styles.monthHeaderContainer, { backgroundColor: colors.background }]} testID="budget-month-header">
      <View style={styles.monthHeaderRow}>
        <Pressable
          onPress={handlePrevMonth}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={t('previous_month')}
          testID="budget-prev-month"
        >
          <Icon name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.text }]} testID="budget-month-label">
          {formatMonthLabel(month)}
        </Text>
        <Pressable
          onPress={handleNextMonth}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={t('next_month')}
          testID="budget-next-month"
        >
          <Icon name="chevron-right" size={26} color={colors.text} />
        </Pressable>
      </View>
      {/* Fix 4: the screen never unmounts across tab switches, so a user who
          wanders off-month and returns later needs an explicit, visible way
          back — silently auto-resetting the month would be surprising. */}
      {!isCurrentMonth && (
        <Pressable
          onPress={handleJumpToCurrentMonth}
          style={styles.jumpToCurrentButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('jump_to_current_period')}
          testID="budget-jump-current"
        >
          <Icon name="calendar-today" size={14} color={colors.primary} />
          <Text style={[styles.jumpToCurrentText, { color: colors.primary }]}>
            {t('jump_to_current_period')}
          </Text>
        </Pressable>
      )}
    </View>
  ), [colors.background, colors.text, colors.primary, month, isCurrentMonth, t, handlePrevMonth, handleNextMonth, handleJumpToCurrentMonth]);

  const listHeader = useMemo(() => (
    <>
      {/* Planned-templates summary strip (ported from the former Planned tab):
          this-month execution progress across all templates, so only shown
          while viewing the current month. */}
      {isCurrentMonth && plannedOperations.length > 0 && renderSummaryStrip()}

      {/* Income templates (executable, this month only) */}
      {isCurrentMonth && incomeTemplates.length > 0
        && renderPlannedCard(t('income'), incomeTemplates, 'planned-income-section')}

      <MonthlyPlanSection
        ref={monthlyPlanRef}
        currency={selectedCurrency}
        expenseCategories={expenseCategories}
        accounts={accounts}
        month={month}
      />

      {/* Recurring / one-time expense & transfer templates alongside allocations */}
      {isCurrentMonth && expenseTemplates.length > 0
        && renderPlannedCard(t('planned_operations'), expenseTemplates, 'planned-expense-section')}

      {isCurrentMonth && incomeTemplates.length === 0 && expenseTemplates.length === 0 && (
        <Pressable
          style={[styles.addRow, styles.addRowStandalone, { borderColor: colors.border }]}
          onPress={handleAddPlanned}
          accessibilityRole="button"
          accessibilityLabel={t('add_planned_operation')}
          testID="planned-add-empty"
        >
          <Icon name="plus" size={20} color={colors.primary} />
          <Text style={[styles.addText, { color: colors.primary }]}>{t('add_planned_operation')}</Text>
        </Pressable>
      )}
    </>
  ), [t, expenseCategories, accounts, month, isCurrentMonth, selectedCurrency,
    plannedOperations, incomeTemplates, expenseTemplates, renderPlannedCard,
    renderSummaryStrip, handleAddPlanned, colors.border, colors.primary]);

  if (loading) {
    return <LoadingView testID="budget-screen-loading" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="budget-screen">
      {monthHeader}
      <FlatList
        data={EMPTY_LIST}
        keyExtractor={(item) => item.id}
        renderItem={renderNothing}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
      />

      {/* Floating currency wheel — same control as the Graphs screen */}
      {currencyItems.length > 0 && (
        <View style={[styles.fabWheel, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}>
          <WheelPicker
            data={currencyItems}
            value={selectedCurrency}
            onValueChanged={({ item }) => item && setSelectedCurrency(item.value)}
            itemHeight={28}
            visibleItemCount={3}
            itemTextStyle={[styles.wheelItemText, { color: colors.text }]}
            overlayItemStyle={[styles.wheelOverlayItem, { backgroundColor: colors.selected }]}
            enableScrollByTapOnItem
            keyExtractor={(item, index) => `currency-${index}`}
          />
        </View>
      )}

      {/* Convert-other-currencies toggle — badge tucked into the wheel's corner */}
      {currencyItems.length > 1 && (
        <TouchableOpacity
          style={[
            styles.fabToggle,
            {
              backgroundColor: convertAllBudgets ? colors.primary : colors.surface,
              borderColor: convertAllBudgets ? colors.primary : colors.border,
            },
          ]}
          onPress={handleToggleConvert}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: convertAllBudgets }}
          accessibilityLabel={t('graphs_convert_currencies')}
          testID="budget-convert-toggle"
        >
          <Icon
            name="cash-sync"
            size={18}
            color={convertAllBudgets ? colors.surface : colors.mutedText}
          />
        </TouchableOpacity>
      )}

      <AddFAB
        onPress={handleOpenAddAllocation}
        testID="budget-add-fab"
        accessibilityLabel={t('add_allocation')}
      />

      <PlannedOperationModal
        visible={plannedModal.visible}
        onClose={handleClosePlannedModal}
        plannedOperation={plannedModal.plannedOperation}
        isNew={plannedModal.isNew}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

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
  addRowStandalone: {
    marginBottom: SPACING.md,
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
  cardTitle: {
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  checkBadge: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    bottom: -2,
    height: 13,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 13,
  },
  container: {
    flex: 1,
  },
  executedWrapper: {
    opacity: 0.4,
  },
  fabToggle: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    bottom: 104,
    elevation: 12,
    height: 32,
    justifyContent: 'center',
    left: 82,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    width: 32,
    zIndex: 2,
  },
  fabWheel: {
    borderRadius: 40,
    borderWidth: 1,
    bottom: 116,
    elevation: 8,
    left: 16,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 80,
  },
  jumpToCurrentButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    paddingVertical: 2,
  },
  jumpToCurrentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 210,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  monthHeaderContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  monthHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  navButton: {
    padding: 4,
  },
  plannedAmount: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  plannedDetails: {
    flex: 1,
    gap: 2,
  },
  plannedIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  plannedMeta: {
    fontSize: 12,
  },
  plannedName: {
    fontSize: 15,
    fontWeight: '600',
  },
  plannedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  progressFill: {
    borderRadius: 2,
    height: 3,
  },
  progressLabel: {
    fontSize: 11,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  progressTrack: {
    borderRadius: 2,
    height: 3,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  snackbar: {
    marginBottom: 100,
  },
  summaryDivider: {
    height: 30,
    width: StyleSheet.hairlineWidth,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStrip: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  swipeAction: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
    paddingHorizontal: SPACING.md,
    width: 72,
  },
  swipeActionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  swipeActionsRow: {
    flexDirection: 'row',
  },
  swipeRowCover: {
    borderRadius: 10,
  },
  wheelItemText: {
    fontSize: 14,
  },
  wheelOverlayItem: {
    borderRadius: 8,
  },
});

export default BudgetScreen;
