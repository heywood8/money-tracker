import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Keyboard, FlatList } from 'react-native';
import { Text, TextInput as PaperTextInput, Button, FAB, Portal, Modal, Card, TouchableRipple, ActivityIndicator, Switch } from 'react-native-paper';
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

// Memoized transfer account picker modal component
const TransferAccountPickerModal = memo(({ visible, onClose, accounts, accountToDelete, accountCurrency, operationCount, colors, t, onSelect, currencies }) => {
  const availableAccounts = useMemo(() => {
    return accounts.filter(a => a.id !== accountToDelete && a.currency === accountCurrency);
  }, [accounts, accountToDelete, accountCurrency]);

  const renderAccountItem = useCallback(({ item }) => {
    const currencySymbol = currencies[item.currency]?.symbol || item.currency;

    return (
      <TouchableRipple
        onPress={() => onSelect(item.id)}
        style={styles.pickerOption}
        rippleColor="rgba(0, 0, 0, .12)"
      >
        <View>
          <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
          <Text style={{ fontSize: 14, color: colors.mutedText, marginTop: 4 }}>
            {item.balance} {currencySymbol}
          </Text>
        </View>
      </TouchableRipple>
    );
  }, [onSelect, colors, currencies]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.pickerModalContent, { backgroundColor: colors.card }]}
      >
        <Text variant="titleLarge" style={{ marginBottom: 8, textAlign: 'center' }}>
          {t('transfer_operations') || 'Transfer Operations'}
        </Text>
        <Text variant="bodyMedium" style={{ marginBottom: 16, textAlign: 'center', color: colors.mutedText }}>
          {`${t('transfer_operations_message') || 'This account has transactions. Select an account to transfer them to:'}`}
        </Text>
        <Text variant="bodySmall" style={{ marginBottom: 16, textAlign: 'center', color: colors.mutedText, fontWeight: '600' }}>
          {`${operationCount} ${operationCount === 1 ? 'transaction' : 'transactions'}`}
        </Text>
        <FlatList
          data={availableAccounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccountItem}
          style={{ maxHeight: 400 }}
        />
        <Button mode="text" onPress={onClose} style={{ marginTop: 8 }}>
          {t('cancel') || 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
});

TransferAccountPickerModal.displayName = 'TransferAccountPickerModal';

// Memoized confirmation dialog component
const ConfirmationDialog = memo(({ visible, onClose, title, message, cancelText, confirmText, onConfirm, colors, confirmColor }) => {
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.confirmationModalContent, { backgroundColor: colors.card }]}
      >
        <Text variant="titleLarge" style={[styles.confirmationTitle, { color: colors.text }]}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={[styles.confirmationMessage, { color: colors.text }]}>
          {message}
        </Text>
        <View style={styles.confirmationButtons}>
          {cancelText && (
            <Button
              mode="outlined"
              onPress={onClose}
              style={styles.confirmationButton}
              textColor={colors.text}
            >
              {cancelText}
            </Button>
          )}
          <Button
            mode="contained"
            onPress={onConfirm}
            style={styles.confirmationButton}
            buttonColor={confirmColor || colors.primary}
          >
            {confirmText}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
});

