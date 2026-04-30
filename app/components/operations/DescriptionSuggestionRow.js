import React, { memo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { SPACING, FONT_SIZE, BORDER_RADIUS, DURATION } from '../../styles/designTokens';

const DescriptionSuggestionRow = ({ chips, colors, onApply, onDismiss }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: DURATION.fast,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim, borderTopColor: colors.border }]}
    >
      <View style={styles.hintRow}>
        <Text style={[styles.hint, { color: colors.primary }]}>label this?</Text>
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="skip suggestion"
        >
          <Text style={[styles.skip, { color: colors.mutedText }]}>skip</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chipRow}>
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip}
            onPress={() => onApply(chip)}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`label: ${chip}`}
          >
            <Text style={[styles.chipText, { color: colors.primary }]}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  container: {
    borderTopWidth: 1,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
  },
  hintRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  skip: {
    fontSize: FONT_SIZE.sm,
  },
});

DescriptionSuggestionRow.propTypes = {
  chips: PropTypes.arrayOf(PropTypes.string).isRequired,
  colors: PropTypes.shape({
    border: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
    mutedText: PropTypes.string.isRequired,
    surface: PropTypes.string.isRequired,
  }).isRequired,
  onApply: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

export default memo(DescriptionSuggestionRow);
