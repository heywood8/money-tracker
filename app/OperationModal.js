import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useOperations } from './OperationsContext';
import { useAccounts } from './AccountsContext';
import { useCategories } from './CategoriesContext';
import { getLastAccessedAccount, setLastAccessedAccount } from './services/LastAccount';
import * as Currency from './services/currency';
import currencies from '../assets/currencies.json';

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
    description: '',
    date: new Date().toISOString().split('T')[0],
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
  });
  // Track which field was last edited to determine calculation direction
  const [lastEditedField, setLastEditedField] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function setDefaultAccount() {
      if (operation && !isNew) {
        setValues({ ...operation });
      } else if (isNew) {
        let defaultAccountId = '';
        if (accounts.length === 1) {
          defaultAccountId = accounts[0].id;
        } else if (accounts.length > 1) {
          // Try to get last accessed from AsyncStorage
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
            date: new Date().toISOString().split('T')[0],
            toAccountId: '',
            exchangeRate: '',
            destinationAmount: '',
          });
        }
      }
      if (!cancelled) setErrors({});
    }
    setDefaultAccount();
    return () => { cancelled = true; };
  }, [operation, isNew, visible, accounts]);

  const handleSave = useCallback(async () => {
    const operationData = prepareOperationData();
    const error = validateOperation(operationData, t);
    if (error) {
      setErrors({ general: error });
      return;
    }

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
  }, [prepareOperationData, validateOperation, isNew, addOperation, updateOperation, operation, onClose, t]);

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
    setPickerState({ visible: true, type, data });
  }, []);

  const closePicker = useCallback(() => {
    setPickerState({ visible: false, type: null, data: [] });
  }, []);

  const getAccountName = useCallback((accountId) => {
    if (!accountId) return t('select_account');
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : t('select_account');
  }, [accounts, t]);

  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return t('select_category');
    return category.nameKey ? t(category.nameKey) : category.name;
  }, [categories, t]);

  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (values.type === 'transfer') return false;
      // Exclude shadow categories from selection
      if (cat.isShadow) return false;
      return cat.categoryType === values.type && cat.type === 'entry';
    });
  }, [categories, values.type]);

  const formatDateForDisplay = useCallback((isoDate) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
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
          values.exchangeRate
        );
        if (converted && converted !== values.destinationAmount) {
          setValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [isMultiCurrencyTransfer, values.amount, values.exchangeRate, values.destinationAmount, sourceAccount, destinationAccount, lastEditedField]);

  // Prepare operation data with currency information for saving
  const prepareOperationData = useCallback(() => {
    const data = { ...values };

    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount) {
      data.sourceCurrency = sourceAccount.currency;
      data.destinationCurrency = destinationAccount.currency;
      // Exchange rate and destination amount are already in values
    }

    return data;
  }, [values, isMultiCurrencyTransfer, sourceAccount, destinationAccount]);

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
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior="height"
            style={{ flex: 1 }}
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
                      isShadowOperation && styles.disabledInput
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

                  {/* Amount Input */}
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput
                    ]}
                    value={values.amount}
                    onChangeText={text => {
                      if (!isShadowOperation) {
                        setValues(v => ({ ...v, amount: text }));
                        setLastEditedField('amount');
                      }
                    }}
                    placeholder={t('amount')}
                    placeholderTextColor={colors.mutedText}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    editable={!isShadowOperation}
                  />

                  {/* Account Picker */}
                  <Pressable
                    style={[
                      styles.pickerButton,
                      { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput
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
                          isShadowOperation && styles.disabledInput
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
                        <>
                          {/* Currency info display */}
                          <View style={styles.currencyInfo}>
                            <Icon name="swap-horizontal-circle" size={16} color={colors.mutedText} />
                            <Text style={[styles.currencyInfoText, { color: colors.mutedText }]}>
                              {getCurrencySymbol(sourceAccount.currency)} → {getCurrencySymbol(destinationAccount.currency)}
                            </Text>
                          </View>

                          {/* Exchange Rate Input */}
                          <View style={styles.inputRow}>
                            <Text style={[styles.inputLabel, { color: colors.text }]}>
                              {t('exchange_rate')}:
                            </Text>
                            <TextInput
                              style={[
                                styles.smallInput,
                                { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                                isShadowOperation && styles.disabledInput
                              ]}
                              value={values.exchangeRate}
                              onChangeText={text => {
                                if (!isShadowOperation) {
                                  setValues(v => ({ ...v, exchangeRate: text }));
                                  setLastEditedField('exchangeRate');
                                }
                              }}
                              placeholder="0.00"
                              placeholderTextColor={colors.mutedText}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              onSubmitEditing={Keyboard.dismiss}
                              editable={!isShadowOperation}
                            />
                          </View>

                          {/* Destination Amount Input */}
                          <View style={styles.inputRow}>
                            <Text style={[styles.inputLabel, { color: colors.text }]}>
                              {t('destination_amount')}:
                            </Text>
                            <TextInput
                              style={[
                                styles.smallInput,
                                { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                                isShadowOperation && styles.disabledInput
                              ]}
                              value={values.destinationAmount}
                              onChangeText={text => {
                                if (!isShadowOperation) {
                                  setValues(v => ({ ...v, destinationAmount: text }));
                                  setLastEditedField('destinationAmount');
                                }
                              }}
                              placeholder="0.00"
                              placeholderTextColor={colors.mutedText}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              onSubmitEditing={Keyboard.dismiss}
                              editable={!isShadowOperation}
                            />
                            <Text style={[styles.currencyLabel, { color: colors.mutedText }]}>
                              {getCurrencySymbol(destinationAccount.currency)}
                            </Text>
                          </View>

                          {/* Exchange rate source info */}
                          <Text style={[styles.rateInfo, { color: colors.mutedText }]}>
                            {t('offline_rate_info')} ({Currency.getExchangeRatesLastUpdated()})
                          </Text>
                        </>
                      )}
                    </>
                  )}

                  {/* Category Picker (not for transfers) */}
                  {values.type !== 'transfer' && (
                    <Pressable
                      style={[
                        styles.pickerButton,
                        { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                        isShadowOperation && styles.disabledInput
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
                      isShadowOperation && styles.disabledInput
                    ]}
                    onPress={() => !isShadowOperation && setShowDatePicker(true)}
                    disabled={isShadowOperation}
                    accessibilityRole="button"
                    accessibilityLabel={t('select_date')}
                  >
                    <View style={styles.pickerButtonContent}>
                      <Icon name="calendar" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                      <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                        {formatDateForDisplay(values.date)}
                      </Text>
                    </View>
                    <Icon name="chevron-down" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                  </Pressable>

                  {/* Description Input */}
                  <TextInput
                    style={[
                      styles.input,
                      styles.descriptionInput,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                      isShadowOperation && styles.disabledInput
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
                      !canDeleteShadowOperation && styles.disabledButton
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
                        { color: canDeleteShadowOperation ? (colors.delete || '#ff6b6b') : colors.mutedText }
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
                date: selectedDate.toISOString().split('T')[0]
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
                        <Text style={{ color: colors.mutedText, fontSize: 14 }}>
                          {getCurrencySymbol(item.currency)}{item.balance}
                        </Text>
                      </View>
                    </Pressable>
                  );
                } else if (pickerState.type === 'category') {
                  return (
                    <Pressable
                      onPress={() => {
                        setValues(v => ({ ...v, categoryId: item.id }));
                        closePicker();
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                      ]}
                    >
                      <View style={styles.categoryOption}>
                        <Icon name={item.icon} size={24} color={colors.text} />
                        <Text style={[styles.pickerOptionText, { color: colors.text, marginLeft: 12 }]}>
                          {item.nameKey ? t(item.nameKey) : item.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }
                return null;
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedText, textAlign: 'center', padding: 20 }}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            <Pressable style={styles.closeButton} onPress={closePicker}>
              <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    minHeight: '60%',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'column',
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 80,
  },
  pickerButton: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  pickerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerButtonText: {
    fontSize: 16,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerModalContent: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 12,
    padding: 12,
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  pickerOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerOptionText: {
    fontSize: 18,
  },
  accountOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    marginTop: 16,
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
    minHeight: 48,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  disabledInput: {
    opacity: 0.6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  currencyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  currencyInfoText: {
    fontSize: 14,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    minWidth: 110,
  },
  smallInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
  },
  currencyLabel: {
    fontSize: 14,
    minWidth: 40,
  },
  rateInfo: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
