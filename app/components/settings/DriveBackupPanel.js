import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDriveBackup } from '../../contexts/DriveBackupContext';
import {
  isDriveBackupEnabled,
  setDriveBackupEnabled,
  getDriveBackupFormats,
  setDriveBackupFormats,
  BACKUP_FORMATS,
  DEFAULT_FOLDER_NAME,
  MAX_DAILY_BACKUPS,
  MAX_WEEKLY_BACKUPS,
} from '../../services/GoogleDriveBackupService';
import { getValidAccessToken, signIn as googleSignIn } from '../../services/GoogleSheetsService';
import { SettingToggleRow, SETTINGS_LIST_CONTENT } from './SettingsRows';
import { SECTION_LABEL } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// The colour a finished run's status line takes. Matches ExportPanel's success tint.
const SUCCESS_GREEN = '#4caf50';

const FORMAT_ROWS = [
  { id: 'json', icon: 'code-outline', label: 'JSON' },
  { id: 'csv', icon: 'document-text-outline', label: 'CSV' },
  { id: 'sqlite', icon: 'server-outline', label: 'SQLite' },
];

/**
 * Settings for the automatic Google Drive backup.
 *
 * The feature is off until it is switched on here, and switching it on is what
 * asks for the Google account — nothing signs in behind the user's back.
 *
 * The panel does not own the run: it asks DriveBackupContext to start one and
 * reads the state back. That is what lets the user close the panel, or the whole
 * settings screen, while an upload is still going.
 */
