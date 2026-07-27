import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useBudgetsData } from '../contexts/BudgetsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import MonthlyPlanSection from '../components/budgets/MonthlyPlanSection';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import * as Currency from '../services/currency';
import { SPACING } from '../styles/layout';
import { currentMonthKey, addMonths, formatMonthLabel } from '../utils/monthUtils';

// The Budgets screen is a single month-scoped list rendered by
// MonthlyPlanSection (Budgets v3: the per-category budgets list, the monthly plan
// and the Planned tab all collapsed into it). The FlatList here exists purely to
// host that section as a scrollable header, so its own data is always empty.
// Module-level so the reference never changes.
const EMPTY_LIST = [];
const renderNothing = () => null;

// Stands in for the header's remainder until the plan section has computed and
// reported one.
const PENDING_PLACEHOLDER = '—';

const BudgetScreen = () => {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();
  // convertAllBudgets/setConvertAllBudgets is the shared multi-currency toggle:
  // owned here (BudgetsDataContext) and consumed by BudgetPlansDataContext, so
  // the whole merged screen converts consistently. `loading` is a proxy for "DB
  // ready" (BudgetsDataContext still loads the legacy `budgets` table on mount).
  // selectedCurrency lives in the context rather than in this screen's state:
  // BudgetPlansDataContext has to recompute its plan statuses in the very
  // currency the chip names, or the card prints converted rows above totals
  // still computed in each plan's stored currency.
  const {
    loading, convertAllBudgets, setConvertAllBudgets,
    displayCurrency: selectedCurrency, setDisplayCurrency: setSelectedCurrency,
  } = useBudgetsData();
  const { categories } = useCategories();
  const { accounts } = useAccountsData();
  const { showDialog } = useDialog();

  // The whole screen is scoped to one month via a single shared ‹ Month › header;
  // MonthlyPlanSection is controlled from here.
  const [month, setMonth] = useState(currentMonthKey);
  const isCurrentMonth = month === currentMonthKey();

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

  // The month's remainder, reported up from the plan section so the header can
  // print it. Replaced only when a field actually differs: the section re-reports
  // on every recompute, and swapping in an equal-but-new object each time would
  // re-render this screen (and the whole plan below it) for nothing.
  const [planTotals, setPlanTotals] = useState(null);
  const handleTotalsChange = useCallback((next) => {
    setPlanTotals(prev => (
      prev
        && prev.remainder === next.remainder
        && prev.hasIncomeBasis === next.hasIncomeBasis
        && prev.currency === next.currency
        ? prev
        : next
    ));
  }, []);

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

  // Picking the display currency used to be a floating wheel parked over the
  // plan card's bottom rows, with a convert-all badge tucked into its corner —
  // an always-on overlay for a setting changed once in a while, which also
  // forced 260dp of dead scroll padding so the card's own totals could be
  // scrolled out from under it. It is a header control now: an action sheet,
  // like every other whole-screen choice in the app.
  const handleOpenCurrencyPicker = useCallback(() => {
    showDialog(
      t('currency'),
      null,
      [
        ...currencies.map(cur => ({ text: cur, onPress: () => setSelectedCurrency(cur) })),
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [showDialog, t, currencies]);

  // Seed the currency from the first account, and re-seed whenever the selected
  // one stops existing (its last account was deleted). The membership check is not
  // cosmetic: the picker is only rendered while currencyItems.length > 1, so a
  // stale selection could otherwise survive with no UI left to change it, and it
  // is the currency the whole tab is read in (and the one any plan it creates is
  // stored in).
  useEffect(() => {
    if (accounts.length === 0) {
      if (selectedCurrency) setSelectedCurrency('');
      return;
    }
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(accounts[0].currency);
    }
  }, [accounts, currencies, selectedCurrency]);

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
          {formatMonthLabel(month, language)}
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
      {/* The month's headline figure. It used to sit at the very bottom of the
          plan card in 14px muted text, below every row and the allocated/actual
          totals — the one number a person acts on, placed where they would reach
          it last. Here it is always on screen, whatever the list is scrolled to. */}
      <View style={styles.heroRow}>
        <View style={styles.heroFigure}>
          <Text style={[styles.heroLabel, { color: colors.mutedText }]} numberOfLines={1}>
            {planTotals?.hasIncomeBasis === false ? t('add_income_for_remainder') : t('remainder')}
          </Text>
          {/* An em dash until the section has reported: the label alone would
              read as a value that failed to load, and reserving the line keeps
              the header from jumping a row taller once the figure arrives. */}
          {planTotals?.hasIncomeBasis !== false && (
            <Text
              style={[styles.heroValue, {
                color: planTotals && Currency.isNegative(planTotals.remainder)
                  ? colors.overspend
                  : colors.text,
              }]}
              numberOfLines={1}
              testID="budget-remainder"
            >
              {/* The code hangs off the hero only when there is no chip beside
                  it to carry it — with a chip, printing it here says "RUB" twice
                  a centimetre apart. With a single account currency there is no
                  chip, and then this is the only place the screen names its
                  unit at all. */}
              {planTotals
                ? `${Currency.formatAmountTrimmed(planTotals.remainder, planTotals.currency)}${currencies.length > 1 ? '' : ` ${planTotals.currency}`}`
                : PENDING_PLACEHOLDER}
            </Text>
          )}
        </View>
        {currencies.length > 1 && (
          <View style={styles.heroControls}>
            <Pressable
              onPress={handleOpenCurrencyPicker}
              style={[styles.currencyChip, { borderColor: colors.border }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${t('currency')}: ${selectedCurrency}`}
              testID="budget-currency-chip"
            >
              <Text style={[styles.currencyChipText, { color: colors.text }]}>{selectedCurrency}</Text>
              <Icon name="chevron-down" size={14} color={colors.mutedText} />
            </Pressable>
            {/* Outlined, not a solid accent disc. Filled, it was the most
                saturated thing on the screen — a secondary toggle outweighing
                the month's headline figure right beside it. On state is carried
                by the icon's colour and the border, which is as much weight as
                a toggle needs. */}
            <Pressable
              onPress={handleToggleConvert}
              style={[styles.convertToggle, {
                borderColor: convertAllBudgets ? colors.primary : colors.border,
              }]}
              hitSlop={6}
              accessibilityRole="switch"
              accessibilityState={{ checked: convertAllBudgets }}
              accessibilityLabel={t('graphs_convert_currencies')}
              testID="budget-convert-toggle"
            >
              <Icon name="cash-sync" size={16} color={convertAllBudgets ? colors.primary : colors.mutedText} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  ), [colors.background, colors.text, colors.primary, colors.mutedText, colors.border,
    colors.overspend, colors.surface, month, isCurrentMonth, t, language, planTotals,
    currencies.length, selectedCurrency, convertAllBudgets, handleOpenCurrencyPicker,
    handleToggleConvert, handlePrevMonth, handleNextMonth, handleJumpToCurrentMonth]);

  const listHeader = useMemo(() => (
    <MonthlyPlanSection
      ref={monthlyPlanRef}
      currency={selectedCurrency}
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      accounts={accounts}
      month={month}
      onNotify={handleNotify}
      onTotalsChange={handleTotalsChange}
    />
  ), [selectedCurrency, expenseCategories, incomeCategories, accounts, month, handleNotify,
    handleTotalsChange]);

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
  convertToggle: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  currencyChip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: 28,
    paddingHorizontal: SPACING.sm,
  },
  currencyChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  heroControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  heroFigure: {
    flexShrink: 1,
  },
  heroLabel: {
    fontSize: 12,
  },
  heroRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  heroValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
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
    // Clears the tab bar and the FAB. It was 260 to also clear the floating
    // currency wheel, which left roughly a quarter of the screen as dead space
    // at the end of the list; the wheel moved into the header.
    paddingBottom: 180,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  monthHeaderContainer: {
    paddingBottom: SPACING.sm,
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
});

export default BudgetScreen;
