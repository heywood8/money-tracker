import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useImportProgress } from '../../contexts/ImportProgressContext';
import {
  pickImportFile,
  importBackupFromFile,
  restoreBackup,
  getPreRestoreSnapshots,
  CancelledImportError,
} from '../../services/BackupRestore';
import { getStoredBackups } from '../../services/DailyBackupService';
import { getValidAccessToken, signIn as googleSignIn, importFromSheets } from '../../services/GoogleSheetsService';
import { getPreference, PREF_KEYS } from '../../services/PreferencesDB';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';
import SheetsProgressList, { sheetsErrorTextStyle } from './SheetsProgressList';
import LocalBackupList, { formatBackupLabel } from './LocalBackupList';
import {
  CONFIRM_BUTTON_DESTRUCTIVE,
  CONFIRM_BUTTON_TEXT,
  CONFIRM_CONTENT,
  CONFIRM_TEXT,
  CONFIRM_WARNING_ICON,
  FORMAT_DESCRIPTION,
  FORMAT_ITEM_ROW,
  FORMAT_TEXT_CONTAINER,
  LIST_CONTAINER,
  LIST_ITEM,
  LIST_ITEM_CONTENT,
  LIST_ITEM_TEXT,
} from './settingsPanelStyles';

const SHEETS_IMPORT_STEPS = [
  { id: 'connect', label: 'Connecting to spreadsheet' },
  { id: 'parse', label: 'Reading sheet data' },
];

const pendingSteps = () => SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' }));

// One restore source in the picker.
function SourceRow({ icon, title, description, onPress, testID }) {
  const { colors } = useThemeColors();
  return (
    <TouchableRipple onPress={onPress} style={styles.listItem} testID={testID}>
      <View style={styles.listItemContent}>
        <View style={styles.formatItemRow}>
          <Ionicons name={icon} size={24} color={colors.text} />
          <View style={styles.formatTextContainer}>
            <Text style={[styles.listItemText, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.formatDescription, { color: colors.mutedText }]}>{description}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
      </View>
    </TouchableRipple>
  );
}

