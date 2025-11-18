import React, { useMemo, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OperationsScreen from './OperationsScreen';
import AccountsScreen from './AccountsScreen';
import CategoriesScreen from './CategoriesScreen';
import GraphsScreen from './GraphsScreen';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import Header from './Header';
import SettingsModal from './SettingsModal';

// Memoized tab button component to prevent unnecessary re-renders
const TabButton = memo(({ tab, isActive, colors, onPress }) => {
  const tabStyle = useMemo(() => [
    styles.tab,
    isActive && { backgroundColor: colors.selected }
  ], [isActive, colors.selected]);

  const textStyle = useMemo(() => [
    styles.tabText,
    { color: isActive ? colors.text : colors.mutedText },
    isActive && styles.tabTextActive
  ], [isActive, colors.text, colors.mutedText]);

  const handlePress = useCallback(() => {
    onPress(tab.key);
  }, [onPress, tab.key]);

  return (
    <TouchableOpacity
      style={tabStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Text style={textStyle}>{tab.label}</Text>
    </TouchableOpacity>
  );
});

TabButton.displayName = 'TabButton';

export default function SimpleTabs() {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const [active, setActive] = React.useState('Operations');
  const [settingsVisible, setSettingsVisible] = React.useState(false);

  const TABS = useMemo(() => [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Accounts', label: t('accounts') || 'Accounts' },
    { key: 'Categories', label: t('categories') || 'Categories' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
  ], [t]);

  const handleTabPress = useCallback((tabKey) => {
    setActive(tabKey);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsVisible(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  const renderActive = useCallback(() => {
    switch (active) {
      case 'Operations':
        return <OperationsScreen />;
      case 'Accounts':
        return <AccountsScreen />;
      case 'Categories':
        return <CategoriesScreen />;
      case 'Graphs':
        return <GraphsScreen />;
      default:
        return <OperationsScreen />;
    }
  }, [active]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header onOpenSettings={handleOpenSettings} />
      <View style={styles.content}>{renderActive()}</View>
      <SettingsModal visible={settingsVisible} onClose={handleCloseSettings} />
      <SafeAreaView style={[styles.tabBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]} edges={['bottom']}>
        {TABS.map(tab => (
          <TabButton
            key={tab.key}
            tab={tab}
            isActive={active === tab.key}
            colors={colors}
            onPress={handleTabPress}
          />
        ))}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 56, // Ensure adequate touch target
  },
  tabText: { fontSize: 13 },
  tabTextActive: { fontWeight: '700' },
});
