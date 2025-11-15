import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import OperationsScreen from './OperationsScreen';
import AccountsScreen from './AccountsScreen';
import CategoriesScreen from './CategoriesScreen';
import GraphsScreen from './GraphsScreen';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import Header from './Header';
import SettingsModal from './SettingsModal';

export default function SimpleTabs() {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const [active, setActive] = React.useState('Operations');
  const [settingsVisible, setSettingsVisible] = React.useState(false);

  const TABS = [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Accounts', label: t('accounts') || 'Accounts' },
    { key: 'Categories', label: t('categories') || 'Categories' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
  ];

  const renderActive = () => {
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
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Header onOpenSettings={() => setSettingsVisible(true)} />
      <View style={styles.content}>{renderActive()}</View>
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <View style={[styles.tabBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}> 
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, active === tab.key && { backgroundColor: colors.selected }]}
            onPress={() => setActive(tab.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active === tab.key }}
          >
            <Text style={[styles.tabText, { color: active === tab.key ? colors.text : colors.mutedText }, active === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 80 : 56,
    paddingBottom: Platform.OS === 'ios' ? 24 : 0,
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontSize: 13 },
  tabTextActive: { fontWeight: '700' },
});
