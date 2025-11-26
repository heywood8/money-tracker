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
          paddingTop: insets.top,
        }
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityRole="button"
        accessibilityHint="Opens settings menu"
        style={[styles.burger, { backgroundColor: colors.secondary }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: { fontSize: 11, fontWeight: '700' },
  burger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: { width: 14, height: 2, marginVertical: 1.5 },
});
