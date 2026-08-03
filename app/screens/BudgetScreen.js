import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Text, Snackbar } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBudgetsData } from '../contexts/BudgetsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import MonthlyPlanSection from '../components/budgets/MonthlyPlanSection';
import CurrencySheet from '../components/CurrencySheet';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import * as Currency from '../services/currency';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../styles/designTokens';
import currencyMeta from '../../assets/currencies.json';
import { currentMonthKey, addMonths, formatMonthLabel } from '../utils/monthUtils';
import { TIMING_ENTER } from '../utils/motion';

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

// How far the plan travels when the month changes, and for how long.
//
// 20dp, not a screen width. The tab strip already owns full-bleed horizontal
// travel (SimpleTabs swipes between tabs), so a plan that slid the whole way
// would claim to be a second pager on the same axis. This is a directional hint:
// enough to say "later" or "earlier", not enough to be mistaken for navigation.
//
// Nothing animates out. The two months would have to be mounted at once for
// that, and they stack vertically inside the FlatList header — the exiting copy
// would push the incoming one down the screen. The graph panel resolved the same
// problem the same way (chartTransitions.js): a fade through, not a cross-fade.
const MONTH_SHIFT = 20;
const MONTH_TRANSITION_DURATION = 280;

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

  // The whole screen is scoped to one month via a single shared ‹ Month › header;
  // MonthlyPlanSection is controlled from here.
  //
  // The direction of travel rides along with the key rather than living in its
  // own state: it is only ever meaningful for the render that the new month
  // causes, and two separate setState calls could be batched into an order where
  // the plan animates the wrong way. `dir` is null on the first render, which is
  // what keeps the screen from animating on mount.
  const [monthState, setMonthState] = useState(() => ({ key: currentMonthKey(), dir: null }));
  const month = monthState.key;
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
        && prev.allocated === next.allocated
        && prev.actual === next.actual
        ? prev
        : next
    ));
  }, []);

  const handlePrevMonth = useCallback(() => setMonthState(s => ({ key: addMonths(s.key, -1), dir: -1 })), []);
  const handleNextMonth = useCallback(() => setMonthState(s => ({ key: addMonths(s.key, 1), dir: 1 })), []);
  // Explicit affordance for Fix 4: the screen stays mounted across tab
  // switches, so a user who navigates away from the current month and comes
  // back later would otherwise land on a stale month with the executable
  // templates non-executable (isCurrentMonth === false) and no obvious way
  // back. Surface a visible "jump to current month" control instead of
  // silently auto-resetting the month on focus.
  //
  // The jump can go either way, so the direction is read off the keys. They are
  // 'YYYY-MM', so a plain string compare orders them. Returning the same object
  // when the user is already on the current month keeps the plan from re-rendering
  // (and from animating) for a tap that changes nothing.
  const handleJumpToCurrentMonth = useCallback(() => setMonthState(s => {
    const key = currentMonthKey();
    return key === s.key ? s : { key, dir: key > s.key ? 1 : -1 };
  }), []);

  // Month navigation is the Budgets tab's primary axis, and it was the only
  // navigation in the app with no spatial story: the sticky header said a new
  // month and the entire plan under it was simply replaced, mid-scroll, with no
  // indication of which way through the year the user had moved.
  //
  // Driven by a shared value rather than by Reanimated's `entering` on a keyed
  // view, because remounting the FlatList's header on every month would reset the
  // scroll position — the plan would jump to the top as well as change.
  // One value drives both the fade and the travel: they are the same 0→1
  // arrival, so a second animation with an identical config would only be a
  // second thing that can fall out of sync. `monthDir` is set, never animated —
  // it is which way this particular arrival comes from.
  const monthProgress = useSharedValue(1);
  const monthDir = useSharedValue(0);
  useEffect(() => {
    if (monthState.dir === null) return;
    monthDir.value = monthState.dir;
    monthProgress.value = 0;
    monthProgress.value = withTiming(1, { ...TIMING_ENTER, duration: MONTH_TRANSITION_DURATION });
  }, [monthState, monthProgress, monthDir]);

  const monthTransitionStyle = useAnimatedStyle(() => ({
    opacity: monthProgress.value,
    transform: [{ translateX: (1 - monthProgress.value) * monthDir.value * MONTH_SHIFT }],
  }));

  // Memoize unique currencies from accounts
  const currencies = useMemo(() =>
    [...new Set(accounts.map(acc => acc.currency))],
  [accounts],
  );

  // Picking the display currency used to be a floating wheel parked over the
  // plan card's bottom rows, with a convert-all badge tucked into its corner —
  // an always-on overlay for a setting changed once in a while, which also
  // forced 260dp of dead scroll padding so the card's own totals could be
  // scrolled out from under it. It is a header control now: a bottom sheet,
  // like every other whole-screen choice in the app.
  //
  // The sheet replaced a `showDialog` whose *buttons* were the currencies. It
  // read as an action row because that is what it was: seven bare codes wrapping
  // right-aligned across two lines with Cancel among them, no names, and nothing
  // marking the one currently in force. See CurrencySheet.
  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  // Blank for anything the catalogue has no symbol for, and blank when the symbol
  // *is* the code (CHF, and every currency the catalogue lists that way) — a chip
  // reading "CHF CHF" is worse than one reading "CHF".
  const selectedSymbol = useMemo(() => {
    const symbol = currencyMeta[selectedCurrency]?.symbol;
    return symbol && symbol !== selectedCurrency ? symbol : '';
  }, [selectedCurrency]);
  const handleOpenCurrencyPicker = useCallback(() => setCurrencySheetVisible(true), []);
  const handleCloseCurrencyPicker = useCallback(() => setCurrencySheetVisible(false), []);

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
      {/* Three regions, the outer two both `flex: 1`: whatever they hold, the
          month name between them stays on the screen's centre line. That is what
          lets the currency chip sit up here on the right — beside the month, the
          screen's other whole-tab scope — without dragging the title off centre
          the way appending it to a two-item row would. */}
      <View style={styles.monthHeaderRow}>
        <View style={styles.navSlot}>
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
        </View>
        {/* Fix 4: the screen never unmounts across tab switches, so a user who
            wanders off-month and returns later needs an explicit, visible way
            back — silently auto-resetting the month would be surprising.
            It used to be a labelled button on a row of its own under the title,
            which pushed the hero figure and the whole plan down by ~22dp the
            moment you stepped one month back — the content shifting under the
            thumb that navigated. Now it is a glyph beside the label, in a slot
            mirrored on the other side so the month name stays on the same
            centre line whether or not the button is up. */}
        <View style={styles.monthTitleWrap}>
          {!isCurrentMonth && <View style={styles.jumpSlot} />}
          <Text
            style={[styles.monthTitle, { color: colors.text }]}
            numberOfLines={1}
            testID="budget-month-label"
          >
            {formatMonthLabel(month, language)}
          </Text>
          {!isCurrentMonth && (
            <Pressable
              onPress={handleJumpToCurrentMonth}
              style={styles.jumpSlot}
              // The glyph's own box is 26×18; the slop is what brings the target
              // up to a thumb's worth without widening the slot the label is
              // centred against.
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('jump_to_current_period')}
              testID="budget-jump-current"
            >
              <Icon name="calendar-today" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>
        <View style={[styles.navSlot, styles.navSlotEnd]}>
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
          {/* The chip names the unit the whole screen is read in, so it belongs
              beside the month rather than a row below it, and it is set at the
              month's own weight — the two together are the scope of everything
              underneath. It carries the currency's mark as well as its code,
              and goes tonal while its sheet is open. */}
          {currencies.length > 1 && (
            <Pressable
              onPress={handleOpenCurrencyPicker}
              style={[styles.currencyChip, {
                borderColor: currencySheetVisible ? colors.primary : colors.border,
                backgroundColor: currencySheetVisible ? colors.primary + '1F' : undefined,
              }]}
              android_ripple={{ color: colors.primary + '1F' }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${t('currency')}: ${selectedCurrency}`}
              testID="budget-currency-chip"
            >
              {!!selectedSymbol && (
                <Text style={[styles.currencySymbol, { color: colors.mutedText }]}>{selectedSymbol}</Text>
              )}
              <Text style={[styles.currencyChipText, { color: colors.text }]}>{selectedCurrency}</Text>
              <Icon name="chevron-down" size={16} color={colors.mutedText} />
            </Pressable>
          )}
        </View>
      </View>
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
          {/* The month's two orientation figures, moved up from the very bottom
              of the plan card — on a plan of any length they sat below the fold
              with the FAB over them, which is a strange place for the totals of
              the thing being read. Here they qualify the remainder directly:
              7490 left OF 443K committed, against 419K actually spent. */}
          {planTotals?.allocated != null && (
            <Text
              style={[styles.heroTotals, { color: colors.mutedText }]}
              numberOfLines={1}
              testID="budget-hero-totals"
            >
              {t('allocated')} {Currency.formatCompact(planTotals.allocated)}
              {planTotals.actual != null && ` · ${t('actual')} ${Currency.formatCompact(planTotals.actual)}`}
            </Text>
          )}
        </View>
      </View>
    </View>
  ), [colors.background, colors.text, colors.primary, colors.mutedText, colors.border,
    colors.overspend, colors.surface, month, isCurrentMonth, t, language, planTotals,
    currencies.length, selectedCurrency, selectedSymbol, currencySheetVisible,
    handleOpenCurrencyPicker, handlePrevMonth, handleNextMonth, handleJumpToCurrentMonth]);

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
      {/* The scrolling layer as a whole is what belongs to the month, so it is
          what moves — wrapping the memoized header instead would have put an
          animated style into that memo's dependencies, and a style object that
          ever stopped being referentially stable would rebuild the entire plan
          on every render of this screen. */}
      <Animated.View style={[styles.planLayer, monthTransitionStyle]} testID="budget-plan-transition">
        <FlatList
          data={EMPTY_LIST}
          keyExtractor={(item) => item.id}
          renderItem={renderNothing}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
        />
      </Animated.View>

      <CurrencySheet
        visible={currencySheetVisible}
        codes={currencies}
        selectedCurrency={selectedCurrency}
        onSelect={setSelectedCurrency}
        onClose={handleCloseCurrencyPicker}
        colors={colors}
        t={t}
        title={t('currency')}
        convertAll={convertAllBudgets}
        onToggleConvert={handleToggleConvert}
        testIDPrefix="budget-currency"
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
  // Set against the month title (17/700) rather than against the hero's
  // sub-labels: the chip sits on that line now and reads as its peer.
  currencyChip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    height: 34,
    // The ripple is drawn by the platform on the view's own rectangle, so
    // without this it spills past the pill's rounded ends.
    overflow: 'hidden',
    paddingHorizontal: SPACING.md,
  },
  currencyChipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  currencySymbol: {
    fontSize: 15,
    fontWeight: '700',
  },
  heroFigure: {
    flexShrink: 1,
  },
  heroLabel: {
    fontSize: FONT_SIZE.sm,
  },
  heroRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  heroTotals: {
    fontSize: FONT_SIZE.sm,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  heroValue: {
    fontSize: FONT_SIZE.xxl,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  // Both sides of the label reserve the same box, so mounting the jump button
  // never moves the month name off centre.
  jumpSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
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
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  // Sized by its own content and centred by the equal `flex: 1` slots on either
  // side of it, not by a flex of its own — a `flex: 1` here would centre the
  // title in the space the chip leaves over, which is not the screen's centre.
  monthTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 2,
    justifyContent: 'center',
  },
  navButton: {
    padding: 4,
  },
  // The two end regions of the month row. Equal by construction, whatever they
  // hold: that is what keeps the month name centred with a chip on one side.
  navSlot: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  navSlotEnd: {
    justifyContent: 'flex-end',
  },
  // The animated wrapper sits between the screen's column and the FlatList, so
  // it has to pass the remaining height through or the list collapses to nothing.
  planLayer: {
    flex: 1,
  },
  snackbar: {
    marginBottom: 100,
  },
});

export default BudgetScreen;
