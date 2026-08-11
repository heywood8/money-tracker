import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { exportBackup, createBackup } from '../../services/BackupRestore';
import { DAILY_BACKUP_DIR } from '../../services/DailyBackupService';
import { getValidAccessToken, signIn as googleSignIn, exportToSheets } from '../../services/GoogleSheetsService';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';
import SheetsProgressList, { sheetsErrorTextStyle } from './SheetsProgressList';
import {
  FORMAT_DESCRIPTION,
  FORMAT_ITEM_ROW,
  FORMAT_TEXT_CONTAINER,
  LIST_CONTAINER,
  LIST_ITEM,
  LIST_ITEM_CONTENT,
  LIST_ITEM_TEXT,
} from './settingsPanelStyles';

// The ids are the contract with exportToSheets, which reports progress against
// them; the labels are what the user reads while it runs.
const SHEETS_STEPS = [
  { id: 'auth', label: 'Signing in to Google' },
  { id: 'backup', label: 'Preparing data' },
  { id: 'connect', label: 'Connecting to spreadsheet' },
  { id: 'clear', label: 'Clearing existing data' },
  { id: 'write', label: 'Uploading data' },
  { id: 'complete', label: 'Export complete' },
];

const pendingSteps = () => SHEETS_STEPS.map(s => ({ ...s, status: 'pending' }));

// The colour a row's icon and title take once its export has succeeded.
const SUCCESS_GREEN = '#4caf50';

// One export destination. All five rows are the same shape — icon, title,
// description that doubles as the status line, and a trailing affordance that
// cycles chevron → spinner → tick — so they are one component rather than five
// copies that drift.
// `disableOnSuccess` is only set for the local backup, which writes one dated
// file per tap: a second tap would silently make a near-duplicate. The file
// exports and the Sheets export stay tappable after they succeed, because
// re-running them is a reasonable thing to want.
function ExportRow({ icon, title, description, loading, success, disableOnSuccess, onPress, testID }) {
  const { colors } = useThemeColors();
  const tint = success ? SUCCESS_GREEN : colors.text;
  const disabled = !!loading || (!!success && !!disableOnSuccess);

  return (
    <TouchableRipple
      onPress={disabled ? null : onPress}
      disabled={disabled}
      style={styles.listItem}
      testID={testID}
    >
      <View style={styles.listItemContent}>
        <View style={styles.formatItemRow}>
          <Ionicons name={icon} size={24} color={tint} />
          <View style={styles.formatTextContainer}>
            <Text style={[styles.listItemText, { color: tint }]}>{title}</Text>
            <Text style={[styles.formatDescription, { color: colors.mutedText }]}>{description}</Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : success ? (
          <Ionicons name="checkmark-circle" size={22} color={SUCCESS_GREEN} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        )}
      </View>
    </TouchableRipple>
  );
}

ExportRow.propTypes = {
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  loading: PropTypes.bool,
  success: PropTypes.bool,
  disableOnSuccess: PropTypes.bool,
  onPress: PropTypes.func,
  testID: PropTypes.string,
};

