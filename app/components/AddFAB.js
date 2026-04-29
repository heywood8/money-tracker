import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING } from '../styles/layout';

const AddFAB = ({ onPress, testID, accessibilityLabel, accessibilityHint }) => {
  const { colors } = useThemeColors();

  return (
    <FAB
      testID={testID}
      icon="plus"
      style={[
        styles.fab,
        {
          backgroundColor: colors.surface + 'DE',
          borderColor: colors.border + '80',
        },
      ]}
      color={colors.text}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    />
  );
};

const styles = StyleSheet.create({
  fab: {
    borderRadius: 28,
    borderWidth: 1,
    bottom: 100,
    elevation: 8,
    margin: SPACING.lg,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});

export default AddFAB;
