import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import DescriptionAutocomplete from '../components/DescriptionAutocomplete';
import OperationFormFields from '../components/operations/OperationFormFields';
import SplitOperationModal from '../components/operations/SplitOperationModal';
import { getDistinctDescriptions } from '../services/OperationsDB';
import * as Currency from '../services/currency';
import { formatDate } from '../services/BalanceHistoryDB';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import currencies from '../../assets/currencies.json';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useOperationForm from '../hooks/useOperationForm';
import ModalShell from '../components/ModalShell';
import { modalSharedStyles } from '../styles/modalStyles';
import useOperationPicker from '../hooks/useOperationPicker';

/**
 * OperationModal Component
 *
 * Modal for adding/editing financial operations (expenses, income, transfers).
 * Uses the shared OperationFormFields component for common form fields
 * (amount, accounts, category) with showTypeSelector={false} and showFieldIcons={false}
 * to match the modal's simpler UI pattern.
 *
 * Additional modal-specific fields:
 * - Type picker (opens modal picker)
 * - Date picker
 * - Description field with autocomplete suggestions (shown for both new and existing operations)
 * - Multi-currency fields (for cross-currency transfers)
 */

/**
 * Get currency symbol from currency code
 * @param {string} currencyCode - Currency code like 'USD', 'EUR', etc.
 * @returns {string} Currency symbol or code if not found
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

export default function OperationModal({ visible, onClose, operation, isNew, onDelete }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { addOperation, updateOperation, validateOperation } = useOperationsActions();
  const { visibleAccounts: accounts } = useAccountsData();
  const { categories } = useCategories();

  // Operation form hook (includes multi-currency logic)
  const {
    values,
    setValues,
    errors,
    showDatePicker,
    setShowDatePicker,
    lastEditedField,
    setLastEditedField,
    isShadowOperation,
    canDeleteShadowOperation,
    filteredCategories,
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    isForeignCurrencyOp,
    rateSource,
    setRateSource,
    handleSave,
    handleClose,
    handleDelete,
    handleSplit,
    getAccountName,
    getAccountBalance,
    getCategoryName,
    formatDateForDisplay,
  } = useOperationForm({
    visible,
    operation,
    isNew,
    accounts,
    categories,
    t,
    addOperation,
    updateOperation,
    validateOperation,
    showDialog,
    onClose,
    onDelete,
  });

  // Operation picker hook for category navigation
  const {
    pickerState,
    categoryNavigation,
    openPicker,
    closePicker,
    navigateIntoFolder,
    navigateBack,
  } = useOperationPicker(t);

  // State for split modal
  const [showSplitModal, setShowSplitModal] = useState(false);

  // Scroll ref for auto-scrolling to description field on keyboard focus
  const scrollViewRef = useRef(null);

  // Autocomplete suggestions for description field
  const [descriptionSuggestions, setDescriptionSuggestions] = useState([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const numericAmount = parseFloat(values.amount);
    getDistinctDescriptions(
      100,
      values.categoryId || null,
      isNaN(numericAmount) ? null : numericAmount,
    ).then(results => {
      if (!cancelled) setDescriptionSuggestions(results);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, values.categoryId, values.amount]);

  // Determine if split button should be shown
  // Only for editing expense/income (not transfers, not shadow operations, not new)
  const canSplit = !isNew && !isShadowOperation && values.type !== 'transfer' && parseFloat(values.amount) > 0;

  // Handle split confirmation
  const handleSplitConfirm = useCallback(async (splitAmount, categoryId) => {
    const result = await handleSplit(splitAmount, categoryId);
    if (result.success) {
      // Keep modal open with updated amount - user can split again
      setShowSplitModal(false);
    } else {
      // Show error (dialog is handled inside handleSplit if needed)
      console.error('[OperationModal] Split failed:', result.error);
    }
  }, [handleSplit]);

  // Memoize calculator amount change handler for performance
  const handleAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, amount: text }));
      setLastEditedField('amount');
    }
  }, [isShadowOperation, setValues, setLastEditedField]);

  // Handler for exchange rate changes
  const handleExchangeRateChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, exchangeRate: text }));
      setLastEditedField('exchangeRate');
      setRateSource('manual');
    }
  }, [isShadowOperation, setValues, setLastEditedField, setRateSource]);

  // Handler for destination amount changes
  const handleDestinationAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, destinationAmount: text }));
      setLastEditedField('destinationAmount');
      setRateSource('manual');
    }
  }, [isShadowOperation, setValues, setLastEditedField, setRateSource]);

  // Handler for operation currency changes (foreign currency expense/income)
  const handleOperationCurrencyChange = useCallback((code) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, operationCurrency: code }));
    }
  }, [isShadowOperation, setValues]);

  // Handler for description changes
  const handleDescriptionChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, description: text }));
    }
  }, [isShadowOperation, setValues]);

  // Handler for description focus (auto-scroll to end)
  // We scroll twice: immediately for initial positioning, then again after the
  // suggestion chips have animated in (150ms fade-in), so chips are visible.
  const handleDescriptionFocus = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, []);

  // Handler for opening date picker
  const handleOpenDatePicker = useCallback(() => {
    if (!isShadowOperation) {
      setShowDatePicker(true);
    }
  }, [isShadowOperation, setShowDatePicker]);

  // Handler for date picker change
  const handleDateChange = useCallback((event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setValues(v => ({
        ...v,
        date: formatDate(selectedDate),
      }));
    }
  }, [setValues]);

  // Empty handler for preventing event propagation
  const handleStopPropagation = useCallback(() => {}, []);

  // Handler for account selection in picker
  const handleAccountSelect = useCallback((accountId) => {
    setValues(v => ({ ...v, accountId }));
    closePicker();
  }, [setValues, closePicker]);

  // Handler for "to account" selection in picker
  const handleToAccountSelect = useCallback((accountId) => {
    setValues(v => ({ ...v, toAccountId: accountId }));
    closePicker();
  }, [setValues, closePicker]);

  // Handler for category selection in picker
  const handleCategorySelect = useCallback(async (category) => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = values.amount;

    if (hasOperation(values.amount)) {
      const evaluated = evaluateExpression(values.amount);
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    // Select entry category and update amount in one setState call
    setValues(v => ({ ...v, categoryId: category.id, amount: finalAmount }));
    closePicker();

    // Only auto-add for new operations, not when editing
    if (isNew) {
      // Check if amount is valid and auto-save
      const hasValidAmount = finalAmount &&
        !isNaN(parseFloat(finalAmount)) &&
        parseFloat(finalAmount) > 0;

      if (hasValidAmount) {
        // Build operation data directly with evaluated amount
        const operationData = {
          type: values.type,
          amount: finalAmount, // Use the evaluated amount directly
          accountId: values.accountId,
          categoryId: category.id,
          date: values.date,
          description: values.description || null,
        };

        try {
          await addOperation(operationData);

          // Save last accessed account
          if (operationData.accountId) {
            setLastAccessedAccount(operationData.accountId);
          }

          onClose();
        } catch (error) {
          console.error('[OperationModal] Failed to add operation:', error);
        }
      }
    }
  }, [values, setValues, closePicker, isNew, addOperation, onClose, hasOperation, evaluateExpression]);

  // FlatList key extractor
  const keyExtractor = useCallback((item) => {
    return item.id || item.key;
  }, []);

  // FlatList render item
  const renderPickerItem = useCallback(({ item }) => {
    if (pickerState.type === 'account' || pickerState.type === 'toAccount') {
      const handlePress = pickerState.type === 'account' ? handleAccountSelect : handleToAccountSelect;
      return (
        <Pressable
          onPress={() => handlePress(item.id)}
          style={({ pressed }) => [
            styles.pickerOption,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <View style={styles.accountOption}>
            <Text style={[styles.pickerOptionText, styles.accountName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.pickerOptionCurrency, { color: colors.mutedText }]} numberOfLines={1}>
              {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
            </Text>
          </View>
        </Pressable>
      );
    } else if (pickerState.type === 'category') {
      const isFolder = item.type === 'folder';
      const isSelected = !isFolder && values.categoryId === item.id;
      const name = item.nameKey ? t(item.nameKey) : item.name;

      return (
        <Pressable
          onPress={() => {
            if (isFolder) {
              navigateIntoFolder(item);
            } else {
              handleCategorySelect(item);
            }
          }}
          style={({ pressed }) => [
            styles.gridCell,
            { backgroundColor: isSelected ? colors.selected : colors.altRow, borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <Icon name={item.icon} size={24} color={colors.text} />
          <Text style={[styles.gridCellName, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
          {isFolder && (
            <View style={styles.folderBadge}>
              <Icon name="folder-outline" size={12} color={colors.mutedText} />
            </View>
          )}
        </Pressable>
      );
    }
    return null;
  }, [pickerState.type, colors, values, handleAccountSelect, handleToAccountSelect, handleCategorySelect, navigateIntoFolder, t]);

  const TYPES = [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ];

  const splitExtraActions = canSplit ? (
    <Pressable
      style={[styles.splitButtonContainer, { backgroundColor: colors.card }]}
      onPress={() => setShowSplitModal(true)}
      testID="split-button"
    >
      <Icon name="call-split" size={18} color={colors.primary} />
      <Text style={[styles.splitButtonText, { color: colors.primary }]}>
        {t('split_transaction')}
      </Text>
    </Pressable>
  ) : null;

  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_operation') : t('edit_operation')}
        onSave={isShadowOperation ? undefined : handleSave}
        onCancel={handleClose}
        cancelLabel={isShadowOperation ? t('close') : t('cancel')}
        onDelete={!isNew && onDelete ? handleDelete : undefined}
        deleteDisabled={!canDeleteShadowOperation}
        deleteLabel={t('delete_operation')}
        extraActions={splitExtraActions}
        scrollRef={scrollViewRef}
        showBlurOverlay
      >
        {/* Shared Form Fields: type selector, amount, account(s), category, multi-currency */}
        <OperationFormFields
          colors={colors}
          t={t}
          values={values}
          setValues={setValues}
          accounts={accounts}
          categories={filteredCategories}
          getAccountName={getAccountName}
          getAccountBalance={getAccountBalance}
          getCategoryName={getCategoryName}
          openPicker={openPicker}
          onAmountChange={handleAmountChange}
          TYPES={TYPES}
          showTypeSelector={true}
          showAccountBalance={true}
          showFieldIcons={true}
          hideCategoryPicker={!isNew}
          hideTransferTargetPicker={true}
          transferLayout="sideBySide"
          compact={true}
          disabled={isShadowOperation}
          containerBackground={colors.card}
          onExchangeRateChange={handleExchangeRateChange}
          onDestinationAmountChange={handleDestinationAmountChange}
          rateSource={rateSource}
          onOperationCurrencyChange={handleOperationCurrencyChange}
          foreignCurrencyEditable={true}
        />

        {/* Category / To Account + Date row */}
        <View style={styles.categoryDateRow}>
          {values.type === 'transfer' ? (
            <View style={styles.halfFieldWrapper}>
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('to_account') || 'To').toUpperCase()}
              </Text>
              <Pressable
                style={[
                  styles.pickerButtonHalf,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isShadowOperation && styles.disabledInput,
                ]}
                onPress={() => !isShadowOperation && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                disabled={isShadowOperation}
                accessibilityRole="button"
                accessibilityLabel={t('to_account')}
                testID="to-account-picker"
              >
                <Icon name="swap-horizontal" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                  numberOfLines={1}
                >
                  {values.toAccountId ? getAccountName(values.toAccountId) : t('to_account')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.halfFieldWrapper}>
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('select_category') || 'Category').toUpperCase()}
              </Text>
              <Pressable
                style={[
                  styles.pickerButtonHalf,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isShadowOperation && styles.disabledInput,
                ]}
                onPress={() => !isShadowOperation && openPicker('category', filteredCategories)}
                disabled={isShadowOperation}
                accessibilityRole="button"
                accessibilityLabel={t('select_category')}
              >
                <Icon name="tag" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                  numberOfLines={1}
                >
                  {getCategoryName(values.categoryId)}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.halfFieldWrapper}>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('select_date') || 'Date').toUpperCase()}
            </Text>
            <Pressable
              style={[
                styles.pickerButtonHalf,
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                isShadowOperation && styles.disabledInput,
              ]}
              onPress={handleOpenDatePicker}
              disabled={isShadowOperation}
              accessibilityRole="button"
              accessibilityLabel={t('select_date')}
              testID="date-input"
            >
              <Icon name="calendar" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
              <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                {formatDateForDisplay(values.date)}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Description with autocomplete */}
        <DescriptionAutocomplete
          value={values.description || ''}
          onChangeText={handleDescriptionChange}
          suggestions={descriptionSuggestions}
          placeholder={t('description')}
          editable={!isShadowOperation}
          colors={colors}
          onFocus={handleDescriptionFocus}
        />

        {errors.general && <Text style={styles.error}>{errors.general}</Text>}
      </ModalShell>

      {/* Split Operation Modal */}
      <SplitOperationModal
        visible={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onConfirm={handleSplitConfirm}
        originalAmount={values.amount}
        operationType={values.type}
        categories={categories}
        colors={colors}
        t={t}
      />

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date(values.date)}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Unified Picker Modal */}
      <Modal
        visible={pickerState.visible && visible}
        animationType="slide"
        transparent
        onRequestClose={closePicker}
      >
        <Pressable style={styles.pickerOverlay} onPress={closePicker}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={handleStopPropagation}>
            {pickerState.type === 'category' && categoryNavigation.breadcrumb.length > 0 && (
              <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
                <Pressable onPress={navigateBack} style={styles.backButton}>
                  <Icon name="arrow-left" size={24} color={colors.primary} />
                </Pressable>
                <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                  {categoryNavigation.breadcrumb[categoryNavigation.breadcrumb.length - 1].name}
                </Text>
              </View>
            )}
            <FlatList
              data={pickerState.data}
              keyExtractor={keyExtractor}
              numColumns={pickerState.type === 'category' ? 3 : 1}
              columnWrapperStyle={pickerState.type === 'category' ? styles.gridRow : undefined}
              contentContainerStyle={pickerState.type === 'category' ? styles.gridContent : undefined}
              renderItem={renderPickerItem}
              ListEmptyComponent={
                <Text style={[styles.pickerEmptyText, { color: colors.mutedText }]}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {(pickerState.type !== 'category' || !isNew) && (
              <Pressable style={styles.closeButton} onPress={closePicker}>
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  accountName: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  accountOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
  },
  breadcrumbContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  categoryDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 48,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledInput: {
    opacity: 0.6,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  folderBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  gridCell: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
    margin: SPACING.xs,
    padding: SPACING.md,
    position: 'relative',
    width: (Dimensions.get('window').width - SPACING.md * 2 - SPACING.sm * 2 - SPACING.xs * 2 * 3) / 3,
  },
  gridCellName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  gridContent: {
    padding: SPACING.sm,
  },
  gridRow: {
    justifyContent: 'flex-start',
  },
  halfFieldWrapper: {
    flex: 1,
  },
  pickerButtonHalf: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 48,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  pickerButtonText: {
    fontSize: 13,
  },
  pickerEmptyText: {
    padding: 20,
    textAlign: 'center',
  },
  pickerModalContent: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '70%',
    padding: SPACING.md,
    width: '100%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pickerOptionCurrency: {
    fontSize: 14,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  pickerOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  splitButtonContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: SPACING.sm,
  },
  splitButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

});

OperationModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  operation: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    accountId: PropTypes.string,
    categoryId: PropTypes.string,
    description: PropTypes.string,
    date: PropTypes.string,
    toAccountId: PropTypes.string,
    exchangeRate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    destinationAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  isNew: PropTypes.bool,
  onDelete: PropTypes.func,
};

OperationModal.defaultProps = {
  visible: false,
  onClose: () => {},
  operation: null,
  isNew: false,
  onDelete: null,
};
