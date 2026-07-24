import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import PropTypes from 'prop-types';
import WheelPicker from '@quidone/react-native-wheel-picker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBudgetsData } from '../contexts/BudgetsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import * as Currency from '../services/currency';
import { fetchRatesToTarget, convertWithRateMap, getUnconvertibleCurrencies } from '../services/OperationsDB';
import BudgetModal from '../modals/BudgetModal';
import BudgetProgressBar from '../components/BudgetProgressBar';
import AddFAB from '../components/AddFAB';
import EmptyState from '../components/EmptyState';
import LoadingView from '../components/LoadingView';
import ModalBlurOverlay from '../components/ModalBlurOverlay';
import ModalHeader from '../components/ModalHeader';
import { SPACING } from '../styles/layout';

const CLOSED_MODAL = { visible: false, budget: null, categoryId: '', categoryName: '', isNew: true };

// Category picker shown before creating a new budget: budgets attach to expense
// categories, so the user picks one here and then fills the budget form.
const CategoryPickerModal = ({ visible, categories, colors, t, onSelect, onClose }) => {
  const renderItem = useCallback(({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: colors.selected }]}
      onPress={() => onSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      testID={`budget-category-option-${item.id}`}
    >
      <Icon name={item.icon || 'shape-outline'} size={22} color={colors.text} />
      <Text variant="bodyLarge" style={{ color: colors.text }}>{item.name}</Text>
    </Pressable>
  ), [colors, onSelect]);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
        testID="budget-category-picker"
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ModalHeader title={t('select_category')} />
            <FlatList
              data={categories}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListEmptyComponent={(
                <Text style={[styles.pickerEmpty, { color: colors.mutedText }]}>
                  {t('no_categories')}
                </Text>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

CategoryPickerModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  categories: PropTypes.array.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const BudgetScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { budgets, budgetStatuses, loading, convertAllBudgets, setConvertAllBudgets } = useBudgetsData();
  const { categories } = useCategories();
  const { accounts } = useAccountsData();

  const [selectedCurrency, setSelectedCurrency] = useState('');
  // Account currencies with no rate (offline or live) to selectedCurrency —
  // their operations are excluded from converted totals, so warn (same UX as
  // the Graphs screen).
  const [unconvertedCurrencies, setUnconvertedCurrencies] = useState([]);
  // Converted grand totals { budgeted, spent } in selectedCurrency; null while
  // conversion is off (per-currency totals render instead) or rates are loading.
  const [convertedTotals, setConvertedTotals] = useState(null);
  const [modalState, setModalState] = useState(CLOSED_MODAL);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

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

  // Detect account currencies that cannot be expressed in the selected currency.
  // Functional guards keep the empty state referentially stable (see the same
  // pattern in GraphsScreen): a fresh [] every run would re-render and re-fire
  // this effect through the `currencies` memo — an infinite loop.
  useEffect(() => {
    if (!convertAllBudgets || !selectedCurrency) {
      setUnconvertedCurrencies(prev => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    getUnconvertibleCurrencies(currencies, selectedCurrency)
      .then(list => { if (!cancelled) setUnconvertedCurrencies(list); })
      .catch(() => { if (!cancelled) setUnconvertedCurrencies(prev => (prev.length === 0 ? prev : [])); });
    return () => { cancelled = true; };
  }, [convertAllBudgets, selectedCurrency, currencies]);

  // Grand totals across all active budgets, converted into selectedCurrency.
  // Async because a rate may need a live fetch when the bundled table lacks it.
  useEffect(() => {
    if (!convertAllBudgets || !selectedCurrency) {
      setConvertedTotals(prev => (prev === null ? prev : null));
      return;
    }
    const statuses = [...budgetStatuses.values()];
    let cancelled = false;
    (async () => {
      try {
        const rateByCurrency = await fetchRatesToTarget(statuses.map(s => s.currency), selectedCurrency);
        let budgeted = '0';
        let spent = '0';
        for (const status of statuses) {
          const amount = convertWithRateMap(String(status.amount), status.currency, selectedCurrency, rateByCurrency);
          const spentConverted = convertWithRateMap(String(status.spent), status.currency, selectedCurrency, rateByCurrency);
          if (amount !== null) budgeted = Currency.add(budgeted, amount);
          if (spentConverted !== null) spent = Currency.add(spent, spentConverted);
        }
        if (!cancelled) setConvertedTotals({ budgeted, spent });
      } catch {
        if (!cancelled) setConvertedTotals(prev => (prev === null ? prev : null));
      }
    })();
    return () => { cancelled = true; };
  }, [convertAllBudgets, selectedCurrency, budgetStatuses]);

  // Per-currency totals for the convert-off mode: each budget counts in its own
  // currency, one totals line per currency.
  const perCurrencyTotals = useMemo(() => {
    const totals = new Map();
    for (const status of budgetStatuses.values()) {
      const entry = totals.get(status.currency) || { budgeted: '0', spent: '0' };
      entry.budgeted = Currency.add(entry.budgeted, status.amount);
      entry.spent = Currency.add(entry.spent, status.spent);
      totals.set(status.currency, entry);
    }
    return [...totals.entries()];
  }, [budgetStatuses]);

  const categoriesById = useMemo(() =>
    new Map(categories.map(cat => [cat.id, cat])),
  [categories],
  );

  const expenseCategories = useMemo(() =>
    categories.filter(cat => cat.categoryType === 'expense'),
  [categories],
  );

  const handleEditBudget = useCallback((budget) => {
    const category = categoriesById.get(budget.categoryId);
    setModalState({
      visible: true,
      budget,
      categoryId: budget.categoryId,
      categoryName: category ? category.name : '',
      isNew: false,
    });
  }, [categoriesById]);

  const handleCategorySelected = useCallback((category) => {
    setCategoryPickerVisible(false);
    setModalState({
      visible: true,
      budget: null,
      categoryId: category.id,
      categoryName: category.name,
      isNew: true,
    });
  }, []);

  const handleCloseModal = useCallback(() => setModalState(CLOSED_MODAL), []);
  const handleOpenPicker = useCallback(() => setCategoryPickerVisible(true), []);
  const handleClosePicker = useCallback(() => setCategoryPickerVisible(false), []);
  const handleToggleConvert = useCallback(() => setConvertAllBudgets(prev => !prev), [setConvertAllBudgets]);

  const renderBudget = useCallback(({ item, index }) => {
    const category = categoriesById.get(item.categoryId);
    const isActive = budgetStatuses.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.budgetRow, index % 2 === 1 && { backgroundColor: colors.altRow }]}
        onPress={() => handleEditBudget(item)}
        accessibilityRole="button"
        accessibilityLabel={`${t('edit_budget')}: ${category ? category.name : ''}`}
        testID={`budget-row-${item.id}`}
      >
        <View style={styles.budgetRowHeader}>
          <Icon name={category?.icon || 'shape-outline'} size={20} color={colors.text} />
          <Text variant="bodyLarge" style={[styles.budgetRowName, { color: colors.text }]} numberOfLines={1}>
            {category ? category.name : t('budget')}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.mutedText }}>
            {t(item.periodType)} · {item.currency}
          </Text>
        </View>
        {isActive ? (
          <BudgetProgressBar budgetId={item.id} compact showDetails />
        ) : (
          <Text variant="bodySmall" style={{ color: colors.mutedText }}>
            {t('no_budget_set')}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [categoriesById, budgetStatuses, colors, t, handleEditBudget]);

  const listHeader = useMemo(() => (
    <View style={[styles.totalsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="titleMedium" style={[styles.totalsTitle, { color: colors.text }]}>
        {t('all_budgets')}
      </Text>
      {convertAllBudgets && convertedTotals ? (
        <View style={styles.totalsRow}>
          <Text variant="bodyMedium" style={{ color: colors.mutedText }}>
            {t('total_spent')}: {Currency.formatAmount(convertedTotals.spent, selectedCurrency)} {selectedCurrency}
          </Text>
          <Text variant="bodyMedium" style={{ color: colors.mutedText }}>
            {t('total_budgeted')}: {Currency.formatAmount(convertedTotals.budgeted, selectedCurrency)} {selectedCurrency}
          </Text>
        </View>
      ) : (
        perCurrencyTotals.map(([currency, entry]) => (
          <View key={currency} style={styles.totalsRow}>
            <Text variant="bodyMedium" style={{ color: colors.mutedText }}>
              {t('total_spent')}: {Currency.formatAmount(entry.spent, currency)} {currency}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.mutedText }}>
              {t('total_budgeted')}: {Currency.formatAmount(entry.budgeted, currency)} {currency}
            </Text>
          </View>
        ))
      )}
      {convertAllBudgets && unconvertedCurrencies.length > 0 && (
        <View style={styles.convertWarning} testID="budget-unconverted-warning">
          <Icon name="alert-circle-outline" size={16} color={colors.mutedText} />
          <Text variant="bodySmall" style={[styles.convertWarningText, { color: colors.mutedText }]}>
            {t('graphs_currencies_not_converted')}: {unconvertedCurrencies.join(', ')}
          </Text>
        </View>
      )}
    </View>
  ), [colors, t, convertAllBudgets, convertedTotals, perCurrencyTotals, selectedCurrency, unconvertedCurrencies]);

  if (loading) {
    return <LoadingView testID="budget-screen-loading" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="budget-screen">
      <FlatList
        data={budgets}
        keyExtractor={(item) => item.id}
        renderItem={renderBudget}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <EmptyState
            icon="piggy-bank-outline"
            message={t('no_budgets_yet')}
            testID="budget-empty-state"
          />
        )}
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
        onPress={handleOpenPicker}
        testID="budget-add-fab"
        accessibilityLabel={t('set_budget')}
      />

      <CategoryPickerModal
        visible={categoryPickerVisible}
        categories={expenseCategories}
        colors={colors}
        t={t}
        onSelect={handleCategorySelected}
        onClose={handleClosePicker}
      />

      <BudgetModal
        visible={modalState.visible}
        onClose={handleCloseModal}
        budget={modalState.budget}
        categoryId={modalState.categoryId}
        categoryName={modalState.categoryName}
        isNew={modalState.isNew}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  budgetRow: {
    borderRadius: 12,
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  budgetRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  budgetRowName: {
    flex: 1,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  convertWarning: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.sm,
  },
  convertWarningText: {
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
  listContent: {
    flexGrow: 1,
    paddingBottom: 210,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    padding: SPACING.lg,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerEmpty: {
    paddingVertical: SPACING.lg,
    textAlign: 'center',
  },
  pickerRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  totalsCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  totalsTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  wheelItemText: {
    fontSize: 14,
  },
  wheelOverlayItem: {
    borderRadius: 8,
  },
});

export default BudgetScreen;
