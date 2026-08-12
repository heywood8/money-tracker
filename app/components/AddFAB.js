import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { BORDER_RADIUS, SPACING } from '../styles/designTokens';

/**
 * Distance from the bottom of the FAB's parent to the bottom of the button
 * (its `bottom` offset plus its own margin). Exported so a screen that floats
 * something else down there — an undo bar, a banner — can work out whether the
 * two overlap instead of guessing at the number.
 */
export const FAB_BOTTOM_OFFSET = 100 + SPACING.lg;

const AddFAB = ({ onPress, testID, accessibilityLabel, accessibilityHint, icon = 'plus' }) => {
  const { colors } = useThemeColors();

  return (
    <FAB
      testID={testID}
      icon={icon}
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

AddFAB.propTypes = {
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
  accessibilityLabel: PropTypes.string,
  accessibilityHint: PropTypes.string,
  // Defaults to the plus this component is named for; a host that toggles a
  // surface open and closed with the same button passes 'close' for the open
  // state, so the button says what the next tap does.
  icon: PropTypes.string,
};

const styles = StyleSheet.create({
  fab: {
    borderRadius: BORDER_RADIUS.xl,
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
