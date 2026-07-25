import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Pressable, TouchableOpacity } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import WheelPicker from '@quidone/react-native-wheel-picker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBudgetsData } from '../contexts/BudgetsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import MonthlyPlanSection from '../components/budgets/MonthlyPlanSection';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import { SPACING } from '../styles/layout';
import { currentMonthKey, addMonths, formatMonthLabel } from '../utils/monthUtils';

// The Budgets screen is a single month-scoped list rendered by
// MonthlyPlanSection (Budgets v3: the per-category budgets list, the monthly plan
// and the Planned tab all collapsed into it). The FlatList here exists purely to
// host that section as a scrollable header, so its own data is always empty.
// Module-level so the reference never changes.
const EMPTY_LIST = [];
const renderNothing = () => null;

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

  // The whole screen is scoped to one month via a single shared ‹ Month › header;
  // MonthlyPlanSection is controlled from here.
  const [month, setMonth] = useState(currentMonthKey);
  const isCurrentMonth = month === currentMonthKey();

  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Lets the FAB open the "add allocation" flow without lifting that section's
  // modal state up into this screen.
  const monthlyPlanRef = useRef(null);
  const handleOpenAddAllocation = useCallback(() => monthlyPlanRef.current?.openAddLine(), []);

  // Execute / mark-done / undo happen on the rows inside MonthlyPlanSection, but
  // the Snackbar belongs at the screen's bottom edge rather than inside the card.
  const handleNotify = useCallback((message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);
  const handleDismissSnackbar = useCallback(() => setSnackbarVisible(false), []);

  const handlePrevMonth = useCallback(() => setMonth(m => addMonths(m, -1)), []);
  const handleNextMonth = useCallback(() => setMonth(m => addMonths(m, 1)), []);
  // Explicit affordance for Fix 4: the screen stays mounted across tab
  // switches, so a user who navigates away from the current month and comes
  // back later would otherwise land on a stale month with the executable
  // templates non-executable (isCurrentMonth === false) and no obvious way
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

  const expenseCategories = useMemo(() =>
    categories.filter(cat => cat.categoryType === 'expense'),
  [categories],
  );

  const incomeCategories = useMemo(() =>
    categories.filter(cat => cat.categoryType === 'income'),
  [categories],
  );

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
    <MonthlyPlanSection
      ref={monthlyPlanRef}
      currency={selectedCurrency}
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      accounts={accounts}
      month={month}
      onNotify={handleNotify}
    />
  ), [selectedCurrency, expenseCategories, incomeCategories, accounts, month, handleNotify]);

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

      <Snackbar
        visible={snackbarVisible}
        onDismiss={handleDismissSnackbar}
        duration={2000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  snackbar: {
    marginBottom: 100,
  },
  wheelItemText: {
    fontSize: 14,
  },
  wheelOverlayItem: {
    borderRadius: 8,
  },
});

export default BudgetScreen;
