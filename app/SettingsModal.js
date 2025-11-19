import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useAccounts } from './AccountsContext';

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme, colors } = useTheme();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { resetDatabase } = useAccounts();
  const [localSelection, setLocalSelection] = useState(theme);
  const [localLang, setLocalLang] = useState(language);

  const handleResetDatabase = () => {
    Alert.alert(
      t('reset_database') || 'Reset Database',
      t('reset_database_confirm') || 'Are you sure you want to reset the database? This will delete all data and create default accounts.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('reset') || 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDatabase();
              onClose();
            } catch (error) {
              // Error already handled in resetDatabase
            }
          },
        },
      ]
    );
  };

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
        <Pressable
          style={[styles.content, {
            backgroundColor: colors.card,
            borderColor: colors.glassBorder,
          }]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text }]}>{t('settings')}</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>{t('theme') || 'Theme'}</Text>
          {themeOptions.map(opt => (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: localSelection === opt.value ? colors.primary : colors.glassBackground,
                  borderColor: localSelection === opt.value ? colors.primary : colors.glassBorder,
                },
                pressed && { opacity: 0.8 },
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
                {
                  backgroundColor: localLang === lng ? colors.primary : colors.glassBackground,
                  borderColor: localLang === lng ? colors.primary : colors.glassBorder,
                },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setLocalLang(lng)}
            >
              <Text style={[styles.optionText, { color: localLang === lng ? colors.card : colors.text }]}>{t(lng === 'en' ? 'english' : 'russian')}</Text>
              {localLang === lng && <Text style={{ color: colors.card, fontSize: 18 }}>✓</Text>}
            </Pressable>
          ))}

          <Text style={[styles.subtitle, { color: colors.text, marginTop: 16 }]}>{t('database') || 'Database'}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.resetButton,
              { backgroundColor: '#dc3545' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleResetDatabase}
          >
            <Text style={[styles.resetButtonText, { color: '#ffffff' }]}>{t('reset_database') || 'Reset Database'}</Text>
          </Pressable>

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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '85%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
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
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
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
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
