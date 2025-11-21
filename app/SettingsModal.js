import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Portal, Modal, Text, Button, RadioButton, Divider } from 'react-native-paper';
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.content, { backgroundColor: colors.card }]}
      >
        <Text variant="headlineSmall" style={styles.title}>{t('settings')}</Text>

        <Text variant="titleMedium" style={styles.subtitle}>{t('theme') || 'Theme'}</Text>
        <RadioButton.Group onValueChange={setLocalSelection} value={localSelection}>
          {themeOptions.map(opt => (
            <RadioButton.Item
              key={opt.value}
              label={opt.label}
              value={opt.value}
              style={styles.radioItem}
            />
          ))}
        </RadioButton.Group>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.subtitle}>{t('language')}</Text>
        <RadioButton.Group onValueChange={setLocalLang} value={localLang}>
          {availableLanguages.map(lng => (
            <RadioButton.Item
              key={lng}
              label={t(lng === 'en' ? 'english' : 'russian')}
              value={lng}
              style={styles.radioItem}
            />
          ))}
        </RadioButton.Group>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.subtitle}>{t('database') || 'Database'}</Text>
        <Button
          mode="contained"
          buttonColor="#dc3545"
          onPress={handleResetDatabase}
          style={styles.resetButton}
        >
          {t('reset_database') || 'Reset Database'}
        </Button>

        <View style={styles.modalButtonRow}>
          <Button mode="outlined" onPress={onClose} style={styles.modalButton}>
            {t('cancel') || 'Cancel'}
          </Button>
          <Button
            mode="contained"
            onPress={() => {
              setTheme(localSelection);
              setLanguage(localLang);
              onClose();
            }}
            style={styles.modalButton}
          >
            {t('save') || 'Save'}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: {
    margin: 20,
    borderRadius: 12,
    padding: 24,
    maxHeight: '90%',
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 4,
  },
  radioItem: {
    paddingVertical: 4,
  },
  divider: {
    marginVertical: 12,
  },
  resetButton: {
    marginTop: 8,
    marginBottom: 8,
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
});
