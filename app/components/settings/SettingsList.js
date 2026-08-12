import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useThemeConfig } from '../../contexts/ThemeConfigContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useUpdateDownload } from '../../contexts/UpdateDownloadContext';
import { languageLabel } from '../../utils/languages';
import { SettingsNavRow, SETTINGS_LIST_CONTENT } from './SettingsRows';
import { SECTION_LABEL } from '../../styles/componentStyles';
import { HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// Shown on the update row. Read once at module load rather than on every render.
const APP_VERSION = require('../../../package.json').version;

// The settings root: the list you see before opening anything. Every row asks the
// host to open a subpanel — the list has no opinion about how a panel is
// presented, only which one it wants.
//
// It holds no toggles of its own any more. Seven two-line preference rows used to
// live here and the list ran well past a screen, so the frequently-read entries
// (accounts, categories, export/import) sat below the fold behind settings people
// flip once. The preferences now live in the Appearance and Privacy panels, one
// tap in, and the root fits on one screen.
export default function SettingsList({ onOpenPanel }) {
  const { colors } = useThemeColors();
  const { colorScheme } = useThemeConfig();
  const { t, language } = useLocalization();
  const { isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();

  // The update row shows the installed version, or the live download state while
  // an update is being fetched — the one row whose trailing slot is not a chevron.
  const updateRight = isDownloading ? (
    <View style={styles.updateRowRight}>
      <Text style={[styles.versionLabel, { color: colors.primary }]}>
        {downloadPhase === 'verifying'
          ? (t('update_phase_verifying') || 'Verifying APK…')
          : downloadPhase === 'backing_up'
            ? (t('update_phase_backing_up') || 'Backing up…')
            : `${Math.round((downloadProgress ?? 0) * 100)}%`}
      </Text>
      <ActivityIndicator size={16} color={colors.primary} style={styles.updateRowSpinner} />
    </View>
  ) : (
    <View style={styles.updateRowRight}>
      <Text style={[styles.versionLabel, { color: colors.mutedText }]}>
        {`v${APP_VERSION}`}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <SettingsNavRow
        icon="language-outline"
        label={t('language')}
        hint={languageLabel(language)}
        onPress={() => onOpenPanel('language')}
        testID="settings-language-row"
      />

      <SettingsNavRow
        icon={colorScheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
        label={t('appearance') || 'Appearance'}
        hint={t('appearance_hint') || 'Theme, menu tabs and quick add'}
        onPress={() => onOpenPanel('appearance')}
        testID="settings-appearance-row"
      />

      <SettingsNavRow
        icon="lock-closed-outline"
        label={t('privacy') || 'Privacy'}
        hint={t('privacy_hint') || 'Hidden balances and location'}
        onPress={() => onOpenPanel('privacy')}
        testID="settings-privacy-row"
      />

      <SettingsNavRow
        icon="wallet-outline"
        label={t('accounts') || 'Accounts'}
        hint={t('accounts_hint') || 'Manage your accounts and balances'}
        onPress={() => onOpenPanel('accounts')}
        testID="settings-accounts-row"
      />

      <SettingsNavRow
        icon="shapes-outline"
        label={t('categories') || 'Categories'}
        hint={t('categories_hint') || 'Manage your expense and income categories'}
        onPress={() => onOpenPanel('categories')}
        testID="settings-categories-row"
      />

      <SettingsNavRow
        icon="notifications-outline"
        label={t('notification_processing') || 'Notification processing'}
        hint={t('notification_processing_hint') || 'Read notifications and turn purchases into operations'}
        onPress={() => onOpenPanel('notificationProcessing')}
        testID="settings-notification-processing-row"
      />

      <Divider style={styles.divider} />

      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('database') || 'Database'}</Text>

      <SettingsNavRow
        icon="cloud-upload-outline"
        label={t('export') || 'Export'}
        onPress={() => onOpenPanel('export')}
        testID="settings-export-row"
      />

      <SettingsNavRow
        icon="cloud-download-outline"
        label={t('import') || 'Import'}
        onPress={() => onOpenPanel('import')}
        testID="settings-import-row"
      />

      <Divider style={styles.divider} />

      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('developer') || 'Developer'}</Text>

      <SettingsNavRow
        icon="terminal-outline"
        label={t('logs') || 'Logs'}
        onPress={() => onOpenPanel('logs')}
        testID="logs-row"
      />

      <SettingsNavRow
        icon="download-outline"
        label={t('check_updates') || 'Check for updates'}
        onPress={() => onOpenPanel('update')}
        right={updateRight}
        disabled={isDownloading}
        testID="check-updates-row"
      />

      <View style={styles.resetSpacer} />

      <SettingsNavRow
        icon="trash-outline"
        label={t('reset_database') || 'Reset Database'}
        onPress={() => onOpenPanel('reset')}
        destructive
        testID="settings-reset-row"
      />
    </ScrollView>
  );
}

SettingsList.propTypes = {
  // Asks the host to slide in a subpanel by name.
  onOpenPanel: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  divider: {
    marginVertical: SPACING.xs,
  },
  resetSpacer: {
    height: SPACING.sm,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  settingsContent: {
    ...SETTINGS_LIST_CONTENT,
    paddingBottom: 96,
  },
  updateRowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  updateRowSpinner: {
    marginLeft: 2,
  },
  versionLabel: {
    fontSize: 13,
  },
});
