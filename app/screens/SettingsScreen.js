import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, ScrollView, FlatList, Linking, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { Text, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, pickImportFile, importBackupFromFile, restoreBackup, createBackup, getPreRestoreSnapshots } from '../services/BackupRestore';
import { getStoredBackups, DAILY_BACKUP_DIR } from '../services/DailyBackupService';
import { useLogEntries } from '../hooks/useLogEntries';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkForAppUpdate, listDownloadedApks, installApk, checkAlreadyDownloaded } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { authenticateWithBiometrics, BiometricResult } from '../services/BiometricService';
import { getValidAccessToken, signIn as googleSignIn, exportToSheets, importFromSheets } from '../services/GoogleSheetsService';
import UpdateContentPanel from '../components/UpdateContentPanel';

const SHEETS_STEPS = [
  { id: 'auth', label: 'Signing in to Google' },
  { id: 'backup', label: 'Preparing data' },
  { id: 'connect', label: 'Connecting to spreadsheet' },
  { id: 'clear', label: 'Clearing existing data' },
  { id: 'write', label: 'Uploading data' },
  { id: 'complete', label: 'Export complete' },
];

const SHEETS_IMPORT_STEPS = [
  { id: 'connect', label: 'Connecting to spreadsheet' },
  { id: 'parse', label: 'Reading sheet data' },
];

const LOG_LEVEL_COLORS = {
  error: '#e53935',
  warn: '#fb8c00',
  info: '#1e88e5',
  debug: '#757575',
};

const LOG_FILTERS = ['all', 'error', 'warn', 'info', 'debug'];


