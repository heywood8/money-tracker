import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, SectionList, Pressable } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import EmptyState from '../components/EmptyState';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING } from '../styles/layout';
import { BORDER_RADIUS, FONT_SIZE, HEIGHTS } from '../styles/designTokens';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { usePlannedOperations } from '../contexts/PlannedOperationsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import PlannedOperationModal from '../modals/PlannedOperationModal';
import currencies from '../../assets/currencies.json';

const TYPE_COLORS = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
};

const TYPE_ICONS = {
  expense: 'arrow-up',
  income: 'arrow-down',
  transfer: 'swap-horizontal',
};

export default function PlannedOperationsScreen() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    plannedOperations,
    loading,
    executePlannedOperation,
    deletePlannedOperation,
    isExecutedThisMonth,
  } = usePlannedOperations();
  const { visibleAccounts: accounts } = useAccountsData();
  const { categories } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingOp, setEditingOp] = useState(null);
  const [isNew, setIsNew] = useState(true);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const sortByExecution = useCallback((ops) => {
    return [...ops].sort((a, b) => {
      const aEx = isExecutedThisMonth(a);
      const bEx = isExecutedThisMonth(b);
      if (aEx === bEx) return 0;
      return aEx ? 1 : -1;
    });
  }, [isExecutedThisMonth]);

  const recurringOps = useMemo(
    () => sortByExecution(plannedOperations.filter(op => op.isRecurring)),
    [plannedOperations, sortByExecution],
  );

  const oneTimeOps = useMemo(
    () => sortByExecution(plannedOperations.filter(op => !op.isRecurring)),
    [plannedOperations, sortByExecution],
  );

  const sections = useMemo(() => {
    const result = [];
    if (recurringOps.length > 0) {
      result.push({ key: 'recurring', data: recurringOps });
    }
    if (oneTimeOps.length > 0) {
      result.push({ key: 'one_time', data: oneTimeOps });
    }
    return result;
  }, [recurringOps, oneTimeOps]);

  const summary = useMemo(() => {
    const pending = plannedOperations.filter(op => !isExecutedThisMonth(op));
    const pendingOut = pending
      .filter(op => op.type === 'expense' || op.type === 'transfer')
      .reduce((sum, op) => sum + parseFloat(op.amount || '0'), 0);
    const pendingIn = pending
      .filter(op => op.type === 'income')
      .reduce((sum, op) => sum + parseFloat(op.amount || '0'), 0);
    const doneCount = plannedOperations.filter(op => isExecutedThisMonth(op)).length;
    const total = plannedOperations.length;
    const progressFraction = total > 0 ? doneCount / total : 0;
    return { pendingOut, pendingIn, doneCount, total, progressFraction };
  }, [plannedOperations, isExecutedThisMonth]);

  const formatSummaryAmount = useCallback((amount) => {
    if (amount === 0) return '0';
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
    return String(Math.round(amount));
  }, []);

  const renderSummaryStrip = useCallback(() => (
    <View style={[styles.summaryStrip, { backgroundColor: colors.surface }]}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text
            testID="summary-pending-out"
            style={[styles.summaryValue, { color: colors.expense }]}
          >
            {formatSummaryAmount(summary.pendingOut)}
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
          >
            {formatSummaryAmount(summary.pendingIn)}
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

  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : '?';
  }, [accounts]);

  const getAccountCurrency = useCallback((accountId) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.currency : '';
  }, [accounts]);

  const getCurrencySymbol = useCallback((currencyCode) => {
    if (!currencyCode) return '';
    const currency = currencies[currencyCode];
    return currency ? currency.symbol : currencyCode;
  }, []);

  const getCategoryInfo = useCallback((categoryId) => {
    const category = (categories || []).find(c => c.id === categoryId);
    return category ? { name: category.name, icon: category.icon } : { name: '', icon: null };
  }, [categories]);

  const handleAdd = useCallback(() => {
    setEditingOp(null);
    setIsNew(true);
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((op) => {
    setEditingOp(op);
    setIsNew(false);
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setEditingOp(null);
  }, []);

  const handleExecute = useCallback(async (op) => {
    try {
      await executePlannedOperation(op);
      setSnackbarMessage(t('added_to_operations'));
      setSnackbarVisible(true);
    } catch (error) {
      // Error handled by context
    }
  }, [executePlannedOperation, t]);

  const handleLongPress = useCallback((op) => {
    showDialog(
      t('select_action'),
      op.name,
      [
        {
          text: t('edit'),
          onPress: () => handleEdit(op),
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            showDialog(
              t('delete_planned_operation'),
              t('delete_planned_confirm'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete'),
                  style: 'destructive',
                  onPress: () => deletePlannedOperation(op.id),
                },
              ],
            );
          },
        },
        { text: t('cancel'), style: 'cancel' },
      ],
    );
  }, [showDialog, t, handleEdit, deletePlannedOperation]);

  const renderSectionHeader = useCallback(({ section }) => {
    const label = section.key === 'recurring' ? `🔁 ${t('recurring')}` : `1️⃣ ${t('one_time')}`;
    const count = section.data.length;
    return (
      <View style={styles.sectionHeader} testID={`section-header-${section.key}`}>
        <Text style={[styles.sectionHeaderText, { color: colors.mutedText }]}>{label}</Text>
        <View style={[styles.sectionHeaderLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionHeaderCount, { color: colors.mutedText }]}>{count}</Text>
      </View>
    );
  }, [colors, t]);

  const renderItem = useCallback(({ item }) => {
    const executed = isExecutedThisMonth(item);
    const categoryInfo = getCategoryInfo(item.categoryId);
    const accountCurrency = getAccountCurrency(item.accountId);
    const currencySymbol = getCurrencySymbol(accountCurrency);
    const typeColor = colors[TYPE_COLORS[item.type]] || colors.text;
    const mutedTypeColor = typeColor + '60';

    const rowContent = (
      <Pressable
        style={styles.itemContainer}
        onPress={() => handleEdit(item)}
        onLongPress={() => handleLongPress(item)}
      >
        {/* Left: Category icon with optional checkmark badge */}
        <View style={[styles.iconContainer, { backgroundColor: typeColor + '1A' }]}>
          <Icon
            name={categoryInfo.icon || TYPE_ICONS[item.type]}
            size={22}
            color={executed ? mutedTypeColor : typeColor}
          />
          {executed && (
            <View
              testID={`check-badge-${item.id}`}
              style={[styles.checkBadge, { borderColor: colors.background }]}
            >
              <Icon name="check" size={7} color="white" />
            </View>
          )}
        </View>

        {/* Center: Name and meta */}
        <View style={styles.itemDetails}>
          <Text
            style={[styles.itemName, { color: executed ? colors.mutedText : colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.itemMetaText, { color: colors.mutedText }]} numberOfLines={1}>
            {getAccountName(item.accountId)}
            {categoryInfo.name ? ` · ${categoryInfo.name}` : ''}
          </Text>
        </View>

        {/* Right: Amount */}
        <Text
          style={[styles.itemAmount, { color: executed ? mutedTypeColor : typeColor }]}
          numberOfLines={1}
        >
          {currencySymbol}{item.amount}
        </Text>
      </Pressable>
    );

    return (
      <View
        testID={`item-opacity-${item.id}`}
        style={executed ? styles.executedWrapper : null}
      >
        {rowContent}
      </View>
    );
  }, [colors, isExecutedThisMonth, getCategoryInfo, getAccountName, getAccountCurrency,
    getCurrencySymbol, handleEdit, handleLongPress]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return <LoadingView />;
    }
    return (
      <EmptyState icon="calendar-blank-outline" message={t('no_planned_operations')} />
    );
  }, [loading, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderSummaryStrip()}
      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
        windowSize={10}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
      />

      <AddFAB
        testID="planned-add-fab"
        onPress={handleAdd}
        accessibilityLabel={t('add_planned_operation')}
      />

      {/* Modal */}
      <PlannedOperationModal
        visible={modalVisible}
        onClose={handleCloseModal}
        plannedOperation={editingOp}
        isNew={isNew}
      />

      {/* Snackbar */}
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
}

const styles = StyleSheet.create({
  checkBadge: {
    alignItems: 'center',
    backgroundColor: '#66bb6a',
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
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyList: {
    flexGrow: 1,
  },
  executedWrapper: {
    opacity: 0.4,
  },
  iconContainer: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  itemAmount: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    textAlign: 'right',
  },
  itemContainer: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  itemDetails: {
    flex: 1,
    gap: 2,
  },
  itemMetaText: {
    fontSize: FONT_SIZE.sm,
  },
  itemName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 180,
  },
  progressFill: {
    borderRadius: 2,
    height: 3,
  },
  progressLabel: {
    fontSize: FONT_SIZE.xs,
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
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  sectionHeaderCount: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
  },
  sectionHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  sectionHeaderText: {
    flexShrink: 0,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStrip: {
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  summaryValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
});
