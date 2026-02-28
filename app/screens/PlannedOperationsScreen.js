import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, FAB, ActivityIndicator, Snackbar } from 'react-native-paper';
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
  const [activeTab, setActiveTab] = useState('recurring');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Filter planned operations by tab
  const filteredOps = useMemo(() => {
    if (activeTab === 'recurring') {
      return plannedOperations.filter(op => op.isRecurring);
    }
    return plannedOperations.filter(op => !op.isRecurring);
  }, [plannedOperations, activeTab]);

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

  const renderItem = useCallback(({ item }) => {
    const executed = isExecutedThisMonth(item);
    const categoryInfo = getCategoryInfo(item.categoryId);
    const accountCurrency = getAccountCurrency(item.accountId);
    const currencySymbol = getCurrencySymbol(accountCurrency);
    const typeColor = colors[TYPE_COLORS[item.type]] || colors.text;

    return (
      <Pressable
        style={[
          styles.itemContainer,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: executed ? 0.6 : 1,
          },
        ]}
        onPress={() => handleEdit(item)}
        onLongPress={() => handleLongPress(item)}
      >
        {/* Left: Category icon or type icon */}
        <View style={[styles.iconContainer, { backgroundColor: typeColor + '1A' }]}>
          <Icon
            name={categoryInfo.icon || TYPE_ICONS[item.type]}
            size={22}
            color={typeColor}
          />
        </View>

        {/* Center: Name, account, category */}
        <View style={styles.itemDetails}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.itemMeta}>
            <Text style={[styles.itemMetaText, { color: colors.mutedText }]} numberOfLines={1}>
              {getAccountName(item.accountId)}
              {categoryInfo.name ? ` • ${categoryInfo.name}` : ''}
            </Text>
          </View>
        </View>

        {/* Right: Amount and execute button */}
        <View style={styles.itemRight}>
          <Text style={[styles.itemAmount, { color: typeColor }]} numberOfLines={1}>
            {currencySymbol}{item.amount}
          </Text>
          <Pressable
            style={[
              styles.executeButton,
              {
                backgroundColor: executed ? colors.income + '1A' : colors.primary + '1A',
              },
            ]}
            onPress={() => !executed && handleExecute(item)}
            disabled={executed}
            hitSlop={8}
          >
            <Icon
              name={executed ? 'check-circle' : 'play-circle-outline'}
              size={24}
              color={executed ? colors.income : colors.primary}
            />
          </Pressable>
        </View>
      </Pressable>
    );
  }, [colors, isExecutedThisMonth, getCategoryInfo, getAccountName, getAccountCurrency, getCurrencySymbol, handleEdit, handleLongPress, handleExecute]);

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Icon name="calendar-blank-outline" size={48} color={colors.mutedText} />
        <Text style={[styles.emptyText, { color: colors.mutedText }]}>
          {t('no_planned_operations')}
        </Text>
      </View>
    );
  }, [loading, colors, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab Selector */}
      <View style={styles.tabRow}>
        <Pressable
          style={[
            styles.tab,
            {
              backgroundColor: activeTab === 'recurring' ? colors.primary + '1A' : 'transparent',
              borderColor: activeTab === 'recurring' ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setActiveTab('recurring')}
        >
          <Icon
            name="refresh"
            size={16}
            color={activeTab === 'recurring' ? colors.primary : colors.mutedText}
          />
          <Text style={[styles.tabText, { color: activeTab === 'recurring' ? colors.primary : colors.mutedText }]}>
            {t('recurring')}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            {
              backgroundColor: activeTab === 'one_time' ? colors.primary + '1A' : 'transparent',
              borderColor: activeTab === 'one_time' ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setActiveTab('one_time')}
        >
          <Icon
            name="numeric-1-circle-outline"
            size={16}
            color={activeTab === 'one_time' ? colors.primary : colors.mutedText}
          />
          <Text style={[styles.tabText, { color: activeTab === 'one_time' ? colors.primary : colors.mutedText }]}>
            {t('one_time')}
          </Text>
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        data={filteredOps}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={filteredOps.length === 0 ? styles.emptyList : styles.listContent}
        windowSize={10}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
      />

      {/* FAB */}
      <FAB
        icon="plus"
        label={t('add_planned_operation')}
        style={[styles.fab, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}
        color={colors.text}
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
        style={{ marginBottom: 100 }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
  },
  executeButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  fab: {
    borderRadius: 28,
    borderWidth: 1,
    bottom: 100,
    elevation: 8,
    margin: SPACING.lg,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  itemDetails: {
    flex: 1,
    gap: 2,
  },
  itemMeta: {
    flexDirection: 'row',
  },
  itemMetaText: {
    fontSize: FONT_SIZE.sm,
  },
  itemName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  listContent: {
    paddingBottom: 180,
  },
  tab: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    marginHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
});
