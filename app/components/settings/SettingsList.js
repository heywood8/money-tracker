import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Divider, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useThemeConfig } from '../../contexts/ThemeConfigContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../../contexts/UpdateDownloadContext';
import { authenticateWithBiometrics, BiometricResult } from '../../services/BiometricService';
import { ensureLocationPermission } from '../../services/LocationService';
import { languageLabel } from '../../utils/languages';
import { SECTION_LABEL } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

const SPRING_CONFIG = { mass: 1, damping: 20, stiffness: 200 };

// Shown on the update row. Read once at module load rather than on every render.
const APP_VERSION = require('../../../package.json').version;

/**
 * A settings row with an animated on/off switch. Extracted so the five toggle
 * rows share one implementation — a future restyle or a11y fix touches one
 * place instead of five. `hintError` renders the hint in the error colour (used
 * for the location "permission denied" state).
 */
const SettingToggleRow = ({ icon, label, hint, value, onToggle, hintError = false, testID }) => {
  const { colors } = useThemeColors();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING_CONFIG);
  }, [value, progress]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + progress.value * 20 }],
  }));

  return (
    <TouchableRipple onPress={onToggle} style={styles.settingsRow} testID={testID}>
      <View style={styles.settingsRowContent}>
        <View style={styles.settingsRowLeft}>
          <Ionicons name={icon} size={22} color={colors.text} />
          <View style={styles.settingsRowText}>
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.settingsRowValue, { color: hintError ? colors.destructive : colors.mutedText }]}>
              {hint}
            </Text>
          </View>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: value ? colors.primary : colors.border }]}>
          <Animated.View style={[styles.switchThumb, thumbStyle]} />
        </View>
      </View>
    </TouchableRipple>
  );
};

SettingToggleRow.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  value: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  hintError: PropTypes.bool,
  testID: PropTypes.string,
};

