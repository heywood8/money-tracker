import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import SettingsModal from './SettingsModal';
import { useTheme } from './ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import uuid from 'react-native-uuid';
import currencies from './assets/currencies.json';

const ACCOUNT_STORAGE_KEY = 'accounts';

function validateAccount(account) {
  const errors = {};
  if (!account.name.trim()) errors.name = 'Name required';
  if (isNaN(Number(account.balance)) || account.balance === '') errors.balance = 'Balance must be a number';
  if (!account.currency) errors.currency = 'Currency required';
  return errors;
}


export default function AccountsScreen() {
  const [accounts, setAccounts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [errors, setErrors] = useState({});
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { colorScheme } = useTheme();

  useEffect(() => {
    AsyncStorage.getItem(ACCOUNT_STORAGE_KEY).then(data => {
      if (data) setAccounts(JSON.parse(data));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

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
      setAccounts(accs => [...accs, { ...editValues, balance: String(editValues.balance) }]);
    } else {
      setAccounts(accs => accs.map(a => a.id === editingId ? { ...editValues, balance: String(editValues.balance) } : a));
    }
    setEditingId(null);
    setEditValues({});
    setErrors({});
  };

  const addAccount = () => {
    setEditingId('new');
    setEditValues({ id: uuid.v4(), name: '', balance: '', currency: Object.keys(currencies)[0] });
    setErrors({});
  };

  const deleteAccount = (id) => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete this account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAccounts(accs => accs.filter(a => a.id !== id));
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
    <View style={styles.accountRow}>
      <View style={styles.accountInfo}>
        <Text style={[styles.accountText, colorScheme === 'dark' && { color: '#fff' }]}> 
          {item.name} {item.balance} {currencies[item.currency]?.symbol || item.currency}
        </Text>
      </View>
      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.actionButton} onPress={() => startEdit(item.id)}>
          <Text style={[styles.buttonText, colorScheme === 'dark' && { color: '#111' }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => deleteAccount(item.id)}>
          <Text style={[styles.buttonText, colorScheme === 'dark' && { color: '#111' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, colorScheme === 'dark' ? { backgroundColor: '#111' } : { backgroundColor: '#fff' }]}>  
      <View style={styles.headerRow}>
        <Text style={[styles.title, colorScheme === 'dark' && { color: '#fff' }]}>Accounts</Text>
        <TouchableOpacity
          style={styles.hamburgerButton}
          onPress={() => setSettingsVisible(true)}
          accessibilityLabel="Settings"
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={accounts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={colorScheme === 'dark' ? { color: '#fff' } : {}}>No accounts yet.</Text>}
      />
      <View style={styles.addButtonWrapper}>
        <Button title="Add Account" onPress={addAccount} />
      </View>
      <Modal
        visible={!!editingId}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, colorScheme === 'dark' && { backgroundColor: '#222' }]}> 
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, colorScheme === 'dark' && { color: '#fff' }]}>Edit Account</Text>
              <TextInput
                style={[
                  styles.input,
                  errors.name && styles.inputError,
                  colorScheme === 'dark' && { color: '#fff', backgroundColor: '#333', borderColor: '#555' }
                ]}
                value={editValues.name}
                onChangeText={text => setEditValues(v => ({ ...v, name: text }))}
                placeholder="Account Name"
                placeholderTextColor={colorScheme === 'dark' ? '#aaa' : undefined}
                autoFocus
              />
              {errors.name && <Text style={styles.error}>{errors.name}</Text>}
              <TextInput
                style={[
                  styles.input,
                  errors.balance && styles.inputError,
                  colorScheme === 'dark' && { color: '#fff', backgroundColor: '#333', borderColor: '#555' }
                ]}
                value={editValues.balance}
                onChangeText={text => setEditValues(v => ({ ...v, balance: text }))}
                placeholder="Balance"
                placeholderTextColor={colorScheme === 'dark' ? '#aaa' : undefined}
                keyboardType="numeric"
              />
              {errors.balance && <Text style={styles.error}>{errors.balance}</Text>}
              <View style={[styles.pickerWrapper, colorScheme === 'dark' && { backgroundColor: '#333' }]}> 
                <Picker
                  selectedValue={editValues.currency}
                  style={[styles.picker, colorScheme === 'dark' && { color: '#fff', backgroundColor: '#333' }]}
                  onValueChange={val => setEditValues(v => ({ ...v, currency: val }))}
                  dropdownIconColor={colorScheme === 'dark' ? '#fff' : undefined}
                >
                  {Object.entries(currencies).map(([code, cur]) => (
                    <Picker.Item key={code} label={`${cur.name} (${cur.symbol})`} value={code} color={colorScheme === 'dark' ? '#fff' : '#000'} />
                  ))}
                </Picker>
              </View>
              {errors.currency && <Text style={styles.error}>{errors.currency}</Text>}
            </View>
            <View style={[styles.modalButtonRowSticky, colorScheme === 'dark' && { backgroundColor: '#222' }]}> 
              <Pressable style={[styles.actionButton, styles.modalButton]} onPress={() => { setEditingId(null); setErrors({}); }}>
                <Text style={[styles.buttonText, colorScheme === 'dark' && { color: '#111' }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.modalButton]} onPress={saveEdit}>
                <Text style={[styles.buttonText, colorScheme === 'dark' && { color: '#111' }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
    backgroundColor: '#e0e0e0',
  },
  hamburgerLine: {
    width: 20,
    height: 3,
    backgroundColor: '#333',
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
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 4 },
  inputError: { borderColor: 'red' },
  error: { color: 'red', fontSize: 12, marginBottom: 4 },
  text: { fontSize: 16 },
  accountText: { fontSize: 22, fontWeight: '500', marginBottom: 4 },
  link: { color: 'blue', marginLeft: 8 },
  picker: { height: 80, width: '100%' },
  pickerWrapper: { marginBottom: 4, marginTop: 4, backgroundColor: '#fff', borderRadius: 4, overflow: 'hidden' },
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
