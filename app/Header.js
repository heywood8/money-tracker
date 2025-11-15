import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

export default function Header({ onOpenSettings }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}> 
      <Text style={[styles.title, { color: colors.text }]}>{t('Money Tracker') || 'Money Tracker'}</Text>
      <TouchableOpacity onPress={onOpenSettings} accessibilityLabel={t('settings')} style={[styles.burger, { backgroundColor: colors.secondary }]}>
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 96,
    paddingHorizontal: 16,
    paddingTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  burger: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  line: { width: 18, height: 2, marginVertical: 2 },
});
