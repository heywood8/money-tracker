import React, { useEffect, useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, ScrollView, FlatList } from 'react-native';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { Portal, Modal, Text, Divider, TouchableRipple, ProgressBar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, importBackup, restoreBackup } from '../services/BackupRestore';
import { getStoredBackups } from '../services/DailyBackupService';
import { useLogEntries } from '../hooks/useLogEntries';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkForAppUpdate, downloadAndInstallApk } from '../services/AppUpdateService';
import { setPreference, PREF_KEYS } from '../services/PreferencesDB';
import ModalBlurOverlay from '../components/ModalBlurOverlay';

const LOG_LEVEL_COLORS = {
  error: '#e53935',
  warn: '#fb8c00',
  info: '#1e88e5',
  debug: '#757575',
};

const LOG_FILTERS = ['all', 'error', 'warn', 'info', 'debug'];

export default function SettingsModal({ visible, onClose }) {
  const { colors } = useThemeColors();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { showDialog } = useDialog();
  const { resetDatabase } = useAccountsActions();
  const { startImport, cancelImport, completeImport } = useImportProgress();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [exportFormatModalVisible, setExportFormatModalVisible] = useState(false);
  const [logsModalVisible, setLogsModalVisible] = useState(false);
  const [backupsModalVisible, setBackupsModalVisible] = useState(false);
  const [logFilter, setLogFilter] = useState('all');
  const [apkDownloadProgress, setApkDownloadProgress] = useState(null);
  const [storedBackups, setStoredBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const exportFormatSlideAnim = useRef(new Animated.Value(0)).current;
  const logsSlideAnim = useRef(new Animated.Value(0)).current;
  const backupsSlideAnim = useRef(new Animated.Value(0)).current;
  const logsFlatListRef = useRef(null);

  const { entries, clearLogs, getExportText } = useLogEntries(logFilter);

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
    setLanguage(lng);
    closeLanguageModal();
  }, [setLanguage, closeLanguageModal]);

  // Map of language codes to their native display names
  const nativeLanguageNames = {
    en: 'English',
    ru: 'Русский',
    zh: '中文',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    hy: 'Հայերեն',
    ja: '日本語',
    ko: '한국어',
    pt: 'Português',
  };

  // Simple map of language code to flag emoji (useful default)
  const languageFlags = {
    en: '🇬🇧',
    ru: '🇷🇺',
    zh: '🇨🇳',
    es: '🇪🇸',
    fr: '🇫🇷',
    de: '🇩🇪',
    it: '🇮🇹',
    hy: '🇦🇲',
    ja: '🇯🇵',
    ko: '🇰🇷',
    pt: '🇵🇹',
  };

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

  const openLogsModal = useCallback(() => {
    setLogsModalVisible(true);
    Animated.timing(logsSlideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [logsSlideAnim]);

  const closeLogsModal = useCallback(() => {
    Animated.timing(logsSlideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setLogsModalVisible(false);
    });
  }, [logsSlideAnim]);

  const handleExportFormatSelect = useCallback(async (format) => {
    closeExportFormatModal();
    try {
      await exportBackup(format);
      showDialog(
        t('backup_database') || 'Backup Database',
        t('backup_success') || 'Backup exported successfully',
        [{ text: 'OK', onPress: onClose }],
      );
    } catch (error) {
      console.error('Export backup error:', error);
      showDialog(
        t('error') || 'Error',
        error.message === 'Import cancelled'
          ? t('cancel') || 'Cancelled'
          : t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    }
  }, [closeExportFormatModal, t, showDialog, onClose]);

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
      ],
    );
  };

  const handleExportBackup = () => {
    console.log('handleExportBackup called - opening export format modal');
    openExportFormatModal();
  };

  // Note: reloadApp removed because it was unused. Use expo-updates directly where needed.

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

              // Mark import as complete to enable OK button
              completeImport();
            } catch (error) {
              console.error('Import backup error:', error);
              // Cancel import progress on error
              cancelImport();
              showDialog(
                t('error') || 'Error',
                error.message === 'Import cancelled'
                  ? t('cancel') || 'Cancelled'
                  : error.message || t('restore_error') || 'Failed to restore backup',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const handleShareLogs = useCallback(async () => {
    try {
      const text = getExportText();
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `penny-logs-${date}.txt`);
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
    } catch (error) {
      console.error('Share logs error:', error);
    }
  }, [getExportText]);

  const handleClearLogs = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  const loadStoredBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const uris = await getStoredBackups();
      const infos = await Promise.all(
        uris.map(async (uri) => {
          const filename = uri.split('/').pop();
          const info = await LegacyFileSystem.getInfoAsync(uri);
          return { uri, filename, size: info.size || 0 };
        }),
      );
      setStoredBackups(infos.reverse());
    } catch (error) {
      console.error('Failed to load stored backups:', error);
      setStoredBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const openBackupsModal = useCallback(() => {
    setBackupsModalVisible(true);
    loadStoredBackups();
    Animated.timing(backupsSlideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [backupsSlideAnim, loadStoredBackups]);

  const closeBackupsModal = useCallback(() => {
    Animated.timing(backupsSlideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setBackupsModalVisible(false);
    });
  }, [backupsSlideAnim]);

  const handleRestoreLocalBackup = useCallback((uri) => {
    showDialog(
      t('restore_database') || 'Restore Database',
      t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('restore_database') || 'Restore',
          style: 'destructive',
          onPress: async () => {
            onClose();
            startImport();
            try {
              const content = await LegacyFileSystem.readAsStringAsync(uri);
              const backup = JSON.parse(content);
              await restoreBackup(backup);
              completeImport();
            } catch (error) {
              console.error('Local backup restore error:', error);
              cancelImport();
              showDialog(
                t('error') || 'Error',
                error.message || t('restore_error') || 'Failed to restore backup',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  }, [showDialog, t, onClose, startImport, completeImport, cancelImport]);

  const handleDeleteLocalBackup = useCallback((uri) => {
    showDialog(
      t('delete_backup') || 'Delete Backup',
      t('delete_backup_confirm') || 'Delete this backup? This cannot be undone.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
              setStoredBackups(prev => prev.filter(b => b.uri !== uri));
            } catch (error) {
              console.error('Failed to delete backup:', error);
            }
          },
        },
      ],
    );
  }, [showDialog, t]);

  const handleCheckForUpdates = useCallback(async () => {
    try {
      const result = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

      if (!result.success) {
        showDialog(
          t('check_updates') || 'Check for updates',
          t('update_check_failed') || 'Could not check updates right now. Please try again later.',
          [{ text: t('ok') || 'OK' }],
        );
        return;
      }

      if (!result.isUpdateAvailable) {
        showDialog(
          t('check_updates') || 'Check for updates',
          t('up_to_date') || 'You already have the latest version installed.',
          [{ text: t('ok') || 'OK' }],
        );
        return;
      }

      showDialog(
        t('update_available_title') || 'Update available',
        `${(t('update_available_message') || 'A newer app version ({latestVersion}) is available. Install it from GitHub release APK.')
          .replace('{latestVersion}', result.latestVersion)}\n\n${
          t('update_install_hint')
          || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'
        }`,
        [
          { text: t('later') || 'Later' },
          {
            text: t('update_now') || 'Update now',
            onPress: async () => {
              await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, result.latestVersion);
              setApkDownloadProgress(0);
              try {
                await downloadAndInstallApk(result.downloadUrl, setApkDownloadProgress);
              } catch (e) {
                showDialog(
                  t('error') || 'Error',
                  t('update_download_failed') || 'Could not download the update. Please try again.',
                  [{ text: t('ok') || 'OK' }],
                );
              } finally {
                setApkDownloadProgress(null);
              }
            },
          },
        ],
      );
    } catch (error) {
      console.error('Manual update check failed:', error);
      showDialog(
        t('check_updates') || 'Check for updates',
        t('update_check_failed') || 'Could not check updates right now. Please try again later.',
        [{ text: t('ok') || 'OK' }],
      );
    }
  }, [showDialog, t]);

  useEffect(() => {
    if (visible) {
      setLanguageModalVisible(false);
      setExportFormatModalVisible(false);
      setLogsModalVisible(false);
      setBackupsModalVisible(false);
      slideAnim.setValue(0);
      exportFormatSlideAnim.setValue(0);
      logsSlideAnim.setValue(0);
      backupsSlideAnim.setValue(0);
    }
  }, [visible, slideAnim, exportFormatSlideAnim, logsSlideAnim, backupsSlideAnim]);

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

  // Interpolate animation values for logs modal
  const logsTranslateX = logsSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  const logsOpacity = logsSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Interpolate animation values for backups modal
  const backupsTranslateX = backupsSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  const backupsOpacity = backupsSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const anySubModalOpen = languageModalVisible || exportFormatModalVisible || logsModalVisible || backupsModalVisible;

  const formatBackupLabel = useCallback((filename) => {
    if (filename.startsWith('daily_')) {
      const dateStr = filename.replace('daily_', '').replace('.json', '');
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    }
    if (filename.startsWith('weekly_')) {
      const weekStr = filename.replace('weekly_', '').replace('.json', '');
      const [year, weekPart] = weekStr.split('-');
      return `${t('weekly') || 'Weekly'} ${weekPart}, ${year}`;
    }
    return filename;
  }, [t]);

  const renderBackupItem = useCallback(({ item }) => {
    const isDaily = item.filename.startsWith('daily_');
    const label = formatBackupLabel(item.filename);
    const typeLabel = isDaily ? 'Daily' : (t('weekly') || 'Weekly');
    const sizeKB = item.size ? `${(item.size / 1024).toFixed(1)} KB` : '';
    return (
      <View style={[styles.backupItem, { borderBottomColor: colors.border }]}>
        <View style={styles.backupItemLeft}>
          <Ionicons name={isDaily ? 'calendar-outline' : 'calendar-number-outline'} size={22} color={colors.text} />
          <View style={styles.backupItemText}>
            <Text style={[styles.backupItemLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.backupItemMeta, { color: colors.mutedText }]}>
              {typeLabel}{sizeKB ? ` · ${sizeKB}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.backupItemActions}>
          <TouchableOpacity onPress={() => handleRestoreLocalBackup(item.uri)} style={styles.backupActionButton}>
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteLocalBackup(item.uri)} style={styles.backupActionButton}>
            <Ionicons name="trash-outline" size={18} color="#c44" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [colors, t, formatBackupLabel, handleRestoreLocalBackup, handleDeleteLocalBackup]);

  const renderLogEntry = useCallback(({ item }) => (
    <View style={styles.logEntry}>
      <Text style={[styles.logTimestamp, { color: colors.mutedText }]}>
        {item.timestamp.substring(11, 19)}
      </Text>
      <Text style={[styles.logLevel, { color: LOG_LEVEL_COLORS[item.level] }]}>
        {item.level.toUpperCase()}
      </Text>
      <Text style={[styles.logMessage, { color: colors.text }]} numberOfLines={3}>
        {item.message}
      </Text>
    </View>
  ), [colors]);

  const logKeyExtractor = useCallback((item) => String(item.id), []);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Portal>
      <Modal
        visible={visible}
        onDismiss={backupsModalVisible ? closeBackupsModal : (logsModalVisible ? closeLogsModal : (exportFormatModalVisible ? closeExportFormatModal : (languageModalVisible ? closeLanguageModal : onClose)))}
        dismissable={true}
      >
        <Animated.View style={[
          styles.content,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: settingsTranslateX }],
            opacity: settingsOpacity,
          },
          anySubModalOpen && styles.hidden,
        ]}>
          <View style={styles.header}>
            <View style={styles.closeButton} />
            <Text variant="titleLarge" style={[styles.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} testID="settings-close-button">
              <Ionicons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <TouchableRipple onPress={openLanguageModal} style={styles.settingsRow}>
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="language-outline" size={22} color={colors.text} />
                <View style={styles.settingsRowText}>
                  <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('language')}</Text>
                  <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                    {languageFlags[language] ? `${languageFlags[language]}  ${nativeLanguageNames[language] || language}` : (nativeLanguageNames[language] || language)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <Divider style={styles.divider} />

          <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('database') || 'Database'}</Text>

          <TouchableRipple onPress={handleExportBackup} style={styles.settingsRow}>
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('export') || 'Export'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <TouchableRipple onPress={handleImportBackup} style={styles.settingsRow}>
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="cloud-download-outline" size={22} color={colors.text} />
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('import') || 'Import'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <TouchableRipple onPress={openBackupsModal} style={styles.settingsRow}>
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="archive-outline" size={22} color={colors.text} />
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('local_backups') || 'Local Backups'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <Divider style={styles.divider} />

          <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('developer') || 'Developer'}</Text>

          <TouchableRipple onPress={openLogsModal} style={styles.settingsRow} testID="logs-row">
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="terminal-outline" size={22} color={colors.text} />
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('logs') || 'Logs'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <TouchableRipple onPress={handleCheckForUpdates} style={styles.settingsRow} testID="check-updates-row">
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="download-outline" size={22} color={colors.text} />
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>
                  {t('check_updates') || 'Check for updates'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
            </View>
          </TouchableRipple>

          <View style={styles.resetSpacer} />

          <TouchableRipple onPress={handleResetDatabase} style={styles.settingsRow}>
            <View style={styles.settingsRowContent}>
              <View style={styles.settingsRowLeft}>
                <Ionicons name="trash-outline" size={22} color="#c44" />
                <Text style={[styles.settingsRowLabel, styles.destructiveText]}>{t('reset_database') || 'Reset Database'}</Text>
              </View>
            </View>
          </TouchableRipple>
        </Animated.View>

        <Animated.View style={[
          styles.languageModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: languageTranslateX }],
            opacity: languageOpacity,
          },
          !languageModalVisible && styles.hidden,
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

          <ScrollView style={styles.languageList}>
            {availableLanguages.map(lng => {
              return (
                <TouchableRipple
                  key={lng}
                  onPress={() => handleLanguageSelect(lng)}
                  style={styles.languageItem}
                >
                  <View style={styles.languageItemContent}>
                    <Text style={[styles.languageItemText, { color: colors.text }]}>
                      {languageFlags[lng] ? `${languageFlags[lng]}  ${nativeLanguageNames[lng] || lng}` : (nativeLanguageNames[lng] || lng)}
                    </Text>
                    {language === lng && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </View>
                </TouchableRipple>
              );
            })}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[
          styles.languageModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: exportFormatTranslateX }],
            opacity: exportFormatOpacity,
          },
          !exportFormatModalVisible && styles.hidden,
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

          <ScrollView style={styles.languageList}>
            <TouchableRipple
              onPress={() => handleExportFormatSelect('json')}
              style={styles.languageItem}
            >
              <View style={styles.languageItemContent}>
                <View style={styles.formatItemRow}>
                  <Ionicons name="code-outline" size={24} color={colors.text} />
                  <View style={styles.formatTextContainer}>
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
                <View style={styles.formatItemRow}>
                  <Ionicons name="document-text-outline" size={24} color={colors.text} />
                  <View style={styles.formatTextContainer}>
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
                <View style={styles.formatItemRow}>
                  <Ionicons name="server-outline" size={24} color={colors.text} />
                  <View style={styles.formatTextContainer}>
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
          </ScrollView>
        </Animated.View>

        <Animated.View style={[
          styles.logsModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: logsTranslateX }],
            opacity: logsOpacity,
          },
          !logsModalVisible && styles.hidden,
        ]}>
          <View style={styles.languageModalHeader}>
            <TouchableOpacity onPress={closeLogsModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
              {t('logs') || 'Logs'}
            </Text>
            <View style={styles.backButton} />
          </View>

          <Divider />

          <View style={styles.filterRow}>
            {LOG_FILTERS.map(f => {
              const isSelected = f === logFilter;
              const filterLabelKey = `log_level_${f}`;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setLogFilter(f)}
                  style={[
                    styles.filterChip,
                    { borderColor: colors.border },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    isSelected ? styles.filterChipTextSelected : { color: colors.text },
                  ]}>
                    {t(filterLabelKey) || f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            ref={logsFlatListRef}
            data={entries}
            keyExtractor={logKeyExtractor}
            renderItem={renderLogEntry}
            style={styles.logsList}
            contentContainerStyle={entries.length === 0 && styles.logsEmptyContainer}
            ListEmptyComponent={
              <Text style={[styles.logsEmptyText, { color: colors.mutedText }]}>
                {t('no_logs') || 'No logs yet'}
              </Text>
            }
          />

          <Divider />

          <View style={styles.logsActionBar}>
            <TouchableOpacity onPress={handleShareLogs} style={styles.logsActionButton}>
              <Ionicons name="share-outline" size={20} color={colors.primary} />
              <Text style={[styles.logsActionText, { color: colors.primary }]}>
                {t('share_logs') || 'Share Logs'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearLogs} style={styles.logsActionButton}>
              <Ionicons name="trash-outline" size={20} color={LOG_LEVEL_COLORS.error} />
              <Text style={[styles.logsActionText, styles.clearLogsText]}>
                {t('clear_logs') || 'Clear Logs'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View style={[
          styles.logsModalContent,
          { backgroundColor: colors.card },
          {
            transform: [{ translateX: backupsTranslateX }],
            opacity: backupsOpacity,
          },
          !backupsModalVisible && styles.hidden,
        ]}>
          <View style={styles.languageModalHeader}>
            <TouchableOpacity onPress={closeBackupsModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
              {t('local_backups') || 'Local Backups'}
            </Text>
            <TouchableOpacity onPress={loadStoredBackups} style={styles.backButton}>
              <Ionicons name="refresh-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Divider />

          {backupsLoading ? (
            <View style={styles.logsEmptyContainer}>
              <Text style={[styles.logsEmptyText, { color: colors.mutedText }]}>
                {'Loading...'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={storedBackups}
              keyExtractor={(item) => item.uri}
              renderItem={renderBackupItem}
              style={styles.logsList}
              contentContainerStyle={storedBackups.length === 0 && styles.logsEmptyContainer}
              ListEmptyComponent={
                <Text style={[styles.logsEmptyText, { color: colors.mutedText }]}>
                  {t('local_backups_empty') || 'No local backups yet'}
                </Text>
              }
            />
          )}
        </Animated.View>
      </Modal>
      {apkDownloadProgress !== null && (
        <Modal
          visible
          dismissable={false}
          contentContainerStyle={[styles.downloadModal, { backgroundColor: colors.card }]}
        >
          <Text variant="bodyLarge" style={[styles.downloadTitle, { color: colors.text }]}>
            {t('downloading_update') || 'Downloading update...'}
          </Text>
          <ProgressBar
            progress={apkDownloadProgress}
            color={colors.primary}
            style={styles.downloadProgressBar}
          />
          <Text variant="bodySmall" style={[styles.downloadPercent, { color: colors.mutedText }]}>
            {`${Math.round(apkDownloadProgress * 100)}%`}
          </Text>
        </Modal>
      )}
    </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backupActionButton: {
    padding: 6,
  },
  backupItem: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  backupItemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  backupItemLabel: {
    fontSize: 15,
  },
  backupItemLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  backupItemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  backupItemText: {
    flex: 1,
  },
  clearLogsText: {
    color: '#e53935',
  },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  content: {
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.xl,
    maxHeight: '90%',
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  destructiveText: {
    color: '#c44',
  },
  divider: {
    marginVertical: SPACING.xs,
  },
  downloadModal: {
    alignItems: 'center',
    borderRadius: 12,
    margin: 40,
    padding: 24,
  },
  downloadPercent: {
    marginTop: 8,
  },
  downloadProgressBar: {
    borderRadius: 4,
    height: 8,
    marginTop: 16,
    width: '100%',
  },
  downloadTitle: {
    marginBottom: 4,
    textAlign: 'center',
  },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  formatDescription: {
    fontSize: 12,
    marginTop: SPACING.xs,
  },
  formatItemRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  formatTextContainer: {
    flex: 1,
    flexShrink: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontWeight: '600',
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  languageItem: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  languageItemContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
  },
  languageItemText: {
    fontSize: 16,
  },
  languageList: {
    paddingVertical: SPACING.sm,
  },
  languageModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.xl,
    padding: 0,
  },
  languageModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  languageModalTitle: {
    fontWeight: '600',
  },
  logEntry: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 4,
  },
  logLevel: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    width: 42,
  },
  logMessage: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  logTimestamp: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  logsActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
  },
  logsActionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logsActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  logsEmptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logsEmptyText: {
    fontSize: 14,
  },
  logsList: {
    maxHeight: 350,
  },
  logsModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.xl,
    maxHeight: '85%',
    padding: 0,
  },
  resetSpacer: {
    height: SPACING.sm,
  },
  sectionLabel: {
    letterSpacing: 0.5,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  settingsRow: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  settingsRowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  settingsRowLabel: {
    fontSize: 16,
  },
  settingsRowLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  settingsRowText: {
    flex: 1,
    flexShrink: 1,
  },
  settingsRowValue: {
    fontSize: 13,
    marginTop: 2,
  },
});

SettingsModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
