import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableRipple, Text, Surface } from 'react-native-paper';
import OperationsScreen from '../screens/OperationsScreen';
import AccountsScreen from '../screens/AccountsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import GraphsScreen from '../screens/GraphsScreen';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import Header from '../components/Header';
import SettingsModal from '../modals/SettingsModal';

// Memoized tab button component to prevent unnecessary re-renders
const TabButton = memo(({ tab, isActive, colors, onPress }) => {
  const textStyle = useMemo(() => ({
    fontWeight: isActive ? '700' : 'normal',
    color: isActive ? colors.primary : colors.mutedText,
  }), [isActive, colors.primary, colors.mutedText]);

  const handlePress = useCallback(() => {
    onPress(tab.key);
  }, [onPress, tab.key]);

  return (
    <TouchableRipple
      style={styles.tab}
      onPress={handlePress}
      rippleColor="rgba(0, 0, 0, .12)"
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={styles.tabContent}>
        <Text variant="labelMedium" style={textStyle}>
          {tab.label}
        </Text>
        {isActive && <View style={[styles.indicator, { backgroundColor: colors.primary }]} />}
      </View>
    </TouchableRipple>
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
      <Surface style={styles.tabBarSurface} elevation={3}>
        <SafeAreaView style={styles.tabBar} edges={['bottom']}>
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
      </Surface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  tabBarSurface: {
    elevation: 3,
  },
  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 56,
  },
  tabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
