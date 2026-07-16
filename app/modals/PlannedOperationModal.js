import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  Keyboard,
  Switch,
} from 'react-native';
import { TextInput as PaperTextInput, TouchableRipple } from 'react-native-paper';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { usePlannedOperations } from '../contexts/PlannedOperationsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import useOperationPicker from '../hooks/useOperationPicker';
import PickerModal from '../components/operations/PickerModal';
import LabelInput from '../components/operations/LabelInput';
import { getDistinctLabels } from '../services/OperationsDB';
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../styles/designTokens';

const TYPE_OPTIONS = [
  { key: 'expense', icon: 'arrow-up', colorKey: 'expense' },
  { key: 'income', icon: 'arrow-down', colorKey: 'income' },
  { key: 'transfer', icon: 'swap-horizontal', colorKey: 'transfer' },
];

export default function PlannedOperationModal({
  visible = false, onClose, plannedOperation = null, isNew = true,
}) {
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
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
  const [labelSuggestions, setLabelSuggestions] = useState([]);
  const labelInputRef = useRef(null);

  // Distinct labels for autocomplete in the label editor (category-first).
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    getDistinctLabels(50, values.categoryId || null)
      .then(labels => { if (!cancelled) setLabelSuggestions(labels); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, values.categoryId]);

  // Hierarchical category picker via useOperationPicker
  const {
    pickerState: categoryPickerState,
    categoryNavigation,
    openPicker: openCategoryPicker,
    closePicker: closeCategoryPicker,
    navigateIntoFolder,
    navigateBack,
  } = useOperationPicker(t);

  // Filtered categories based on operation type (include folders for hierarchy)
  const filteredCategories = useMemo(() => {
    if (values.type === 'transfer') return [];
    const categoryType = values.type === 'expense' ? 'expense' : 'income';
    return (categories || []).filter(
      c => c.categoryType === categoryType && !c.isShadow,
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

    // Flush any half-typed label so it isn't lost when saving without committing it.
    const flushedDescription = labelInputRef.current?.flush();
    const description = flushedDescription != null ? flushedDescription : values.description;

    try {
      const data = {
        name: values.name.trim(),
        type: values.type,
        amount: values.amount,
        accountId: values.accountId,
        categoryId: values.type === 'transfer' ? null : values.categoryId,
        toAccountId: values.type === 'transfer' ? values.toAccountId : null,
        description: description.trim() || null,
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
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_planned_operation') : t('edit_planned_operation')}
        onSave={handleSave}
        onCancel={handleClose}
        onDelete={isNew ? undefined : handleDelete}
        deleteLabel={t('delete_planned_operation')}
        showBlurOverlay
      >
        {/* Name */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('planned_name') || 'Name').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={values.name}
          onChangeText={text => setValues(v => ({ ...v, name: text }))}
          placeholder={t('planned_operation_name_hint')}
          returnKeyType="next"
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.name && <Text style={[styles.error, { color: colors.error }]}>{errors.name}</Text>}

        {/* Type Selector */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('operation_type') || 'Type').toUpperCase()}
        </Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map(opt => {
            const isActive = values.type === opt.key;
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
                <Text style={[styles.typeLabel, isActive ? styles.typeLabelActive : { color: colors.mutedText }]}>
                  {t(`${opt.key}_label`) || t(opt.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Amount */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('amount') || 'Amount').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={values.amount}
          onChangeText={text => setValues(v => ({ ...v, amount: text }))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.amount && <Text style={[styles.error, { color: colors.error }]}>{errors.amount}</Text>}

        {/* Account */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('select_account') || 'Account').toUpperCase()}
        </Text>
        <TouchableRipple
          testID="planned-account-picker"
          style={[modalSharedStyles.pickerRow, { borderColor: errors.accountId ? colors.error : colors.border, backgroundColor: colors.card }]}
          onPress={() => setAccountPickerVisible(true)}
          rippleColor="rgba(0,0,0,0.05)"
          borderless={false}
        >
          <View style={modalSharedStyles.pickerRowInner}>
            <Text style={[modalSharedStyles.pickerRowValue, { color: values.accountId ? colors.text : colors.mutedText }]}>
              {values.accountId ? getAccountName(values.accountId) : t('select_account')}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>
        {errors.accountId && <Text style={[styles.error, { color: colors.error }]}>{errors.accountId}</Text>}

        {/* Category (expense/income only) */}
        {values.type !== 'transfer' && (
          <>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('select_category') || 'Category').toUpperCase()}
            </Text>
            <TouchableRipple
              testID="planned-category-picker"
              style={[modalSharedStyles.pickerRow, { borderColor: errors.categoryId ? colors.error : colors.border, backgroundColor: colors.card }]}
              onPress={() => openCategoryPicker('category', filteredCategories)}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: values.categoryId ? colors.text : colors.mutedText }]}>
                  {values.categoryId ? getCategoryName(values.categoryId) : t('select_category')}
                </Text>
                <Icon name="chevron-down" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>
            {errors.categoryId && <Text style={[styles.error, { color: colors.error }]}>{errors.categoryId}</Text>}
          </>
        )}

        {/* To Account (transfer only) */}
        {values.type === 'transfer' && (
          <>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('to_account') || 'To Account').toUpperCase()}
            </Text>
            <TouchableRipple
              style={[modalSharedStyles.pickerRow, { borderColor: errors.toAccountId ? colors.error : colors.border, backgroundColor: colors.card }]}
              onPress={() => setToAccountPickerVisible(true)}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: values.toAccountId ? colors.text : colors.mutedText }]}>
                  {values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}
                </Text>
                <Icon name="chevron-down" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>
            {errors.toAccountId && <Text style={[styles.error, { color: colors.error }]}>{errors.toAccountId}</Text>}
          </>
        )}

        {/* Recurring Toggle */}
        <View style={styles.switchRow}>
          <Text style={[modalSharedStyles.fieldLabel, styles.switchLabel, { color: colors.mutedText }]}>
            {(t('recurring') || 'Recurring').toUpperCase()}
          </Text>
          <Switch
            value={values.isRecurring}
            onValueChange={val => setValues(v => ({ ...v, isRecurring: val }))}
            trackColor={{ false: colors.border, true: colors.primary + '66' }}
            thumbColor={values.isRecurring ? colors.primary : colors.mutedText}
          />
        </View>

        {/* Labels (stored in the description field) */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('labels') || 'Labels').toUpperCase()}
        </Text>
        <LabelInput
          ref={labelInputRef}
          value={values.description}
          onChangeText={text => setValues(v => ({ ...v, description: text }))}
          suggestions={labelSuggestions}
          placeholder={t('add_label_placeholder')}
          colors={colors}
          t={t}
        />
      </ModalShell>

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

      {/* Category Picker Modal (hierarchical) */}
      <PickerModal
        visible={categoryPickerState.visible}
        pickerType={categoryPickerState.type}
        pickerData={categoryPickerState.data}
        colors={colors}
        t={t}
        onClose={closeCategoryPicker}
        categoryNavigation={categoryNavigation}
        quickAddValues={{ ...values, amount: '' }}
        onNavigateBack={navigateBack}
        onNavigateIntoFolder={navigateIntoFolder}
        onSelectCategory={(id) => { setValues(v => ({ ...v, categoryId: id })); closeCategoryPicker(); }}
      />
    </>
  );
}

PlannedOperationModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  plannedOperation: PropTypes.object,
  isNew: PropTypes.bool,
};

const styles = StyleSheet.create({
  error: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  switchLabel: {
    marginTop: 0,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
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
  typeLabelActive: {
    color: '#fff',
  },
  typeRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
});