export default function SettingsScreen({ setSubPanelActive }) {
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
  const [pendingDeleteUri, setPendingDeleteUri] = useState(null);
  const [exportStep, setExportStep] = useState('list'); // 'list' | 'sheets-progress'
  const [sheetsSteps, setSheetsSteps] = useState(SHEETS_STEPS.map(s => ({ ...s, status: 'pending' })));
  const [sheetsSuccessUrl, setSheetsSuccessUrl] = useState(null);
  const [sheetsError, setSheetsError] = useState(null);
  const [sheetsImportSteps, setSheetsImportSteps] = useState(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
  const [sheetsImportError, setSheetsImportError] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [downloadedApks, setDownloadedApks] = useState([]);
  const [importStep, setImportStep] = useState('source'); // 'source' | 'local-list' | 'confirm-file' | 'confirm-local' | 'sheets-progress'
  const [importSelectedBackup, setImportSelectedBackup] = useState(null);
  const [saveLocalBackupLoading, setSaveLocalBackupLoading] = useState(false);
  const [saveLocalBackupSuccess, setSaveLocalBackupSuccess] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());

  // Computed colors
  const saveLocalBackupColor = saveLocalBackupSuccess ? '#4caf50' : colors.text;

  // Animation values
  const settingsAnim = useRef(new Animated.Value(0)).current;
  const subPanelAnim = useRef(new Animated.Value(0)).current;
  const importPickInProgress = useRef(false);
  const toggleAnim = useRef(new Animated.Value(hideBalances ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: hideBalances ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [hideBalances, toggleAnim]);

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
    if (panel === 'import') {
      setImportStep('source');
      setImportSelectedBackup(null);
      loadStoredBackups();
    }
    if (panel === 'export') {
      setExportStep('list');
    }
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
      setUpdateResult(null);
      setImportStep('source');
      setImportSelectedBackup(null);
      setSaveLocalBackupLoading(false);
      setSaveLocalBackupSuccess(false);
      setExportStep('list');
      setSheetsSteps(SHEETS_STEPS.map(s => ({ ...s, status: 'pending' })));
      setSheetsSuccessUrl(null);
      setSheetsError(null);
      setSheetsImportSteps(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
      setSheetsImportError(null);
      setDownloadedApks([]);
    });
  }, [settingsAnim, subPanelAnim]);

  // Signal parent SimpleTabs when a subpanel is open so it can disable tab swiping
  useEffect(() => {
    setSubPanelActive(activeSubPanel !== null);
  }, [activeSubPanel, setSubPanelActive]);

  // Swipe right to close the active subpanel (mirrors Android back gesture)
  const swipeBackGesture = useMemo(() =>
    Gesture.Pan()
      .enabled(activeSubPanel !== null)
      .activeOffsetX([30, 9999])
      .failOffsetY([-15, 15])
      .onEnd((event) => {
        'worklet';
        if (event.translationX > 50 || event.velocityX > 500) {
          runOnJS(closeSubPanel)();
        }
      }),
  [activeSubPanel, closeSubPanel],
  );

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
    try {
      await exportBackup(format);
      // share sheet is user feedback; stay on subpanel so cancel returns here
    } catch (error) {
      console.error('Export backup error:', error);
      showDialog(
        t('error') || 'Error',
        t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    }
  }, [t, showDialog]);

  const updateSheetsStep = useCallback((stepId, status) => {
    setSheetsSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  }, []);

  const handleGoogleSheetsExport = useCallback(async () => {
    setSheetsSteps(SHEETS_STEPS.map(s => ({ ...s, status: 'pending' })));
    setSheetsSuccessUrl(null);
    setSheetsError(null);
    setExportStep('sheets-progress');
    try {
      updateSheetsStep('auth', 'in_progress');
      let accessToken;
      try {
        accessToken = await getValidAccessToken();
      } catch (authError) {
        if (authError.message === 'refresh_failed') throw authError;
        accessToken = await googleSignIn();
      }
      updateSheetsStep('auth', 'completed');

      updateSheetsStep('backup', 'in_progress');
      const backup = await createBackup();
      updateSheetsStep('backup', 'completed');

      const sheetUrl = await exportToSheets(accessToken, backup, ({ step, status }) => {
        updateSheetsStep(step, status);
      });

      updateSheetsStep('complete', 'completed');
      setSheetsSuccessUrl(sheetUrl);
    } catch (error) {
      if (error.message === 'sign_in_cancelled') {
        setExportStep('list');
        return;
      }
      setSheetsSteps(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
      let errorMsg;
      if (error.message === 'refresh_failed') {
        errorMsg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
      } else if (error.message === 'auth_failed') {
        errorMsg = t('google_sheets_signin_failed') || 'Google sign-in failed. Please try again.';
      } else if (error.message === 'quota_exceeded') {
        errorMsg = t('google_sheets_quota_exceeded') || 'Google Sheets quota exceeded. Try again later.';
      } else if (error.message === 'Network request failed') {
        errorMsg = t('google_sheets_no_network') || 'Export failed: no internet connection.';
      } else {
        errorMsg = t('google_sheets_export_failed') || 'Export failed. Please try again.';
      }
      setSheetsError(errorMsg);
    }
  }, [updateSheetsStep, t]);

  const handleExportBack = useCallback(() => {
    if (exportStep === 'sheets-progress') {
      const isInProgress = sheetsSteps.some(s => s.status === 'in_progress');
      if (isInProgress) return;
      setExportStep('list');
      setSheetsSteps(SHEETS_STEPS.map(s => ({ ...s, status: 'pending' })));
      setSheetsSuccessUrl(null);
      setSheetsError(null);
    } else {
      closeSubPanel();
    }
  }, [exportStep, sheetsSteps, closeSubPanel]);

  const confirmResetDatabase = useCallback(async () => {
    closeSubPanel();
    try {
      await resetDatabase();
    } catch (error) {
      // Error already handled in resetDatabase
    }
  }, [closeSubPanel, resetDatabase]);

  // Note: reloadApp removed because it was unused. Use expo-updates directly where needed.

  const confirmImportBackup = useCallback(async () => {
    if (importPickInProgress.current) return;
    importPickInProgress.current = true;

    // Phase 1: pick file while settings screen is still open (cancel returns to source picker)
    let fileInfo;
    try {
      fileInfo = await pickImportFile();
    } catch (error) {
      importPickInProgress.current = false;
      if (error.message === 'Import cancelled') {
        console.info('[Import] User cancelled file selection');
        setImportStep('source');
        return;
      }
      console.error('Import file pick error:', error);
      showDialog(t('error') || 'Error', error.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
      return;
    }

    importPickInProgress.current = false;

    // Phase 2: file confirmed — close subpanel, then show progress panel on top
    closeSubPanel();
    startImport();
    try {
      await importBackupFromFile(fileInfo);
      completeImport();
    } catch (error) {
      cancelImport();
      console.error('Import backup error:', error);
      showDialog(t('error') || 'Error', error.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
    }
  }, [closeSubPanel, startImport, completeImport, cancelImport, t, showDialog]);

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
      const [regularUris, snapshotUris] = await Promise.all([
        getStoredBackups(),
        getPreRestoreSnapshots(),
      ]);
      const allUris = [...regularUris.reverse(), ...snapshotUris];
      const infos = await Promise.all(
        allUris.map(async (uri) => {
          const filename = uri.split('/').pop();
          const info = await LegacyFileSystem.getInfoAsync(uri);
          return { uri, filename, size: info.size || 0 };
        }),
      );
      setStoredBackups(infos);
    } catch (error) {
      console.error('Failed to load stored backups:', error);
      setStoredBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const handleImportSourceSelect = useCallback((source) => {
    if (source === 'file') {
      setImportStep('confirm-file');
    } else if (source === 'local') {
      setImportStep('local-list');
    } else if (source === 'cloud') {
      setImportStep('cloud');
    }
  }, []);

  const handleGoogleSheetsImport = useCallback(async () => {
    setSheetsImportError(null);

    const spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
    if (!spreadsheetId) {
      setSheetsImportError(t('google_sheets_not_configured') || 'Export to Google Sheets first to set up your spreadsheet.');
      return;
    }

    setSheetsImportSteps(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
    setImportStep('sheets-progress');

    let backup;
    try {
      let accessToken;
      try {
        accessToken = await getValidAccessToken();
      } catch {
        accessToken = await googleSignIn();
      }
      backup = await importFromSheets(accessToken, ({ step, status }) => {
        setSheetsImportSteps(prev => prev.map(s => s.id === step ? { ...s, status } : s));
      });
    } catch (error) {
      if (error.message === 'sign_in_cancelled') {
        setImportStep('source');
        return;
      }
      if (error.message === 'no_spreadsheet_configured') {
        setImportStep('source');
        setSheetsImportError(t('google_sheets_not_configured') || 'Export to Google Sheets first to set up your spreadsheet.');
        return;
      }
      let msg;
      if (error.message === 'refresh_failed') msg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
      else if (error.message === 'spreadsheet_not_found') msg = t('google_sheets_not_found') || 'Spreadsheet not found. Try exporting first.';
      else msg = t('google_sheets_import_failed') || 'Import failed. Please try again.';
      setSheetsImportSteps(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
      setSheetsImportError(msg);
      return;
    }

    closeSubPanel();
    startImport();
    try {
      await restoreBackup(backup);
      completeImport();
    } catch (restoreError) {
      cancelImport();
      console.error('[SheetsImport] restore error:', restoreError);
    }
  }, [t, closeSubPanel, startImport, completeImport, cancelImport]);

  const handleImportLocalBackupSelect = useCallback((item) => {
    setImportSelectedBackup(item);
    setImportStep('confirm-local');
  }, []);

  const handleImportBack = useCallback(() => {
    if (importStep === 'source') {
      closeSubPanel();
    } else if (importStep === 'local-list') {
      setImportStep('source');
    } else if (importStep === 'confirm-file') {
      setImportStep('source');
    } else if (importStep === 'confirm-local') {
      setImportStep('local-list');
      setImportSelectedBackup(null);
    } else if (importStep === 'sheets-progress') {
      setImportStep('source');
      setSheetsImportError(null);
    }
  }, [importStep, closeSubPanel]);

  const confirmRestoreLocalBackup = useCallback(async () => {
    if (!importSelectedBackup) return;
    closeSubPanel();
    startImport();
    try {
      const content = await LegacyFileSystem.readAsStringAsync(importSelectedBackup.uri);
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
  }, [importSelectedBackup, closeSubPanel, startImport, completeImport, cancelImport, t, showDialog]);

  const handleSaveLocalBackup = useCallback(async () => {
    setSaveLocalBackupLoading(true);
    try {
      const backup = await createBackup();
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `manual_${dateStr}_${timeStr}.json`;
      const dirInfo = await LegacyFileSystem.getInfoAsync(DAILY_BACKUP_DIR);
      if (!dirInfo.exists) {
        await LegacyFileSystem.makeDirectoryAsync(DAILY_BACKUP_DIR, { intermediates: true });
      }
      const fileUri = `${DAILY_BACKUP_DIR}${filename}`;
      await LegacyFileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup));
      setSaveLocalBackupLoading(false);
      setSaveLocalBackupSuccess(true);
    } catch (error) {
      console.error('Save local backup error:', error);
      setSaveLocalBackupLoading(false);
      showDialog(
        t('error') || 'Error',
        t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    }
  }, [t, showDialog]);

  const handleDeleteLocalBackup = useCallback((uri) => {
    setPendingDeleteUri(uri);
  }, []);

  const handleConfirmDeleteLocalBackup = useCallback(async (uri) => {
    setPendingDeleteUri(null);
    try {
      await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
      setStoredBackups(prev => prev.filter(b => b.uri !== uri));
    } catch (error) {
      console.error('Failed to delete backup:', error);
    }
  }, []);

  const loadDownloadedApks = useCallback(async () => {
    const apks = await listDownloadedApks();
    setDownloadedApks(apks);
  }, []);

  const handleInstallApk = useCallback(async (uri) => {
    try {
      await installApk(uri);
    } catch (error) {
      console.error('Failed to install APK:', error);
      showDialog(
        t('error') || 'Error',
        t('update_download_failed') || 'Could not install the APK. The file may have been removed.',
        [{ text: t('ok') || 'OK' }],
      );
    }
  }, [showDialog, t]);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateResult(null);
    setIsCheckingUpdate(true);
    openSubPanel('update');
    loadDownloadedApks();
    try {
      const result = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

      if (!result.success) {
        setUpdateResult({ type: 'error', errorCode: result.errorCode });
      } else if (!result.isUpdateAvailable) {
        setUpdateResult({
          type: 'up_to_date',
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
        });
      } else {
        const alreadyDownloadedUri = await checkAlreadyDownloaded(result.downloadUrl);
        setUpdateResult({
          type: 'available',
          latestVersion: result.latestVersion,
          currentVersion: result.currentVersion,
          downloadUrl: result.downloadUrl,
          checksumUrl: result.checksumUrl || null,
          releaseNotes: result.releaseNotes || null,
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
          alreadyDownloaded: !!alreadyDownloadedUri,
          localUri: alreadyDownloadedUri,
        });
      }
    } catch (error) {
      console.error('Manual update check failed:', error);
      setUpdateResult({ type: 'error', errorCode: null });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [openSubPanel, loadDownloadedApks]);

  const handleUpdateFromSettings = useCallback(async (downloadUrl, checksumUrl) => {
    if (updateResult) {
      await setPreference(PREF_KEYS.UPDATE_LAST_PROMPTED_VERSION, updateResult.latestVersion);
    }
    closeSubPanel();
    startDownload(downloadUrl, {
      checksumUrl: checksumUrl || null,
      onError: () => {
        showDialog(
          t('error') || 'Error',
          t('update_download_failed') || 'Could not download the update. Please try again.',
          [{ text: t('ok') || 'OK' }],
        );
      },
    });
  }, [updateResult, closeSubPanel, startDownload, showDialog, t]);

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
    if (filename.startsWith('manual_')) {
      const inner = filename.replace('manual_', '').replace('.json', '');
      const [datePart, timePart] = inner.split('_');
      if (datePart) {
        const [year, month, day] = datePart.split('-').map(Number);
        const dateLabel = new Date(year, month - 1, day).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        });
        if (timePart) {
          const [hh, mm] = timePart.split('-');
          return `${dateLabel} · ${hh}:${mm}`;
        }
        return dateLabel;
      }
    }
    return filename;
  }, [t]);

  const renderBackupItem = useCallback(({ item }) => {
    const isDaily = item.filename.startsWith('daily_');
    const isManual = item.filename.startsWith('manual_');
    const label = formatBackupLabel(item.filename);
    const typeLabel = isDaily ? 'Daily' : isManual ? 'Manual' : (t('weekly') || 'Weekly');
    const sizeKB = item.size ? `${(item.size / 1024).toFixed(1)} KB` : '';
    const isPending = pendingDeleteUri === item.uri;
    return (
      <View style={[styles.backupItem, { borderBottomColor: colors.border }]}>
        <View style={styles.backupItemLeft}>
          <Ionicons name={isDaily ? 'calendar-outline' : isManual ? 'save-outline' : 'calendar-number-outline'} size={22} color={isPending ? colors.mutedText : colors.text} />
          <View style={styles.backupItemText}>
            <Text style={[styles.backupItemLabel, { color: isPending ? colors.mutedText : colors.text }]}>{label}</Text>
            <Text style={[styles.backupItemMeta, { color: colors.mutedText }]}>
              {isPending ? (t('delete_backup_confirm') || 'Delete this backup?') : `${typeLabel}${sizeKB ? ` · ${sizeKB}` : ''}`}
            </Text>
          </View>
        </View>
        <View style={styles.backupItemActions}>
          {isPending ? (
            <>
              <TouchableOpacity onPress={() => setPendingDeleteUri(null)} style={styles.backupConfirmButton}>
                <Text style={[styles.backupConfirmButtonText, { color: colors.mutedText }]}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleConfirmDeleteLocalBackup(item.uri)} style={styles.backupConfirmButton}>
                <Text style={styles.backupConfirmButtonDestructiveText}>{t('delete') || 'Delete'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => handleImportLocalBackupSelect(item)} style={styles.backupActionButton}>
                <Ionicons name="refresh-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteLocalBackup(item.uri)} style={styles.backupActionButton}>
                <Ionicons name="trash-outline" size={18} color="#c44" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }, [colors, t, formatBackupLabel, handleImportLocalBackupSelect, handleDeleteLocalBackup, handleConfirmDeleteLocalBackup, pendingDeleteUri]);

  const toggleLogExpand = useCallback((id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderLogEntry = useCallback(({ item }) => {
    const isExpanded = expandedLogIds.has(item.id);
    return (
      <TouchableOpacity
        onPress={() => toggleLogExpand(item.id)}
        onLongPress={() => Clipboard.setStringAsync(`${item.timestamp} [${item.level.toUpperCase()}] ${item.message}`)}
        activeOpacity={0.7}
        style={styles.logEntry}
      >
        <Text style={[styles.logTimestamp, { color: colors.mutedText }]}>
          {item.timestamp.substring(11, 19)}
        </Text>
        <Text style={[styles.logLevel, { color: LOG_LEVEL_COLORS[item.level] }]}>
          {item.level.toUpperCase()}
        </Text>
        <Text style={[styles.logMessage, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 3}>
          {item.message}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, expandedLogIds, toggleLogExpand]);


  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.View style={[
          styles.content,
          {
            transform: [{ translateX: settingsTranslateX }],
            opacity: settingsOpacity,
          },
        ]}>

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
              <View style={styles.updateRowRight}>
                <Text style={[styles.versionLabel, { color: colors.mutedText }]}>
                  {`v${require('../../package.json').version}`}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </View>
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
            { backgroundColor: colors.background },
            {
              transform: [{ translateX: subPanelTranslateX }],
              opacity: subPanelOpacity,
            },
          ]}>
            <View style={styles.languageModalHeader}>
              <TouchableOpacity
                onPress={
                  activeSubPanel === 'import' ? handleImportBack :
                    activeSubPanel === 'export' ? handleExportBack :
                      closeSubPanel
                }
                style={styles.backButton}
                testID="settings-subpanel-back"
                disabled={
                  (activeSubPanel === 'export' && exportStep === 'sheets-progress' && sheetsSteps.some(s => s.status === 'in_progress')) ||
                  (activeSubPanel === 'import' && importStep === 'sheets-progress' && sheetsImportSteps.some(s => s.status === 'in_progress'))
                }
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text variant="titleLarge" style={[styles.languageModalTitle, { color: colors.text }]}>
                {activeSubPanel === 'language' && t('language')}
                {activeSubPanel === 'export' && (
                  exportStep === 'sheets-progress'
                    ? 'Google Sheets'
                    : (t('export_format') || 'Export Format')
                )}
                {activeSubPanel === 'import' && (
                  importStep === 'source'
                    ? (t('import') || 'Import')
                    : importStep === 'sheets-progress'
                      ? (t('google_sheets_import') || 'Import from Sheets')
                      : importStep === 'local-list'
                        ? (t('local_backups') || 'Local Backups')
                        : (t('restore_database') || 'Restore Database')
                )}
                {activeSubPanel === 'logs' && (t('logs') || 'Logs')}
                {activeSubPanel === 'update' && (
                  isCheckingUpdate
                    ? (t('check_updates') || 'Check for updates')
                    : updateResult?.type === 'available'
                      ? (t('update_available_title') || 'Update available')
                      : (t('check_updates') || 'Check for updates')
                )}
                {activeSubPanel === 'reset' && (t('reset_database') || 'Reset Database')}
              </Text>
              {activeSubPanel === 'import' && importStep === 'local-list' ? (
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

            {activeSubPanel === 'export' && exportStep === 'list' && (
              <ScrollView style={styles.languageList}>
                <TouchableRipple
                  onPress={saveLocalBackupSuccess ? null : handleSaveLocalBackup}
                  style={styles.languageItem}
                  disabled={saveLocalBackupLoading || saveLocalBackupSuccess}
                  testID="settings-export-save-local-backup"
                >
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons
                        name="archive-outline"
                        size={24}
                        color={saveLocalBackupColor}
                      />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: saveLocalBackupColor }]}>
                          {t('save_local_backup') || 'Save local backup'}
                        </Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {saveLocalBackupLoading
                            ? (t('save_local_backup_saving') || 'Saving…')
                            : saveLocalBackupSuccess
                              ? (t('save_local_backup_success') || 'Backup saved')
                              : (t('save_local_backup_description') || 'Save a backup to device storage and share')}
                        </Text>
                      </View>
                    </View>
                    {saveLocalBackupLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : saveLocalBackupSuccess ? (
                      <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                    )}
                  </View>
                </TouchableRipple>

                <TouchableRipple
                  onPress={handleGoogleSheetsExport}
                  style={styles.languageItem}
                  testID="settings-export-google-sheets"
                >
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons name="logo-google" size={24} color={colors.text} />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: colors.text }]}>
                          Google Sheets
                        </Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('google_sheets_description') || 'Export to a Google Sheets spreadsheet'}
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
                        <Text style={[styles.languageItemText, { color: colors.text }]}>Save externally to SQLite</Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('sqlite_description') || 'Raw database file, complete backup'}
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
                        <Text style={[styles.languageItemText, { color: colors.text }]}>Save externally to CSV</Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('csv_description') || 'Plain text format, easy to edit'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  </View>
                </TouchableRipple>

                <TouchableRipple onPress={() => handleExportFormatSelect('json')} style={styles.languageItem}>
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons name="code-outline" size={24} color={colors.text} />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: colors.text }]}>Save externally to JSON</Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('json_description') || 'Standard format, compatible with all versions'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  </View>
                </TouchableRipple>
              </ScrollView>
            )}

            {activeSubPanel === 'export' && exportStep === 'sheets-progress' && (
              <View style={styles.sheetsProgressContent}>
                {sheetsSteps.map(step => (
                  <View key={step.id} style={styles.sheetsProgressStep}>
                    <View style={styles.sheetsProgressStepIcon}>
                      {step.status === 'pending' && (
                        <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />
                      )}
                      {step.status === 'in_progress' && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                      {step.status === 'completed' && (
                        <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                      )}
                      {step.status === 'error' && (
                        <Ionicons name="close-circle" size={22} color="#c44" />
                      )}
                    </View>
                    <Text style={[
                      styles.sheetsProgressStepLabel,
                      step.status === 'error' ? styles.sheetsProgressStepLabelError :
                        { color: step.status === 'pending' ? colors.mutedText : colors.text },
                    ]}>
                      {step.label}
                    </Text>
                  </View>
                ))}

                {sheetsError && (
                  <Text style={styles.sheetsErrorText}>{sheetsError}</Text>
                )}

                {sheetsSuccessUrl && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(sheetsSuccessUrl)}
                    style={[styles.sheetsOpenButton, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="open-outline" size={16} color="#fff" />
                    <Text style={styles.sheetsOpenButtonText}>
                      {t('google_sheets_open') || 'Open in Google Sheets'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
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

            {activeSubPanel === 'import' && importStep === 'source' && (
              <ScrollView style={styles.languageList}>
                <TouchableRipple onPress={() => handleImportSourceSelect('file')} style={styles.languageItem}>
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons name="logo-google" size={24} color={colors.text} />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: colors.text }]}>
                          {t('import_from_file') || 'From Google Drive'}
                        </Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('import_from_file_description') || 'Pick a backup file from Google Drive'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  </View>
                </TouchableRipple>

                <TouchableRipple onPress={() => handleImportSourceSelect('local')} style={styles.languageItem}>
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons name="archive-outline" size={24} color={colors.text} />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: colors.text }]}>
                          {t('import_from_local') || 'From local backup'}
                        </Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('import_from_local_description') || 'Restore from a daily or weekly automatic backup'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  </View>
                </TouchableRipple>

                <TouchableRipple
                  onPress={handleGoogleSheetsImport}
                  style={styles.languageItem}
                  testID="settings-import-google-sheets"
                >
                  <View style={styles.languageItemContent}>
                    <View style={styles.formatItemRow}>
                      <Ionicons name="logo-google" size={24} color={colors.text} />
                      <View style={styles.formatTextContainer}>
                        <Text style={[styles.languageItemText, { color: colors.text }]}>
                          {t('import_from_google_sheets') || 'From Google Sheets'}
                        </Text>
                        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                          {t('import_from_google_sheets_description') || 'Import from your Penny spreadsheet'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  </View>
                </TouchableRipple>
                {sheetsImportError && importStep === 'source' && (
                  <Text
                    testID="settings-import-no-spreadsheet"
                    style={styles.sheetsImportErrorInline}
                  >
                    {sheetsImportError}
                  </Text>
                )}
              </ScrollView>
            )}

            {activeSubPanel === 'import' && importStep === 'local-list' && (
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

            {activeSubPanel === 'import' && importStep === 'confirm-file' && (
              <View style={styles.importConfirmContent}>
                <Ionicons name="warning-outline" size={48} color="#c44" style={styles.importWarningIcon} />
                <Text style={[styles.importConfirmText, { color: colors.text }]}>
                  {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
                </Text>
                <TouchableRipple testID="confirm-import-file-btn" onPress={confirmImportBackup} style={styles.importConfirmButtonDestructive}>
                  <Text style={styles.importConfirmButtonText}>
                    {t('restore_database') || 'Restore'}
                  </Text>
                </TouchableRipple>
              </View>
            )}

            {activeSubPanel === 'import' && importStep === 'confirm-local' && (
              <View style={styles.importConfirmContent}>
                <Ionicons name="warning-outline" size={48} color="#c44" style={styles.importWarningIcon} />
                {importSelectedBackup && (
                  <Text style={[styles.importConfirmText, { color: colors.mutedText }]}>
                    {formatBackupLabel(importSelectedBackup.filename)}
                  </Text>
                )}
                <Text style={[styles.importConfirmText, { color: colors.text }]}>
                  {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
                </Text>
                <TouchableRipple onPress={confirmRestoreLocalBackup} style={styles.importConfirmButtonDestructive}>
                  <Text style={styles.importConfirmButtonText}>
                    {t('restore_database') || 'Restore'}
                  </Text>
                </TouchableRipple>
              </View>
            )}

            {activeSubPanel === 'import' && importStep === 'sheets-progress' && (
              <View style={styles.sheetsProgressContent}>
                {sheetsImportSteps.map(step => (
                  <View key={step.id} style={styles.sheetsProgressStep}>
                    <View style={styles.sheetsProgressStepIcon}>
                      {step.status === 'pending' && (
                        <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />
                      )}
                      {step.status === 'in_progress' && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                      {step.status === 'completed' && (
                        <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                      )}
                      {step.status === 'error' && (
                        <Ionicons name="close-circle" size={22} color="#c44" />
                      )}
                    </View>
                    <Text style={[
                      styles.sheetsProgressStepLabel,
                      step.status === 'error' ? styles.sheetsProgressStepLabelError :
                        { color: step.status === 'pending' ? colors.mutedText : colors.text },
                    ]}>
                      {step.label}
                    </Text>
                  </View>
                ))}
                {sheetsImportError && (
                  <Text style={styles.sheetsErrorText}>{sheetsImportError}</Text>
                )}
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
              <View style={styles.updatePanelWrapper}>
                <UpdateContentPanel
                  isChecking={isCheckingUpdate}
                  updateResult={updateResult}
                  downloadedApks={downloadedApks}
                  onUpdate={handleUpdateFromSettings}
                  onInstallApk={handleInstallApk}
                />
              </View>
            )}

          </Animated.View>
        )}
      </View>
    </GestureDetector>
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
  backupConfirmButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backupConfirmButtonDestructiveText: {
    color: '#c44',
    fontSize: 14,
    fontWeight: '600',
  },
  backupConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    paddingBottom: 96,
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
  sheetsErrorText: {
    color: '#c44',
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  sheetsImportErrorInline: {
    color: '#c44',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  sheetsOpenButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  sheetsOpenButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetsProgressContent: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.lg,
  },
  sheetsProgressStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  sheetsProgressStepIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
  },
  sheetsProgressStepLabel: {
    flex: 1,
    fontSize: 15,
  },
  sheetsProgressStepLabelError: {
    color: '#c44',
  },
  subPanelContent: {
    bottom: 0,
    left: 0,
    paddingBottom: 96,
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
  updatePanelWrapper: {
    flex: 1,
  },
  updateRowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  versionLabel: {
    fontSize: 13,
  },
});

SettingsScreen.propTypes = {
  setSubPanelActive: PropTypes.func.isRequired,
};
