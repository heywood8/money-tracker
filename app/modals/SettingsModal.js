import React, { useEffect, useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, ScrollView, FlatList, Linking, ActivityIndicator } from 'react-native'; // FlatList used for backups list
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { Portal, Modal, Text, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, importBackup, restoreBackup, createBackup } from '../services/BackupRestore';
import { getStoredBackups } from '../services/DailyBackupService';
import { useLogEntries } from '../hooks/useLogEntries';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkForAppUpdate } from '../services/AppUpdateService';
import { setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { authenticateWithBiometrics, BiometricResult } from '../services/BiometricService';
import { getValidAccessToken, signIn as googleSignIn, exportToSheets } from '../services/GoogleSheetsService';

const LOG_LEVEL_COLORS = {
  error: '#e53935',
  warn: '#fb8c00',
  info: '#1e88e5',
  debug: '#757575',
};

const LOG_FILTERS = ['all', 'error', 'warn', 'info', 'debug'];

const stripMarkdown = (md) => md
  .replace(/\r\n/g, '\n')
  .replace(/#{1,6}\s+/g, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*+]\s+/gm, '• ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export default function SettingsModal({ visible, onClose }) {
  const { colors } = useThemeColors();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { hideBalances, setHideBalances } = useDisplaySettings();
  const { showDialog } = useDialog();
  const { resetDatabase } = useAccountsActions();
  const { startImport, cancelImport, completeImport } = useImportProgress();
  const { startDownload } = useUpdateDownload();
  const [activeSubPanel, setActiveSubPanel] = useState(null); // 'language' | 'export' | 'logs' | 'backups' | null
  const [logFilter, setLogFilter] = useState('all');
  const [storedBackups, setStoredBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(false);
  const [googleSheetsSuccessUrl, setGoogleSheetsSuccessUrl] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Computed colors
  const googleSheetsTextColor = googleSheetsSuccessUrl ? '#4caf50' : (googleSheetsLoading ? colors.mutedText : colors.text);

  // Animation values
  const settingsAnim = useRef(new Animated.Value(0)).current;
  const subPanelAnim = useRef(new Animated.Value(0)).current;
  const toggleAnim = useRef(new Animated.Value(hideBalances ? 1 : 0)).current;
  const updateContentAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: hideBalances ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [hideBalances, toggleAnim]);

  useEffect(() => {
    if (!isCheckingUpdate && updateResult) {
      Animated.timing(updateContentAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [isCheckingUpdate, updateResult, updateContentAnim]);

  const { entries, clearLogs, getExportText } = useLogEntries(logFilter);

  const handleToggleHideBalances = useCallback(async () => {
    if (!hideBalances) {
      // Hiding — no auth required
      setHideBalances(true);
      return;
    }
    // Unhiding — require biometric auth
    const result = await authenticateWithBiometrics(t('biometric_prompt') || 'Authenticate to show balances');
    if (result === BiometricResult.SUCCESS) {
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_AVAILABLE) {
      console.warn('biometric not available, allowing hide balances toggle without auth');
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_ENROLLED) {
      console.warn('biometric not enrolled, allowing hide balances toggle without auth');
      setHideBalances(false);
    } else if (result === BiometricResult.FAILED) {
      showDialog(
        t('error') || 'Error',
        t('biometric_failed') || 'Authentication failed',
        [{ text: t('ok') || 'OK' }],
      );
    }
    // CANCELLED: do nothing silently
  }, [hideBalances, setHideBalances, t, showDialog]);

  const openSubPanel = useCallback((panel) => {
    if (panel === 'backups') loadStoredBackups();
    setActiveSubPanel(panel);
    Animated.parallel([
      Animated.timing(settingsAnim, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(subPanelAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [settingsAnim, subPanelAnim, loadStoredBackups]);

  const closeSubPanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(subPanelAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(settingsAnim, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setActiveSubPanel(null);
      setGoogleSheetsSuccessUrl(null);
      setUpdateResult(null);
    });
  }, [settingsAnim, subPanelAnim]);

  const handleLanguageSelect = useCallback((lng) => {
    setLanguage(lng);
    closeSubPanel();
  }, [setLanguage, closeSubPanel]);

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

  const handleExportFormatSelect = useCallback(async (format) => {
    closeSubPanel();
    try {
      await exportBackup(format);
    } catch (error) {
      console.error('Export backup error:', error);
      showDialog(
        t('error') || 'Error',
        t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    }
  }, [closeSubPanel, t, showDialog]);

  const handleGoogleSheetsExport = useCallback(async () => {
    setGoogleSheetsLoading(true);
    try {
      let accessToken;
      try {
        accessToken = await getValidAccessToken();
      } catch (authError) {
        if (authError.message === 'refresh_failed') {
          throw authError;
        }
        // Not signed in — trigger native sign-in UI
        accessToken = await googleSignIn();
      }
      const backup = await createBackup();
      const sheetUrl = await exportToSheets(accessToken, backup);
      setGoogleSheetsLoading(false);
      setGoogleSheetsSuccessUrl(sheetUrl);
    } catch (error) {
      setGoogleSheetsLoading(false);
      if (error.message === 'sign_in_cancelled') {
        return; // User dismissed — stay on subpanel, no dialog
      }
      closeSubPanel();
      let dialogMsg;
      if (error.message === 'refresh_failed') {
        dialogMsg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
      } else if (error.message === 'auth_failed') {
        dialogMsg = t('google_sheets_signin_failed') || 'Google sign-in failed. Please try again.';
      } else if (error.message === 'quota_exceeded') {
        dialogMsg = t('google_sheets_quota_exceeded') || 'Google Sheets quota exceeded. Try again later.';
      } else if (error.message === 'Network request failed') {
        dialogMsg = t('google_sheets_no_network') || 'Export failed: no internet connection.';
      } else {
        dialogMsg = t('google_sheets_export_failed') || 'Export failed. Please try again.';
      }
      showDialog(t('error') || 'Error', dialogMsg, [{ text: t('ok') || 'OK' }]);
    }
  }, [closeSubPanel, t, showDialog]);

  const confirmResetDatabase = useCallback(async () => {
    closeSubPanel();
    try {
      await resetDatabase();
      onClose();
    } catch (error) {
      // Error already handled in resetDatabase
    }
  }, [closeSubPanel, resetDatabase, onClose]);

  // Note: reloadApp removed because it was unused. Use expo-updates directly where needed.

  const confirmImportBackup = useCallback(async () => {
    closeSubPanel();
    onClose();
    startImport();
    try {
      await importBackup();
      completeImport();
    } catch (error) {
      console.error('Import backup error:', error);
      cancelImport();
      showDialog(
        t('error') || 'Error',
        error.message === 'Import cancelled'
          ? t('cancel') || 'Cancelled'
          : error.message || t('restore_error') || 'Failed to restore backup',
        [{ text: 'OK' }],
      );
    }
  }, [closeSubPanel, onClose, startImport, completeImport, cancelImport, t, showDialog]);

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
    updateContentAnim.setValue(0);
    setUpdateResult(null);
    setIsCheckingUpdate(true);
    openSubPanel('update');
    try {
      const result = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

      if (!result.success) {
        setUpdateResult({ type: 'error', errorCode: result.errorCode });
      } else if (!result.isUpdateAvailable) {
        setUpdateResult({ type: 'up_to_date' });
      } else {
        setUpdateResult({
          type: 'available',
          latestVersion: result.latestVersion,
          currentVersion: result.currentVersion,
          downloadUrl: result.downloadUrl,
          releaseNotes: result.releaseNotes || null,
        });
      }
    } catch (error) {
      console.error('Manual update check failed:', error);
      setUpdateResult({ type: 'error', errorCode: null });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [openSubPanel, updateContentAnim]);

  useEffect(() => {
    if (visible) {
      setActiveSubPanel(null);
      setGoogleSheetsSuccessUrl(null);
      setUpdateResult(null);
      settingsAnim.setValue(0);
      subPanelAnim.setValue(0);
    }
  }, [visible, settingsAnim, subPanelAnim]);

  const settingsTranslateX = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
  });

  const settingsOpacity = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const subPanelTranslateX = subPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  const subPanelOpacity = subPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const anySubModalOpen = activeSubPanel !== null;

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


  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={activeSubPanel ? closeSubPanel : onClose}
        dismissable={true}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <Animated.View style={[
            styles.content,
            {
              transform: [{ translateX: settingsTranslateX }],
              opacity: settingsOpacity,
            },
          ]}>
            <View style={styles.header}>
              <View style={styles.closeButton} />
              <Text variant="titleLarge" style={[styles.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} testID="settings-close-button">
                <Ionicons name="close" size={24} color={colors.mutedText} />
              </TouchableOpacity>
            </View>

            <TouchableRipple onPress={() => openSubPanel('language')} style={styles.settingsRow} testID="settings-language-row">
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

            <TouchableRipple onPress={handleToggleHideBalances} style={styles.settingsRow}>
              <View style={styles.settingsRowContent}>
                <View style={styles.settingsRowLeft}>
                  <Ionicons name="eye-off-outline" size={22} color={colors.text} />
                  <View style={styles.settingsRowText}>
                    <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('hide_balances') || 'Hide balances'}</Text>
                    <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                      {t('hide_balances_hint') || 'Mask account balances for privacy'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.switchTrack, { backgroundColor: hideBalances ? colors.primary : colors.border }]}>
                  <Animated.View style={[styles.switchThumb, {
                    transform: [{ translateX: toggleAnim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] }) }],
                  }]} />
                </View>
              </View>
            </TouchableRipple>

            <Divider style={styles.divider} />

            <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('database') || 'Database'}</Text>

            <TouchableRipple onPress={() => openSubPanel('export')} style={styles.settingsRow} testID="settings-export-row">
              <View style={styles.settingsRowContent}>
                <View style={styles.settingsRowLeft}>
                  <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
                  <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('export') || 'Export'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            <TouchableRipple onPress={() => openSubPanel('import')} style={styles.settingsRow}>
              <View style={styles.settingsRowContent}>
                <View style={styles.settingsRowLeft}>
                  <Ionicons name="cloud-download-outline" size={22} color={colors.text} />
                  <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('import') || 'Import'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            <TouchableRipple onPress={() => openSubPanel('backups')} style={styles.settingsRow} testID="settings-backups-row">
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

            <TouchableRipple onPress={() => openSubPanel('logs')} style={styles.settingsRow} testID="logs-row">
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

            <TouchableRipple onPress={() => openSubPanel('reset')} style={styles.settingsRow}>
              <View style={styles.settingsRowContent}>
                <View style={styles.settingsRowLeft}>
                  <Ionicons name="trash-outline" size={22} color="#c44" />
                  <Text style={[styles.settingsRowLabel, styles.destructiveText]}>{t('reset_database') || 'Reset Database'}</Text>
                </View>
              </View>
            </TouchableRipple>
          </Animated.View>

          {activeSubPanel && (
            <Animated.View style={[
              styles.subPanelContent,
              { backgroundColor: colors.card },
              {
                transform: [{ translateX: subPanelTranslateX }],
                opacity: subPanelOpacity,
              },
            ]}>
              <View style={styles.languageModalHeader}>
                <TouchableOpacity onPress={closeSubPanel} style={styles.backButton} testID="settings-subpanel-back">
                  <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
                  {activeSubPanel === 'language' && t('language')}
                  {activeSubPanel === 'export' && (t('export_format') || 'Export Format')}
                  {activeSubPanel === 'import' && (t('restore_database') || 'Restore Database')}
                  {activeSubPanel === 'logs' && (t('logs') || 'Logs')}
                  {activeSubPanel === 'backups' && (t('local_backups') || 'Local Backups')}
                  {activeSubPanel === 'update' && (
                    isCheckingUpdate
                      ? (t('check_updates') || 'Check for updates')
                      : updateResult?.type === 'available'
                        ? (t('update_available_title') || 'Update available')
                        : (t('check_updates') || 'Check for updates')
                  )}
                  {activeSubPanel === 'reset' && (t('reset_database') || 'Reset Database')}
                </Text>
                {activeSubPanel === 'backups' ? (
                  <TouchableOpacity onPress={loadStoredBackups} style={styles.backButton}>
                    <Ionicons name="refresh-outline" size={22} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.backButton} />
                )}
              </View>

              <Divider />

              {activeSubPanel === 'language' && (
                <ScrollView style={styles.languageList}>
                  {availableLanguages.map(lng => (
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
                  ))}
                </ScrollView>
              )}

              {activeSubPanel === 'export' && (
                <ScrollView style={styles.languageList}>
                  <TouchableRipple onPress={() => handleExportFormatSelect('json')} style={styles.languageItem}>
                    <View style={styles.languageItemContent}>
                      <View style={styles.formatItemRow}>
                        <Ionicons name="code-outline" size={24} color={colors.text} />
                        <View style={styles.formatTextContainer}>
                          <Text style={[styles.languageItemText, { color: colors.text }]}>JSON</Text>
                          <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                            {t('json_description') || 'Standard format, compatible with all versions'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                    </View>
                  </TouchableRipple>

                  <TouchableRipple onPress={() => handleExportFormatSelect('csv')} style={styles.languageItem}>
                    <View style={styles.languageItemContent}>
                      <View style={styles.formatItemRow}>
                        <Ionicons name="document-text-outline" size={24} color={colors.text} />
                        <View style={styles.formatTextContainer}>
                          <Text style={[styles.languageItemText, { color: colors.text }]}>CSV</Text>
                          <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                            {t('csv_description') || 'Plain text format, easy to edit'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                    </View>
                  </TouchableRipple>

                  <TouchableRipple onPress={() => handleExportFormatSelect('sqlite')} style={styles.languageItem}>
                    <View style={styles.languageItemContent}>
                      <View style={styles.formatItemRow}>
                        <Ionicons name="server-outline" size={24} color={colors.text} />
                        <View style={styles.formatTextContainer}>
                          <Text style={[styles.languageItemText, { color: colors.text }]}>SQLite Database</Text>
                          <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                            {t('sqlite_description') || 'Raw database file, complete backup'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                    </View>
                  </TouchableRipple>

                  <TouchableRipple
                    onPress={googleSheetsSuccessUrl ? null : handleGoogleSheetsExport}
                    style={styles.languageItem}
                    disabled={googleSheetsLoading || !!googleSheetsSuccessUrl}
                    testID="settings-export-google-sheets"
                  >
                    <View style={styles.languageItemContent}>
                      <View style={styles.formatItemRow}>
                        <Ionicons
                          name="logo-google"
                          size={24}
                          color={googleSheetsTextColor}
                        />
                        <View style={styles.formatTextContainer}>
                          <Text style={[styles.languageItemText, { color: googleSheetsTextColor }]}>
                            Google Sheets
                          </Text>
                          <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                            {googleSheetsLoading
                              ? (t('google_sheets_exporting') || 'Exporting…')
                              : googleSheetsSuccessUrl
                                ? (t('google_sheets_export_success') || 'Exported to Google Sheets')
                                : (t('google_sheets_description') || 'Export to a Google Sheets spreadsheet')}
                          </Text>
                        </View>
                      </View>
                      {googleSheetsLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : googleSheetsSuccessUrl ? (
                        <View style={styles.googleSheetsSuccessTrailing}>
                          <TouchableOpacity
                            onPress={() => Linking.openURL(googleSheetsSuccessUrl)}
                            style={[styles.googleSheetsOpenButton, { backgroundColor: colors.border }]}
                          >
                            <Text style={styles.googleSheetsOpenText}>
                              {t('google_sheets_open') || 'Open'}
                            </Text>
                          </TouchableOpacity>
                          <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                      )}
                    </View>
                  </TouchableRipple>
                </ScrollView>
              )}

              {activeSubPanel === 'reset' && (
                <View style={styles.importConfirmContent}>
                  <Ionicons name="warning-outline" size={48} color="#c44" style={styles.importWarningIcon} />
                  <Text style={[styles.importConfirmText, { color: colors.text }]}>
                    {t('reset_database_confirm') || 'Are you sure you want to reset the database? This will delete all data and create default accounts.'}
                  </Text>
                  <TouchableRipple onPress={confirmResetDatabase} style={styles.importConfirmButtonDestructive}>
                    <Text style={styles.importConfirmButtonText}>
                      {t('reset') || 'Reset'}
                    </Text>
                  </TouchableRipple>
                </View>
              )}

              {activeSubPanel === 'import' && (
                <View style={styles.importConfirmContent}>
                  <Ionicons name="warning-outline" size={48} color="#c44" style={styles.importWarningIcon} />
                  <Text style={[styles.importConfirmText, { color: colors.text }]}>
                    {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
                  </Text>
                  <TouchableRipple onPress={confirmImportBackup} style={styles.importConfirmButtonDestructive}>
                    <Text style={styles.importConfirmButtonText}>
                      {t('restore_database') || 'Restore'}
                    </Text>
                  </TouchableRipple>
                </View>
              )}

              {activeSubPanel === 'logs' && (
                <>
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
                    data={entries.slice().reverse()}
                    keyExtractor={(item) => item.id}
                    renderItem={renderLogEntry}
                    style={styles.logsList}
                    inverted
                    initialNumToRender={20}
                    maxToRenderPerBatch={20}
                    windowSize={5}
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
                </>
              )}

              {activeSubPanel === 'update' && (
                isCheckingUpdate ? (
                  <View style={styles.updateCheckingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.updateCheckingText, { color: colors.text }]}>
                      {t('checking_for_updates') || 'Checking for available updates…'}
                    </Text>
                  </View>
                ) : updateResult && (
                  <Animated.View style={[styles.updateResultContainer, { opacity: updateContentAnim }]}>
                    {updateResult.type === 'available' && (
                      <>
                        <View style={styles.updateAvailableHeader}>
                          <Ionicons name="download-outline" size={36} color={colors.primary} />
                          <View style={styles.updateVersionInfo}>
                            <Text style={[styles.updateNewVersion, { color: colors.text }]}>
                              v{updateResult.latestVersion}
                            </Text>
                            <Text style={[styles.updateCurrentVersion, { color: colors.mutedText }]}>
                              {(t('update_from_version') || 'installed: v{currentVersion}')
                                .replace('{currentVersion}', updateResult.currentVersion)}
                            </Text>
                          </View>
                        </View>
                        {updateResult.releaseNotes ? (
                          <>
                            <Divider style={styles.updateDivider} />
                            <Text style={[styles.changelogTitle, { color: colors.mutedText }]}>
                              {t('whats_new') || "What's new"}
                            </Text>
                            <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
                              {updateResult.releaseNotes.map(({ version, notes }) => (
                                <View key={version} style={styles.changelogSection}>
                                  {updateResult.releaseNotes.length > 1 && (
                                    <Text style={[styles.changelogVersion, { color: colors.mutedText }]}>
                                      v{version}
                                    </Text>
                                  )}
                                  <Text style={[styles.changelogText, { color: colors.text }]}>
                                    {stripMarkdown(notes)}
                                  </Text>
                                </View>
                              ))}
                            </ScrollView>
                          </>
                        ) : (
                          <Text style={[styles.updateVersionText, { color: colors.mutedText }]}>
                            {t('update_install_hint') || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'}
                          </Text>
                        )}
                        <View style={styles.updateActions}>
                          {updateResult.releaseNotes && (
                            <Text style={[styles.updateHintText, { color: colors.mutedText }]}>
                              {t('update_install_hint') || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'}
                            </Text>
                          )}
                          <TouchableRipple
                            onPress={async () => {
                              await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, updateResult.latestVersion);
                              closeSubPanel();
                              onClose();
                              startDownload(updateResult.downloadUrl, {
                                onError: () => {
                                  showDialog(
                                    t('error') || 'Error',
                                    t('update_download_failed') || 'Could not download the update. Please try again.',
                                    [{ text: t('ok') || 'OK' }],
                                  );
                                },
                              });
                            }}
                            style={[styles.importConfirmButton, { backgroundColor: colors.primary }]}
                          >
                            <Text style={styles.importConfirmButtonText}>
                              {t('update_now') || 'Update now'}
                            </Text>
                          </TouchableRipple>
                        </View>
                      </>
                    )}
                    {updateResult.type === 'up_to_date' && (
                      <View style={styles.importConfirmContent}>
                        <Ionicons name="checkmark-circle-outline" size={48} color="#4caf50" style={styles.importWarningIcon} />
                        <Text style={[styles.updateVersionText, { color: colors.text }]}>
                          {t('up_to_date') || 'You already have the latest version installed.'}
                        </Text>
                      </View>
                    )}
                    {updateResult.type === 'error' && (
                      <View style={styles.importConfirmContent}>
                        <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedText} style={styles.importWarningIcon} />
                        <Text style={[styles.updateVersionText, { color: colors.text }]}>
                          {updateResult.errorCode === 'releases_without_apks'
                            ? (t('update_releases_without_apks') || 'Found releases but no APKs attached. Check GitHub for the latest release.')
                            : (t('update_check_failed') || 'Could not check updates right now. Please try again later.')}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                )
              )}

              {activeSubPanel === 'backups' && (
                backupsLoading ? (
                  <View style={styles.logsEmptyContainer}>
                    <Text style={[styles.logsEmptyText, { color: colors.mutedText }]}>{'Loading...'}</Text>
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
                )
              )}
            </Animated.View>
          )}
        </View>
      </Modal>
    </Portal>
  );
}

const centeredModal = {
  borderRadius: BORDER_RADIUS.lg,
  margin: SPACING.md,
  maxHeight: '95%',
};

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
  changelogScroll: {
    flex: 1,
    marginTop: SPACING.xs,
  },
  changelogSection: {
    marginBottom: SPACING.md,
  },
  changelogText: {
    fontSize: 13,
    lineHeight: 20,
  },
  changelogTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
  },
  changelogVersion: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
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
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  destructiveText: {
    color: '#c44',
  },
  divider: {
    marginVertical: SPACING.xs,
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
  googleSheetsOpenButton: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  googleSheetsOpenText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  googleSheetsSuccessTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
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
  importConfirmButton: {
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  importConfirmButtonDestructive: {
    backgroundColor: '#c44',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  importConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  importConfirmContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
    paddingVertical: SPACING.xl,
  },
  importConfirmText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  importWarningIcon: {
    marginBottom: SPACING.lg,
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
    flex: 1,
  },
  modalContainer: {
    ...centeredModal,
    overflow: 'hidden',
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
  subPanelContent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 2,
    height: 20,
    width: 20,
  },
  switchTrack: {
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 44,
  },
  updateActions: {
    paddingTop: SPACING.md,
  },
  updateAvailableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  updateCheckingContainer: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.lg,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
  },
  updateCheckingText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  updateCurrentVersion: {
    fontSize: 13,
    marginTop: 2,
  },
  updateDivider: {
    marginTop: SPACING.sm,
  },
  updateHintText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  updateNewVersion: {
    fontSize: 20,
    fontWeight: '600',
  },
  updateResultContainer: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  updateVersionInfo: {
    flex: 1,
  },
  updateVersionText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});

SettingsModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
