import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import SettingsModal from './SettingsModal';

import { useTheme } from './ThemeContext';
import { useAccounts } from './AccountsContext';
import { useLocalization } from './LocalizationContext';

export default function AccountsScreen() {

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [errors, setErrors] = useState({});
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const { colorScheme, colors } = useTheme();
  const { accounts, addAccount, updateAccount, deleteAccount, validateAccount, currencies } = useAccounts();
  const { t } = useLocalization();

  const startEdit = (id) => {
    setEditingId(id);
    const acc = accounts.find(a => a.id === id);
    setEditValues({ ...acc });
    setErrors({});
  };

  const saveEdit = () => {
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
  };

  const addAccountHandler = () => {
    setEditingId('new');
    setEditValues({ name: '', balance: '', currency: Object.keys(currencies)[0] });
    setErrors({});
  };

  const deleteAccountHandler = (id) => {
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
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.accountRow, { borderColor: colors.border }]}
      onPress={() => startEdit(item.id)}
      accessibilityLabel={t('edit_account') || 'Edit Account'}
    >
      <View style={styles.accountInfo}>
        <Text style={[styles.accountText, { color: colors.text }]}> 
          {item.name} {item.balance} {currencies[item.currency]?.symbol || item.currency}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>  
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>{t('accounts')}</Text>
        <TouchableOpacity
          style={[styles.hamburgerButton, { backgroundColor: colors.secondary }]}
          onPress={() => setSettingsVisible(true)}
          accessibilityLabel={t('settings')}
        >
          <View style={[styles.hamburgerLine, { backgroundColor: colors.text }]} />
          <View style={[styles.hamburgerLine, { backgroundColor: colors.text }]} />
          <View style={[styles.hamburgerLine, { backgroundColor: colors.text }]} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={accounts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ color: colors.mutedText }}>{t('no_accounts') || 'No accounts yet.'}</Text>}
      />
      <View style={styles.addButtonWrapper}>
        <Button title={t('add_account') || 'Add Account'} onPress={addAccountHandler} color={colors.primary} />
      </View>
      <Modal
        visible={!!editingId}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingId(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setEditingId(null); setErrors({}); }}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_account') || 'Edit Account'}</Text>
              <TextInput
                style={[
                  styles.input,
                  errors.name && styles.inputError,
                    { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }
                ]}
                value={editValues.name}
                onChangeText={text => setEditValues(v => ({ ...v, name: text }))}
                placeholder={t('account_name') || 'Account Name'}
                  placeholderTextColor={colors.mutedText}
                autoFocus
              />
              {errors.name && <Text style={styles.error}>{errors.name}</Text>}
              <TextInput
                style={[
                  styles.input,
                  errors.balance && styles.inputError,
                    { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }
                ]}
                value={editValues.balance}
                onChangeText={text => setEditValues(v => ({ ...v, balance: text }))}
                placeholder={t('balance') || 'Balance'}
                  placeholderTextColor={colors.mutedText}
                keyboardType="numeric"
              />
              {errors.balance && <Text style={styles.error}>{errors.balance}</Text>}
                <View style={[styles.pickerWrapper, { backgroundColor: colors.inputBackground }]}> 
                  <Pressable onPress={() => setPickerVisible(true)} style={styles.pickerDisplay}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '500' }}>
                      {editValues.currency ? `${currencies[editValues.currency]?.name} (${currencies[editValues.currency]?.symbol})` : t('select_currency') || 'Select currency'}
                    </Text>
                  </Pressable>
                  <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
                    <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
                      <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
                        <FlatList
                          data={Object.entries(currencies)}
                          keyExtractor={([code]) => code}
                          renderItem={({ item }) => {
                            const [code, cur] = item;
                            return (
                              <Pressable
                                onPress={() => { setEditValues(v => ({ ...v, currency: code })); setPickerVisible(false); }}
                                style={({ pressed }) => [styles.pickerOption, { borderColor: colors.border }, pressed && { backgroundColor: colors.selected }]}
                              >
                                <Text style={{ color: colors.text, fontSize: 18 }}>{cur.name} ({cur.symbol})</Text>
                              </Pressable>
                            );
                          }}
                        />
                        <Pressable style={styles.closeButton} onPress={() => setPickerVisible(false)}>
                          <Text style={{ color: colors.primary }}>{t('close') || 'Close'}</Text>
                        </Pressable>
                      </Pressable>
                    </Pressable>
                  </Modal>
                </View>
              {errors.currency && <Text style={styles.error}>{errors.currency}</Text>}
            </View>
              <View style={[styles.modalButtonRowSticky, { backgroundColor: colors.card }]}> 
                <Pressable style={[styles.actionButton, styles.modalButton, { backgroundColor: colors.secondary }]} onPress={() => { setEditingId(null); setErrors({}); }}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>{t('cancel') || 'Cancel'}</Text>
                </Pressable>
                {editingId !== 'new' && (
                  <Pressable
                    style={[styles.actionButton, styles.modalButton, { backgroundColor: colors.delete || '#d9534f' }]}
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
      </Modal>
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
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
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
    paddingBottom: 8,
  },
  accountInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    marginBottom: 24,
  },
});

// Refactored for consistent and performant styles using StyleSheet.create
// Consider using styled-components or tailwind-rn for dynamic styling if needed
// Responsive design can be further improved with Dimensions, PixelRatio, or react-native-size-matters