// The export subpanel: a list of destinations, plus a nested progress view for
// the one destination that takes long enough to need it (Google Sheets).
export default function ExportPanel({
  step,
  onPushStep,
  onPopToRoot,
  onBusyChange,
  onRegisterBack,
  bottomInset,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();

  const [sheetsSteps, setSheetsSteps] = useState(pendingSteps);
  const [sheetsSuccessUrl, setSheetsSuccessUrl] = useState(null);
  const [sheetsError, setSheetsError] = useState(null);
  const [sheetsExportSuccess, setSheetsExportSuccess] = useState(false);
  const [saveLocalBackupLoading, setSaveLocalBackupLoading] = useState(false);
  const [saveLocalBackupSuccess, setSaveLocalBackupSuccess] = useState(false);
  const [fileExport, setFileExport] = useState({});

  // Back is locked while a Sheets stage is mid-flight, so the host must know.
  // Gated on the progress step as well as the stage: an early return that
  // unwinds to the list must never leave the host locked, whatever the last
  // stage was doing when it bailed.
  const sheetsInFlight = step === 'sheets-progress' && sheetsSteps.some(s => s.status === 'in_progress');
  useEffect(() => {
    onBusyChange(sheetsInFlight);
  }, [sheetsInFlight, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  // Leaving the progress view discards the run it was reporting on, so a later
  // export starts from a clean list rather than the last one's ticks. This is
  // tied to the back gesture rather than to the step changing, because the
  // "no spreadsheet configured" path also lands back on the list and must keep
  // the message it just set.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    onRegisterBack(() => {
      if (stepRef.current === 'sheets-progress') {
        setSheetsSteps(pendingSteps());
        setSheetsSuccessUrl(null);
        setSheetsError(null);
      }
      // Never claims the gesture — the host owns the stack.
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack]);

  const updateSheetsStep = useCallback((stepId, status) => {
    setSheetsSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  }, []);

  const handleExportFormatSelect = useCallback(async (format) => {
    setFileExport(prev => ({ ...prev, [format]: { loading: true } }));
    try {
      await exportBackup(format);
      setFileExport(prev => ({ ...prev, [format]: { success: true } }));
    } catch (error) {
      console.error('Export backup error:', error);
      setFileExport(prev => ({ ...prev, [format]: {} }));
      showDialog(
        t('error') || 'Error',
        t('backup_error') || 'Failed to create backup',
        [{ text: 'OK' }],
      );
    }
  }, [t, showDialog]);

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

  const handleGoogleSheetsExport = useCallback(async () => {
    setSheetsSteps(pendingSteps());
    setSheetsSuccessUrl(null);
    setSheetsError(null);
    onPushStep('sheets-progress');
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

      const sheetUrl = await exportToSheets(accessToken, backup, ({ step: id, status }) => {
        updateSheetsStep(id, status);
      });

      updateSheetsStep('complete', 'completed');
      setSheetsSuccessUrl(sheetUrl);
      setSheetsExportSuccess(true);
    } catch (error) {
      if (error.message === 'sign_in_cancelled') {
        // Abandoned before it really began: drop the half-started run so the
        // next attempt opens on a clean list and nothing stays in flight.
        setSheetsSteps(pendingSteps());
        onPopToRoot();
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
  }, [updateSheetsStep, onPushStep, onPopToRoot, t]);

  if (step === 'sheets-progress') {
    return (
      <SheetsProgressList steps={sheetsSteps}>
        {sheetsError && <Text style={[styles.sheetsErrorText, { color: colors.destructive }]}>{sheetsError}</Text>}
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
      </SheetsProgressList>
    );
  }

  const fileRow = (format) => fileExport[format] || {};

  return (
    <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: bottomInset }}>
      <ExportRow
        icon="archive-outline"
        title={t('save_local_backup') || 'Save local backup'}
        description={
          saveLocalBackupLoading
            ? (t('save_local_backup_saving') || 'Saving…')
            : saveLocalBackupSuccess
              ? (t('save_local_backup_success') || 'Backup saved')
              : (t('save_local_backup_description') || 'Save a backup to device storage and share')
        }
        loading={saveLocalBackupLoading}
        success={saveLocalBackupSuccess}
        disableOnSuccess
        onPress={handleSaveLocalBackup}
        testID="settings-export-save-local-backup"
      />

      <ExportRow
        icon="logo-google"
        title="Google Sheets"
        description={
          sheetsExportSuccess
            ? (t('export_success') || 'Export complete')
            : (t('google_sheets_description') || 'Export to a Google Sheets spreadsheet')
        }
        success={sheetsExportSuccess}
        onPress={handleGoogleSheetsExport}
        testID="settings-export-google-sheets"
      />

      <ExportRow
        icon="server-outline"
        title="Save externally to SQLite"
        description={
          fileRow('sqlite').loading
            ? (t('exporting') || 'Exporting…')
            : fileRow('sqlite').success
              ? (t('export_success') || 'Export complete')
              : (t('sqlite_description') || 'Raw database file, complete backup')
        }
        loading={fileRow('sqlite').loading}
        success={fileRow('sqlite').success}
        onPress={() => handleExportFormatSelect('sqlite')}
      />

      <ExportRow
        icon="document-text-outline"
        title="Save externally to CSV"
        description={
          fileRow('csv').loading
            ? (t('exporting') || 'Exporting…')
            : fileRow('csv').success
              ? (t('export_success') || 'Export complete')
              : (t('csv_description') || 'Plain text format, easy to edit')
        }
        loading={fileRow('csv').loading}
        success={fileRow('csv').success}
        onPress={() => handleExportFormatSelect('csv')}
      />

      <ExportRow
        icon="code-outline"
        title="Save externally to JSON"
        description={
          fileRow('json').loading
            ? (t('exporting') || 'Exporting…')
            : fileRow('json').success
              ? (t('export_success') || 'Export complete')
              : (t('json_description') || 'Standard format, compatible with all versions')
        }
        loading={fileRow('json').loading}
        success={fileRow('json').success}
        onPress={() => handleExportFormatSelect('json')}
      />
    </ScrollView>
  );
}

ExportPanel.propTypes = {
  // 'list' | 'sheets-progress'
  step: PropTypes.string,
  onPushStep: PropTypes.func.isRequired,
  onPopToRoot: PropTypes.func.isRequired,
  // Reports whether back must be locked (a Sheets stage is mid-flight).
  onBusyChange: PropTypes.func.isRequired,
  // Registers a pre-back hook so the panel can release state it owns.
  onRegisterBack: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  formatDescription: FORMAT_DESCRIPTION,
  formatItemRow: FORMAT_ITEM_ROW,
  formatTextContainer: FORMAT_TEXT_CONTAINER,
  listContainer: LIST_CONTAINER,
  listItem: LIST_ITEM,
  listItemContent: LIST_ITEM_CONTENT,
  listItemText: LIST_ITEM_TEXT,
  sheetsErrorText: sheetsErrorTextStyle,
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
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
});
