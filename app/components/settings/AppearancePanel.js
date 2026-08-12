import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useThemeConfig } from '../../contexts/ThemeConfigContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { SettingToggleRow, SETTINGS_LIST_CONTENT } from './SettingsRows';
import { SECTION_LABEL } from '../../styles/componentStyles';
import { HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// Everything that decides how the app looks and which tabs it offers. These five
// toggles used to sit on the settings root, where they took up more than half a
// screen of two-line rows and pushed everything else below the fold — they are
// set once and then left alone, which is exactly the kind of setting that
// belongs one tap in rather than in the way.
export default function AppearancePanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { colorScheme, setTheme } = useThemeConfig();
  const { t } = useLocalization();
  const {
    showAccountsTab, setShowAccountsTab,
    showBudgetTab, setShowBudgetTab,
    showQuickAddPanel, setShowQuickAddPanel,
  } = useDisplaySettings();

  const handleToggleDarkMode = useCallback(() => {
    setTheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setTheme]);

  const handleToggleShowAccountsTab = useCallback(() => {
    setShowAccountsTab(!showAccountsTab);
  }, [showAccountsTab, setShowAccountsTab]);

  const handleToggleShowBudgetTab = useCallback(() => {
    setShowBudgetTab(!showBudgetTab);
  }, [showBudgetTab, setShowBudgetTab]);

  const handleToggleShowQuickAddPanel = useCallback(() => {
    setShowQuickAddPanel(!showQuickAddPanel);
  }, [showQuickAddPanel, setShowQuickAddPanel]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
      <SettingToggleRow
        icon={colorScheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
        label={t('theme') || 'Theme'}
        hint={colorScheme === 'dark' ? t('theme_dark') : t('theme_light')}
        value={colorScheme === 'dark'}
        onToggle={handleToggleDarkMode}
        testID="settings-theme-row"
      />

      <SettingToggleRow
        icon="flash-outline"
        label={t('show_quickadd_panel') || 'Show Quick add panel on operations screen'}
        hint={t('show_quickadd_panel_hint') || 'Keep the quick add form open; off collapses it behind the + button'}
        value={showQuickAddPanel}
        onToggle={handleToggleShowQuickAddPanel}
        testID="settings-show-quickadd-panel-row"
      />

      {/* Only the two tab toggles belong under this heading — the quick-add
        panel above is on the operations screen, not in the bottom navigation. */}
      <Text variant="labelLarge" style={[styles.sectionLabel, { color: colors.mutedText }]}>
        {t('main_menu') || 'Main menu'}
      </Text>

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
    </ScrollView>
  );
}

AppearancePanel.propTypes = {
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  content: {
    ...SETTINGS_LIST_CONTENT,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
});
