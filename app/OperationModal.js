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

export default function OperationModal({ visible, onClose, operation, isNew, onDelete }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { addOperation, updateOperation, validateOperation } = useOperations();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const [values, setValues] = useState({
    type: 'expense',
    amount: '',
    accountId: '',
    categoryId: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    toAccountId: '',
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerState, setPickerState] = useState({
    visible: false,
    type: null,
    data: [],
  });

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
          });
        }
      }
      if (!cancelled) setErrors({});
    }
    setDefaultAccount();
    return () => { cancelled = true; };
  }, [operation, isNew, visible, accounts]);

  const handleSave = useCallback(async () => {
    const error = validateOperation(values);
    if (error) {
      setErrors({ general: error });
      return;
    }

    if (isNew) {
      await addOperation(values);
    } else {
      await updateOperation(operation.id, values);
    }

    // Save last accessed account
    if (values.accountId) {
      setLastAccessedAccount(values.accountId);
    }

    onClose();
  }, [validateOperation, values, isNew, addOperation, updateOperation, operation, onClose]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete && operation) {
      onDelete(operation);
      onClose();
    }
  }, [onDelete, operation, onClose]);

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
                    {isNew ? t('add_operation') : t('edit_operation')}
                  </Text>

                  {/* Type Picker */}
                  <Pressable
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={() => openPicker('type', TYPES)}
                  >
                    <View style={styles.pickerButtonContent}>
                      <Icon
                        name={TYPES.find(tp => tp.key === values.type)?.icon || 'help-circle'}
                        size={20}
                        color={colors.text}
                      />
                      <Text style={[styles.pickerButtonText, { color: colors.text }]}>
                        {TYPES.find(tp => tp.key === values.type)?.label}
                      </Text>
                    </View>
                    <Icon name="chevron-down" size={20} color={colors.text} />
                  </Pressable>

                  {/* Amount Input */}
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                    ]}
                    value={values.amount}
                    onChangeText={text => setValues(v => ({ ...v, amount: text }))}
                    placeholder={t('amount')}
                    placeholderTextColor={colors.mutedText}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {/* Account Picker */}
                  <Pressable
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={() => openPicker('account', accounts)}
                  >
                    <Text style={{ color: colors.text }}>
                      {getAccountName(values.accountId)}
                    </Text>
                    <Icon name="chevron-down" size={20} color={colors.text} />
                  </Pressable>

                  {/* To Account Picker (only for transfers) */}
                  {values.type === 'transfer' && (
                    <Pressable
                      style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                      onPress={() => openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                    >
                      <Text style={{ color: colors.text }}>
                        {t('to_account')}: {getAccountName(values.toAccountId)}
                      </Text>
                      <Icon name="chevron-down" size={20} color={colors.text} />
                    </Pressable>
                  )}

                  {/* Category Picker (not for transfers) */}
                  {values.type !== 'transfer' && (
                    <Pressable
                      style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                      onPress={() => openPicker('category', filteredCategories)}
                    >
                      <Text style={{ color: colors.text }}>
                        {getCategoryName(values.categoryId)}
                      </Text>
                      <Icon name="chevron-down" size={20} color={colors.text} />
                    </Pressable>
                  )}

                  {/* Date Picker Button */}
                  <Pressable
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={() => setShowDatePicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('select_date')}
                  >
                    <View style={styles.pickerButtonContent}>
                      <Icon name="calendar" size={20} color={colors.text} />
                      <Text style={[styles.pickerButtonText, { color: colors.text }]}>
                        {formatDateForDisplay(values.date)}
                      </Text>
                    </View>
                    <Icon name="chevron-down" size={20} color={colors.text} />
                  </Pressable>

                  {/* Description Input */}
                  <TextInput
                    style={[
                      styles.input,
                      styles.descriptionInput,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                    ]}
                    value={values.description}
                    onChangeText={text => setValues(v => ({ ...v, description: text }))}
                    placeholder={t('description')}
                    placeholderTextColor={colors.mutedText}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
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

                {/* Delete Button (only for editing) */}
                {!isNew && onDelete && (
                  <Pressable
                    style={[styles.deleteButtonContainer, { backgroundColor: colors.card }]}
                    onPress={handleDelete}
                  >
                    <Icon name="delete-outline" size={20} color={colors.delete || '#ff6b6b'} />
                    <Text style={[styles.deleteButtonText, { color: colors.delete || '#ff6b6b' }]}>
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
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowDatePicker(Platform.OS === 'ios');
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
                          {item.balance} {item.currency}
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
});
