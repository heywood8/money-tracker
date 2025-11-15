import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';

const options = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme, colors } = useTheme();
  const [localSelection, setLocalSelection] = useState(theme);

  useEffect(() => {
    if (visible) setLocalSelection(theme);
  }, [visible, theme]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.card }]}> 
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>Theme</Text>
          {options.map(opt => (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: colors.secondary },
                localSelection === opt.value && { backgroundColor: colors.primary },
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => setLocalSelection(opt.value)}
            >
              <Text style={[styles.optionText, { color: localSelection === opt.value ? colors.card : colors.text }]}>{opt.label}</Text>
              {localSelection === opt.value && <Text style={{ color: colors.card, fontSize: 18 }}>✓</Text>}
            </Pressable>
          ))}
          <View style={styles.modalButtonRow}>
            <Pressable style={[styles.modalButton, { backgroundColor: colors.secondary }]} onPress={onClose}>
              <Text style={[styles.closeText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={() => { setTheme(localSelection); onClose(); }}>
              <Text style={[styles.closeText, { color: colors.card }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '85%',
    borderRadius: 12,
    padding: 24,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selected: {
    backgroundColor: '#c0e0ff',
  },
  selectedDark: {
    backgroundColor: '#005fa3',
  },
  optionText: {
    fontSize: 18,
  },
  closeButton: {
    marginTop: 16,
    alignSelf: 'center',
    padding: 10,
  },
  closeText: {
    color: '#007AFF',
    fontSize: 16,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
});
