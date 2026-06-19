import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Keyboard, FlatList, TouchableOpacity, Pressable, Animated, Dimensions, ScrollView, Easing } from 'react-native';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
import { Text, TextInput as PaperTextInput, Button, Portal, Modal, TouchableRipple, Switch } from 'react-native-paper';
import AddFAB from '../components/AddFAB';
import LoadingView from '../components/LoadingView';
import EmptyState from '../components/EmptyState';
import { NestableScrollContainer, NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS, HEIGHTS } from '../styles/layout';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useLocalization } from '../contexts/LocalizationContext';
import currencies from '../../assets/currencies.json';

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
        <Text style={styles.pickerOptionText}>{cur.name} ({cur.symbol})</Text>
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
          style={styles.pickerList}
        />
        <Button mode="text" onPress={onClose} style={styles.pickerCloseButton}>
          {t('close') || 'Close'}
        </Button>
      </Modal>
    </Portal>
  );
});

CurrencyPickerModal.displayName = 'CurrencyPickerModal';

CurrencyPickerModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  currencies: PropTypes.object,
  colors: PropTypes.object,
  t: PropTypes.func,
  onSelect: PropTypes.func,
};

CurrencyPickerModal.defaultProps = {
  visible: false,
  onClose: () => {},
  currencies,
  colors: {},
  t: (k) => k,
  onSelect: () => {},
};

// Memoized transfer account picker modal component
const TransferAccountPickerModal = memo(({ visible, onClose, accounts, accountToDelete, accountCurrency, operationCount, colors, t, onSelect, currencies }) => {
  const { hideBalances } = useDisplaySettings();
  const availableAccounts = useMemo(() => {
    return accounts.filter(a => a.id !== accountToDelete && a.currency === accountCurrency);
  }, [accounts, accountToDelete, accountCurrency]);

  const renderAccountItem = useCallback(({ item }) => {
    const currencySymbol = currencies[item.currency]?.symbol || item.currency;
    const decimals = currencies[item.currency]?.decimal_digits ?? 2;
    const formattedBalance = parseFloat(item.balance).toFixed(decimals);

    return (
      <TouchableRipple
        onPress={() => onSelect(item.id)}
        style={styles.pickerOption}
        rippleColor="rgba(0, 0, 0, .12)"
      >
        <View>
          <Text style={styles.pickerAccountName}>{item.name}</Text>
          {hideBalances ? (
            <View style={[styles.hiddenBalance, styles.hiddenBalancePicker]} />
          ) : (
            <Text style={[styles.pickerAccountBalance, { color: colors.mutedText }]}>
              {formattedBalance} {currencySymbol}
            </Text>
          )}
        </View>
      </TouchableRipple>
    );
  }, [onSelect, colors, currencies, hideBalances]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.pickerModalContent, { backgroundColor: colors.card }]}
      >
        <Text variant="titleLarge" style={styles.centeredTitleLarge}>
          {t('transfer_operations') || 'Transfer Operations'}
        </Text>
        <Text variant="bodyMedium" style={[styles.centeredBodyMedium, { color: colors.mutedText }]}>
          {`${t('transfer_operations_message') || 'This account has transactions. Select an account to transfer them to:'}`}
        </Text>
        <Text variant="bodySmall" style={[styles.centeredBodySmall, { color: colors.mutedText }]}>
          {`${operationCount} ${operationCount === 1 ? 'transaction' : 'transactions'}`}
        </Text>
        <FlatList
          data={availableAccounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccountItem}
          style={styles.pickerList}
        />
        <Button mode="text" onPress={onClose} style={styles.pickerCloseButton}>
          {t('cancel') || 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
});

TransferAccountPickerModal.displayName = 'TransferAccountPickerModal';

TransferAccountPickerModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  accounts: PropTypes.array,
  accountToDelete: PropTypes.string,
  accountCurrency: PropTypes.string,
  operationCount: PropTypes.number,
  colors: PropTypes.object,
  t: PropTypes.func,
  onSelect: PropTypes.func,
  currencies: PropTypes.object,
};

