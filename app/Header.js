import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

export default function Header({ onOpenSettings }) {
  const { colors } = useTheme();
  const { t } = useLocalization();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        }
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityRole="button"
        accessibilityHint="Opens settings menu"
        style={styles.settingsButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="settings-outline" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: { fontSize: 14, fontWeight: '700' },
  settingsButton: {
    padding: 8,
  },
});
