import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

export default function Header({ onOpenSettings }) {
  const { colors, colorScheme } = useTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();

  const HeaderContainer = Platform.OS === 'web' ? View : BlurView;
  const blurProps = Platform.OS !== 'web' ? {
    intensity: 80,
    tint: colorScheme === 'dark' ? 'dark' : 'light',
  } : {};

  return (
    <HeaderContainer
      {...blurProps}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.glassBorder,
          borderBottomWidth: 1,
          paddingTop: insets.top + 8,
          shadowColor: colors.glassShadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
        }
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('Money Tracker') || 'Money Tracker'}</Text>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityRole="button"
        accessibilityHint="Opens settings menu"
        style={[styles.burger, {
          backgroundColor: colors.glassBackground,
          borderWidth: 1,
          borderColor: colors.glassBorder,
        }]}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
        <View style={[styles.line, { backgroundColor: colors.text }]} />
      </TouchableOpacity>
    </HeaderContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  burger: {
    width: 44,  // Increased to minimum touch target
    height: 44, // Increased to minimum touch target
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: { width: 18, height: 2, marginVertical: 2, borderRadius: 1 },
});
