import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme, colors } = useTheme();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const [localSelection, setLocalSelection] = useState(theme);
  const [localLang, setLocalLang] = useState(language);

  useEffect(() => {
    if (visible) {
      setLocalSelection(theme);
      setLocalLang(language);
    }
  }, [visible, theme, language]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.content, { backgroundColor: colors.card }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.text }]}>{t('settings')}</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>{t('theme') || 'Theme'}</Text>
          {themeOptions.map(opt => (
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
          <Text style={[styles.subtitle, { color: colors.text, marginTop: 16 }]}>{t('language')}</Text>
          {availableLanguages.map(lng => (
            <Pressable
              key={lng}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: colors.secondary },
                localLang === lng && { backgroundColor: colors.primary },
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => setLocalLang(lng)}
            >
              <Text style={[styles.optionText, { color: localLang === lng ? colors.card : colors.text }]}>{t(lng === 'en' ? 'english' : 'russian')}</Text>
              {localLang === lng && <Text style={{ color: colors.card, fontSize: 18 }}>✓</Text>}
            </Pressable>
          ))}
          <View style={styles.modalButtonRow}>
            <Pressable style={[styles.modalButton, { backgroundColor: colors.secondary }]} onPress={onClose}>
              <Text style={[styles.closeText, { color: colors.text }]}>{t('cancel') || 'Cancel'}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setTheme(localSelection);
                setLanguage(localLang);
                onClose();
              }}
            >
              <Text style={[styles.closeText, { color: colors.card }]}>{t('save') || 'Save'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles are defined using StyleSheet.create for performance and consistency.
// For dynamic styling, consider using styled-components or tailwind-rn.
// For responsive design, consider Dimensions, PixelRatio, or react-native-size-matters.

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
