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
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useBudgets } from '../contexts/BudgetsContext';
import { useAccounts } from '../contexts/AccountsContext';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import currencies from '../../assets/currencies.json';

export default function BudgetModal({ visible, onClose, budget, categoryId, categoryName, isNew }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { addBudget, updateBudget, deleteBudget } = useBudgets();
  const { accounts } = useAccounts();

  // Get unique currencies from user's accounts
  const availableCurrencies = useMemo(() => {
    const uniqueCurrencies = [...new Set(accounts.map(a => a.currency))];
    return uniqueCurrencies.map(code => ({
      code,
      name: currencies[code]?.name || code,
      symbol: currencies[code]?.symbol || code,
    }));
  }, [accounts]);

  const [values, setValues] = useState({
    amount: '',
    currency: 'USD',
    periodType: 'monthly',
    startDate: toDateString(new Date()),
    endDate: null,
    isRecurring: true,
    rolloverEnabled: false,
  });

  const [errors, setErrors] = useState({});
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);

  const PERIOD_TYPES = [
    { key: 'weekly', label: t('weekly') },
    { key: 'monthly', label: t('monthly') },
    { key: 'yearly', label: t('yearly') },
  ];

  // Initialize form when modal opens
  useEffect(() => {
    if (budget && !isNew) {
      setValues({
        amount: budget.amount || '',
        currency: budget.currency || 'USD',
        periodType: budget.periodType || 'monthly',
        startDate: budget.startDate || new Date().toISOString().split('T')[0],
        endDate: budget.endDate || null,
        isRecurring: budget.isRecurring !== false,
        rolloverEnabled: budget.rolloverEnabled === true,
      });
    } else if (isNew) {
      // Set default currency from first account if available
      const defaultCurrency = availableCurrencies.length > 0
        ? availableCurrencies[0].code
        : 'USD';

      setValues({
        amount: '',
        currency: defaultCurrency,
        periodType: 'monthly',
        startDate: toDateString(new Date()),
        endDate: null,
        isRecurring: true,
        rolloverEnabled: false,
      });
    }
    setErrors({});
  }, [budget, isNew, visible, availableCurrencies]);

  const validateForm = useCallback(() => {
    const newErrors = {};

    // Amount validation
    const amount = parseFloat(values.amount);
    if (!values.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = t('amount_must_be_greater_than_zero') || 'Amount must be greater than zero';
    }

    // Currency validation
    if (!values.currency) {
      newErrors.currency = t('currency_required') || 'Currency is required';
    }

    // Period type validation
    if (!values.periodType) {
      newErrors.periodType = t('period_type_required') || 'Period type is required';
    }

    // Start date validation
    if (!values.startDate) {
      newErrors.startDate = t('start_date_required') || 'Start date is required';
    }

    // End date validation (if specified)
    if (values.endDate && values.startDate) {
      if (new Date(values.endDate) <= new Date(values.startDate)) {
        newErrors.endDate = t('end_date_must_be_after_start') || 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, t]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();

    if (!validateForm()) {
      return;
    }

    try {
      const budgetData = {
        categoryId,
        amount: values.amount,
        currency: values.currency,
        periodType: values.periodType,
        startDate: values.startDate,
        endDate: values.endDate,
        isRecurring: values.isRecurring,
        rolloverEnabled: values.rolloverEnabled,
      };

      if (isNew) {
        await addBudget(budgetData);
      } else {
        await updateBudget(budget.id, budgetData);
      }

      onClose();
    } catch (error) {
      // Error already shown in context
      console.error('Save budget error:', error);
    }
  }, [
    validateForm,
    categoryId,
    values,
    isNew,
    addBudget,
    updateBudget,
    budget,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    showDialog(
      t('delete_budget'),
      t('delete_budget_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBudget(budget.id);
              onClose();
            } catch (error) {
              // Error already shown in context
            }
          },
        },
      ]
    );
  }, [budget, deleteBudget, onClose, t, showDialog]);

  const handleStartDateChange = useCallback((event, selectedDate) => {
    setShowStartDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setValues(v => ({ ...v, startDate: toDateString(selectedDate) }));
    }
  }, []);

  const handleEndDateChange = useCallback((event, selectedDate) => {
    setShowEndDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setValues(v => ({ ...v, endDate: toDateString(selectedDate) }));
    }
  }, []);

  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return t('never');
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString();
  }, [t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                {isNew ? t('set_budget') : t('edit_budget')}
              </Text>

              <Text style={[styles.categoryLabel, { color: colors.mutedText }]}>
                {t('budget_for_category')}: {categoryName}
              </Text>

              {/* Amount Input */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>
                  {t('budget_amount')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.inputBackground,
                      borderColor: errors.amount ? colors.error : colors.inputBorder,
                    },
                  ]}
                  value={values.amount}
                  onChangeText={text => setValues(v => ({ ...v, amount: text }))}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {errors.amount && (
                  <Text style={[styles.error, { color: colors.error }]}>{errors.amount}</Text>
                )}
              </View>

              {/* Currency Picker */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>
                  {t('currency')}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  onPress={() => setCurrencyPickerVisible(true)}
                >
                  <View style={styles.pickerValue}>
                    <Text style={{ color: colors.text, fontSize: 16 }}>
                      {values.currency} {currencies[values.currency]?.symbol || ''}
                    </Text>
                    <Icon name="chevron-down" size={20} color={colors.text} />
                  </View>
                </Pressable>
              </View>

              {/* Period Type Picker */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>
                  {t('period_type')}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  onPress={() => setPeriodPickerVisible(true)}
                >
                  <View style={styles.pickerValue}>
                    <Text style={{ color: colors.text, fontSize: 16 }}>
                      {PERIOD_TYPES.find(p => p.key === values.periodType)?.label}
                    </Text>
                    <Icon name="chevron-down" size={20} color={colors.text} />
                  </View>
                </Pressable>
              </View>

              {/* Start Date Picker */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>
                  {t('start_date')}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <View style={styles.pickerValue}>
                    <Text style={{ color: colors.text, fontSize: 16 }}>
                      {formatDate(values.startDate)}
                    </Text>
                    <Icon name="calendar" size={20} color={colors.text} />
                  </View>
                </Pressable>
              </View>

              {/* End Date Picker */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>
                  {t('end_date')}
                </Text>
                <View style={styles.dateRow}>
                  <Pressable
                    style={[
                      styles.pickerButton,
                      {
                        flex: 1,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder
                      },
                    ]}
                    onPress={() => setShowEndDatePicker(true)}
                  >
                    <View style={styles.pickerValue}>
                      <Text style={{ color: colors.text, fontSize: 16 }}>
                        {formatDate(values.endDate)}
                      </Text>
                      <Icon name="calendar" size={20} color={colors.text} />
                    </View>
                  </Pressable>
                  {values.endDate && (
                    <Pressable
                      style={[styles.clearButton, { backgroundColor: colors.secondary }]}
                      onPress={() => setValues(v => ({ ...v, endDate: null }))}
                    >
                      <Icon name="close" size={20} color={colors.text} />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Recurring Switch */}
              <View style={styles.switchContainer}>
                <View style={styles.switchLabel}>
                  <Icon name="sync" size={20} color={colors.text} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text, fontSize: 16 }}>{t('recurring')}</Text>
                </View>
                <Switch
                  value={values.isRecurring}
                  onValueChange={(value) => setValues(v => ({ ...v, isRecurring: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>

              {/* Rollover Switch */}
              <View style={styles.switchContainer}>
                <View style={styles.switchLabel}>
                  <Icon name="arrow-right-thick" size={20} color={colors.text} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16 }}>{t('rollover')}</Text>
                    <Text style={{ color: colors.mutedText, fontSize: 12, marginTop: 2 }}>
                      Carry unused amount to next period
                    </Text>
                  </View>
                </View>
                <Switch
                  value={values.rolloverEnabled}
                  onValueChange={(value) => setValues(v => ({ ...v, rolloverEnabled: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>

              {errors.general && (
                <Text style={[styles.error, { color: colors.error }]}>{errors.general}</Text>
              )}

              {/* Delete Button (only for existing budgets) */}
              {!isNew && (
                <Pressable
                  style={[styles.deleteButtonContainer, { borderTopColor: colors.border }]}
                  onPress={handleDelete}
                >
                  <Icon name="delete-outline" size={20} color={colors.delete} />
                  <Text style={[styles.deleteButtonText, { color: colors.delete }]}>
                    {t('delete_budget')}
                  </Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.modalButtonRow, { backgroundColor: colors.card }]}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.secondary }]}
                onPress={handleClose}
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>
                  {t('cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>
                  {t('save')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Start Date Picker */}
      {showStartDatePicker && (
        <DateTimePicker
          value={values.startDate ? new Date(values.startDate + 'T00:00:00') : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleStartDateChange}
        />
      )}

      {/* End Date Picker */}
      {showEndDatePicker && (
        <DateTimePicker
          value={values.endDate ? new Date(values.endDate + 'T00:00:00') : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleEndDateChange}
          minimumDate={values.startDate ? new Date(values.startDate + 'T00:00:00') : undefined}
        />
      )}

      {/* Currency Picker Modal */}
      <Modal
        visible={currencyPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCurrencyPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCurrencyPickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('select_currency')}</Text>
            <FlatList
              data={availableCurrencies}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValues(v => ({ ...v, currency: item.code }));
                    setCurrencyPickerVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    { borderColor: colors.border },
                    pressed && { backgroundColor: colors.selected },
                    values.currency === item.code && { backgroundColor: colors.selected },
                  ]}
                >
                  <View style={styles.currencyOption}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '500' }}>
                      {item.code}
                    </Text>
                    <Text style={{ color: colors.mutedText, fontSize: 14, marginLeft: 8 }}>
                      {item.symbol} - {item.name}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
            <Pressable style={styles.closeButton} onPress={() => setCurrencyPickerVisible(false)}>
              <Text style={{ color: colors.primary }}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Period Type Picker Modal */}
      <Modal
        visible={periodPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPeriodPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPeriodPickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('period_type')}</Text>
            <FlatList
              data={PERIOD_TYPES}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValues(v => ({ ...v, periodType: item.key }));
                    setPeriodPickerVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    { borderColor: colors.border },
                    pressed && { backgroundColor: colors.selected },
                    values.periodType === item.key && { backgroundColor: colors.selected },
                  ]}
                >
                  <Text style={{ color: colors.text, fontSize: 18 }}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.closeButton} onPress={() => setPeriodPickerVisible(false)}>
              <Text style={{ color: colors.primary }}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
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
    maxHeight: '85%',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  categoryLabel: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
  },
  pickerButton: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },
  pickerValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    marginLeft: 8,
    borderRadius: 4,
    padding: 12,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
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
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerModalContent: {
    width: '90%',
    maxHeight: '60%',
    borderRadius: 12,
    padding: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  closeButton: {
    marginTop: 8,
    alignSelf: 'center',
    padding: 10,
  },
  deleteButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 20,
    borderTopWidth: 1,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});
