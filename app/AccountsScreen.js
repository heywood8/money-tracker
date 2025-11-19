import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, Keyboard, FlatList } from 'react-native';
import { Text, TextInput as PaperTextInput, Button, FAB, Portal, Modal, Card, TouchableRipple, ActivityIndicator } from 'react-native-paper';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { useTheme } from './ThemeContext';
import { useAccounts } from './AccountsContext';
import { useLocalization } from './LocalizationContext';

// Memoized currency picker modal component
const CurrencyPickerModal = memo(({ visible, onClose, currencies, colors, t, onSelect }) => {
  const renderCurrencyItem = useCallback(({ item }) => {
    const [code, cur] = item;

    return (
      <TouchableRipple
        onPress={() => onSelect(code)}
        style={styles.pickerOption}
        rippleColor="rgba(0, 0, 0, .12)"
      >
        <Text style={{ fontSize: 16 }}>{cur.name} ({cur.symbol})</Text>
      </TouchableRipple>
    );
  }, [onSelect]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.pickerModalContent, { backgroundColor: colors.card }]}
      >
        <FlatList
          data={Object.entries(currencies)}
          keyExtractor={([code]) => code}
          renderItem={renderCurrencyItem}
          style={{ maxHeight: 400 }}
        />
        <Button mode="text" onPress={onClose} style={{ marginTop: 8 }}>
          {t('close') || 'Close'}
        </Button>
      </Modal>
    </Portal>
  );
});

CurrencyPickerModal.displayName = 'CurrencyPickerModal';

