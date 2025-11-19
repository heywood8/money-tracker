import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

export default function Header({ onOpenSettings }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();

  return (
    <Appbar.Header
      elevated
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          paddingTop: insets.top,
        }
      ]}
    >
      <Appbar.Content title={t('Money Tracker') || 'Money Tracker'} />
      <Appbar.Action
        icon="cog"
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityHint="Opens settings menu"
      />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  container: {
    elevation: 2,
  },
});
