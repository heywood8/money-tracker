import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Keyboard, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { useTheme } from './ThemeContext';
import { useAccounts } from './AccountsContext';
import { useLocalization } from './LocalizationContext';

// Memoized currency picker modal component
const CurrencyPickerModal = memo(({ visible, onClose, currencies, colors, t, onSelect }) => {
  const renderCurrencyItem = useCallback(({ item }) => {
    const [code, cur] = item;

    return (
      <Pressable
        onPress={() => onSelect(code)}
        style={({ pressed }) => [
          styles.pickerOption,
          { borderColor: colors.border },
          pressed && { backgroundColor: colors.selected }
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 18 }}>{cur.name} ({cur.symbol})</Text>
      </Pressable>
    );
  }, [colors.border, colors.text, colors.selected, onSelect]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
          <FlatList
            data={Object.entries(currencies)}
            keyExtractor={([code]) => code}
            renderItem={renderCurrencyItem}
          />
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={{ color: colors.primary }}>{t('close') || 'Close'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

CurrencyPickerModal.displayName = 'CurrencyPickerModal';

// Memoized account row component
const AccountRow = memo(({ item, index, colors, onPress, t }) => {
  const isEven = index % 2 === 0;
  const rowBg = isEven ? colors.background : colors.altRow;

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  return (
    <TouchableOpacity
      style={[styles.accountRow, { borderColor: colors.border, backgroundColor: rowBg }]}
      onPress={handlePress}
      accessibilityLabel={t('edit_account') || 'Edit Account'}
      accessibilityRole="button"
    >
      <View style={styles.accountNameWrapper}>
        <Text style={[styles.accountText, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
          {item.name}
        </Text>
      </View>
      <View style={styles.verticalDivider} />
      <View style={styles.accountValueWrapper}>
        <Text style={[styles.accountText, { color: colors.text, textAlign: 'right' }]} numberOfLines={1} ellipsizeMode="tail">
          {item.balance} {item.currencySymbol}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

AccountRow.displayName = 'AccountRow';

export default function AccountsScreen() {

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [errors, setErrors] = useState({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const { colorScheme, colors } = useTheme();
  const { accounts, loading, error, addAccount, updateAccount, deleteAccount, validateAccount, currencies } = useAccounts();
  const { t } = useLocalization();

  const balanceInputRef = useRef(null);

  const startEdit = useCallback((id) => {
    setEditingId(id);
    const acc = accounts.find(a => a.id === id);
    setEditValues({ ...acc });
    setErrors({});
  }, [accounts]);

  const saveEdit = useCallback(() => {
    const validation = validateAccount(editValues);
    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }
    if (editingId === 'new') {
      addAccount(editValues);
    } else {
      updateAccount(editingId, editValues);
    }
    setEditingId(null);
    setEditValues({});
    setErrors({});
  }, [validateAccount, editValues, editingId, addAccount, updateAccount]);

  const addAccountHandler = useCallback(() => {
    setEditingId('new');
    setEditValues({ name: '', balance: '', currency: Object.keys(currencies)[0] });
    setErrors({});
  }, [currencies]);

  const deleteAccountHandler = useCallback((id) => {
    Alert.alert(
      t('delete_account') || 'Delete Account',
      t('delete_account_confirm') || 'Are you sure you want to delete this account?',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount(id);
            if (editingId === id) {
              setEditingId(null);
              setEditValues({});
              setErrors({});
            }
          },
        },
      ]
    );
  }, [t, deleteAccount, editingId]);

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setEditingId(null);
    setErrors({});
  }, []);

  const handleOpenPicker = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const handleClosePicker = useCallback(() => {
    setPickerVisible(false);
  }, []);

  const handleNameChange = useCallback((text) => {
    setEditValues(v => ({ ...v, name: text }));
  }, []);

  const handleBalanceChange = useCallback((text) => {
    setEditValues(v => ({ ...v, balance: text }));
  }, []);

  const handleCurrencySelect = useCallback((code) => {
    setEditValues(v => ({ ...v, currency: code }));
    setPickerVisible(false);
  }, []);

  // Enhance accounts with currency symbol for better performance
  const enhancedAccounts = useMemo(() => {
    return accounts.map(acc => ({
      ...acc,
      currencySymbol: currencies[acc.currency]?.symbol || acc.currency
    }));
  }, [accounts, currencies]);

  const renderItem = useCallback(({ item, index }) => (
    <AccountRow
      item={item}
      index={index}
      colors={colors}
      onPress={startEdit}
      t={t}
    />
  ), [colors, startEdit, t]);

  const getItemLayout = useCallback((data, index) => ({
    length: 56,
    offset: 56 * index,
    index,
  }), []);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_accounts') || 'Loading accounts...'}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.delete }]}>
          {t('error_loading_accounts') || 'Failed to load accounts'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header is rendered globally by app/Header; per-screen header removed */}
      <FlatList
        data={enhancedAccounts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        getItemLayout={getItemLayout}
        windowSize={10}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        removeClippedSubviews={true}
        ListEmptyComponent={<Text style={{ color: colors.mutedText }}>{t('no_accounts') || 'No accounts yet.'}</Text>}
      />
      <View style={styles.addButtonWrapper}>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={addAccountHandler}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('add_account') || 'Add Account'}
          accessibilityHint={t('add_account_hint') || 'Opens form to create a new account'}
        >
          <Icon name="plus" size={20} color="#fff" style={styles.addButtonIcon} />
          <Text style={styles.addButtonText}>{t('add_account') || 'Add Account'}</Text>
        </TouchableOpacity>
      </View>
      <Modal
        visible={!!editingId}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_account') || 'Edit Account'}</Text>
                <TextInput
                  style={[
                    styles.input,
                    errors.name && styles.inputError,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }
                  ]}
                  value={editValues.name}
                  onChangeText={handleNameChange}
                  placeholder={t('account_name') || 'Account Name'}
                    placeholderTextColor={colors.mutedText}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => balanceInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                {errors.name && <Text style={styles.error}>{errors.name}</Text>}
                <TextInput
                  ref={balanceInputRef}
                  style={[
                    styles.input,
                    errors.balance && styles.inputError,
                      { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }
                  ]}
                  value={editValues.balance}
                  onChangeText={handleBalanceChange}
                  placeholder={t('balance') || 'Balance'}
                    placeholderTextColor={colors.mutedText}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {errors.balance && <Text style={styles.error}>{errors.balance}</Text>}
                  <View style={[styles.pickerWrapper, { backgroundColor: colors.inputBackground }]}>
                    <Pressable onPress={handleOpenPicker} style={styles.pickerDisplay}>
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '500' }}>
                        {editValues.currency ? `${currencies[editValues.currency]?.name} (${currencies[editValues.currency]?.symbol})` : t('select_currency') || 'Select currency'}
                      </Text>
                    </Pressable>
                    <CurrencyPickerModal
                      visible={pickerVisible}
                      onClose={handleClosePicker}
                      currencies={currencies}
                      colors={colors}
                      t={t}
                      onSelect={handleCurrencySelect}
                    />
                  </View>
                {errors.currency && <Text style={styles.error}>{errors.currency}</Text>}
              </ScrollView>
                <View style={[styles.modalButtonRowSticky, { backgroundColor: colors.card }]}>
                  <Pressable style={[styles.actionButton, styles.modalButton, { backgroundColor: colors.secondary }]} onPress={handleCloseModal}>
                    <Text style={[styles.buttonText, { color: colors.text }]}>{t('cancel') || 'Cancel'}</Text>
                  </Pressable>
                  {editingId !== 'new' && (
                    <Pressable
                      style={[styles.actionButton, styles.modalButton, { backgroundColor: colors.delete }]}
                      onPress={() => deleteAccountHandler(editingId)}
                    >
                      <Text style={[styles.buttonText, { color: colors.card }]}>{t('delete') || 'Delete'}</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.actionButton, styles.modalButton, { backgroundColor: colors.primary }]} onPress={saveEdit}>
                    <Text style={[styles.buttonText, { color: colors.text }]}>{t('save') || 'Save'}</Text>
                  </Pressable>
                </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {/* Settings modal is managed at the top-level Header in SimpleTabs */}
    </View>
  );
}

const styles = StyleSheet.create({
    verticalDivider: {
      width: 1,
      height: '70%',
      backgroundColor: 'rgba(120,120,120,0.13)', // subtle vertical divider
      alignSelf: 'center',
      marginHorizontal: 2,
    },
  container: { flex: 1, padding: 16 },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: 'bold' },
  hamburgerButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  hamburgerLine: {
    width: 20,
    height: 3,
    backgroundColor: '#000',
    marginVertical: 2,
    borderRadius: 2,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(120,120,120,0.13)', // slightly visible divider
    minHeight: 56,
  },
  accountNameWrapper: {
    flex: 7,
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 8,
  },
  accountValueWrapper: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
    paddingLeft: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButton: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 4 },
  inputError: { borderColor: 'red' },
  error: { color: 'red', fontSize: 12, marginBottom: 4 },
  text: { fontSize: 16 },
  accountText: { fontSize: 22, fontWeight: '500', marginBottom: 4 },
  link: { color: 'blue', marginLeft: 8 },
  picker: { height: 80, width: '100%' },
  pickerWrapper: { marginBottom: 4, marginTop: 4, borderRadius: 4, overflow: 'hidden' },
  pickerDisplay: { padding: 12, justifyContent: 'center' },
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
    borderColor: '#eee',
  },
  closeButton: {
    marginTop: 8,
    alignSelf: 'center',
    padding: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    minHeight: 280,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'column',
    justifyContent: 'space-between',
    maxHeight: '90%',
  },
    modalButtonRowSticky: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
      backgroundColor: '#fff',
      paddingBottom: 0,
    },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  addButtonWrapper: {
    padding: 16,
    paddingBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonIcon: {
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Refactored for consistent and performant styles using StyleSheet.create
// Consider using styled-components or tailwind-rn for dynamic styling if needed
// Responsive design can be further improved with Dimensions, PixelRatio, or react-native-size-matters
