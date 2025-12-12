import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { Portal, Modal, Text, Button, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, importBackup } from '../services/BackupRestore';


export default function SettingsModal({ visible, onClose }) {
  const { colors, theme } = useTheme();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { showDialog } = useDialog();
  const { resetDatabase } = useAccounts();
  const { startImport, cancelImport } = useImportProgress();
  const [localSelection, setLocalSelection] = useState(theme === 'system' ? 'light' : theme);
  const [localLang, setLocalLang] = useState(language);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [exportFormatModalVisible, setExportFormatModalVisible] = useState(false);

  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const exportFormatSlideAnim = useRef(new Animated.Value(0)).current;

  const openLanguageModal = useCallback(() => {
    setLanguageModalVisible(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const closeLanguageModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setLanguageModalVisible(false);
    });
  }, [slideAnim]);

  const handleLanguageSelect = useCallback((lng) => {
    setLocalLang(lng);
    closeLanguageModal();
  }, [closeLanguageModal]);

  const openExportFormatModal = useCallback(() => {
    console.log('openExportFormatModal called - showing modal');
    setExportFormatModalVisible(true);
    Animated.timing(exportFormatSlideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [exportFormatSlideAnim]);

  const closeExportFormatModal = useCallback(() => {
    Animated.timing(exportFormatSlideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setExportFormatModalVisible(false);
    });
  }, [exportFormatSlideAnim]);

  const handleExportFormatSelect = useCallback(async (format) => {
    closeExportFormatModal();
    try {
      await exportBackup(format);
      showDialog(
        t('backup_database') || 'Backup Database',
        t('backup_success') || 'Backup exported successfully',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Export backup error:', error);
      showDialog(
        t('error') || 'Error',
        error.message === 'Import cancelled'
          ? t('cancel') || 'Cancelled'
          : t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }]
      );
    }
  }, [closeExportFormatModal, t, showDialog]);

  const handleResetDatabase = () => {
    showDialog(
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

  const handleExportBackup = () => {
    console.log('handleExportBackup called - opening export format modal');
    openExportFormatModal();
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
    showDialog(
      t('restore_database') || 'Restore Database',
      t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('restore_database') || 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              // Close settings modal first
              onClose();

              // Start import progress tracking
              startImport();

              // Perform the import
              await importBackup();

              // Show success dialog
              showDialog(
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
              // Cancel import progress on error
              cancelImport();
              showDialog(
                t('error') || 'Error',
                error.message === 'Import cancelled'
                  ? t('cancel') || 'Cancelled'
                  : error.message || t('restore_error') || 'Failed to restore backup',
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (visible) {
      setLocalLang(language);
      setLanguageModalVisible(false);
      setExportFormatModalVisible(false);
      slideAnim.setValue(0);
      exportFormatSlideAnim.setValue(0);
    }
  }, [visible, language, slideAnim, exportFormatSlideAnim]);

  // Interpolate animation values for language modal
  const settingsTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
  });

  const settingsOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const languageTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  const languageOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Interpolate animation values for export format modal
  const exportFormatTranslateX = exportFormatSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  const exportFormatOpacity = exportFormatSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={exportFormatModalVisible ? closeExportFormatModal : (languageModalVisible ? closeLanguageModal : onClose)}
        contentContainerStyle={[styles.modalWrapper, { backgroundColor: 'transparent' }]}
      >
        <Animated.View style={[
          styles.content,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: settingsTranslateX }],
            opacity: settingsOpacity,
          },
          (languageModalVisible || exportFormatModalVisible) && styles.hidden
        ]}>
          <Text variant="headlineSmall" style={styles.title}>{t('settings')}</Text>

          <Text variant="titleMedium" style={styles.subtitle}>{t('language')}</Text>
        <TouchableRipple
          onPress={openLanguageModal}
          style={[styles.languageSelector, { borderColor: colors.border, backgroundColor: colors.surface }]}
          borderless={false}
        >
          <View style={styles.languageSelectorContent}>
            <Text style={[styles.languageText, { color: colors.text }]}>
              {t(localLang === 'en' ? 'english' : localLang === 'ru' ? 'russian' : localLang === 'es' ? 'spanish' : localLang === 'fr' ? 'french' : localLang === 'zh' ? 'chinese' : localLang === 'de' ? 'german' : localLang)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>

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
              setLanguage(localLang);
              onClose();
            }}
            style={styles.modalButton}
          >
            {t('save') || 'Save'}
          </Button>
        </View>
        </Animated.View>

        <Animated.View style={[
          styles.languageModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: languageTranslateX }],
            opacity: languageOpacity,
          },
          !languageModalVisible && styles.hidden
        ]}>
          <View style={styles.languageModalHeader}>
            <TouchableOpacity onPress={closeLanguageModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
              {t('language')}
            </Text>
            <View style={styles.backButton} />
          </View>

          <Divider />

          <View style={styles.languageList}>
            {availableLanguages.map(lng => {
              const languageNameKey = lng === 'en' ? 'english' : lng === 'ru' ? 'russian' : lng === 'es' ? 'spanish' : lng === 'fr' ? 'french' : lng === 'zh' ? 'chinese' : lng === 'de' ? 'german' : lng;
              return (
                <TouchableRipple
                  key={lng}
                  onPress={() => handleLanguageSelect(lng)}
                  style={styles.languageItem}
                >
                  <View style={styles.languageItemContent}>
                    <Text style={[styles.languageItemText, { color: colors.text }]}>
                      {t(languageNameKey)}
                    </Text>
                    {localLang === lng && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </View>
                </TouchableRipple>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View style={[
          styles.languageModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: exportFormatTranslateX }],
            opacity: exportFormatOpacity,
          },
          !exportFormatModalVisible && styles.hidden
        ]}>
          <View style={styles.languageModalHeader}>
            <TouchableOpacity onPress={closeExportFormatModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
              {t('export_format') || 'Export Format'}
            </Text>
            <View style={styles.backButton} />
          </View>

          <Divider />

          <View style={styles.languageList}>
            <TouchableRipple
              onPress={() => handleExportFormatSelect('json')}
              style={styles.languageItem}
            >
              <View style={styles.languageItemContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="code-outline" size={24} color={colors.text} />
                  <View>
                    <Text style={[styles.languageItemText, { color: colors.text }]}>
                      JSON
                    </Text>
                    <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                      {t('json_description') || 'Standard format, compatible with all versions'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            <TouchableRipple
              onPress={() => handleExportFormatSelect('csv')}
              style={styles.languageItem}
            >
              <View style={styles.languageItemContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="document-text-outline" size={24} color={colors.text} />
                  <View>
                    <Text style={[styles.languageItemText, { color: colors.text }]}>
                      CSV
                    </Text>
                    <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                      {t('csv_description') || 'Plain text format, easy to edit'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            <TouchableRipple
              onPress={() => handleExportFormatSelect('sqlite')}
              style={styles.languageItem}
            >
              <View style={styles.languageItemContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="server-outline" size={24} color={colors.text} />
                  <View>
                    <Text style={[styles.languageItemText, { color: colors.text }]}>
                      SQLite Database
                    </Text>
                    <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                      {t('sqlite_description') || 'Raw database file, complete backup'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>
          </View>
        </Animated.View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    margin: 20,
    borderRadius: 12,
    padding: 24,
    maxHeight: '90%',
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 8,
  },
  languageSelector: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  languageSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  languageText: {
    fontSize: 16,
  },
  languageModalContent: {
    margin: 20,
    borderRadius: 12,
    padding: 0,
    maxHeight: '80%',
  },
  languageModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageModalTitle: {
    fontWeight: '600',
  },
  languageList: {
    paddingVertical: 8,
  },
  languageItem: {
    paddingHorizontal: 16,
  },
  languageItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  languageItemText: {
    fontSize: 16,
  },
  formatDescription: {
    fontSize: 12,
    marginTop: 4,
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