// The settings root: the list you see before opening anything. Every row either
// flips a preference here or asks the host to open a subpanel — the list has no
// opinion about how a panel is presented, only which one it wants.
export default function SettingsList({ onOpenPanel }) {
  const { colors } = useThemeColors();
  const { colorScheme, setTheme } = useThemeConfig();
  const { t, language } = useLocalization();
  const { showDialog } = useDialog();
  const {
    hideBalances, setHideBalances,
    attachLocation, setAttachLocation,
    showAccountsTab, setShowAccountsTab,
    showBudgetTab, setShowBudgetTab,
    showQuickAddPanel, setShowQuickAddPanel,
  } = useDisplaySettings();
  const { isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();

  // Inline hint shown under the "Attach location" row when the OS permission was
  // denied while turning the toggle on. Cleared on a successful grant / toggle off.
  const [locationDenied, setLocationDenied] = useState(false);

  const handleToggleDarkMode = useCallback(() => {
    setTheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setTheme]);

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

  const handleToggleShowAccountsTab = useCallback(() => {
    setShowAccountsTab(!showAccountsTab);
  }, [showAccountsTab, setShowAccountsTab]);

  const handleToggleShowBudgetTab = useCallback(() => {
    setShowBudgetTab(!showBudgetTab);
  }, [showBudgetTab, setShowBudgetTab]);

  const handleToggleShowQuickAddPanel = useCallback(() => {
    setShowQuickAddPanel(!showQuickAddPanel);
  }, [showQuickAddPanel, setShowQuickAddPanel]);

  const handleToggleAttachLocation = useCallback(async () => {
    // Turning OFF is non-destructive and needs no permission: just persist false.
    // Coordinates already stored on past operations are left untouched (R1.5).
    if (attachLocation) {
      setAttachLocation(false);
      setLocationDenied(false);
      return;
    }
    // Turning ON: request the OS permission in this clear context. If it isn't
    // granted, leave the toggle off and show an inline hint — never nag, never
    // flip the toggle on without permission.
    const { granted } = await ensureLocationPermission();
    if (granted) {
      setLocationDenied(false);
      setAttachLocation(true);
    } else {
      setLocationDenied(true);
      setAttachLocation(false);
    }
  }, [attachLocation, setAttachLocation]);

  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <TouchableRipple onPress={() => onOpenPanel('language')} style={styles.settingsRow} testID="settings-language-row">
        <View style={styles.settingsRowContent}>
          <View style={styles.settingsRowLeft}>
            <Ionicons name="language-outline" size={22} color={colors.text} />
            <View style={styles.settingsRowText}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('language')}</Text>
              <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                {languageLabel(language)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </View>
      </TouchableRipple>

      <SettingToggleRow
        icon="eye-off-outline"
        label={t('hide_balances') || 'Hide balances'}
        hint={t('hide_balances_hint') || 'Mask account balances for privacy'}
        value={hideBalances}
        onToggle={handleToggleHideBalances}
      />

      <SettingToggleRow
        icon="location-outline"
        label={t('attach_location') || 'Attach location to operations'}
        hint={locationDenied
          ? (t('location_permission_denied') || 'Location permission denied. Enable it in system settings.')
          : (t('attach_location_hint') || 'Suggest labels you used nearby before')}
        hintError={locationDenied}
        value={attachLocation}
        onToggle={handleToggleAttachLocation}
        testID="settings-location-row"
      />

      <SettingToggleRow
        icon={colorScheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
        label={t('theme') || 'Theme'}
        hint={colorScheme === 'dark' ? t('theme_dark') : t('theme_light')}
        value={colorScheme === 'dark'}
        onToggle={handleToggleDarkMode}
        testID="settings-theme-row"
      />

      <TouchableRipple onPress={() => onOpenPanel('accounts')} style={styles.settingsRow} testID="settings-accounts-row">
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

      <SettingToggleRow
        icon="grid-outline"
        label={t('show_accounts_in_menu') || 'Show accounts in main menu'}
        hint={t('show_accounts_in_menu_hint') || 'Add an Accounts tab to the bottom navigation'}
        value={showAccountsTab}
        onToggle={handleToggleShowAccountsTab}
        testID="settings-show-accounts-tab-row"
      />

      <SettingToggleRow
        icon="pie-chart-outline"
        label={t('show_budget_in_menu') || 'Show Budget in main menu'}
        hint={t('show_budget_in_menu_hint') || 'Show the Budget tab in the bottom navigation'}
        value={showBudgetTab}
        onToggle={handleToggleShowBudgetTab}
        testID="settings-show-budget-tab-row"
      />

      <SettingToggleRow
        icon="flash-outline"
        label={t('show_quickadd_panel') || 'Show Quick add panel on operations screen'}
        hint={t('show_quickadd_panel_hint') || 'Keep the quick add form open; off collapses it behind the + button'}
        value={showQuickAddPanel}
        onToggle={handleToggleShowQuickAddPanel}
        testID="settings-show-quickadd-panel-row"
      />

      <TouchableRipple onPress={() => onOpenPanel('categories')} style={styles.settingsRow} testID="settings-categories-row">
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

      <TouchableRipple
        onPress={() => onOpenPanel('notificationProcessing')}
        style={styles.settingsRow}
        testID="settings-notification-processing-row"
      >
        <View style={styles.settingsRowContent}>
          <View style={styles.settingsRowLeft}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            <View style={styles.settingsRowText}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>
                {t('notification_processing') || 'Notification processing'}
              </Text>
              <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
                {t('notification_processing_hint') ||
                    'Read notifications and turn purchases into operations'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </View>
      </TouchableRipple>

      <Divider style={styles.divider} />

      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('database') || 'Database'}</Text>

      <TouchableRipple onPress={() => onOpenPanel('export')} style={styles.settingsRow} testID="settings-export-row">
        <View style={styles.settingsRowContent}>
          <View style={styles.settingsRowLeft}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('export') || 'Export'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </View>
      </TouchableRipple>

      <TouchableRipple onPress={() => onOpenPanel('import')} style={styles.settingsRow}>
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

      <TouchableRipple onPress={() => onOpenPanel('logs')} style={styles.settingsRow} testID="logs-row">
        <View style={styles.settingsRowContent}>
          <View style={styles.settingsRowLeft}>
            <Ionicons name="terminal-outline" size={22} color={colors.text} />
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('logs') || 'Logs'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </View>
      </TouchableRipple>

      <TouchableRipple
        onPress={isDownloading ? undefined : () => onOpenPanel('update')}
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
                  {`v${APP_VERSION}`}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </>
            )}
          </View>
        </View>
      </TouchableRipple>

      <View style={styles.resetSpacer} />

      <TouchableRipple onPress={() => onOpenPanel('reset')} style={styles.settingsRow}>
        <View style={styles.settingsRowContent}>
          <View style={styles.settingsRowLeft}>
            <Ionicons name="trash-outline" size={22} color={colors.destructive} />
            <Text style={[styles.settingsRowLabel, { color: colors.destructive }]}>{t('reset_database') || 'Reset Database'}</Text>
          </View>
        </View>
      </TouchableRipple>
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
    fontSize: FONT_SIZE.base,
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
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.pill,
    elevation: 2,
    height: 20,
    position: 'absolute',
    width: 20,
  },
  switchTrack: {
    borderRadius: BORDER_RADIUS.pill,
    height: 24,
    justifyContent: 'center',
    width: 44,
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