ConfirmationDialog.displayName = 'ConfirmationDialog';

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
  const [createAdjustmentOperation, setCreateAdjustmentOperation] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [accountToDeleteCurrency, setAccountToDeleteCurrency] = useState(null);
  const [operationCount, setOperationCount] = useState(0);

  // Confirmation dialogs
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteConfirmAccountId, setDeleteConfirmAccountId] = useState(null);
  const [transferConfirmVisible, setTransferConfirmVisible] = useState(false);
  const [transferConfirmDestinationId, setTransferConfirmDestinationId] = useState(null);
  const [noCurrencyMatchVisible, setNoCurrencyMatchVisible] = useState(false);
  const [noCurrencyMatchMessage, setNoCurrencyMatchMessage] = useState('');

  const { colorScheme, colors } = useTheme();
  const { accounts, displayedAccounts, hiddenAccounts, showHiddenAccounts, toggleShowHiddenAccounts, loading, error, addAccount, updateAccount, deleteAccount, reorderAccounts, validateAccount, getOperationCount, currencies } = useAccounts();
  const { t } = useLocalization();

  const balanceInputRef = useRef(null);

  const startEdit = useCallback((id) => {
    setEditingId(id);
    const acc = accounts.find(a => a.id === id);
    setEditValues({ ...acc });
    setErrors({});
    setCreateAdjustmentOperation(true);
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
      updateAccount(editingId, editValues, createAdjustmentOperation);
    }
    setEditingId(null);
    setEditValues({});
    setErrors({});
    setCreateAdjustmentOperation(true);
  }, [validateAccount, editValues, editingId, addAccount, updateAccount, createAdjustmentOperation]);

  const addAccountHandler = useCallback(() => {
    setEditingId('new');
    setEditValues({ name: '', balance: '', currency: Object.keys(currencies)[0], hidden: 0 });
    setErrors({});
    setCreateAdjustmentOperation(true);
  }, [currencies]);

  const deleteAccountHandler = useCallback(async (id) => {
    try {
      // Check if account has operations
      const count = await getOperationCount(id);

      if (count > 0) {
        // Account has operations, need to transfer them first
        const accountToDeleteData = accounts.find(a => a.id === id);
        if (!accountToDeleteData) {
          throw new Error('Account not found');
        }

        // Filter for accounts with same currency (excluding the account being deleted)
        const sameCurrencyAccounts = accounts.filter(
          a => a.id !== id && a.currency === accountToDeleteData.currency
        );

        if (sameCurrencyAccounts.length === 0) {
          // No same-currency accounts to transfer to
          setNoCurrencyMatchMessage(
            t('no_same_currency_account') || `This account has ${count} transaction(s) but there are no other accounts with the same currency (${accountToDeleteData.currency}). Please create another ${accountToDeleteData.currency} account first, or delete the transactions.`
          );
          setNoCurrencyMatchVisible(true);
          return;
        }

        // Show transfer modal
        setAccountToDelete(id);
        setAccountToDeleteCurrency(accountToDeleteData.currency);
        setOperationCount(count);
        setTransferModalVisible(true);
      } else {
        // No operations, safe to delete directly
        setDeleteConfirmAccountId(id);
        setDeleteConfirmVisible(true);
      }
    } catch (err) {
      console.error('Failed to check operation count:', err);
      setNoCurrencyMatchMessage(t('failed_to_check_operations') || 'Failed to check operations. Please try again.');
      setNoCurrencyMatchVisible(true);
    }
  }, [t, getOperationCount, accounts]);

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setEditingId(null);
    setErrors({});
    setCreateAdjustmentOperation(true);
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

  const handleToggleAdjustmentSwitch = useCallback(() => {
    setCreateAdjustmentOperation(prev => !prev);
  }, []);

  const handleCloseTransferModal = useCallback(() => {
    setTransferModalVisible(false);
    setAccountToDelete(null);
    setAccountToDeleteCurrency(null);
    setOperationCount(0);
  }, []);

  const handleTransferAndDelete = useCallback((transferToAccountId) => {
    // Close the transfer modal first
    setTransferModalVisible(false);

    // Store the destination ID and show confirmation dialog
    setTransferConfirmDestinationId(transferToAccountId);
    setTransferConfirmVisible(true);
  }, []);

  // Handle simple delete confirmation
  const handleConfirmDelete = useCallback(async () => {
    setDeleteConfirmVisible(false);
    try {
      await deleteAccount(deleteConfirmAccountId);
      if (editingId === deleteConfirmAccountId) {
        setEditingId(null);
        setEditValues({});
        setErrors({});
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
      setNoCurrencyMatchMessage(t('failed_to_delete_account') || 'Failed to delete account. Please try again.');
      setNoCurrencyMatchVisible(true);
    }
    setDeleteConfirmAccountId(null);
  }, [deleteConfirmAccountId, deleteAccount, editingId, t]);

  // Handle transfer and delete confirmation
  const handleConfirmTransferAndDelete = useCallback(async () => {
    setTransferConfirmVisible(false);
    try {
      await deleteAccount(accountToDelete, transferConfirmDestinationId);

      // Clear edit state if we were editing the deleted account
      if (editingId === accountToDelete) {
        setEditingId(null);
        setEditValues({});
        setErrors({});
      }

      // Reset transfer modal state
      setAccountToDelete(null);
      setAccountToDeleteCurrency(null);
      setOperationCount(0);
      setTransferConfirmDestinationId(null);
    } catch (err) {
      console.error('Failed to transfer and delete account:', err);
      setNoCurrencyMatchMessage(t('failed_to_delete_account') || 'Failed to delete account. Please try again.');
      setNoCurrencyMatchVisible(true);
    }
  }, [accountToDelete, transferConfirmDestinationId, deleteAccount, editingId, t]);

  // Enhance accounts with currency symbol for better performance
  const enhancedAccounts = useMemo(() => {
    return displayedAccounts.map(acc => ({
      ...acc,
      currencySymbol: currencies[acc.currency]?.symbol || acc.currency
    }));
  }, [displayedAccounts, currencies]);

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
        ListFooterComponent={
          hiddenAccounts.length > 0 ? (
            <TouchableRipple
              onPress={toggleShowHiddenAccounts}
              style={[styles.showHiddenButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.showHiddenContent}>
                <Icon
                  name={showHiddenAccounts ? 'eye-off' : 'eye'}
                  size={24}
                  color={colors.primary}
                />
                <Text style={[styles.showHiddenText, { color: colors.text }]}>
                  {showHiddenAccounts
                    ? (t('hide_hidden_accounts') || 'Hide hidden accounts')
                    : (t('show_hidden_accounts') || `Show ${hiddenAccounts.length} hidden account${hiddenAccounts.length !== 1 ? 's' : ''}`)}
                </Text>
              </View>
            </TouchableRipple>
          ) : null
        }
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
            behavior="height"
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
              {editingId !== 'new' && (
                <View style={styles.switchContainer}>
                  <View style={styles.switchLabelContainer}>
                    <Text variant="bodyLarge">{t('create_adjustment_operation') || 'Create adjustment operation'}</Text>
                    <Text variant="bodySmall" style={{ color: colors.mutedText, marginTop: 4 }}>
                      {t('create_adjustment_operation_hint') || 'Automatically create a shadow operation to track balance adjustments'}
                    </Text>
                  </View>
                  <Switch
                    value={createAdjustmentOperation}
                    onValueChange={handleToggleAdjustmentSwitch}
                    color={colors.primary}
                  />
                </View>
              )}
              <View style={styles.switchContainer}>
                <View style={styles.switchLabelContainer}>
                  <Text variant="bodyLarge">{t('hidden_account') || 'Hidden account'}</Text>
                  <Text variant="bodySmall" style={{ color: colors.mutedText, marginTop: 4 }}>
                    {t('hidden_account_hint') || 'Hide this account from the main list and operations'}
                  </Text>
                </View>
                <Switch
                  value={!!editValues.hidden}
                  onValueChange={(value) => setEditValues(prev => ({ ...prev, hidden: value ? 1 : 0 }))}
                  color={colors.primary}
                />
              </View>
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
      <TransferAccountPickerModal
        visible={transferModalVisible}
        onClose={handleCloseTransferModal}
        accounts={accounts}
        accountToDelete={accountToDelete}
        accountCurrency={accountToDeleteCurrency}
        operationCount={operationCount}
        currencies={currencies}
        colors={colors}
        t={t}
        onSelect={handleTransferAndDelete}
      />

      {/* Simple delete confirmation */}
      <ConfirmationDialog
        visible={deleteConfirmVisible}
        onClose={() => setDeleteConfirmVisible(false)}
        title={t('delete_account') || 'Delete Account'}
        message={t('delete_account_confirm') || 'Are you sure you want to delete this account?'}
        cancelText={t('cancel') || 'Cancel'}
        confirmText={t('delete') || 'Delete'}
        onConfirm={handleConfirmDelete}
        colors={colors}
        confirmColor={colors.delete}
      />

      {/* Transfer and delete confirmation */}
      <ConfirmationDialog
        visible={transferConfirmVisible}
        onClose={() => {
          setTransferConfirmVisible(false);
          setAccountToDelete(null);
          setAccountToDeleteCurrency(null);
          setOperationCount(0);
          setTransferConfirmDestinationId(null);
        }}
        title={t('confirm_delete_and_transfer') || 'Confirm Deletion'}
        message={(() => {
          if (!accountToDelete || !transferConfirmDestinationId) return '';
          const sourceAccount = accounts.find(a => a.id === accountToDelete);
          const destAccount = accounts.find(a => a.id === transferConfirmDestinationId);
          if (!sourceAccount || !destAccount) return '';
          return `${t('confirm_delete_and_transfer_message') || `This will permanently delete "${sourceAccount.name}" and irreversibly move ${operationCount} transaction(s) to "${destAccount.name}".\n\nThis action cannot be undone.`}`;
        })()}
        cancelText={t('cancel') || 'Cancel'}
        confirmText={t('delete') || 'Delete'}
        onConfirm={handleConfirmTransferAndDelete}
        colors={colors}
        confirmColor={colors.delete}
      />

      {/* Error/info dialog (no currency match, errors, etc.) */}
      <ConfirmationDialog
        visible={noCurrencyMatchVisible}
        onClose={() => setNoCurrencyMatchVisible(false)}
        title={t('cannot_delete_account') || 'Cannot Delete Account'}
        message={noCurrencyMatchMessage}
        cancelText=""
        confirmText={t('ok') || 'OK'}
        onConfirm={() => setNoCurrencyMatchVisible(false)}
        colors={colors}
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
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 16,
    paddingVertical: 8,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
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
  confirmationModalContent: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
  },
  confirmationTitle: {
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  confirmationMessage: {
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmationButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  confirmationButton: {
    minWidth: 100,
  },
  showHiddenButton: {
    marginHorizontal: 8,
    marginVertical: 8,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  showHiddenContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  showHiddenText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

// Refactored for consistent and performant styles using StyleSheet.create
// Consider using styled-components or tailwind-rn for dynamic styling if needed
// Responsive design can be further improved with Dimensions, PixelRatio, or react-native-size-matters
