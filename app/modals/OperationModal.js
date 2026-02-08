import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import OperationFormFields from '../components/operations/OperationFormFields';
import SplitOperationModal from '../components/operations/SplitOperationModal';
import * as Currency from '../services/currency';
import { formatDate } from '../services/BalanceHistoryDB';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import currencies from '../../assets/currencies.json';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useOperationForm from '../hooks/useOperationForm';
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
 * - Description field (only when editing)
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
    handleSave,
    handleClose,
    handleDelete,
    handleSplit,
    getAccountName,
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
    }
  }, [isShadowOperation, setValues, setLastEditedField]);

  // Handler for destination amount changes
  const handleDestinationAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, destinationAmount: text }));
      setLastEditedField('destinationAmount');
    }
  }, [isShadowOperation, setValues, setLastEditedField]);

  // Handler for description changes
  const handleDescriptionChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, description: text }));
    }
  }, [isShadowOperation, setValues]);

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
            <Text style={[styles.pickerOptionText, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.pickerOptionCurrency, { color: colors.mutedText }]}>
              {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
            </Text>
          </View>
        </Pressable>
      );
    } else if (pickerState.type === 'category') {
      // Determine if this is a folder or entry
      const isFolder = item.type === 'folder';

      return (
        <Pressable
          onPress={() => {
            if (isFolder) {
              // Navigate into folder
              navigateIntoFolder(item);
            } else {
              handleCategorySelect(item);
            }
          }}
          style={({ pressed }) => [
            styles.pickerOption,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <View style={styles.categoryOption}>
            <Icon name={item.icon} size={24} color={colors.text} />
            <Text style={[styles.pickerOptionText, styles.categoryLabel, { color: colors.text }]}>
              {item.nameKey ? t(item.nameKey) : item.name}
            </Text>
            {isFolder && <Icon name="chevron-right" size={24} color={colors.mutedText} />}
          </View>
        </Pressable>
      );
    }
    return null;
  }, [pickerState.type, colors, handleAccountSelect, handleToAccountSelect, handleCategorySelect, navigateIntoFolder, t]);

  const TYPES = [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ];

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}
      >
        <SafeAreaView style={styles.fullFlex} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior="height"
            style={styles.fullFlex}
          >
            <Pressable style={styles.modalOverlay} onPress={handleClose}>
              <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={handleStopPropagation}>
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {isNew && (
                    <Text style={[styles.modalTitle, { color: colors.text }]}> 
                      {t('add_operation')}
                    </Text>
                  )}

                  {/* Shared Form Fields: Type selector, Amount, Account(s), Category, Multi-currency */}
                  <OperationFormFields
                    colors={colors}
                    t={t}
                    values={values}
                    setValues={setValues}
                    accounts={accounts}
                    categories={filteredCategories}
                    getAccountName={getAccountName}
                    getCategoryName={getCategoryName}
                    openPicker={openPicker}
                    onAmountChange={handleAmountChange}
                    TYPES={TYPES}
                    showTypeSelector={true}
                    showAccountBalance={false}
                    showFieldIcons={false}
                    transferLayout="sideBySide"
                    disabled={isShadowOperation}
                    containerBackground={colors.card}
                    onExchangeRateChange={handleExchangeRateChange}
                    onDestinationAmountChange={handleDestinationAmountChange}
                  />

                  {/* Date Picker Button */}
                  <Pressable
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput,
                    ]}
                    onPress={handleOpenDatePicker}
                    disabled={isShadowOperation}
                    accessibilityRole="button"
                    accessibilityLabel={t('select_date')}
                    testID="date-input" // Added testID for date input
                  >
                    <View style={styles.pickerButtonContent}>
                      <Icon name="calendar" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                      <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                        {formatDateForDisplay(values.date)}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Description Input - Only show when editing existing operations */}
                  {!isNew && (
                    <TextInput
                      style={[
                        styles.input,
                        styles.descriptionInput,
                        { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                        isShadowOperation && styles.disabledInput,
                      ]}
                      value={values.description}
                      onChangeText={handleDescriptionChange}
                      placeholder={t('description')}
                      placeholderTextColor={colors.mutedText}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      editable={!isShadowOperation}
                    />
                  )}

                  {errors.general && <Text style={styles.error}>{errors.general}</Text>}
                </ScrollView>

                {/* Action Buttons */}
                <View style={[styles.modalButtonRow, { backgroundColor: colors.card }]}>
                  <Pressable
                    style={[styles.modalButton, { backgroundColor: colors.secondary }]}
                    onPress={handleClose}
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>
                      {isShadowOperation ? t('close') : t('cancel')}
                    </Text>
                  </Pressable>
                  {!isShadowOperation && (
                    <Pressable
                      style={[styles.modalButton, { backgroundColor: colors.primary }]}
                      onPress={handleSave}
                      accessibilityLabel="Save"
                      testID="save-button" // Added testID for Save button
                    >
                      <Text style={[styles.buttonText, { color: colors.text }]}>
                        {t('save')}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Split & Delete Buttons Row */}
                {(canSplit || (!isNew && onDelete)) && (
                  <View style={styles.splitDeleteRow}>
                    {canSplit && (
                      <Pressable
                        style={[
                          styles.splitButtonContainer,
                          { backgroundColor: colors.card },
                        ]}
                        onPress={() => setShowSplitModal(true)}
                        testID="split-button"
                      >
                        <Icon
                          name="call-split"
                          size={18}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.splitButtonText,
                            { color: colors.primary },
                          ]}
                        >
                          {t('split_transaction')}
                        </Text>
                      </Pressable>
                    )}
                    {!isNew && onDelete && (
                      <Pressable
                        style={[
                          styles.deleteButtonContainer,
                          { backgroundColor: colors.card },
                          !canDeleteShadowOperation && styles.disabledButton,
                        ]}
                        onPress={handleDelete}
                        disabled={!canDeleteShadowOperation}
                      >
                        <Icon
                          name="delete-outline"
                          size={18}
                          color={canDeleteShadowOperation ? (colors.delete || '#ff6b6b') : colors.mutedText}
                        />
                        <Text
                          style={[
                            styles.deleteButtonText,
                            { color: canDeleteShadowOperation ? (colors.delete || '#ff6b6b') : colors.mutedText },
                          ]}
                        >
                          {t('delete_operation')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

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
        <Pressable style={styles.modalOverlay} onPress={closePicker}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={handleStopPropagation}>
            {/* Breadcrumb navigation for categories */}
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
              renderItem={renderPickerItem}
              ListEmptyComponent={
                <Text style={[styles.pickerEmptyText, { color: colors.mutedText }]}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {/* Show Close button for non-category pickers OR when editing operations */}
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
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryLabel: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  categoryOption: {
    alignItems: 'center',
    flexDirection: 'row',
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
  deleteButtonContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: SPACING.sm,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  descriptionInput: {
    minHeight: 80,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledInput: {
    opacity: 0.6,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  fullFlex: {
    flex: 1,
  },
  input: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    marginHorizontal: SPACING.sm,
    minHeight: 48,
    paddingVertical: SPACING.md,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalContent: {
    borderRadius: BORDER_RADIUS.lg,
    elevation: 5,
    flexDirection: 'column',
    maxHeight: '80%',
    minHeight: '60%',
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    minHeight: 48,
    padding: SPACING.md,
  },
  pickerButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pickerButtonText: {
    fontSize: 16,
  },
  pickerEmptyText: {
    padding: 20,
    textAlign: 'center',
  },
  pickerModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    maxHeight: '70%',
    padding: SPACING.md,
    width: '90%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  pickerOptionCurrency: {
    fontSize: 14,
  },
  pickerOptionText: {
    fontSize: 18,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
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
  splitDeleteRow: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
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