TransferAccountPickerModal.defaultProps = {
  visible: false,
  onClose: () => {},
  accounts: [],
  accountToDelete: null,
  accountCurrency: null,
  operationCount: 0,
  colors: {},
  t: (k) => k,
  onSelect: () => {},
  currencies,
};

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

ConfirmationDialog.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  title: PropTypes.string,
  message: PropTypes.string,
  cancelText: PropTypes.string,
  confirmText: PropTypes.string,
  onConfirm: PropTypes.func,
  colors: PropTypes.object,
  confirmColor: PropTypes.string,
};

ConfirmationDialog.defaultProps = {
  visible: false,
  onClose: () => {},
  title: '',
  message: '',
  cancelText: null,
  confirmText: 'OK',
  onConfirm: () => {},
  colors: {},
  confirmColor: null,
};

// Net worth summary card
const NetWorthCard = memo(({ accounts, operations, colors, t }) => {
  const { hideBalances } = useDisplaySettings();

  // Determine display currency from first account (or default to USD)
  const displayCurrency = useMemo(() => {
    if (accounts.length > 0) {
      return accounts[0].currency || 'USD';
    }
    return 'USD';
  }, [accounts]);

  const currencyData = currencies[displayCurrency] || currencies['USD'];
  const decimals = currencyData?.decimal_digits ?? 2;
  const currencySymbol = currencyData?.symbol || displayCurrency;

  // Filter accounts to only those matching display currency
  const sameCurrencyAccounts = useMemo(() => {
    return accounts.filter(acc => acc.currency === displayCurrency);
  }, [accounts, displayCurrency]);

  // Create account ID set for quick lookup
  const sameCurrencyAccountIds = useMemo(() => {
    return new Set(sameCurrencyAccounts.map(acc => acc.id));
  }, [sameCurrencyAccounts]);

  const totalBalance = useMemo(() => {
    return sameCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);
  }, [sameCurrencyAccounts]);

  // Calculate this month's change (only for accounts with matching currency)
  const monthlyChange = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return operations.reduce((sum, op) => {
      // Only count operations from accounts with matching currency
      if (!sameCurrencyAccountIds.has(op.accountId)) {
        return sum;
      }

      const opDate = new Date(op.date);
      if (opDate.getMonth() === currentMonth && opDate.getFullYear() === currentYear) {
        const amount = parseFloat(op.amount || '0');
        if (op.type === 'income') {
          return sum + amount;
        } else if (op.type === 'expense') {
          return sum - amount;
        }
        // transfers don't affect net worth
      }
      return sum;
    }, 0);
  }, [operations, sameCurrencyAccountIds]);

  const isNegative = totalBalance < 0;
  const abs = Math.abs(totalBalance);
  const [intPart, decPart] = abs.toFixed(decimals).split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = decPart ? `${formattedInt}.${decPart}` : formattedInt;

  const changeIsPositive = monthlyChange >= 0;
  const absChange = Math.abs(monthlyChange);
  const [changeIntPart, changeDecPart] = absChange.toFixed(decimals).split('.');
  const formattedChangeInt = changeIntPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedChange = changeDecPart ? `${formattedChangeInt}.${changeDecPart}` : formattedChangeInt;

  return (
    <View style={[styles.netWorthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.netWorthLabel, { color: colors.mutedText }]}>
        {(t('net_worth') || 'NET WORTH').toUpperCase()}
      </Text>
      {hideBalances ? (
        <View style={[styles.hiddenBalance, styles.hiddenBalanceLarge]} />
      ) : (
        <>
          <Text style={[styles.netWorthAmount, { color: isNegative ? colors.expense : colors.text }]}>
            {isNegative ? '-' : ''}{currencySymbol}{formatted}
          </Text>
          {monthlyChange !== 0 && (
            <View style={styles.monthlyChangeRow}>
              <Text style={[styles.monthlyChangeText, { color: changeIsPositive ? colors.income : colors.expense }]}>
                {changeIsPositive ? '↗' : '↘'} {changeIsPositive ? '+' : '-'}{currencySymbol}{formattedChange} {t('this_month') || 'this month'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
});

NetWorthCard.displayName = 'NetWorthCard';

NetWorthCard.propTypes = {
  accounts: PropTypes.array,
  operations: PropTypes.array,
  colors: PropTypes.object,
  t: PropTypes.func,
};

NetWorthCard.defaultProps = {
  accounts: [],
  operations: [],
  colors: {},
  t: (k) => k,
};

// Memoized account row component
const AccountRow = memo(({ item, colors, onPress, t, drag, isActive }) => {
  const { hideBalances } = useDisplaySettings();
  const decimals = currencies[item.currency]?.decimal_digits ?? 2;
  const balance = parseFloat(item.balance);
  const isNegative = balance < 0;

  // Format balance with thousands separators
  const absBalance = Math.abs(balance);
  const [intPart, decPart] = absBalance.toFixed(decimals).split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedBalance = decPart ? `${formattedInt}.${decPart}` : formattedInt;

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  return (
    <View style={[styles.accountRow, isActive && { backgroundColor: colors.selected }]}>
      <TouchableOpacity
        testID={`account-row-${(item.name ?? '').toLowerCase().replace(/\s+/g, '-')}`}
        onPress={handlePress}
        activeOpacity={0.7}
        style={styles.accountTouchableArea}
        accessibilityRole="button"
        accessibilityLabel={t('edit_account') || 'Edit Account'}
      >
        <View style={styles.accountRowInner}>
          <View style={styles.accountInfo}>
            <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>
            <Text style={[styles.accountCurrencyLabel, { color: colors.mutedText }]}>
              {item.currency}
            </Text>
          </View>
          {hideBalances ? (
            <View style={styles.hiddenBalance} />
          ) : (
            <Text
              style={[styles.accountBalance, { color: isNegative ? colors.expense : colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {isNegative ? '-' : ''}{item.currencySymbol}{formattedBalance}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onLongPress={drag}
        delayLongPress={0}
        style={styles.dragHandle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={t('drag_to_reorder') || 'Drag to reorder'}
        accessibilityRole="button"
      >
        <Icon name="drag-horizontal-variant" size={24} color={colors.mutedText} />
      </TouchableOpacity>
    </View>
  );
});

AccountRow.displayName = 'AccountRow';

AccountRow.propTypes = {
  item: PropTypes.object.isRequired,
  colors: PropTypes.object,
  onPress: PropTypes.func,
  t: PropTypes.func,
  drag: PropTypes.func,
  isActive: PropTypes.bool,
};

AccountRow.defaultProps = {
  colors: {},
  onPress: () => {},
  t: (k) => k,
  drag: () => {},
  isActive: false,
};

export default function AccountsScreen({ onBackStateChange }) {

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [errors, setErrors] = useState({});
  const [createAdjustmentOperation, setCreateAdjustmentOperation] = useState(true);
  const [currencyPanelVisible, setCurrencyPanelVisible] = useState(false);
  const currencySlideAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;
  const formPanelAnim = useRef(new Animated.Value(0)).current;
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

  const insets = useSafeAreaInsets();
  const { colorScheme } = useThemeConfig();
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
  const { accounts, displayedAccounts, hiddenAccounts, showHiddenAccounts, loading, error } = useAccountsData();
  const { toggleShowHiddenAccounts, addAccount, updateAccount, deleteAccount, reorderAccounts, validateAccount, getOperationCount } = useAccountsActions();
  const { operations } = useOperationsData();
  const { t } = useLocalization();

  const balanceInputRef = useRef(null);

  const SCREEN_WIDTH = Dimensions.get('window').width;

  // Form panel interpolations
  const formPanelTranslateX = formPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0],
  });
  const formPanelOpacity = formPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const openFormPanel = useCallback((id, values) => {
    setCurrencyPanelVisible(false);
    currencySlideAnim.setValue(Dimensions.get('window').width);
    setEditingId(id);
    setEditValues(values);
    Animated.timing(formPanelAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [formPanelAnim, currencySlideAnim]);

  const closeFormPanel = useCallback(() => {
    Animated.timing(formPanelAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setEditingId(null);
      setEditValues({});
      setErrors({});
      setCurrencyPanelVisible(false);
    });
  }, [formPanelAnim]);

  const startEdit = useCallback((id) => {
    const acc = accounts.find(a => a.id === id);
    const decimals = currencies[acc.currency]?.decimal_digits ?? 2;
    let balance = String(acc.balance ?? '');
    if (decimals === 0) {
      balance = balance.replace(/\..*/g, '');
    } else {
      const dotIndex = balance.indexOf('.');
      if (dotIndex !== -1) {
        balance = balance.substring(0, dotIndex + 1) + balance.substring(dotIndex + 1).substring(0, decimals);
      }
    }
    setErrors({});
    setCreateAdjustmentOperation(true);
    openFormPanel(id, { ...acc, balance });
  }, [accounts, openFormPanel]);

  const saveEdit = useCallback(() => {
    const validation = validateAccount(editValues, t);
    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }
    if (editingId === 'new') {
      addAccount(editValues);
    } else {
      updateAccount(editingId, editValues, createAdjustmentOperation);
    }
    closeFormPanel();
  }, [validateAccount, editValues, editingId, addAccount, updateAccount, createAdjustmentOperation, t, closeFormPanel]);

  const addAccountHandler = useCallback(() => {
    setErrors({});
    setCreateAdjustmentOperation(true);
    openFormPanel('new', { name: '', balance: '', currency: Object.keys(currencies)[0], hidden: 0 });
  }, [openFormPanel]);

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
          a => a.id !== id && a.currency === accountToDeleteData.currency,
        );

        if (sameCurrencyAccounts.length === 0) {
          // No same-currency accounts to transfer to
          setNoCurrencyMatchMessage(
            t('no_same_currency_account') || `This account has ${count} transaction(s) but there are no other accounts with the same currency (${accountToDeleteData.currency}). Please create another ${accountToDeleteData.currency} account first, or delete the transactions.`,
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
    closeFormPanel();
  }, [closeFormPanel]);

  const handleOpenPicker = useCallback(() => {
    currencySlideAnim.setValue(Dimensions.get('window').width);
    setCurrencyPanelVisible(true);
    Animated.timing(currencySlideAnim, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currencySlideAnim]);

  const handleClosePicker = useCallback(() => {
    Animated.timing(currencySlideAnim, {
      toValue: Dimensions.get('window').width,
      duration: 260,
      useNativeDriver: true,
    }).start(() => setCurrencyPanelVisible(false));
  }, [currencySlideAnim]);

  const handleNameChange = useCallback((text) => {
    setEditValues(v => ({ ...v, name: text }));
  }, []);

  const handleBalanceChange = useCallback((text) => {
    setEditValues(v => {
      const decimals = currencies[v.currency]?.decimal_digits ?? 2;

      // Strip anything that isn't a digit, minus, or decimal point
      let filtered = text.replace(/[^0-9.-]/g, '');

      // Only allow a leading minus
      const isNegative = filtered.startsWith('-');
      filtered = filtered.replace(/-/g, '');
      if (isNegative) filtered = '-' + filtered;

      if (decimals === 0) {
        // No fractional part allowed
        filtered = filtered.replace(/\./g, '');
      } else {
        // Keep only the first decimal point, cap fractional digits
        const dotIndex = filtered.indexOf('.');
        if (dotIndex !== -1) {
          const intPart = filtered.substring(0, dotIndex + 1);
          const fracPart = filtered.substring(dotIndex + 1).replace(/\./g, '').substring(0, decimals);
          filtered = intPart + fracPart;
        }
      }

      return { ...v, balance: filtered };
    });
  }, []);

  const handleCurrencySelect = useCallback((code) => {
    setEditValues(v => {
      const decimals = currencies[code]?.decimal_digits ?? 2;
      let balance = v.balance;

      if (decimals === 0) {
        // Strip any fractional part
        balance = balance.replace(/\..*/g, '');
      } else {
        // Trim fractional part to the new currency's allowed digits
        const dotIndex = balance.indexOf('.');
        if (dotIndex !== -1) {
          const fracPart = balance.substring(dotIndex + 1).substring(0, decimals);
          balance = balance.substring(0, dotIndex + 1) + fracPart;
        }
      }

      return { ...v, currency: code, balance };
    });
    handleClosePicker();
  }, [handleClosePicker]);

  const handleToggleAdjustmentSwitch = useCallback(() => {
    setCreateAdjustmentOperation(prev => !prev);
  }, []);

  const handleToggleHiddenSwitch = useCallback((value) => {
    setEditValues(prev => ({ ...prev, hidden: value ? 1 : 0 }));
  }, []);

  const handleDeleteEditingAccount = useCallback(() => {
    deleteAccountHandler(editingId);
  }, [deleteAccountHandler, editingId]);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
  }, []);

  const handleCloseTransferConfirm = useCallback(() => {
    setTransferConfirmVisible(false);
    setAccountToDelete(null);
    setAccountToDeleteCurrency(null);
    setOperationCount(0);
    setTransferConfirmDestinationId(null);
  }, []);

  const handleCloseNoCurrencyMatch = useCallback(() => {
    setNoCurrencyMatchVisible(false);
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
        closeFormPanel();
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
      setNoCurrencyMatchMessage(t('failed_to_delete_account') || 'Failed to delete account. Please try again.');
      setNoCurrencyMatchVisible(true);
    }
    setDeleteConfirmAccountId(null);
  }, [deleteConfirmAccountId, deleteAccount, editingId, t, closeFormPanel]);

  // Handle transfer and delete confirmation
  const handleConfirmTransferAndDelete = useCallback(async () => {
    setTransferConfirmVisible(false);
    try {
      await deleteAccount(accountToDelete, transferConfirmDestinationId);

      // Clear edit state if we were editing the deleted account
      if (editingId === accountToDelete) {
        closeFormPanel();
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
  }, [accountToDelete, transferConfirmDestinationId, deleteAccount, editingId, t, closeFormPanel]);

  // Enhance accounts with currency symbol for better performance
  const enhancedAccounts = useMemo(() => {
    return displayedAccounts.map(acc => ({
      ...acc,
      currencySymbol: currencies[acc.currency]?.symbol || acc.currency,
    }));
  }, [displayedAccounts, currencies]);

  // Memoize transfer confirmation message
  const transferConfirmMessage = useMemo(() => {
    if (!accountToDelete || !transferConfirmDestinationId) return '';
    const sourceAccount = accounts.find(a => a.id === accountToDelete);
    const destAccount = accounts.find(a => a.id === transferConfirmDestinationId);
    if (!sourceAccount || !destAccount) return '';
    return `${t('confirm_delete_and_transfer_message') || `This will permanently delete "${sourceAccount.name}" and irreversibly move ${operationCount} transaction(s) to "${destAccount.name}".\n\nThis action cannot be undone.`}`;
  }, [accountToDelete, transferConfirmDestinationId, accounts, operationCount, t]);

  const renderItem = useCallback(({ item, drag, isActive }) => (
    <AccountRow
      item={item}
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

  const renderItemSeparator = useCallback(() => (
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
  ), [colors.border]);

  // Report internal back capability to an embedding parent (the Settings subpanel)
  // so a swipe / hardware-back pops one level here (currency picker → edit form)
  // before the parent closes the whole panel.
  const internalCanGoBack = currencyPanelVisible || editingId !== null;

  const internalGoBack = useCallback(() => {
    if (currencyPanelVisible) { handleClosePicker(); return; }
    if (editingId !== null) { closeFormPanel(); return; }
  }, [currencyPanelVisible, editingId, handleClosePicker, closeFormPanel]);

  useEffect(() => {
    onBackStateChange?.(internalCanGoBack ? internalGoBack : null);
  }, [internalCanGoBack, internalGoBack, onBackStateChange]);

  useEffect(() => () => onBackStateChange?.(null), [onBackStateChange]);

  if (loading) {
    return <LoadingView message={t('loading_accounts') || 'Loading accounts...'} />;
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text variant="bodyLarge" style={[styles.centeredErrorText, { color: colors.delete }]}>
          {t('error_loading_accounts') || 'Failed to load accounts'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NestableScrollContainer
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.background }}
      >
        {/* Net Worth Summary Card */}
        <NetWorthCard accounts={accounts} operations={operations} colors={colors} t={t} />

        {/* Accounts Grouped Card */}
        <View style={[styles.accountsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {enhancedAccounts.length === 0 ? (
            <EmptyState icon="bank-outline" message={t('no_accounts') || 'No accounts yet.'} />
          ) : (
            <NestableDraggableFlatList
              data={enhancedAccounts}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              onDragEnd={handleDragEnd}
              activationDistance={20}
              ItemSeparatorComponent={renderItemSeparator}
            />
          )}
        </View>

        {/* Show/hide hidden accounts */}
        {hiddenAccounts.length > 0 && (
          <Pressable
            onPress={toggleShowHiddenAccounts}
            android_ripple={{ color: 'rgba(0, 0, 0, .08)', borderless: false }}
            style={[styles.showHiddenButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.showHiddenContent}>
              <Icon
                name={showHiddenAccounts ? 'eye-off' : 'eye'}
                size={20}
                color={colors.selected}
              />
              <Text style={[styles.showHiddenText, { color: colors.text }]}>
                {showHiddenAccounts
                  ? (t('hide_hidden_accounts') || 'Hide hidden accounts')
                  : (t('show_hidden_accounts') || `Show ${hiddenAccounts.length} hidden account${hiddenAccounts.length !== 1 ? 's' : ''}`)}
              </Text>
            </View>
          </Pressable>
        )}
      </NestableScrollContainer>

      <AddFAB
        testID="accounts-add-fab"
        onPress={addAccountHandler}
        accessibilityLabel={t('add_account') || 'Add Account'}
        accessibilityHint={t('add_account_hint') || 'Opens form to create a new account'}
      />

      {/* Inline form panel — slides in from the right */}
      {editingId && (
        <Animated.View
          style={[
            styles.formPanel,
            {
              backgroundColor: colors.background,
              transform: [{ translateX: formPanelTranslateX }],
              opacity: formPanelOpacity,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.formPanelHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleCloseModal} style={styles.formPanelBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.formPanelTitle, { color: colors.text }]}>
              {editingId === 'new' ? (t('add_account') || 'New Account') : (t('edit_account') || 'Edit Account')}
            </Text>
            {editingId !== 'new' ? (
              <TouchableOpacity onPress={handleDeleteEditingAccount} style={styles.formPanelBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="trash-can-outline" size={22} color={colors.delete} />
              </TouchableOpacity>
            ) : (
              <View style={styles.formPanelBack} />
            )}
          </View>

          {/* Form content */}
          <ScrollView style={styles.formPanelScroll} contentContainerStyle={styles.formPanelScrollContent} keyboardShouldPersistTaps="handled">
            {/* Account name */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('account_name') || 'Account name').toUpperCase()}
            </Text>
            <PaperTextInput
              mode="outlined"
              theme={paperInputTheme}
              value={editValues.name}
              onChangeText={handleNameChange}
              error={!!errors.name}
              autoFocus={editingId === 'new'}
              returnKeyType="next"
              onSubmitEditing={() => balanceInputRef.current?.focus()}
              blurOnSubmit={false}
              style={modalSharedStyles.textInput}
            />
            {errors.name && <Text variant="bodySmall" style={styles.error}>{errors.name}</Text>}

            {/* Balance */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('balance') || 'Balance').toUpperCase()}
            </Text>
            <PaperTextInput
              ref={balanceInputRef}
              mode="outlined"
              theme={paperInputTheme}
              value={editValues.balance}
              onChangeText={handleBalanceChange}
              error={!!errors.balance}
              keyboardType="numeric"
              returnKeyType="done"
              placeholder={(() => {
                const dec = currencies[editValues.currency]?.decimal_digits ?? 2;
                return dec === 0 ? '0' : `0.${'0'.repeat(dec)}`;
              })()}
              onSubmitEditing={Keyboard.dismiss}
              style={modalSharedStyles.textInput}
            />
            {errors.balance && <Text variant="bodySmall" style={styles.error}>{errors.balance}</Text>}

            {/* Currency selector */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('currency') || 'Currency').toUpperCase()}
            </Text>
            <TouchableRipple onPress={handleOpenPicker} style={[modalSharedStyles.pickerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: colors.text }]}>
                  {editValues.currency
                    ? `${currencies[editValues.currency]?.name} · ${currencies[editValues.currency]?.symbol}`
                    : (t('select_currency') || 'Select currency')}
                </Text>
                <Icon name="chevron-right" size={22} color={colors.mutedText} />
              </View>
            </TouchableRipple>
            {errors.currency && <Text variant="bodySmall" style={styles.error}>{errors.currency}</Text>}

            {/* Settings group */}
            <View style={[styles.settingsGroup, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {editingId !== 'new' && (
                <View style={[styles.settingItem, styles.settingItemBorder, { borderBottomColor: colors.border }]}>
                  <View style={styles.settingItemText}>
                    <Text style={[styles.settingTitle, { color: colors.text }]}>
                      {t('create_adjustment_operation') || 'Log adjustment'}
                    </Text>
                    <Text style={[styles.settingHint, { color: colors.mutedText }]}>
                      {t('create_adjustment_operation_hint') || 'Record balance change as a transaction'}
                    </Text>
                  </View>
                  <Switch
                    value={createAdjustmentOperation}
                    onValueChange={handleToggleAdjustmentSwitch}
                    color={colors.primary}
                  />
                </View>
              )}
              <View style={styles.settingItem}>
                <View style={styles.settingItemText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    {t('hidden_account') || 'Hidden account'}
                  </Text>
                  <Text style={[styles.settingHint, { color: colors.mutedText }]}>
                    {t('hidden_account_hint') || 'Hide from main list and operations'}
                  </Text>
                </View>
                <Switch
                  value={!!editValues.hidden}
                  onValueChange={handleToggleHiddenSwitch}
                  color={colors.primary}
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer with Save/Cancel buttons */}
          <View style={[styles.formPanelFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + 80 }]}>
            <TouchableRipple onPress={handleCloseModal} style={[styles.formFooterBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text }}>{t('cancel') || 'Cancel'}</Text>
            </TouchableRipple>
            <TouchableRipple onPress={saveEdit} style={[styles.formFooterBtn, styles.formFooterBtnPrimary, { backgroundColor: colors.primary }]}>
              <Text style={styles.formFooterBtnPrimaryText}>{t('save') || 'Save'}</Text>
            </TouchableRipple>
          </View>

          {/* In-panel currency picker — absolute overlay, slides in from the right */}
          {currencyPanelVisible && (
            <Animated.View
              style={[styles.currencyPanel, { backgroundColor: colors.card, transform: [{ translateX: currencySlideAnim }] }]}
            >
              <View style={[styles.currencyPanelHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={handleClosePicker} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.currencyPanelTitle, { color: colors.text }]}>
                  {t('select_currency') || 'Currency'}
                </Text>
              </View>
              <FlatList
                data={Object.entries(currencies)}
                keyExtractor={([code]) => code}
                renderItem={({ item: [code, cur] }) => (
                  <TouchableRipple
                    onPress={() => handleCurrencySelect(code)}
                    style={styles.currencyPanelItem}
                    rippleColor="rgba(0,0,0,0.08)"
                  >
                    <Text style={[styles.currencyPanelItemText, { color: colors.text }]}>
                      {cur.name} ({cur.symbol})
                    </Text>
                  </TouchableRipple>
                )}
                ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              />
            </Animated.View>
          )}
        </Animated.View>
      )}

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
        onClose={handleCloseDeleteConfirm}
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
        onClose={handleCloseTransferConfirm}
        title={t('confirm_delete_and_transfer') || 'Confirm Deletion'}
        message={transferConfirmMessage}
        cancelText={t('cancel') || 'Cancel'}
        confirmText={t('delete') || 'Delete'}
        onConfirm={handleConfirmTransferAndDelete}
        colors={colors}
        confirmColor={colors.delete}
      />

      {/* Error/info dialog */}
      <ConfirmationDialog
        visible={noCurrencyMatchVisible}
        onClose={handleCloseNoCurrencyMatch}
        title={t('cannot_delete_account') || 'Cannot Delete Account'}
        message={noCurrencyMatchMessage}
        cancelText=""
        confirmText={t('ok') || 'OK'}
        onConfirm={handleCloseNoCurrencyMatch}
        colors={colors}
      />
    </View>
  );
}

AccountsScreen.propTypes = {
  onBackStateChange: PropTypes.func,
};

AccountsScreen.defaultProps = {};

const styles = StyleSheet.create({
  accountBalance: {
    flexShrink: 1,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: -0.2,
    marginLeft: SPACING.sm,
    textAlign: 'right',
  },
  accountCurrencyLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  accountInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
  },
  accountRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  accountTouchableArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  accountsCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  centeredBodyMedium: {
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  centeredBodySmall: {
    fontWeight: '600',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  centeredErrorText: {
    textAlign: 'center',
  },
  centeredTitleLarge: {
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  confirmationButton: {
    minWidth: 100,
  },
  confirmationButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
  },
  confirmationMessage: {
    lineHeight: 22,
    marginBottom: SPACING.xxl,
    textAlign: 'center',
  },
  confirmationModalContent: {
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.xl,
    maxWidth: 500,
    padding: SPACING.xxl,
    width: '90%',
  },
  confirmationTitle: {
    fontWeight: '600',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    paddingTop: TOP_CONTENT_SPACING,
  },
  currencyPanel: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  currencyPanelHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  currencyPanelItem: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  currencyPanelItemText: {
    fontSize: 16,
  },
  currencyPanelTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: SPACING.lg,
  },
  dragHandle: {
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  error: {
    color: 'red',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.md,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  formFooterBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  formFooterBtnPrimary: {
    borderWidth: 0,
  },
  formFooterBtnPrimaryText: {
    color: '#fff',
  },
  formPanel: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  formPanelBack: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  formPanelFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  formPanelHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 8,
  },
  formPanelScroll: {
    flex: 1,
  },
  formPanelScrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  formPanelTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  hiddenBalance: {
    backgroundColor: 'rgba(120, 120, 120, 0.25)',
    borderRadius: 6,
    height: 16,
    width: 80,
  },
  hiddenBalanceLarge: {
    height: 36,
    marginTop: SPACING.xs,
    width: 160,
  },
  hiddenBalancePicker: {
    marginTop: 4,
    width: 70,
  },
  monthlyChangeRow: {
    marginTop: SPACING.sm,
  },
  monthlyChangeText: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  netWorthAmount: {
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: SPACING.xs,
  },
  netWorthCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    padding: SPACING.xl,
  },
  netWorthLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  pickerAccountBalance: {
    fontSize: 14,
    marginTop: SPACING.xs,
  },
  pickerAccountName: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerCloseButton: {
    marginTop: SPACING.sm,
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.xl,
    padding: HORIZONTAL_PADDING,
  },
  pickerOption: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  scrollContent: {
    paddingBottom: 180,
  },
  settingHint: {
    fontSize: 12,
    marginTop: 2,
  },
  settingItem: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
  },
  settingItemText: {
    flex: 1,
    marginRight: SPACING.lg,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingsGroup: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  showHiddenButton: {
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  showHiddenContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  showHiddenText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
