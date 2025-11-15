import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';

const options = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme } = useTheme();

  const isDark = colorScheme === 'dark';
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, isDark && { backgroundColor: '#222' }]}> 
          <Text style={[styles.title, isDark && { color: '#fff' }]}>Settings</Text>
          <Text style={[styles.subtitle, isDark && { color: '#fff' }]}>Theme</Text>
          {options.map(opt => (
            <Pressable
              key={opt.value}
              style={[
                styles.option,
                theme === opt.value && (isDark ? styles.selectedDark : styles.selected),
                isDark && { backgroundColor: '#333' },
              ]}
              onPress={() => setTheme(opt.value)}
            >
              <Text style={[styles.optionText, isDark && { color: '#fff' }]}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={[styles.closeText, isDark && { color: '#4da3ff' }]}>Close</Text>
          </Pressable>
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
    backgroundColor: '#fff',
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
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
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
});
