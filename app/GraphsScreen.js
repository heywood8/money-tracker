import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';

const GraphsScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={{ color: colors.text, fontSize: 18 }}>{t('graphs') || 'Graphs'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default GraphsScreen;