SourceRow.propTypes = {
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

// The import subpanel and its four nested steps: pick a source, browse local
// backups, confirm, and (for Sheets) watch the run.
export default function ImportPanel({
  step,
  onPushStep,
  onPopToRoot,
  onBusyChange,
  onRegisterBack,
  onRegisterRefresh,
  onDone,
  onSetUpSheetsExport,
  bottomInset,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { startImport, cancelImport, completeImport, getCancelToken } = useImportProgress();

  const [storedBackups, setStoredBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [sheetsSteps, setSheetsSteps] = useState(pendingSteps);
  const [sheetsError, setSheetsError] = useState(null);
  const pickInProgress = useRef(false);

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

  // The list is read once when the panel opens; the header refresh re-reads it.
  useEffect(() => { loadStoredBackups(); }, [loadStoredBackups]);

  // Back is locked while a Sheets stage is mid-flight. Gated on the progress
  // step as well as the stage: an early return that unwinds to the source list
  // must never leave the host locked, whatever the last stage was doing.
  const sheetsInFlight = step === 'sheets-progress' && sheetsSteps.some(s => s.status === 'in_progress');
  useEffect(() => {
    onBusyChange(sheetsInFlight);
  }, [sheetsInFlight, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  // The header gets a refresh button only while the local backup list is shown.
  useEffect(() => {
    onRegisterRefresh(step === 'local-list' ? loadStoredBackups : null);
    return () => onRegisterRefresh(null);
  }, [step, loadStoredBackups, onRegisterRefresh]);

  // Release what the step being left owns. Tied to the back gesture, not to the
  // step changing: the "no spreadsheet configured" failure also returns to the
  // source list and has to keep the message it just set.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    onRegisterBack(() => {
      if (stepRef.current === 'sheets-progress') setSheetsError(null);
      if (stepRef.current === 'confirm-local') setSelectedBackup(null);
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack]);

  const handleSourceSelect = useCallback((source) => {
    if (source === 'file') {
      onPushStep('confirm-file');
    } else if (source === 'local') {
      onPushStep('local-list');
    }
  }, [onPushStep]);

  const confirmImportBackup = useCallback(async () => {
    if (pickInProgress.current) return;
    pickInProgress.current = true;

    let fileInfo;
    try {
      fileInfo = await pickImportFile();
    } catch (error) {
      pickInProgress.current = false;
      if (error.message === 'Import cancelled') {
        onPopToRoot();
        return;
      }
      console.error('Import file pick error:', error);
      showDialog(t('error') || 'Error', error.message || t('restore_error') || 'Failed to restore backup', [{ text: 'OK' }]);
      return;
    }

    pickInProgress.current = false;
    onDone();
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
  }, [onDone, onPopToRoot, startImport, completeImport, cancelImport, getCancelToken, t, showDialog]);

  const handleGoogleSheetsImport = useCallback(async () => {
    setSheetsError(null);

    const spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
    if (!spreadsheetId) {
      setSheetsError(t('google_sheets_not_configured') || 'Export to Google Sheets first to set up your spreadsheet.');
      return;
    }

    setSheetsSteps(pendingSteps());
    onPushStep('sheets-progress');

    let backup;
    try {
      let accessToken;
      try {
        accessToken = await getValidAccessToken();
      } catch {
        accessToken = await googleSignIn();
      }
      backup = await importFromSheets(accessToken, ({ step: id, status }) => {
        setSheetsSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      });
    } catch (error) {
      // Both of these unwind to the source list, so the half-started run goes
      // with them — otherwise its in-flight stage would outlive the view.
      if (error.message === 'sign_in_cancelled') {
        setSheetsSteps(pendingSteps());
        onPopToRoot();
        return;
      }
      if (error.message === 'no_spreadsheet_configured') {
        setSheetsSteps(pendingSteps());
        onPopToRoot();
        setSheetsError(t('google_sheets_not_configured') || 'Export to Google Sheets first to set up your spreadsheet.');
        return;
      }
      let msg;
      if (error.message === 'refresh_failed') msg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
      else if (error.message === 'spreadsheet_not_found') msg = t('google_sheets_not_found') || 'Spreadsheet not found. Try exporting first.';
      else msg = t('google_sheets_import_failed') || 'Import failed. Please try again.';
      setSheetsSteps(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
      setSheetsError(msg);
      return;
    }

    onDone();
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
  }, [t, onDone, onPushStep, onPopToRoot, startImport, completeImport, cancelImport, getCancelToken, showDialog]);

  const handleSetUpExport = useCallback(() => {
    setSheetsError(null);
    onSetUpSheetsExport();
  }, [onSetUpSheetsExport]);

  const handleLocalBackupSelect = useCallback((item) => {
    setSelectedBackup(item);
    onPushStep('confirm-local');
  }, [onPushStep]);

  const confirmRestoreLocalBackup = useCallback(async () => {
    if (!selectedBackup) return;
    onDone();
    startImport();
    const cancelToken = getCancelToken();
    try {
      const content = await LegacyFileSystem.readAsStringAsync(selectedBackup.uri);
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
  }, [selectedBackup, onDone, startImport, completeImport, cancelImport, getCancelToken, t, showDialog]);

  const deleteLocalBackup = useCallback(async (uri) => {
    try {
      await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
      setStoredBackups(prev => prev.filter(b => b.uri !== uri));
    } catch (error) {
      console.error('Failed to delete backup:', error);
    }
  }, []);

  if (step === 'local-list') {
    return (
      <LocalBackupList
        backups={storedBackups}
        loading={backupsLoading}
        onRestore={handleLocalBackupSelect}
        onDelete={deleteLocalBackup}
        bottomInset={bottomInset}
      />
    );
  }

  if (step === 'confirm-file') {
    return (
      <View style={styles.confirmContent}>
        <Ionicons name="warning-outline" size={48} color={colors.destructive} style={styles.confirmWarningIcon} />
        <Text style={[styles.confirmText, { color: colors.text }]}>
          {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
        </Text>
        <TouchableRipple testID="confirm-import-file-btn" onPress={confirmImportBackup} style={[styles.confirmButtonDestructive, { backgroundColor: colors.destructive }]}>
          <Text style={styles.confirmButtonText}>{t('restore_database') || 'Restore'}</Text>
        </TouchableRipple>
      </View>
    );
  }

  if (step === 'confirm-local') {
    return (
      <View style={styles.confirmContent}>
        <Ionicons name="warning-outline" size={48} color={colors.destructive} style={styles.confirmWarningIcon} />
        {selectedBackup && (
          <Text style={[styles.confirmText, { color: colors.mutedText }]}>
            {formatBackupLabel(selectedBackup.filename, t)}
          </Text>
        )}
        <Text style={[styles.confirmText, { color: colors.text }]}>
          {t('restore_confirm') || 'Are you sure you want to restore from backup? This will replace all current data.'}
        </Text>
        <TouchableRipple onPress={confirmRestoreLocalBackup} style={[styles.confirmButtonDestructive, { backgroundColor: colors.destructive }]}>
          <Text style={styles.confirmButtonText}>{t('restore_database') || 'Restore'}</Text>
        </TouchableRipple>
      </View>
    );
  }

  if (step === 'sheets-progress') {
    return (
      <SheetsProgressList steps={sheetsSteps}>
        {sheetsError && <Text style={[styles.sheetsErrorText, { color: colors.destructive }]}>{sheetsError}</Text>}
      </SheetsProgressList>
    );
  }

  return (
    <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: bottomInset }}>
      <SourceRow
        icon="logo-google"
        title={t('import_from_file') || 'From Google Drive'}
        description={t('import_from_file_description') || 'Pick a backup file from Google Drive'}
        onPress={() => handleSourceSelect('file')}
      />
      <SourceRow
        icon="archive-outline"
        title={t('import_from_local') || 'From local backup'}
        description={t('import_from_local_description') || 'Restore from a daily or weekly automatic backup'}
        onPress={() => handleSourceSelect('local')}
      />
      <SourceRow
        icon="logo-google"
        title={t('import_from_google_sheets') || 'From Google Sheets'}
        description={t('import_from_google_sheets_description') || 'Import from your Penny spreadsheet'}
        onPress={handleGoogleSheetsImport}
        testID="settings-import-google-sheets"
      />
      {/* A Sheets import that dead-ends on "no spreadsheet configured" leaves its
        message here, with a shortcut to the export that would create one. */}
      {sheetsError && (
        <View style={styles.sheetsSetupCta}>
          <Text testID="settings-import-no-spreadsheet" style={[styles.sheetsImportErrorInline, { color: colors.destructive }]}>
            {sheetsError}
          </Text>
          <TouchableRipple
            testID="settings-import-setup-export"
            onPress={handleSetUpExport}
            style={[styles.sheetsSetupCtaButton, { borderColor: colors.primary }]}
          >
            <View style={styles.sheetsSetupCtaRow}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
              <Text style={[styles.sheetsSetupCtaText, { color: colors.primary }]}>
                {t('google_sheets_setup_export_now') || 'Export now to set up'}
              </Text>
            </View>
          </TouchableRipple>
        </View>
      )}
    </ScrollView>
  );
}

ImportPanel.propTypes = {
  // 'source' | 'local-list' | 'confirm-file' | 'confirm-local' | 'sheets-progress'
  step: PropTypes.string,
  onPushStep: PropTypes.func.isRequired,
  onPopToRoot: PropTypes.func.isRequired,
  onBusyChange: PropTypes.func.isRequired,
  onRegisterBack: PropTypes.func.isRequired,
  // Offers the host a refresh action for its header while the list is shown.
  onRegisterRefresh: PropTypes.func.isRequired,
  // Close the whole subpanel — a restore takes over the screen from here.
  onDone: PropTypes.func.isRequired,
  // Swap the subpanel over to export, to create the missing spreadsheet.
  onSetUpSheetsExport: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  confirmButtonDestructive: CONFIRM_BUTTON_DESTRUCTIVE,
  confirmButtonText: CONFIRM_BUTTON_TEXT,
  confirmContent: CONFIRM_CONTENT,
  confirmText: CONFIRM_TEXT,
  confirmWarningIcon: CONFIRM_WARNING_ICON,
  formatDescription: FORMAT_DESCRIPTION,
  formatItemRow: FORMAT_ITEM_ROW,
  formatTextContainer: FORMAT_TEXT_CONTAINER,
  listContainer: LIST_CONTAINER,
  listItem: LIST_ITEM,
  listItemContent: LIST_ITEM_CONTENT,
  listItemText: LIST_ITEM_TEXT,
  sheetsErrorText: sheetsErrorTextStyle,
  sheetsImportErrorInline: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  sheetsSetupCta: {
    marginTop: SPACING.sm,
  },
  sheetsSetupCtaButton: {
    alignSelf: 'flex-start',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginHorizontal: 16,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  sheetsSetupCtaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sheetsSetupCtaText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});