export default function DriveBackupPanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { startBackup, isRunning, progress, lastResult } = useDriveBackup();

  const [enabled, setEnabled] = useState(false);
  const [formats, setFormats] = useState(BACKUP_FORMATS);
  const [loading, setLoading] = useState(true);
  const [signInError, setSignInError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isDriveBackupEnabled(), getDriveBackupFormats()]).then(([on, saved]) => {
      if (cancelled) return;
      setEnabled(on);
      setFormats(saved);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = useCallback(async () => {
    setSignInError(null);
    if (enabled) {
      setEnabled(false);
      await setDriveBackupEnabled(false);
      return;
    }

    // Turning it on is the moment to establish the Google session: doing it here
    // rather than at the first scheduled run means the user finds out now if the
    // account is wrong, instead of through a silent failure days later.
    try {
      try {
        await getValidAccessToken();
      } catch (error) {
        if (error.message === 'not_signed_in' || error.message === 'refresh_failed') {
          await googleSignIn();
        } else {
          throw error;
        }
      }
      setEnabled(true);
      await setDriveBackupEnabled(true);
    } catch (error) {
      if (error.message === 'sign_in_cancelled') return; // Backed out; stay off, say nothing.
      setSignInError(
        error.message === 'auth_failed'
          ? (t('google_sheets_signin_failed') || 'Google sign-in failed. Please try again.')
          : (t('drive_backup_enable_failed') || 'Could not connect to Google Drive.'),
      );
    }
  }, [enabled, t]);

  const handleToggleFormat = useCallback(async (format) => {
    // The last remaining format cannot be switched off — "enabled but uploading
    // nothing" is a state that looks like it works and does not.
    const next = formats.includes(format)
      ? formats.filter(f => f !== format)
      : [...formats, format];
    if (next.length === 0) return;
    setFormats(next);
    await setDriveBackupFormats(next);
  }, [formats]);

  // Deliberately not awaited: the point of the button is that the upload carries
  // on while the user goes back to using the app. The banner and the status line
  // report it from here on.
  const handleBackupNow = useCallback(() => {
    setSignInError(null);
    startBackup({ mode: 'manual', interactive: true });
  }, [startBackup]);

  const statusLine = (() => {
    if (isRunning) {
      switch (progress?.phase) {
      case 'preparing': return t('drive_backup_status_preparing') || 'Preparing backup…';
      case 'folder': return t('drive_backup_status_connecting') || 'Connecting to Google Drive…';
      case 'uploading':
        return `${t('drive_backup_status_uploading') || 'Uploading to Drive'} ${progress.current}/${progress.total}`;
      case 'cleanup': return t('drive_backup_status_cleanup') || 'Tidying up old backups…';
      default: return t('drive_backup_status_running') || 'Backing up to Google Drive…';
      }
    }
    if (!lastResult) return t('drive_backup_never_run') || 'No backup uploaded yet';
    const when = new Date(lastResult.at).toLocaleString();
    if (lastResult.status === 'success') {
      return `${t('drive_backup_last_success') || 'Last backup'}: ${when}`;
    }
    if (lastResult.status === 'error') {
      return `${t('drive_backup_last_error') || 'Last backup failed'}: ${when}`;
    }
    return `${t('drive_backup_last_skipped') || 'Last run skipped'}: ${when}`;
  })();

  const statusColor = isRunning
    ? colors.primary
    : lastResult?.status === 'success'
      ? SUCCESS_GREEN
      : lastResult?.status === 'error'
        ? colors.destructive
        : colors.mutedText;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
      <SettingToggleRow
        icon="cloud-upload-outline"
        label={t('drive_backup_enable') || 'Automatic backup to Google Drive'}
        hint={
          enabled
            ? (t('drive_backup_enable_hint_on') || 'Uploads on the first app open each day')
            : (t('drive_backup_enable_hint_off') || 'Off — nothing is uploaded')
        }
        value={enabled}
        onToggle={handleToggle}
        testID="drive-backup-enable-toggle"
      />

      {!!signInError && (
        <Text style={[styles.errorText, { color: colors.destructive }]}>{signInError}</Text>
      )}

      <Text style={[styles.explainer, { color: colors.mutedText }]}>
        {t('drive_backup_explainer')
          || `Backups go to a "${DEFAULT_FOLDER_NAME}" folder the app creates on your Drive. You can rename or move it — the link is kept by folder, not by name. The app can only see files it created itself.`}
      </Text>

      <Divider style={styles.divider} />

      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>
        {t('drive_backup_formats') || 'Formats to upload'}
      </Text>

      {FORMAT_ROWS.map(({ id, icon, label }) => (
        <SettingToggleRow
          key={id}
          icon={icon}
          label={label}
          hint={
            id === 'json'
              ? (t('json_description') || 'Standard format, compatible with all versions')
              : id === 'csv'
                ? (t('csv_description') || 'Plain text format, easy to edit')
                : (t('sqlite_description') || 'Raw database file, complete backup')
          }
          value={formats.includes(id)}
          onToggle={() => handleToggleFormat(id)}
          testID={`drive-backup-format-${id}`}
        />
      ))}

      <Divider style={styles.divider} />

      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>
        {t('drive_backup_status') || 'Status'}
      </Text>

      <View style={styles.statusRow}>
        <Ionicons
          name={isRunning ? 'cloud-upload-outline' : lastResult?.status === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          size={18}
          color={statusColor}
        />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLine}</Text>
        {isRunning && <ActivityIndicator size={14} color={colors.primary} />}
      </View>

      {lastResult?.status === 'error' && !isRunning && (
        <Text style={[styles.errorText, { color: colors.mutedText }]}>{lastResult.error}</Text>
      )}

      <TouchableOpacity
        onPress={handleBackupNow}
        disabled={isRunning}
        style={[
          styles.button,
          { backgroundColor: colors.primary },
          isRunning && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('drive_backup_now') || 'Back up now'}
        testID="drive-backup-now-button"
      >
        <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
        <Text style={styles.buttonText}>{t('drive_backup_now') || 'Back up now'}</Text>
      </TouchableOpacity>

      <Text style={[styles.explainer, { color: colors.mutedText }]}>
        {t('drive_backup_retention')
          || `Scheduled backups keep the last ${MAX_DAILY_BACKUPS} daily and ${MAX_WEEKLY_BACKUPS} weekly copies of each format. Backups you make with the button are kept until you delete them.`}
      </Text>
    </ScrollView>
  );
}

DriveBackupPanel.propTypes = {
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  content: {
    ...SETTINGS_LIST_CONTENT,
  },
  divider: {
    marginVertical: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZE.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.xs,
  },
  explainer: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  statusText: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
});