// Memoized account row component
const AccountRow = memo(({ item, index, colors, onPress, t, drag, isActive }) => {
  const isEven = index % 2 === 0;
  const rowBg = isEven ? colors.background : colors.altRow;

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  return (
    <Card
      mode="outlined"
      style={[
        styles.accountCard,
        { backgroundColor: rowBg, borderColor: colors.border },
        isActive && { backgroundColor: colors.selected, opacity: 0.9 }
      ]}
    >
      <View style={styles.accountRow}>
        <TouchableRipple
          style={styles.accountContentWrapper}
          onPress={handlePress}
          rippleColor="rgba(0, 0, 0, .12)"
          accessibilityLabel={t('edit_account') || 'Edit Account'}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={styles.accountNameWrapper}>
              <Text variant="titleMedium" numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.accountValueWrapper}>
              <Text variant="titleMedium" style={{ textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">
                {item.balance} {item.currencySymbol}
              </Text>
            </View>
          </View>
        </TouchableRipple>
        <TouchableRipple
          onLongPress={drag}
          style={styles.dragHandle}
          rippleColor="rgba(0, 0, 0, .12)"
          accessibilityLabel={t('drag_to_reorder') || 'Long press to reorder'}
          accessibilityRole="button"
        >
          <Icon name="drag-horizontal-variant" size={24} color={colors.mutedText} />
        </TouchableRipple>
      </View>
    </Card>
  );
});

AccountRow.displayName = 'AccountRow';

export default function AccountsScreen() {

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [errors, setErrors] = useState({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const { colorScheme, colors } = useTheme();
  const { accounts, loading, error, addAccount, updateAccount, deleteAccount, reorderAccounts, validateAccount, currencies } = useAccounts();
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

  const renderItem = useCallback(({ item, index, drag, isActive }) => (
    <AccountRow
      item={item}
      index={index}
      colors={colors}
      onPress={startEdit}
      t={t}
      drag={drag}
      isActive={isActive}
    />
  ), [colors, startEdit, t]);

  const handleDragEnd = useCallback(({ data }) => {
    reorderAccounts(data);
  }, [reorderAccounts]);

  const keyExtractor = useCallback((item) => item.id, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 12, color: colors.mutedText }}>
          {t('loading_accounts') || 'Loading accounts...'}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text variant="bodyLarge" style={{ color: colors.delete, textAlign: 'center' }}>
          {t('error_loading_accounts') || 'Failed to load accounts'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header is rendered globally by app/Header; per-screen header removed */}
      <DraggableFlatList
        data={enhancedAccounts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onDragEnd={handleDragEnd}
        activationDistance={20}
        ListEmptyComponent={<Text style={{ color: colors.mutedText }}>{t('no_accounts') || 'No accounts yet.'}</Text>}
      />
      <FAB
        icon="plus"
        label={t('add_account') || 'Add Account'}
        style={styles.fab}
        onPress={addAccountHandler}
        accessibilityLabel={t('add_account') || 'Add Account'}
        accessibilityHint={t('add_account_hint') || 'Opens form to create a new account'}
      />
      <Portal>
        <Modal
          visible={!!editingId}
          onDismiss={handleCloseModal}
          contentContainerStyle={[styles.modalContent, { backgroundColor: colors.card }]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Text variant="headlineSmall" style={styles.modalTitle}>{t('edit_account') || 'Edit Account'}</Text>
              <PaperTextInput
                mode="outlined"
                label={t('account_name') || 'Account Name'}
                value={editValues.name}
                onChangeText={handleNameChange}
                error={!!errors.name}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => balanceInputRef.current?.focus()}
                blurOnSubmit={false}
                style={styles.textInput}
              />
              {errors.name && <Text variant="bodySmall" style={styles.error}>{errors.name}</Text>}
              <PaperTextInput
                ref={balanceInputRef}
                mode="outlined"
                label={t('balance') || 'Balance'}
                value={editValues.balance}
                onChangeText={handleBalanceChange}
                error={!!errors.balance}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={styles.textInput}
              />
              {errors.balance && <Text variant="bodySmall" style={styles.error}>{errors.balance}</Text>}
              <TouchableRipple onPress={handleOpenPicker} style={[styles.pickerWrapper, { backgroundColor: colors.inputBackground }]}>
                <View style={styles.pickerDisplay}>
                  <Text variant="bodyLarge">
                    {editValues.currency ? `${currencies[editValues.currency]?.name} (${currencies[editValues.currency]?.symbol})` : t('select_currency') || 'Select currency'}
                  </Text>
                </View>
              </TouchableRipple>
              {errors.currency && <Text variant="bodySmall" style={styles.error}>{errors.currency}</Text>}
            </ScrollView>
            <View style={styles.modalButtonRow}>
              <Button mode="outlined" onPress={handleCloseModal} style={styles.modalButton}>
                {t('cancel') || 'Cancel'}
              </Button>
              {editingId !== 'new' && (
                <Button
                  mode="contained"
                  buttonColor={colors.delete}
                  onPress={() => deleteAccountHandler(editingId)}
                  style={styles.modalButton}
                >
                  {t('delete') || 'Delete'}
                </Button>
              )}
              <Button mode="contained" onPress={saveEdit} style={styles.modalButton}>
                {t('save') || 'Save'}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
      <CurrencyPickerModal
        visible={pickerVisible}
        onClose={handleClosePicker}
        currencies={currencies}
        colors={colors}
        t={t}
        onSelect={handleCurrencySelect}
      />
      {/* Settings modal is managed at the top-level Header in SimpleTabs */}
    </View>
  );
}

const styles = StyleSheet.create({
  verticalDivider: {
    width: 1,
    height: '70%',
    backgroundColor: 'rgba(120,120,120,0.13)',
    alignSelf: 'center',
    marginHorizontal: 2,
  },
  container: { flex: 1 },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountCard: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  accountContentWrapper: {
    flex: 1,
    paddingVertical: 12,
  },
  dragHandle: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  textInput: {
    marginBottom: 8,
  },
  error: {
    color: 'red',
    marginBottom: 8,
    marginLeft: 12,
  },
  pickerWrapper: {
    marginBottom: 8,
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  pickerDisplay: {
    padding: 16,
    justifyContent: 'center',
  },
  pickerModalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  pickerOption: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
    maxHeight: '90%',
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  modalButton: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

// Refactored for consistent and performant styles using StyleSheet.create
// Consider using styled-components or tailwind-rn for dynamic styling if needed
// Responsive design can be further improved with Dimensions, PixelRatio, or react-native-size-matters
