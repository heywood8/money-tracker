import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import PropTypes from 'prop-types';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useBudgets } from '../contexts/BudgetsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import currencies from '../../assets/currencies.json';
import ModalBlurOverlay from '../components/ModalBlurOverlay';
import ModalHeader from '../components/ModalHeader';

export default function BudgetModal({
  visible = false, onClose = () => {}, budget = null, categoryId = '', categoryName = '', isNew = true,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { addBudget, updateBudget, deleteBudget } = useBudgets();
  const { accounts } = useAccountsData();

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

  // Sub-panel navigation (subpanel pattern — see CLAUDE.md). Secondary views
  // (currency / period pickers) slide in over the form inside the same modal
  // instead of opening a second, nested native Modal.
  const [activeSubPanel, setActiveSubPanel] = useState(null); // null | 'currency' | 'period'
  const mainAnim = useRef(new Animated.Value(0)).current; // 0 = form visible, 1 = form shifted/dimmed
  const subPanelAnim = useRef(new Animated.Value(0)).current; // 0 = subpanel hidden, 1 = visible

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

  // Reset any open subpanel (and its animation values) whenever the modal is
  // hidden, so reopening always starts on the form.
  useEffect(() => {
    if (!visible) {
      setActiveSubPanel(null);
      mainAnim.setValue(0);
      subPanelAnim.setValue(0);
    }
  }, [visible, mainAnim, subPanelAnim]);

  // Slide a secondary view in over the form. Asymmetric durations inside a
  // single Animated.parallel produce the staggered feel without an
  // Animated.delay node (which would break the native driver).
  const openSubPanel = useCallback((panel) => {
    Keyboard.dismiss();
    setActiveSubPanel(panel);
    Animated.parallel([
      Animated.timing(mainAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(subPanelAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [mainAnim, subPanelAnim]);

  const closeSubPanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(subPanelAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(mainAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setActiveSubPanel(null));
  }, [subPanelAnim, mainAnim]);

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

  // Android hardware back (and the outer Modal's onRequestClose): step out of an
  // open subpanel first, otherwise close the whole modal.
  const handleRequestClose = useCallback(() => {
    if (activeSubPanel) {
      closeSubPanel();
    } else {
      handleClose();
    }
  }, [activeSubPanel, closeSubPanel, handleClose]);

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
      ],
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

  const handleSelectCurrency = useCallback((code) => {
    setValues(v => ({ ...v, currency: code }));
    closeSubPanel();
  }, [closeSubPanel]);

  const handleSelectPeriod = useCallback((key) => {
    setValues(v => ({ ...v, periodType: key }));
    closeSubPanel();
  }, [closeSubPanel]);

  // Subpanel slides in from the right edge of the card; the form shifts slightly
  // left and fades as it goes. Transforms/opacity only — no layout impact.
  const panelWidth = Dimensions.get('window').width;
  const subPanelTranslateX = subPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  });
  const mainTranslateX = mainAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -40],
  });
  const mainOpacity = mainAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const renderCurrencyItem = useCallback(({ item }) => (
    <Pressable
      onPress={() => handleSelectCurrency(item.code)}
      style={({ pressed }) => [
        styles.pickerOption,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.selected },
        values.currency === item.code && { backgroundColor: colors.selected },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.code} ${item.name}`}
    >
      <View style={styles.currencyOption}>
        <Text style={[styles.text18bold, { color: colors.text }]}>
          {item.code}
        </Text>
        <Text style={[styles.text14muted, { color: colors.mutedText }]}>
          {item.symbol} - {item.name}
        </Text>
      </View>
    </Pressable>
  ), [colors, values.currency, handleSelectCurrency]);

  const renderPeriodItem = useCallback(({ item }) => (
    <Pressable
      onPress={() => handleSelectPeriod(item.key)}
      style={({ pressed }) => [
        styles.pickerOption,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.selected },
        values.periodType === item.key && { backgroundColor: colors.selected },
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Text style={[styles.text18, { color: colors.text }]}>{item.label}</Text>
    </Pressable>
  ), [colors, values.periodType, handleSelectPeriod]);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleRequestClose}
        testID="budget-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <Pressable style={styles.modalOverlay} onPress={handleClose}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
              <Animated.View
                style={[
                  styles.mainContent,
                  { opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] },
                ]}
              >
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <ModalHeader title={isNew ? t('set_budget') : t('edit_budget')} />

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
                      onPress={() => openSubPanel('currency')}
                      accessibilityRole="button"
                      accessibilityLabel={t('currency')}
                    >
                      <View style={styles.pickerValue}>
                        <Text style={[styles.text16, { color: colors.text }]}>
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
                      onPress={() => openSubPanel('period')}
                      accessibilityRole="button"
                      accessibilityLabel={t('period_type')}
                    >
                      <View style={styles.pickerValue}>
                        <Text style={[styles.text16, { color: colors.text }]}>
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
                        <Text style={[styles.text16, { color: colors.text }]}>
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
                          styles.flex1,
                          {
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.inputBorder,
                          },
                        ]}
                        onPress={() => setShowEndDatePicker(true)}
                      >
                        <View style={styles.pickerValue}>
                          <Text style={[styles.text16, { color: colors.text }]}>
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
                      <Icon name="sync" size={20} color={colors.text} style={styles.iconMarginRight} />
                      <Text style={[styles.text16, { color: colors.text }]}>{t('recurring')}</Text>
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
                      <Icon name="arrow-right-thick" size={20} color={colors.text} style={styles.iconMarginRight} />
                      <View style={styles.flex1}>
                        <Text style={[styles.text16, { color: colors.text }]}>{t('rollover')}</Text>
                        <Text style={[styles.text12, styles.smallTop, { color: colors.mutedText }]}>
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
              </Animated.View>

              {/* Secondary view (currency / period picker) — slides in over the
                  form within the same modal. Mounted only while open so the
                  entry animation always plays from the hidden state. */}
              {activeSubPanel && (
                <Animated.View
                  testID="budget-subpanel"
                  style={[
                    styles.subPanel,
                    { backgroundColor: colors.card },
                    { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
                  ]}
                >
                  <View style={styles.subPanelHeader}>
                    <Pressable
                      onPress={closeSubPanel}
                      style={styles.subPanelBack}
                      hitSlop={8}
                      testID="budget-subpanel-back"
                      accessibilityRole="button"
                      accessibilityLabel={t('back')}
                    >
                      <Icon name="arrow-left" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.subPanelTitle, { color: colors.text }]}>
                      {activeSubPanel === 'currency' ? t('select_currency') : t('period_type')}
                    </Text>
                  </View>

                  {activeSubPanel === 'currency' && (
                    <FlatList
                      data={availableCurrencies}
                      keyExtractor={item => item.code}
                      renderItem={renderCurrencyItem}
                      keyboardShouldPersistTaps="handled"
                    />
                  )}

                  {activeSubPanel === 'period' && (
                    <FlatList
                      data={PERIOD_TYPES}
                      keyExtractor={item => item.key}
                      renderItem={renderPeriodItem}
                      keyboardShouldPersistTaps="handled"
                    />
                  )}
                </Animated.View>
              )}
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
      </Modal>
    </>
  );
}

BudgetModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  budget: PropTypes.shape({
    id: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currency: PropTypes.string,
    periodType: PropTypes.string,
    startDate: PropTypes.string,
    endDate: PropTypes.string,
    isRecurring: PropTypes.bool,
    rolloverEnabled: PropTypes.bool,
  }),
  categoryId: PropTypes.string,
  categoryName: PropTypes.string,
  isNew: PropTypes.bool,
};

const styles = StyleSheet.create({
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryLabel: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  clearButton: {
    borderRadius: 4,
    marginLeft: 8,
    padding: 12,
  },
  currencyOption: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  deleteButtonContainer: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
  flex1: {
    flex: 1,
  },
  iconMarginRight: {
    marginRight: 8,
  },
  input: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 16,
    padding: 12,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  mainContent: {
    flexShrink: 1,
    padding: 20,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 8,
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
    maxHeight: '85%',
    minHeight: '60%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  pickerButton: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 12,
  },
  pickerOption: {
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  pickerValue: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  smallTop: {
    marginTop: 2,
  },
  subPanel: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
  },
  subPanelBack: {
    marginRight: 8,
    padding: 4,
  },
  subPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  subPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 12,
  },
  switchLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    marginRight: 12,
  },
  text12: {
    fontSize: 12,
  },
  text14muted: {
    fontSize: 14,
    marginLeft: 8,
  },
  text16: {
    fontSize: 16,
  },
  text18: {
    fontSize: 18,
  },
  text18bold: {
    fontSize: 18,
    fontWeight: '500',
  },
});
