import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, ScrollView, FlatList, Linking, ActivityIndicator, BackHandler, LayoutAnimation } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { Text, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useBackShrink } from '../hooks/useBackShrink';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, pickImportFile, importBackupFromFile, restoreBackup, createBackup, getPreRestoreSnapshots, CancelledImportError } from '../services/BackupRestore';
import { getStoredBackups, DAILY_BACKUP_DIR } from '../services/DailyBackupService';
import { useLogEntries } from '../hooks/useLogEntries';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkForAppUpdate, listDownloadedApks, installApk, checkAlreadyDownloaded } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS, getDefaultAccountId, setDefaultAccountId } from '../services/PreferencesDB';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { authenticateWithBiometrics, BiometricResult } from '../services/BiometricService';
import { getValidAccessToken, signIn as googleSignIn, exportToSheets, importFromSheets } from '../services/GoogleSheetsService';
import UpdateContentPanel from '../components/UpdateContentPanel';
import AccountsScreen from './AccountsScreen';
import { useAccountsData } from '../contexts/AccountsDataContext';
import CategoriesScreen from './CategoriesScreen';

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

const SPRING_CONFIG = { mass: 1, damping: 20, stiffness: 200 };


export default function SettingsScreen({ setSubPanelActive }) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const { colorScheme, setTheme } = useThemeConfig();
  const { t, language, setLanguage, availableLanguages } = useLocalization();
  const { hideBalances, setHideBalances } = useDisplaySettings();
  const { showDialog } = useDialog();
  const { resetDatabase } = useAccountsActions();
  const { startImport, cancelImport, completeImport, getCancelToken } = useImportProgress();
  const { startDownload, isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();
  const { visibleAccounts } = useAccountsData();
  const [activeSubPanel, setActiveSubPanel] = useState(null);
  const [pinnedAccountId, setPinnedAccountId] = useState(null);
  const [logFilter, setLogFilter] = useState('all');
  const [storedBackups, setStoredBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [pendingDeleteUri, setPendingDeleteUri] = useState(null);
  const [exportStep, setExportStep] = useState('list');
  const [sheetsSteps, setSheetsSteps] = useState(SHEETS_STEPS.map(s => ({ ...s, status: 'pending' })));
  const [sheetsSuccessUrl, setSheetsSuccessUrl] = useState(null);
  const [sheetsError, setSheetsError] = useState(null);
  const [sheetsImportSteps, setSheetsImportSteps] = useState(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
  const [sheetsImportError, setSheetsImportError] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [downloadedApks, setDownloadedApks] = useState([]);
  const [importStep, setImportStep] = useState('source');
  const [importSelectedBackup, setImportSelectedBackup] = useState(null);
  const [saveLocalBackupLoading, setSaveLocalBackupLoading] = useState(false);
  const [saveLocalBackupSuccess, setSaveLocalBackupSuccess] = useState(false);
  const [sheetsExportSuccess, setSheetsExportSuccess] = useState(false);
  const [sqliteExportLoading, setSqliteExportLoading] = useState(false);
  const [sqliteExportSuccess, setSqliteExportSuccess] = useState(false);
  const [csvExportLoading, setCsvExportLoading] = useState(false);
  const [csvExportSuccess, setCsvExportSuccess] = useState(false);
  const [jsonExportLoading, setJsonExportLoading] = useState(false);
  const [jsonExportSuccess, setJsonExportSuccess] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());

  const saveLocalBackupColor = saveLocalBackupSuccess ? '#4caf50' : colors.text;
  const sheetsColor = sheetsExportSuccess ? '#4caf50' : colors.text;
  const sqliteColor = sqliteExportSuccess ? '#4caf50' : colors.text;
  const csvColor = csvExportSuccess ? '#4caf50' : colors.text;
  const jsonColor = jsonExportSuccess ? '#4caf50' : colors.text;
  const defaultAccountName = pinnedAccountId
    ? (visibleAccounts.find(a => a.id === pinnedAccountId)?.name ?? t('latest_used'))
    : t('latest_used');

  // Toggle animations using reanimated shared values
  const toggleProgress = useSharedValue(hideBalances ? 1 : 0);
  useEffect(() => {
    toggleProgress.value = withSpring(hideBalances ? 1 : 0, SPRING_CONFIG);
  }, [hideBalances, toggleProgress]);

  const toggleThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + toggleProgress.value * 20 }],
  }));

  const themeToggleProgress = useSharedValue(colorScheme === 'dark' ? 1 : 0);
  useEffect(() => {
    themeToggleProgress.value = withSpring(colorScheme === 'dark' ? 1 : 0, SPRING_CONFIG);
  }, [colorScheme, themeToggleProgress]);

  const themeToggleThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + themeToggleProgress.value * 20 }],
  }));

  const handleToggleDarkMode = useCallback(() => {
    setTheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setTheme]);

  const { entries, clearLogs, getExportText } = useLogEntries(logFilter);
  const importPickInProgress = useRef(false);

  const handleToggleHideBalances = useCallback(async () => {
    if (!hideBalances) {
      setHideBalances(true);
      return;
    }
    const result = await authenticateWithBiometrics(t('biometric_prompt') || 'Authenticate to show balances');
    if (result === BiometricResult.SUCCESS) {
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_AVAILABLE) {
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_ENROLLED) {
      setHideBalances(false);
    } else if (result === BiometricResult.FAILED) {
      showDialog(
        t('error') || 'Error',
        t('biometric_failed') || 'Authentication failed',
        [{ text: t('ok') || 'OK' }],
      );
    }
  }, [hideBalances, setHideBalances, t, showDialog]);

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

  // Telegram-style predictive "back" shrink for the active subpanel.
  const {
    animatedStyle: shrinkStyle,
    originStyle: shrinkOrigin,
    reset: resetShrink,
    commit: commitShrink,
  } = useBackShrink();

  const openSubPanel = useCallback((panel) => {
    if (panel === 'import') {
      setImportStep('source');
      setImportSelectedBackup(null);
      loadStoredBackups();
    }
    if (panel === 'export') {
      setExportStep('list');
    }
    resetShrink();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveSubPanel(panel);
  }, [loadStoredBackups, resetShrink]);

  const closeSubPanel = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
  }, []);

  // Back-gesture close: play the Telegram-style shrink, then dismiss the panel.
  const closeWithShrink = useCallback(() => {
    commitShrink(closeSubPanel);
  }, [commitShrink, closeSubPanel]);

  useEffect(() => {
    getDefaultAccountId().then(id => setPinnedAccountId(id));
  }, []);

  const handleDefaultAccountSelect = useCallback(async (id) => {
    await setDefaultAccountId(id);
    setPinnedAccountId(id);
    closeSubPanel();
  }, [closeSubPanel]);

  useEffect(() => {
    setSubPanelActive(activeSubPanel !== null);
  }, [activeSubPanel, setSubPanelActive]);

  // Android hardware back button closes subpanel
  useEffect(() => {
    if (!activeSubPanel) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeWithShrink();
      return true;
    });
    return () => subscription.remove();
  }, [activeSubPanel, closeWithShrink]);

  const handleLanguageSelect = useCallback((lng) => {
    setLanguage(lng);
    closeSubPanel();
  }, [setLanguage, closeSubPanel]);

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
    const setLoading = format === 'sqlite' ? setSqliteExportLoading : format === 'csv' ? setCsvExportLoading : setJsonExportLoading;
    const setSuccess = format === 'sqlite' ? setSqliteExportSuccess : format === 'csv' ? setCsvExportSuccess : setJsonExportSuccess;
    setLoading(true);
    try {
      await exportBackup(format);
      setSuccess(true);
    } catch (error) {
      console.error('Export backup error:', error);
      showDialog(
        t('error') || 'Error',
        t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
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
      setSheetsExportSuccess(true);
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
      console.error('[Settings] Database reset failed:', error);
      showDialog(t('error') || 'Error', error.message || 'Database reset failed', [{ text: 'OK' }]);
    }
  }, [closeSubPanel, resetDatabase, showDialog, t]);

  const confirmImportBackup = useCallback(async () => {
    if (importPickInProgress.current) return;
    importPickInProgress.current = true;

    let fileInfo;
    try {
      fileInfo = await pickImportFile();
    } catch (error) {
      importPickInProgress.current = false;
      if (error.message === 'Import cancelled') {
        setImportStep('source');
        return;
      }
      console.error('Import file pick error:', error);
      showDialog(t('error') || 'Error', error.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
      return;
    }

    importPickInProgress.current = false;
    closeSubPanel();
    startImport();
    const cancelToken = getCancelToken();
    try {
      await importBackupFromFile(fileInfo, cancelToken);
      completeImport();
    } catch (error) {
      cancelImport();
      if (error instanceof CancelledImportError) return;
      console.error('Import backup error:', error);
      showDialog(t('error') || 'Error', error.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
    }
  }, [closeSubPanel, startImport, completeImport, cancelImport, getCancelToken, t, showDialog]);

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
    const cancelToken = getCancelToken();
    try {
      await restoreBackup(backup, cancelToken);
      completeImport();
    } catch (restoreError) {
      cancelImport();
      if (!(restoreError instanceof CancelledImportError)) {
        console.error('[SheetsImport] restore error:', restoreError);
        showDialog(t('error') || 'Error', restoreError.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
      }
    }
  }, [t, closeSubPanel, startImport, completeImport, cancelImport, getCancelToken, showDialog]);

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
    const cancelToken = getCancelToken();
    try {
      const content = await LegacyFileSystem.readAsStringAsync(importSelectedBackup.uri);
      const backup = JSON.parse(content);
      await restoreBackup(backup, cancelToken);
      completeImport();
    } catch (error) {
      cancelImport();
      if (error instanceof CancelledImportError) return;
      console.error('Local backup restore error:', error);
      showDialog(
        t('error') || 'Error',
        error.message || t('restore_error') || 'Failed to restore backup',
        [{ text: 'OK' }],
      );
    }
  }, [importSelectedBackup, closeSubPanel, startImport, completeImport, cancelImport, getCancelToken, t, showDialog]);

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

  const runUpdateCheck = useCallback(async () => {
    setUpdateResult(null);
    setIsCheckingUpdate(true);
    loadDownloadedApks();
    try {
      const result = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

      if (!result.success) {
        setUpdateResult({
          type: 'error',
          errorCode: result.errorCode,
          releaseNotes: result.releaseNotes || null,
          recentReleaseNotes: result.recentReleaseNotes || null,
          releasesUrl: result.releasesUrl || null,
        });
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
      setUpdateResult({ type: 'error', errorCode: null });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [loadDownloadedApks]);

  const handleCheckForUpdates = useCallback(() => {
    openSubPanel('update');
    runUpdateCheck();
  }, [openSubPanel, runUpdateCheck]);

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

  // ─── Subpanel title resolver ───
  const subPanelTitle = useMemo(() => {
    if (activeSubPanel === 'accounts') return t('accounts') || 'Accounts';
    if (activeSubPanel === 'categories') return t('categories') || 'Categories';
    if (activeSubPanel === 'defaultAccount') return t('default_account') || 'Default Account';
    if (activeSubPanel === 'language') return t('language');
    if (activeSubPanel === 'export') {
      return exportStep === 'sheets-progress' ? 'Google Sheets' : (t('export_format') || 'Export Format');
    }
    if (activeSubPanel === 'import') {
      if (importStep === 'source') return t('import') || 'Import';
      if (importStep === 'sheets-progress') return t('google_sheets_import') || 'Import from Sheets';
      if (importStep === 'local-list') return t('local_backups') || 'Local Backups';
      return t('restore_database') || 'Restore Database';
    }
    if (activeSubPanel === 'logs') return t('logs') || 'Logs';
    if (activeSubPanel === 'update') {
      if (isCheckingUpdate) return t('check_updates') || 'Check for updates';
      if (updateResult?.type === 'available') return t('update_available_title') || 'Update available';
      return t('check_updates') || 'Check for updates';
    }
    if (activeSubPanel === 'reset') return t('reset_database') || 'Reset Database';
    return '';
  }, [activeSubPanel, exportStep, importStep, isCheckingUpdate, updateResult, t]);

  const handleSubPanelBack = useMemo(() => {
    if (activeSubPanel === 'import') return handleImportBack;
    if (activeSubPanel === 'export') return handleExportBack;
    return closeWithShrink;
  }, [activeSubPanel, handleImportBack, handleExportBack, closeWithShrink]);

  const isBackDisabled = useMemo(() => {
    if (activeSubPanel === 'export' && exportStep === 'sheets-progress') {
      return sheetsSteps.some(s => s.status === 'in_progress');
    }
    if (activeSubPanel === 'import' && importStep === 'sheets-progress') {
      return sheetsImportSteps.some(s => s.status === 'in_progress');
    }
    return false;
  }, [activeSubPanel, exportStep, importStep, sheetsSteps, sheetsImportSteps]);


  // ─── RENDER ───
  if (activeSubPanel !== null) {
    return (
      <Animated.View
        style={[styles.container, styles.subPanelShrink, { backgroundColor: colors.background }, shrinkOrigin, shrinkStyle]}
      >
        {/* Subpanel header */}
        <View style={styles.subPanelHeader}>
          <TouchableOpacity
            onPress={handleSubPanelBack}
            style={styles.backButton}
            testID="settings-subpanel-back"
            disabled={isBackDisabled}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text variant="titleLarge" style={[styles.subPanelTitle, { color: colors.text }]}>
            {subPanelTitle}
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

        {/* Subpanel body */}
        <View style={[
          styles.subPanelBody,
          (activeSubPanel === 'accounts' || activeSubPanel === 'categories') && styles.subPanelBodyFlush,
          !(activeSubPanel === 'accounts' || activeSubPanel === 'categories') && { paddingBottom: insets.bottom + 80 },
        ]}>
          {activeSubPanel === 'accounts' && <AccountsScreen />}
          {activeSubPanel === 'categories' && <CategoriesScreen />}

          {activeSubPanel === 'defaultAccount' && (
            <ScrollView
              style={styles.listContainer}
              testID="settings-default-account-panel"
            >
              <TouchableRipple
                onPress={() => handleDefaultAccountSelect(null)}
                style={styles.listItem}
                testID="default-account-option-null"
              >
                <View style={styles.listItemContent}>
                  <Text style={[styles.listItemText, { color: colors.text }]}>{t('latest_used')}</Text>
                  {pinnedAccountId === null && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </View>
              </TouchableRipple>
              {visibleAccounts.map(acc => (
                <TouchableRipple
                  key={acc.id}
                  onPress={() => handleDefaultAccountSelect(acc.id)}
                  style={styles.listItem}
                  testID={`default-account-option-${acc.id}`}
                >
                  <View style={styles.listItemContent}>
                    <Text style={[styles.listItemText, { color: colors.text }]}>{acc.name}</Text>
                    {pinnedAccountId === acc.id && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </View>
                </TouchableRipple>
              ))}
            </ScrollView>
          )}

          {activeSubPanel === 'language' && (
            <ScrollView style={styles.listContainer}>
              {availableLanguages.map(lng => (
                <TouchableRipple
                  key={lng}
                  onPress={() => handleLanguageSelect(lng)}
                  style={styles.listItem}
                >
                  <View style={styles.listItemContent}>
                    <Text style={[styles.listItemText, { color: colors.text }]}>
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
            <ScrollView style={styles.listContainer}>
              <TouchableRipple
                onPress={saveLocalBackupSuccess ? null : handleSaveLocalBackup}
                style={styles.listItem}
                disabled={saveLocalBackupLoading || saveLocalBackupSuccess}
                testID="settings-export-save-local-backup"
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="archive-outline" size={24} color={saveLocalBackupColor} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: saveLocalBackupColor }]}>
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
                style={styles.listItem}
                testID="settings-export-google-sheets"
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="logo-google" size={24} color={sheetsColor} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: sheetsColor }]}>Google Sheets</Text>
                      <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                        {sheetsExportSuccess
                          ? (t('export_success') || 'Export complete')
                          : (t('google_sheets_description') || 'Export to a Google Sheets spreadsheet')}
                      </Text>
                    </View>
                  </View>
                  {sheetsExportSuccess ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  )}
                </View>
              </TouchableRipple>

              <TouchableRipple
                onPress={sqliteExportLoading ? null : () => handleExportFormatSelect('sqlite')}
                style={styles.listItem}
                disabled={sqliteExportLoading}
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="server-outline" size={24} color={sqliteColor} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: sqliteColor }]}>Save externally to SQLite</Text>
                      <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                        {sqliteExportLoading
                          ? (t('exporting') || 'Exporting…')
                          : sqliteExportSuccess
                            ? (t('export_success') || 'Export complete')
                            : (t('sqlite_description') || 'Raw database file, complete backup')}
                      </Text>
                    </View>
                  </View>
                  {sqliteExportLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : sqliteExportSuccess ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  )}
                </View>
              </TouchableRipple>

              <TouchableRipple
                onPress={csvExportLoading ? null : () => handleExportFormatSelect('csv')}
                style={styles.listItem}
                disabled={csvExportLoading}
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="document-text-outline" size={24} color={csvColor} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: csvColor }]}>Save externally to CSV</Text>
                      <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                        {csvExportLoading
                          ? (t('exporting') || 'Exporting…')
                          : csvExportSuccess
                            ? (t('export_success') || 'Export complete')
                            : (t('csv_description') || 'Plain text format, easy to edit')}
                      </Text>
                    </View>
                  </View>
                  {csvExportLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : csvExportSuccess ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  )}
                </View>
              </TouchableRipple>

              <TouchableRipple
                onPress={jsonExportLoading ? null : () => handleExportFormatSelect('json')}
                style={styles.listItem}
                disabled={jsonExportLoading}
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="code-outline" size={24} color={jsonColor} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: jsonColor }]}>Save externally to JSON</Text>
                      <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
                        {jsonExportLoading
                          ? (t('exporting') || 'Exporting…')
                          : jsonExportSuccess
                            ? (t('export_success') || 'Export complete')
                            : (t('json_description') || 'Standard format, compatible with all versions')}
                      </Text>
                    </View>
                  </View>
                  {jsonExportLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : jsonExportSuccess ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                  )}
                </View>
              </TouchableRipple>
            </ScrollView>
          )}

          {activeSubPanel === 'export' && exportStep === 'sheets-progress' && (
            <View style={styles.sheetsProgressContent}>
              {sheetsSteps.map(step => (
                <View key={step.id} style={styles.sheetsProgressStep}>
                  <View style={styles.sheetsProgressStepIcon}>
                    {step.status === 'pending' && <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />}
                    {step.status === 'in_progress' && <ActivityIndicator size="small" color={colors.primary} />}
                    {step.status === 'completed' && <Ionicons name="checkmark-circle" size={22} color="#4caf50" />}
                    {step.status === 'error' && <Ionicons name="close-circle" size={22} color="#c44" />}
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
              {sheetsError && <Text style={styles.sheetsErrorText}>{sheetsError}</Text>}
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
            <View style={styles.confirmContent}>
              <Ionicons name="warning-outline" size={48} color="#c44" style={styles.confirmWarningIcon} />
              <Text style={[styles.confirmText, { color: colors.text }]}>
                {t('reset_database_confirm') || 'Are you sure you want to reset the database? This will delete all data and create default accounts.'}
              </Text>
              <TouchableRipple onPress={confirmResetDatabase} style={styles.confirmButtonDestructive}>
                <Text style={styles.confirmButtonText}>{t('reset') || 'Reset'}</Text>
              </TouchableRipple>
            </View>
          )}

          {activeSubPanel === 'import' && importStep === 'source' && (
            <ScrollView style={styles.listContainer}>
              <TouchableRipple onPress={() => handleImportSourceSelect('file')} style={styles.listItem}>
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="logo-google" size={24} color={colors.text} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: colors.text }]}>
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

              <TouchableRipple onPress={() => handleImportSourceSelect('local')} style={styles.listItem}>
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="archive-outline" size={24} color={colors.text} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: colors.text }]}>
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
                style={styles.listItem}
                testID="settings-import-google-sheets"
              >
                <View style={styles.listItemContent}>
                  <View style={styles.formatItemRow}>
                    <Ionicons name="logo-google" size={24} color={colors.text} />
                    <View style={styles.formatTextContainer}>
                      <Text style={[styles.listItemText, { color: colors.text }]}>
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
                <Text testID="settings-import-no-spreadsheet" style={styles.sheetsImportErrorInline}>
                  {sheetsImportError}
                </Text>
              )}
            </ScrollView>
          )}

          {activeSubPanel === 'import' && importStep === 'local-list' && (
            backupsLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>{'Loading...'}</Text>
              </View>
            ) : (
              <FlatList
                data={storedBackups}
                keyExtractor={(item) => item.uri}
                renderItem={renderBackupItem}
                style={styles.flexList}
                contentContainerStyle={storedBackups.length === 0 && styles.emptyContainer}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                    {t('local_backups_empty') || 'No local backups yet'}
                  </Text>
                }
              />
            )
          )}

          {activeSubPanel === 'import' && importStep === 'confirm-file' && (
            <View style={styles.confirmContent}>
              <Ionicons name="warning-outline" size={48} color="#c44" style={styles.confirmWarningIcon} />
              <Text style={[styles.confirmText, { color: colors.text }]}>
                {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
              </Text>
              <TouchableRipple testID="confirm-import-file-btn" onPress={confirmImportBackup} style={styles.confirmButtonDestructive}>
                <Text style={styles.confirmButtonText}>{t('restore_database') || 'Restore'}</Text>
              </TouchableRipple>
            </View>
          )}

          {activeSubPanel === 'import' && importStep === 'confirm-local' && (
            <View style={styles.confirmContent}>
              <Ionicons name="warning-outline" size={48} color="#c44" style={styles.confirmWarningIcon} />
              {importSelectedBackup && (
                <Text style={[styles.confirmText, { color: colors.mutedText }]}>
                  {formatBackupLabel(importSelectedBackup.filename)}
                </Text>
              )}
              <Text style={[styles.confirmText, { color: colors.text }]}>
                {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
              </Text>
              <TouchableRipple onPress={confirmRestoreLocalBackup} style={styles.confirmButtonDestructive}>
                <Text style={styles.confirmButtonText}>{t('restore_database') || 'Restore'}</Text>
              </TouchableRipple>
            </View>
          )}

          {activeSubPanel === 'import' && importStep === 'sheets-progress' && (
            <View style={styles.sheetsProgressContent}>
              {sheetsImportSteps.map(step => (
                <View key={step.id} style={styles.sheetsProgressStep}>
                  <View style={styles.sheetsProgressStepIcon}>
                    {step.status === 'pending' && <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />}
                    {step.status === 'in_progress' && <ActivityIndicator size="small" color={colors.primary} />}
                    {step.status === 'completed' && <Ionicons name="checkmark-circle" size={22} color="#4caf50" />}
                    {step.status === 'error' && <Ionicons name="close-circle" size={22} color="#c44" />}
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
              {sheetsImportError && <Text style={styles.sheetsErrorText}>{sheetsImportError}</Text>}
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
                style={styles.flexList}
                inverted
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={5}
                contentContainerStyle={entries.length === 0 && styles.emptyContainer}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
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
                onRefresh={runUpdateCheck}
              />
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  // ─── Main settings list ───
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.settingsContent}>
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
              <Animated.View style={[styles.switchThumb, toggleThumbStyle]} />
            </View>
          </View>
        </TouchableRipple>

        <TouchableRipple onPress={handleToggleDarkMode} style={styles.settingsRow} testID="settings-theme-row">
          <View style={styles.settingsRowContent}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name={colorScheme === 'dark' ? 'moon-outline' : 'sunny-outline'} size={22} color={colors.text} />
              <View style={styles.settingsRowText}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('theme') || 'Theme'}</Text>
                <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                  {colorScheme === 'dark' ? t('theme_dark') : t('theme_light')}
                </Text>
              </View>
            </View>
            <View style={[styles.switchTrack, { backgroundColor: colorScheme === 'dark' ? colors.primary : colors.border }]}>
              <Animated.View style={[styles.switchThumb, themeToggleThumbStyle]} />
            </View>
          </View>
        </TouchableRipple>

        <TouchableRipple onPress={() => openSubPanel('accounts')} style={styles.settingsRow} testID="settings-accounts-row">
          <View style={styles.settingsRowContent}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="wallet-outline" size={22} color={colors.text} />
              <View style={styles.settingsRowText}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('accounts') || 'Accounts'}</Text>
                <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                  {t('accounts_hint') || 'Manage your accounts and balances'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>

        <TouchableRipple
          onPress={() => openSubPanel('defaultAccount')}
          style={styles.settingsRow}
          testID="settings-default-account-row"
        >
          <View style={styles.settingsRowContent}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="bookmark-outline" size={22} color={colors.text} />
              <View style={styles.settingsRowText}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('default_account')}</Text>
                <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                  {defaultAccountName}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>

        <TouchableRipple onPress={() => openSubPanel('categories')} style={styles.settingsRow} testID="settings-categories-row">
          <View style={styles.settingsRowContent}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="shapes-outline" size={22} color={colors.text} />
              <View style={styles.settingsRowText}>
                <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('categories') || 'Categories'}</Text>
                <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                  {t('categories_hint') || 'Manage your expense and income categories'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
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

        <TouchableRipple
          onPress={isDownloading ? undefined : handleCheckForUpdates}
          style={[styles.settingsRow, isDownloading && styles.settingsRowDisabled]}
          disabled={isDownloading}
          testID="check-updates-row"
        >
          <View style={styles.settingsRowContent}>
            <View style={styles.settingsRowLeft}>
              <Ionicons name="download-outline" size={22} color={isDownloading ? colors.mutedText : colors.text} />
              <Text style={[styles.settingsRowLabel, { color: isDownloading ? colors.mutedText : colors.text }]}>
                {t('check_updates') || 'Check for updates'}
              </Text>
            </View>
            <View style={styles.updateRowRight}>
              {isDownloading ? (
                <>
                  <Text style={[styles.versionLabel, { color: colors.primary }]}>
                    {downloadPhase === 'verifying'
                      ? (t('update_phase_verifying') || 'Verifying APK…')
                      : downloadPhase === 'backing_up'
                        ? (t('update_phase_backing_up') || 'Backing up…')
                        : `${Math.round((downloadProgress ?? 0) * 100)}%`}
                  </Text>
                  <ActivityIndicator size={16} color={colors.primary} style={styles.updateRowSpinner} />
                </>
              ) : (
                <>
                  <Text style={[styles.versionLabel, { color: colors.mutedText }]}>
                    {`v${require('../../package.json').version}`}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
                </>
              )}
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
      </ScrollView>
    </View>
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
  confirmButtonDestructive: {
    backgroundColor: '#c44',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
    paddingVertical: SPACING.xl,
  },
  confirmText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  confirmWarningIcon: {
    marginBottom: SPACING.lg,
  },
  container: {
    flex: 1,
  },
  destructiveText: {
    color: '#c44',
  },
  divider: {
    marginVertical: SPACING.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
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
  flexList: {
    flex: 1,
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
  listContainer: {
    paddingVertical: SPACING.sm,
  },
  listItem: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  listItemContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
  },
  listItemText: {
    fontSize: 16,
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
  resetSpacer: {
    height: SPACING.sm,
  },
  sectionLabel: {
    letterSpacing: 0.5,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  settingsContent: {
    paddingBottom: 96,
    paddingTop: SPACING.sm,
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
  settingsRowDisabled: {
    opacity: 0.6,
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
  subPanelBody: {
    flex: 1,
  },
  subPanelBodyFlush: {
    paddingBottom: 0,
  },
  subPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  subPanelShrink: {
    // Clip content to the rounded corners while the panel shrinks, and lift it
    // off the backdrop so the Telegram-style shrink reads clearly.
    elevation: 8,
    overflow: 'hidden',
  },
  subPanelTitle: {
    fontWeight: '600',
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 2,
    height: 20,
    position: 'absolute',
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
  updateRowSpinner: {
    marginLeft: 2,
  },
  versionLabel: {
    fontSize: 13,
  },
});

SettingsScreen.propTypes = {
  setSubPanelActive: PropTypes.func.isRequired,
};
