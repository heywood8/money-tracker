import React, { memo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView, StyleSheet } from 'react-native';
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
      style={[styles.container, { opacity: fadeAnim }]}
    >
      <View style={styles.row}>
        <View style={styles.xSlot}>
          <TouchableOpacity
            onPress={onDismiss}
            style={[styles.chip, styles.dismissChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="dismiss suggestion"
          >
            <Text style={[styles.chipText, { color: colors.mutedText }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {chips.map((chip) => (
            <TouchableOpacity
              key={chip}
              onPress={() => onApply(chip)}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel={`label: ${chip}`}
            >
              <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingRight: SPACING.lg,
  },
  chipScroll: {
    flex: 1,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  container: {
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
  dismissChip: {
    paddingHorizontal: SPACING.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.lg,
  },
  xSlot: {
    alignItems: 'flex-start',
    marginRight: SPACING.md,
    width: 32,
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
