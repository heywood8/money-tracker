import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useOperations } from '../contexts/OperationsContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getLastAccessedAccount, setLastAccessedAccount } from '../services/LastAccount';
import Calculator from '../components/Calculator';
import MultiCurrencyFields from '../components/modals/MultiCurrencyFields';
import * as Currency from '../services/currency';
import { formatDate } from '../services/BalanceHistoryDB';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import currencies from '../../assets/currencies.json';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import { getCategoryDisplayName } from '../utils/categoryUtils';

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
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { addOperation, updateOperation, validateOperation } = useOperations();
  const { visibleAccounts: accounts } = useAccounts();
  const { categories } = useCategories();

  const [values, setValues] = useState({
    type: 'expense',
    amount: '',
    accountId: '',
    categoryId: '',
    date: formatDate(new Date()),
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerState, setPickerState] = useState({
    visible: false,
    type: null,
    data: [],
    allCategories: [],
  });
  // Category navigation state (for hierarchical folder navigation)
  const [categoryNavigation, setCategoryNavigation] = useState({
    currentFolderId: null,
    breadcrumb: [],
  });
  // Track which field was last edited to determine calculation direction
  const [lastEditedField, setLastEditedField] = useState(null);

  // Memoize calculator amount change handler for performance
  const handleAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, amount: text }));
      setLastEditedField('amount');
    }
  }, [isShadowOperation]);

  useEffect(() => {
    // Only run when modal becomes visible
    if (!visible) return;

    let cancelled = false;
    async function setDefaultAccount() {
      if (operation && !isNew) {
        // Normalize values when editing an existing operation
        setValues({
          type: operation.type || 'expense',
          amount: String(operation.amount || ''),
          accountId: operation.accountId || accounts[0]?.id || '',
          categoryId: operation.categoryId || '',
          description: operation.description || '',
          date: operation.date || formatDate(new Date()),
          toAccountId: operation.toAccountId || '',
          exchangeRate: String(operation.exchangeRate || ''),
          destinationAmount: String(operation.destinationAmount || ''),
        });
        // Reset last edited field when opening modal with existing operation
        setLastEditedField(null);
      } else if (isNew) {
        let defaultAccountId = '';
        if (accounts.length === 1) {
          defaultAccountId = accounts[0].id;
        } else if (accounts.length > 1) {
          // Try to get last accessed account
          const lastId = await getLastAccessedAccount();
          if (lastId && accounts.some(acc => acc.id === lastId)) {
            defaultAccountId = lastId;
          } else {
            // Fallback: lowest ID (lexicographically)
            defaultAccountId = accounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0].id;
          }
        }
        if (!cancelled) {
          setValues({
            type: 'expense',
            amount: '',
            accountId: defaultAccountId,
            categoryId: '',
            description: '',
            date: formatDate(new Date()),
            toAccountId: '',
            exchangeRate: '',
            destinationAmount: '',
          });
          // Reset last edited field when opening modal for new operation
          setLastEditedField(null);
        }
      }
      if (!cancelled) setErrors({});
    }
    setDefaultAccount();
    return () => { cancelled = true; };
  }, [operation, isNew, visible, accounts]);

  const validateFields = useCallback((valuesToValidate = null) => {
    const vals = valuesToValidate || values;
    const newErrors = {};

    if (!vals.type) {
      newErrors.type = t('operation_type_required');
    }

    if (!vals.amount || isNaN(parseFloat(vals.amount)) || parseFloat(vals.amount) <= 0) {
      newErrors.amount = t('valid_amount_required');
    }

    if (!vals.accountId) {
      newErrors.accountId = t('account_required');
    }

    if (vals.type === 'transfer') {
      if (!vals.toAccountId) {
        newErrors.toAccountId = t('destination_account_required');
      } else if (vals.accountId === vals.toAccountId) {
        newErrors.toAccountId = t('accounts_must_be_different');
      }
    } else if (!vals.categoryId) {
      newErrors.categoryId = t('category_required');
    }

    if (!vals.date) {
      newErrors.date = t('date_required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, t]);

  const handleSave = useCallback(async () => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = values.amount;
    if (hasOperation(values.amount)) {
      const evaluated = evaluateExpression(values.amount);
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    // Create updated values with evaluated amount for validation
    const valuesToValidate = { ...values, amount: finalAmount };

    if (!validateFields(valuesToValidate)) {
      return;
    }

    // Update the state with evaluated amount
    setValues(v => ({ ...v, amount: finalAmount }));

    // Pass the evaluated amount to prepareOperationData
    const operationData = prepareOperationData(finalAmount);

    if (isNew) {
      await addOperation(operationData);
    } else {
      await updateOperation(operation.id, operationData);
    }

    // Save last accessed account
    if (operationData.accountId) {
      setLastAccessedAccount(operationData.accountId);
    }

    onClose();
  }, [values, validateFields, prepareOperationData, isNew, addOperation, updateOperation, operation, onClose]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  // Check if operation belongs to a shadow category
  const isShadowOperation = useMemo(() => {
    if (!operation || !operation.categoryId) return false;
    const category = categories.find(cat => cat.id === operation.categoryId);
    return category?.isShadow || false;
  }, [operation, categories]);

  // Check if operation date is today (for shadow operations)
  const isOperationToday = useMemo(() => {
    if (!operation) return false;
    const today = new Date().toISOString().split('T')[0];
    return operation.date === today;
  }, [operation]);

  // Shadow operations can only be deleted if they were made today
  const canDeleteShadowOperation = useMemo(() => {
    return !isShadowOperation || isOperationToday;
  }, [isShadowOperation, isOperationToday]);

  const handleDelete = useCallback(() => {
    if (onDelete && operation && canDeleteShadowOperation) {
      onDelete(operation);
      onClose();
    }
  }, [onDelete, operation, onClose, canDeleteShadowOperation]);

  const openPicker = useCallback((type, data) => {
    Keyboard.dismiss();
    if (type === 'category') {
      // For categories, show root folders and root entry categories
      const rootItems = data.filter(cat => !cat.parentId);
      setPickerState({ visible: true, type, data: rootItems, allCategories: data });
      setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
    } else {
      setPickerState({ visible: true, type, data, allCategories: [] });
    }
  }, []);

  const closePicker = useCallback(() => {
    setPickerState({ visible: false, type: null, data: [], allCategories: [] });
    setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
  }, []);

  const getAccountName = useCallback((accountId) => {
    if (!accountId) return t('select_account');
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : t('select_account');
  }, [accounts, t]);

  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const displayName = getCategoryDisplayName(categoryId, categories, t);
    return displayName || t('select_category');
  }, [categories, t]);

  // Navigate into a category folder
  const navigateIntoFolder = useCallback((folder) => {
    setPickerState(prev => {
      const folderName = folder.nameKey ? t(folder.nameKey) : folder.name;
      const children = prev.allCategories.filter(cat => cat.parentId === folder.id);

      setCategoryNavigation(prevNav => ({
        currentFolderId: folder.id,
        breadcrumb: [...prevNav.breadcrumb, { id: folder.id, name: folderName }],
      }));

      return { ...prev, data: children };
    });
  }, [t]);

  // Navigate back to previous folder level
  const navigateBack = useCallback(() => {
    setPickerState(prev => {
      const newBreadcrumb = categoryNavigation.breadcrumb.slice(0, -1);
      const newFolderId = newBreadcrumb.length > 0
        ? newBreadcrumb[newBreadcrumb.length - 1].id
        : null;

      // Get the appropriate categories for this level
      let newData;
      if (newFolderId === null) {
        newData = prev.allCategories.filter(cat => !cat.parentId);
      } else {
        newData = prev.allCategories.filter(cat => cat.parentId === newFolderId);
      }

      setCategoryNavigation({
        currentFolderId: newFolderId,
        breadcrumb: newBreadcrumb,
      });

      return { ...prev, data: newData };
    });
  }, [categoryNavigation.breadcrumb]);

  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (values.type === 'transfer') return false;
      // Exclude shadow categories from selection
      if (cat.isShadow) return false;
      return cat.categoryType === values.type;
    });
  }, [categories, values.type]);

  const formatDateForDisplay = useCallback((isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // Get source and destination accounts for currency detection
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.accountId);
  }, [accounts, values.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.toAccountId);
  }, [accounts, values.toAccountId]);

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = useMemo(() => {
    if (values.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [values.type, sourceAccount, destinationAccount]);

  // Auto-populate exchange rate when accounts change
  useEffect(() => {
    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount && !values.exchangeRate) {
      const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
      if (rate) {
        setValues(v => ({ ...v, exchangeRate: rate }));
        setLastEditedField('exchangeRate');
      }
    }
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, values.exchangeRate]);

  // Auto-calculate based on which field was last edited
  useEffect(() => {
    if (!isMultiCurrencyTransfer) {
      // Clear exchange rate fields for same-currency transfers
      if (values.exchangeRate || values.destinationAmount) {
        setValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
        setLastEditedField(null);
      }
      return;
    }

    if (!sourceAccount || !destinationAccount) return;

    // If user edited destination amount, calculate the rate
    if (lastEditedField === 'destinationAmount') {
      if (values.amount && values.destinationAmount) {
        // Calculate rate = destinationAmount / sourceAmount (accounting for decimal places)
        const sourceAmount = parseFloat(values.amount);
        const destAmount = parseFloat(values.destinationAmount);

        if (!isNaN(sourceAmount) && !isNaN(destAmount) && sourceAmount > 0) {
          const calculatedRate = (destAmount / sourceAmount).toFixed(6);
          // Only update if the rate has meaningfully changed (avoid precision issues)
          const currentRate = parseFloat(values.exchangeRate || '0');
          const newRate = parseFloat(calculatedRate);
          if (Math.abs(currentRate - newRate) > 0.000001) {
            setValues(v => ({ ...v, exchangeRate: calculatedRate }));
          }
        }
      }
    }
    // If user edited amount or rate, calculate destination amount
    else if (lastEditedField === 'amount' || lastEditedField === 'exchangeRate') {
      if (values.amount && values.exchangeRate) {
        const converted = Currency.convertAmount(
          values.amount,
          sourceAccount.currency,
          destinationAccount.currency,
          values.exchangeRate,
        );
        if (converted && converted !== values.destinationAmount) {
          setValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [isMultiCurrencyTransfer, values.amount, values.exchangeRate, values.destinationAmount, sourceAccount, destinationAccount, lastEditedField]);

  // Prepare operation data with currency information for saving
  const prepareOperationData = useCallback((customAmount = null) => {
    const data = { ...values };

    // Override amount if provided (used when evaluating expressions)
    if (customAmount !== null) {
      data.amount = customAmount;
    }

    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount) {
      data.sourceCurrency = sourceAccount.currency;
      data.destinationCurrency = destinationAccount.currency;
    }

    // Ensure amount is preserved when editing
    if (!isNew && !data.amount && operation?.amount) {
      data.amount = String(operation.amount);
    }

    // Format amounts based on currency decimal places
    if (data.amount && sourceAccount) {
      data.amount = Currency.formatAmount(data.amount, sourceAccount.currency);
    }

    if (data.destinationAmount && destinationAccount) {
      data.destinationAmount = Currency.formatAmount(data.destinationAmount, destinationAccount.currency);
    }

    return data;
  }, [values, isMultiCurrencyTransfer, sourceAccount, destinationAccount, isNew, operation]);

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
              <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {isNew ? t('add_operation') : t('edit_operation')}
                  </Text>

                  {/* Type Picker */}
                  <Pressable
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput,
                    ]}
                    onPress={() => !isShadowOperation && openPicker('type', TYPES)}
                    disabled={isShadowOperation}
                  >
                    <View style={styles.pickerButtonContent}>
                      <Icon
                        name={TYPES.find(tp => tp.key === values.type)?.icon || 'help-circle'}
                        size={20}
                        color={isShadowOperation ? colors.mutedText : colors.text}
                      />
                      <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                        {TYPES.find(tp => tp.key === values.type)?.label}
                      </Text>
                    </View>
                    <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                  </Pressable>

                  {/* Amount Calculator */}
                  <View style={isShadowOperation && styles.disabledInput}>
                    <Calculator
                      value={values.amount}
                      onValueChange={handleAmountChange}
                      colors={colors}
                      placeholder={t('amount')}
                      containerBackground={colors.card}
                    />
                  </View>

                  {/* Account Picker */}
                  <Pressable
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput,
                    ]}
                    onPress={() => !isShadowOperation && openPicker('account', accounts)}
                    disabled={isShadowOperation}
                  >
                    <Text style={{ color: isShadowOperation ? colors.mutedText : colors.text }}>
                      {getAccountName(values.accountId)}
                    </Text>
                    <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                  </Pressable>

                  {/* To Account Picker (only for transfers) */}
                  {values.type === 'transfer' && (
                    <>
                      <Pressable
                        style={[
                          styles.pickerButton,
                          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                          isShadowOperation && styles.disabledInput,
                        ]}
                        onPress={() => !isShadowOperation && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                        disabled={isShadowOperation}
                      >
                        <Text style={{ color: isShadowOperation ? colors.mutedText : colors.text }}>
                          {t('to_account')}: {getAccountName(values.toAccountId)}
                        </Text>
                        <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                      </Pressable>

                      {/* Multi-currency transfer fields */}
                      {isMultiCurrencyTransfer && sourceAccount && destinationAccount && (
                        <MultiCurrencyFields
                          colors={colors}
                          t={t}
                          sourceAccount={sourceAccount}
                          destinationAccount={destinationAccount}
                          exchangeRate={values.exchangeRate}
                          destinationAmount={values.destinationAmount}
                          isShadowOperation={isShadowOperation}
                          onExchangeRateChange={(text) => {
                            if (!isShadowOperation) {
                              setValues(v => ({ ...v, exchangeRate: text }));
                              setLastEditedField('exchangeRate');
                            }
                          }}
                          onDestinationAmountChange={(text) => {
                            if (!isShadowOperation) {
                              setValues(v => ({ ...v, destinationAmount: text }));
                              setLastEditedField('destinationAmount');
                            }
                          }}
                        />
                      )}
                    </>
                  )}

                  {/* Category Picker (not for transfers) */}
                  {values.type !== 'transfer' && (
                    <Pressable
                      style={[
                        styles.pickerButton,
                        { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                        isShadowOperation && styles.disabledInput,
                      ]}
                      onPress={() => !isShadowOperation && openPicker('category', filteredCategories)}
                      disabled={isShadowOperation}
                    >
                      <Text style={{ color: isShadowOperation ? colors.mutedText : colors.text }}>
                        {getCategoryName(values.categoryId)}
                      </Text>
                      <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                    </Pressable>
                  )}

                  {/* Date Picker Button */}
                  <Pressable
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput,
                    ]}
                    onPress={() => !isShadowOperation && setShowDatePicker(true)}
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
                    <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
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
                      onChangeText={text => !isShadowOperation && setValues(v => ({ ...v, description: text }))}
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

                {/* Delete Button (only for editing) */}
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
                      size={20}
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
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date(values.date)}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setValues(v => ({
                ...v,
                date: formatDate(selectedDate),
              }));
            }
          }}
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
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
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
              keyExtractor={(item) => {
                if (pickerState.type === 'type') return item.key;
                if (pickerState.type === 'account' || pickerState.type === 'toAccount') return item.id;
                if (pickerState.type === 'category') return item.id;
                return item.id || item.key;
              }}
              renderItem={({ item }) => {
                if (pickerState.type === 'type') {
                  return (
                    <Pressable
                      onPress={() => {
                        setValues(v => ({
                          ...v,
                          type: item.key,
                          categoryId: item.key === 'transfer' ? '' : v.categoryId,
                        }));
                        closePicker();
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                      ]}
                    >
                      <View style={styles.pickerOptionContent}>
                        <Icon name={item.icon} size={24} color={colors.text} />
                        <Text style={[styles.pickerOptionText, { color: colors.text }]}>{item.label}</Text>
                      </View>
                    </Pressable>
                  );
                } else if (pickerState.type === 'account' || pickerState.type === 'toAccount') {
                  return (
                    <Pressable
                      onPress={() => {
                        if (pickerState.type === 'account') {
                          setValues(v => ({ ...v, accountId: item.id }));
                        } else {
                          setValues(v => ({ ...v, toAccountId: item.id }));
                        }
                        closePicker();
                      }}
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
                      onPress={async () => {
                        if (isFolder) {
                          // Navigate into folder
                          navigateIntoFolder(item);
                        } else {
                          // Automatically evaluate any pending math operation before saving
                          let finalAmount = values.amount;

                          if (hasOperation(values.amount)) {
                            const evaluated = evaluateExpression(values.amount);
                            if (evaluated !== null) {
                              finalAmount = evaluated;
                            }
                          }

                          // Select entry category and update amount in one setState call
                          setValues(v => ({ ...v, categoryId: item.id, amount: finalAmount }));
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
                                categoryId: item.id,
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
              }}
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
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 48,
    paddingVertical: SPACING.md,
  },
  deleteButtonText: {
    fontSize: 16,
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
    marginBottom: 8,
  },
  fullFlex: {
    flex: 1,
  },
  input: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    padding: 12,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 8,
    minHeight: 48,
    paddingVertical: 12,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalContent: {
    borderRadius: 12,
    elevation: 5,
    flexDirection: 'column',
    maxHeight: '80%',
    minHeight: '60%',
    padding: 20,
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
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 48,
    padding: 12,
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
    borderRadius: 12,
    maxHeight: '70%',
    padding: 12,
    width: '90%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  pickerOptionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  pickerOptionCurrency: {
    fontSize: 14,
  },
  pickerOptionText: {
    fontSize: 18,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
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
