import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity } from 'react-native';
import { Portal, Modal, Text, Button, Divider, Menu } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useAccounts } from './AccountsContext';
import { exportBackup, importBackup } from './services/BackupRestore';


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme, colors } = useTheme();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { resetDatabase } = useAccounts();
  const [localSelection, setLocalSelection] = useState(theme === 'system' ? 'light' : theme);
  const [localLang, setLocalLang] = useState(language);
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);

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

  const handleExportBackup = async () => {
    try {
      await exportBackup();
      Alert.alert(
        t('backup_database') || 'Backup Database',
        t('backup_success') || 'Backup exported successfully'
      );
    } catch (error) {
      console.error('Export backup error:', error);
      Alert.alert(
        t('error') || 'Error',
        error.message === 'Import cancelled'
          ? t('cancel') || 'Cancelled'
          : t('backup_error') || 'Failed to create backup'
      );
    }
  };

  const reloadApp = async () => {
    // Close modal first
    onClose();

    // Platform-specific reload
    if (Platform.OS === 'web') {
      // Web: reload the page
      window.location?.reload?.();
    } else {
      // Native (iOS/Android): use expo-updates to reload
      try {
        await Updates.reloadAsync();
      } catch (error) {
        console.error('Failed to reload app:', error);
        // Fallback: just close the modal and let the app refresh naturally
      }
    }
  };

  const handleImportBackup = () => {
    Alert.alert(
      t('restore_database') || 'Restore Database',
      t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('restore_database') || 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              await importBackup();
              Alert.alert(
                t('restore_database') || 'Restore Database',
                t('restore_success') || 'Database restored successfully',
                [
                  {
                    text: t('close') || 'Close',
                    onPress: reloadApp,
                  },
                ]
              );
            } catch (error) {
              console.error('Import backup error:', error);
              Alert.alert(
                t('error') || 'Error',
                error.message === 'Import cancelled'
                  ? t('cancel') || 'Cancelled'
                  : error.message || t('restore_error') || 'Failed to restore backup'
              );
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (visible) {
      setLocalSelection(theme === 'system' ? 'light' : theme);
      setLocalLang(language);
      setLanguageMenuVisible(false);
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
        <View style={styles.themeSwitch}>
          <TouchableOpacity
            style={[
              styles.themeOption,
              localSelection === 'light' && styles.themeOptionActive,
              { borderColor: colors.border }
            ]}
            onPress={() => setLocalSelection('light')}
            accessibilityRole="button"
            accessibilityLabel="Light theme"
          >
            <Ionicons
              name="sunny"
              size={24}
              color={localSelection === 'light' ? colors.primary : colors.mutedText}
            />
            <Text style={[
              styles.themeLabel,
              { color: localSelection === 'light' ? colors.text : colors.mutedText }
            ]}>
              Light
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.themeOption,
              localSelection === 'dark' && styles.themeOptionActive,
              { borderColor: colors.border }
            ]}
            onPress={() => setLocalSelection('dark')}
            accessibilityRole="button"
            accessibilityLabel="Dark theme"
          >
            <Ionicons
              name="moon"
              size={24}
              color={localSelection === 'dark' ? colors.primary : colors.mutedText}
            />
            <Text style={[
              styles.themeLabel,
              { color: localSelection === 'dark' ? colors.text : colors.mutedText }
            ]}>
              Dark
            </Text>
          </TouchableOpacity>
        </View>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.subtitle}>{t('language')}</Text>
        <View>
          <Menu
            visible={languageMenuVisible}
            onDismiss={() => setLanguageMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setLanguageMenuVisible(true)}
                style={styles.dropdown}
                contentStyle={styles.dropdownContent}
                icon={() => <Ionicons name="chevron-down" size={20} color={colors.text} />}
                labelStyle={{ color: colors.text }}
              >
                {t(localLang === 'en' ? 'english' : 'russian')}
              </Button>
            }
          >
            {availableLanguages.map(lng => (
              <Menu.Item
                key={lng}
                onPress={() => {
                  setLocalLang(lng);
                  setLanguageMenuVisible(false);
                }}
                title={t(lng === 'en' ? 'english' : 'russian')}
              />
            ))}
          </Menu>
        </View>

        <Divider style={styles.divider} />

        <Text variant="titleMedium" style={styles.subtitle}>{t('database') || 'Database'}</Text>

        <View style={styles.buttonRow}>
          <Button
            mode="contained"
            onPress={handleExportBackup}
            style={styles.actionButton}
            icon="export"
          >
            {t('export_backup') || 'Export Backup'}
          </Button>
          <Button
            mode="contained"
            onPress={handleImportBackup}
            style={styles.actionButton}
            icon="import"
          >
            {t('import_backup') || 'Import Backup'}
          </Button>
        </View>

        <View style={styles.resetButtonContainer}>
          <Button
            mode="outlined"
            textColor="#b33"
            onPress={handleResetDatabase}
            style={styles.resetButton}
            icon="delete-forever"
          >
            {t('reset_database') || 'Reset Database'}
          </Button>
        </View>

        <View style={styles.modalButtonRow}>
          <Button
            mode="outlined"
            onPress={onClose}
            style={[styles.modalButton, { borderColor: '#999' }]}
            textColor="#888"
          >
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
    marginBottom: 8,
  },
  themeSwitch: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  themeOptionActive: {
    borderWidth: 2,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  dropdown: {
    marginTop: 8,
    marginBottom: 8,
  },
  dropdownContent: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  divider: {
    marginVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
  },
  resetButtonContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  resetButton: {
    maxWidth: 300,
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
