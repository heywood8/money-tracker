import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Alert, Platform, TouchableOpacity, Animated, Switch } from 'react-native';
import { Portal, Modal, Text, Button, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useAccounts } from './AccountsContext';
import { useGooglePay } from './GooglePayContext';
import { exportBackup, importBackup } from './services/BackupRestore';


export default function SettingsModal({ visible, onClose }) {
  const { theme, setTheme, colorScheme, colors } = useTheme();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { resetDatabase } = useAccounts();
  const googlePay = useGooglePay();
  const [localSelection, setLocalSelection] = useState(theme === 'system' ? 'light' : theme);
  const [localLang, setLocalLang] = useState(language);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;

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
      setLanguageModalVisible(false);
      slideAnim.setValue(0);
    }
  }, [visible, theme, language, slideAnim]);

  // Interpolate animation values
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

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={languageModalVisible ? closeLanguageModal : onClose}
        contentContainerStyle={[styles.modalWrapper, { backgroundColor: 'transparent' }]}
      >
        <Animated.View style={[
          styles.content,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: settingsTranslateX }],
            opacity: settingsOpacity,
          },
          languageModalVisible && styles.hidden
        ]}>
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
        <TouchableRipple
          onPress={openLanguageModal}
          style={[styles.languageSelector, { borderColor: colors.border, backgroundColor: colors.surface }]}
          borderless={false}
        >
          <View style={styles.languageSelectorContent}>
            <Text style={[styles.languageText, { color: colors.text }]}>
              {t(localLang === 'en' ? 'english' : 'russian')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>

        <Divider style={styles.divider} />

        {/* Google Pay Integration (Android only) */}
        {googlePay?.isAvailable && (
          <>
            <Text variant="titleMedium" style={styles.subtitle}>{t('google_pay_integration')}</Text>

            {/* Notification Access */}
            {!googlePay.hasNotificationAccess ? (
              <View style={[styles.notificationAccessBanner, { backgroundColor: colors.warning || '#fff3cd', borderColor: colors.border }]}>
                <Ionicons name="information-circle" size={20} color="#856404" />
                <Text style={[styles.notificationAccessText, { color: '#856404', flex: 1, marginLeft: 8 }]}>
                  {t('notification_access_required')}
                </Text>
              </View>
            ) : (
              <View style={[styles.notificationAccessBanner, { backgroundColor: colors.success || '#d4edda', borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={20} color="#155724" />
                <Text style={[styles.notificationAccessText, { color: '#155724', flex: 1, marginLeft: 8 }]}>
                  {t('notification_access_granted')}
                </Text>
              </View>
            )}

            {!googlePay.hasNotificationAccess && (
              <Button
                mode="contained"
                onPress={googlePay.requestNotificationAccess}
                style={styles.notificationButton}
                icon="bell"
              >
                {t('grant_notification_access')}
              </Button>
            )}

            {/* Enable/Disable Toggle */}
            <View style={[styles.settingRow, { borderColor: colors.border }]}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('enable_google_pay')}</Text>
              <Switch
                value={googlePay.settings?.enabled || false}
                onValueChange={(value) => googlePay.updateSettings({ enabled: value })}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
                disabled={!googlePay.hasNotificationAccess}
              />
            </View>

            {/* Auto-create transactions */}
            {googlePay.settings?.enabled && (
              <View style={[styles.settingRow, { borderColor: colors.border }]}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{t('auto_create_transactions')}</Text>
                <Switch
                  value={googlePay.settings?.autoCreateTransactions || false}
                  onValueChange={(value) => googlePay.updateSettings({ autoCreateTransactions: value })}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            )}

            {/* Require confirmation */}
            {googlePay.settings?.enabled && googlePay.settings?.autoCreateTransactions && (
              <View style={[styles.settingRow, { borderColor: colors.border }]}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{t('require_confirmation')}</Text>
                <Switch
                  value={googlePay.settings?.requireConfirmation || false}
                  onValueChange={(value) => googlePay.updateSettings({ requireConfirmation: value })}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            )}

            <Divider style={styles.divider} />
          </>
        )}

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
            {availableLanguages.map(lng => (
              <TouchableRipple
                key={lng}
                onPress={() => handleLanguageSelect(lng)}
                style={styles.languageItem}
              >
                <View style={styles.languageItemContent}>
                  <Text style={[styles.languageItemText, { color: colors.text }]}>
                    {t(lng === 'en' ? 'english' : 'russian')}
                  </Text>
                  {localLang === lng && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </View>
              </TouchableRipple>
            ))}
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
  notificationAccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  notificationAccessText: {
    fontSize: 14,
  },
  notificationButton: {
    marginTop: 8,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  settingLabel: {
    fontSize: 15,
    flex: 1,
  },
});
