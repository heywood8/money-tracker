import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

export default function Header({ onOpenSettings }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingTop: insets.top + 8,
        }
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('Money Tracker') || 'Money Tracker'}</Text>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityRole="button"
        accessibilityHint="Opens settings menu"
        style={[styles.burger, { backgroundColor: colors.secondary }]}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  burger: {
    width: 44,  // Increased to minimum touch target
    height: 44, // Increased to minimum touch target
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: { width: 18, height: 2, marginVertical: 2 },
});
