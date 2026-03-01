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
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { usePlannedOperations } from '../contexts/PlannedOperationsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { SPACING, BORDER_RADIUS, HEIGHTS, FONT_SIZE } from '../styles/designTokens';

const TYPE_OPTIONS = [
  { key: 'expense', icon: 'arrow-up', colorKey: 'expense' },
  { key: 'income', icon: 'arrow-down', colorKey: 'income' },
  { key: 'transfer', icon: 'swap-horizontal', colorKey: 'transfer' },
];

export default function PlannedOperationModal({ visible, onClose, plannedOperation, isNew }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { addPlannedOperation, updatePlannedOperation, deletePlannedOperation } = usePlannedOperations();
  const { visibleAccounts: accounts } = useAccountsData();
  const { categories } = useCategories();

  const [values, setValues] = useState({
    name: '',
    type: 'expense',
    amount: '',
    accountId: null,
    categoryId: null,
    toAccountId: null,
    description: '',
    isRecurring: true,
  });

  const [errors, setErrors] = useState({});
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [toAccountPickerVisible, setToAccountPickerVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  // Filtered categories based on operation type
  const filteredCategories = useMemo(() => {
    if (values.type === 'transfer') return [];
    const categoryType = values.type === 'expense' ? 'expense' : 'income';
    return (categories || []).filter(
      c => c.categoryType === categoryType && c.type === 'entry' && !c.isShadow,
    );
  }, [categories, values.type]);

  // Initialize form when modal opens
  useEffect(() => {
    if (!visible) return;

    if (plannedOperation && !isNew) {
      setValues({
        name: plannedOperation.name || '',
        type: plannedOperation.type || 'expense',
        amount: plannedOperation.amount || '',
        accountId: plannedOperation.accountId || null,
        categoryId: plannedOperation.categoryId || null,
        toAccountId: plannedOperation.toAccountId || null,
        description: plannedOperation.description || '',
        isRecurring: plannedOperation.isRecurring !== false,
      });
    } else {
      setValues({
        name: '',
        type: 'expense',
        amount: '',
        accountId: accounts.length > 0 ? accounts[0].id : null,
        categoryId: null,
        toAccountId: null,
        description: '',
        isRecurring: true,
      });
    }
    setErrors({});
  }, [plannedOperation, isNew, visible, accounts]);

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!values.name || !values.name.trim()) {
      newErrors.name = t('planned_name_required') || 'Name is required';
    }

    const amount = parseFloat(values.amount);
    if (!values.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = t('valid_amount_required') || 'Valid amount is required';
    }

    if (!values.accountId) {
      newErrors.accountId = t('account_required') || 'Account is required';
    }

    if (values.type === 'transfer') {
      if (!values.toAccountId) {
        newErrors.toAccountId = t('destination_account_required') || 'Destination account is required';
      }
      if (values.accountId && values.toAccountId && values.accountId === values.toAccountId) {
        newErrors.toAccountId = t('accounts_must_be_different') || 'Accounts must be different';
      }
    } else {
      if (!values.categoryId) {
        newErrors.categoryId = t('category_required') || 'Category is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, t]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;

    try {
      const data = {
        name: values.name.trim(),
        type: values.type,
        amount: values.amount,
        accountId: values.accountId,
        categoryId: values.type === 'transfer' ? null : values.categoryId,
        toAccountId: values.type === 'transfer' ? values.toAccountId : null,
        description: values.description.trim() || null,
        isRecurring: values.isRecurring,
      };

      if (isNew) {
        await addPlannedOperation(data);
      } else {
        await updatePlannedOperation(plannedOperation.id, data);
      }
      onClose();
    } catch (error) {
      console.error('Save planned operation error:', error);
    }
  }, [validateForm, values, isNew, addPlannedOperation, updatePlannedOperation, plannedOperation, onClose]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    showDialog(
      t('delete_planned_operation'),
      t('delete_planned_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlannedOperation(plannedOperation.id);
              onClose();
            } catch (error) {
              // Error already shown in context
            }
          },
        },
      ],
    );
  }, [plannedOperation, deletePlannedOperation, onClose, t, showDialog]);

  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : t('select_account');
  }, [accounts, t]);

  const getCategoryName = useCallback((categoryId) => {
    const category = (categories || []).find(c => c.id === categoryId);
    return category ? category.name : t('select_category');
  }, [categories, t]);

  // Picker modal renderer
  const renderPickerModal = useCallback((pickerVisible, setPickerVisible, items, onSelect, title) => (
    <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
      <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
        <View style={[styles.pickerContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>{title}</Text>
          <FlatList
            data={items}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item.id); setPickerVisible(false); }}
              >
                {item.icon && (
                  <Icon name={item.icon} size={20} color={colors.text} style={styles.pickerItemIcon} />
                )}
                <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.name}</Text>
              </Pressable>
            )}
            style={styles.pickerList}
          />
          <Pressable style={[styles.pickerCancel, { borderTopColor: colors.border }]} onPress={() => setPickerVisible(false)}>
            <Text style={[styles.pickerCancelText, { color: colors.primary }]}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  ), [colors, t]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isNew ? t('add_planned_operation') : t('edit_planned_operation')}
              </Text>

              {/* Name Input */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('planned_name')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: errors.name ? colors.error : colors.inputBorder }]}
                  value={values.name}
                  onChangeText={text => setValues(v => ({ ...v, name: text }))}
                  placeholder={t('planned_operation_name_hint')}
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="next"
                />
                {errors.name && <Text style={[styles.error, { color: colors.error }]}>{errors.name}</Text>}
              </View>

              {/* Type Selector */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('operation_type')}</Text>
                <View style={styles.typeRow}>
                  {TYPE_OPTIONS.map(opt => {
                    const isActive = values.type === opt.key;
                    const typeLabelStyle = { color: isActive ? '#fff' : colors.mutedText };
                    return (
                      <Pressable
                        key={opt.key}
                        style={[
                          styles.typeButton,
                          {
                            backgroundColor: isActive ? colors[opt.colorKey] : colors.inputBackground,
                            borderColor: isActive ? colors[opt.colorKey] : colors.inputBorder,
                          },
                        ]}
                        onPress={() => setValues(v => ({ ...v, type: opt.key, categoryId: null }))}
                      >
                        <Icon name={opt.icon} size={18} color={isActive ? '#fff' : colors.mutedText} />
                        <Text style={[styles.typeLabel, typeLabelStyle]}>
                          {t(`${opt.key}_label`) || t(opt.key)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Amount Input */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('amount')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: errors.amount ? colors.error : colors.inputBorder }]}
                  value={values.amount}
                  onChangeText={text => setValues(v => ({ ...v, amount: text }))}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {errors.amount && <Text style={[styles.error, { color: colors.error }]}>{errors.amount}</Text>}
              </View>

              {/* Account Picker */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('select_account')}</Text>
                <Pressable
                  style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: errors.accountId ? colors.error : colors.inputBorder }]}
                  onPress={() => setAccountPickerVisible(true)}
                >
                  <Text style={[styles.pickerButtonText, { color: values.accountId ? colors.text : colors.mutedText }]}>
                    {values.accountId ? getAccountName(values.accountId) : t('select_account')}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.mutedText} />
                </Pressable>
                {errors.accountId && <Text style={[styles.error, { color: colors.error }]}>{errors.accountId}</Text>}
              </View>

              {/* Category Picker (for expense/income) */}
              {values.type !== 'transfer' && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('select_category')}</Text>
                  <Pressable
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: errors.categoryId ? colors.error : colors.inputBorder }]}
                    onPress={() => setCategoryPickerVisible(true)}
                  >
                    <Text style={[styles.pickerButtonText, { color: values.categoryId ? colors.text : colors.mutedText }]}>
                      {values.categoryId ? getCategoryName(values.categoryId) : t('select_category')}
                    </Text>
                    <Icon name="chevron-down" size={20} color={colors.mutedText} />
                  </Pressable>
                  {errors.categoryId && <Text style={[styles.error, { color: colors.error }]}>{errors.categoryId}</Text>}
                </View>
              )}

              {/* To Account Picker (for transfers) */}
              {values.type === 'transfer' && (
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('to_account')}</Text>
                  <Pressable
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: errors.toAccountId ? colors.error : colors.inputBorder }]}
                    onPress={() => setToAccountPickerVisible(true)}
                  >
                    <Text style={[styles.pickerButtonText, { color: values.toAccountId ? colors.text : colors.mutedText }]}>
                      {values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}
                    </Text>
                    <Icon name="chevron-down" size={20} color={colors.mutedText} />
                  </Pressable>
                  {errors.toAccountId && <Text style={[styles.error, { color: colors.error }]}>{errors.toAccountId}</Text>}
                </View>
              )}

              {/* Recurring Toggle */}
              <View style={[styles.inputContainer, styles.switchRow]}>
                <Text style={[styles.inputLabel, styles.inputLabelNoMargin, { color: colors.mutedText }]}>
                  {t('recurring')}
                </Text>
                <Switch
                  value={values.isRecurring}
                  onValueChange={val => setValues(v => ({ ...v, isRecurring: val }))}
                  trackColor={{ false: colors.border, true: colors.primary + '66' }}
                  thumbColor={values.isRecurring ? colors.primary : colors.mutedText}
                />
              </View>

              {/* Description */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{t('description')}</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  value={values.description}
                  onChangeText={text => setValues(v => ({ ...v, description: text }))}
                  placeholder={t('description')}
                  placeholderTextColor={colors.mutedText}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                {!isNew && (
                  <Pressable style={[styles.button, { backgroundColor: colors.danger || colors.delete }]} onPress={handleDelete}>
                    <Text style={styles.buttonText}>{t('delete')}</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.button, { backgroundColor: colors.border }]} onPress={handleClose}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>{t('cancel')}</Text>
                </Pressable>
                <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSave}>
                  <Text style={styles.buttonText}>{t('save')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Account Picker Modal */}
      {renderPickerModal(
        accountPickerVisible,
        setAccountPickerVisible,
        accounts.map(a => ({ id: a.id, name: `${a.name} (${a.currency})` })),
        (id) => setValues(v => ({ ...v, accountId: id })),
        t('select_account'),
      )}

      {/* To Account Picker Modal */}
      {renderPickerModal(
        toAccountPickerVisible,
        setToAccountPickerVisible,
        accounts.filter(a => a.id !== values.accountId).map(a => ({ id: a.id, name: `${a.name} (${a.currency})` })),
        (id) => setValues(v => ({ ...v, toAccountId: id })),
        t('to_account'),
      )}

      {/* Category Picker Modal */}
      {renderPickerModal(
        categoryPickerVisible,
        setCategoryPickerVisible,
        filteredCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
        (id) => setValues(v => ({ ...v, categoryId: id })),
        t('select_category'),
      )}
    </Modal>
  );
}

PlannedOperationModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  plannedOperation: PropTypes.object,
  isNew: PropTypes.bool,
};

PlannedOperationModal.defaultProps = {
  visible: false,
  plannedOperation: null,
  isNew: true,
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  error: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  flex1: {
    flex: 1,
  },
  input: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    fontSize: FONT_SIZE.base,
    height: HEIGHTS.input,
    paddingHorizontal: SPACING.md,
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  inputLabelNoMargin: {
    marginBottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '90%',
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    width: '100%',
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  multilineInput: {
    height: 70,
    paddingTop: SPACING.md,
    textAlignVertical: 'top',
  },
  pickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    flexDirection: 'row',
    height: HEIGHTS.input,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  pickerCancel: {
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: SPACING.md,
  },
  pickerCancelText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  pickerContent: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '60%',
    paddingTop: SPACING.lg,
    width: '100%',
  },
  pickerItem: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  pickerItemIcon: {
    marginRight: SPACING.sm,
  },
  pickerItemText: {
    fontSize: FONT_SIZE.base,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  scrollContent: {
    paddingBottom: SPACING.lg,
  },
  scrollView: {
    flexGrow: 0,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeButton: {
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
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
  },
});
