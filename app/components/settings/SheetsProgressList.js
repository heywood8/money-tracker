import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// The step-by-step readout both Google Sheets flows show while they run: one row
// per stage, each carrying its own state. Export and import differ in what they
// put *below* the list (a link to the new sheet; an error), so that stays with
// each panel and only the list itself is shared.
//
// `children` renders under the steps, inside the same padded container.
export default function SheetsProgressList({ steps, children }) {
  const { colors } = useThemeColors();

  return (
    <View style={styles.content}>
      {steps.map(step => (
        <View key={step.id} style={styles.step}>
          <View style={styles.stepIcon}>
            {step.status === 'pending' && <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />}
            {step.status === 'in_progress' && <ActivityIndicator size="small" color={colors.primary} />}
            {step.status === 'completed' && <Ionicons name="checkmark-circle" size={22} color="#4caf50" />}
            {step.status === 'error' && <Ionicons name="close-circle" size={22} color={colors.destructive} />}
          </View>
          <Text style={[
            styles.stepLabel,
            step.status === 'error' ? { color: colors.destructive } :
              { color: step.status === 'pending' ? colors.mutedText : colors.text },
          ]}>
            {step.label}
          </Text>
        </View>
      ))}
      {children}
    </View>
  );
}

SheetsProgressList.propTypes = {
  steps: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
    status: PropTypes.oneOf(['pending', 'in_progress', 'completed', 'error']),
  })).isRequired,
  children: PropTypes.node,
};

// Shown under the steps when a flow fails.
export const sheetsErrorTextStyle = {
  fontSize: FONT_SIZE.md,
  lineHeight: 20,
  marginTop: SPACING.lg,
  textAlign: 'center',
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.lg,
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  stepIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
  },
  stepLabel: {
    flex: 1,
    fontSize: 15,
  },
});
