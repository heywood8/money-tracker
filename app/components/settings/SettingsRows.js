import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// The two row shapes the settings root and its preference panels are built from.
// They live here rather than in the settings list because the list no longer
// holds every preference: the toggles moved into the Appearance and Privacy
// panels, and a row copied into each would be three definitions of the same row.

const SPRING_CONFIG = { mass: 1, damping: 20, stiffness: 200 };

/**
 * A settings row with an animated on/off switch. `hintError` renders the hint in
 * the error colour (used for the location "permission denied" state).
 */
export const SettingToggleRow = ({ icon, label, hint, value, onToggle, hintError = false, testID }) => {
  const { colors } = useThemeColors();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING_CONFIG);
  }, [value, progress]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + progress.value * 20 }],
  }));

  return (
    <TouchableRipple onPress={onToggle} style={styles.settingsRow} testID={testID}>
      <View style={styles.settingsRowContent}>
        <View style={styles.settingsRowLeft}>
          <Ionicons name={icon} size={22} color={colors.text} />
          <View style={styles.settingsRowText}>
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.settingsRowValue, { color: hintError ? colors.destructive : colors.mutedText }]}>
              {hint}
            </Text>
          </View>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: value ? colors.primary : colors.border }]}>
          <Animated.View style={[styles.switchThumb, thumbStyle]} />
        </View>
      </View>
    </TouchableRipple>
  );
};

SettingToggleRow.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  value: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  hintError: PropTypes.bool,
  testID: PropTypes.string,
};

/**
 * A settings row that leads somewhere: icon, label, an optional description line
 * and a trailing chevron. `right` replaces the chevron when the row has
 * something of its own to show (the update row's version / progress), and
 * `destructive` paints it in the error colour and drops the chevron — a wipe
 * confirmation is not a place you navigate to, it is an action you arm.
 */
export const SettingsNavRow = ({
  icon, label, hint, onPress, right, disabled = false, destructive = false, testID,
}) => {
  const { colors } = useThemeColors();
  const tint = destructive ? colors.destructive : (disabled ? colors.mutedText : colors.text);

  return (
    <TouchableRipple
      onPress={disabled ? undefined : onPress}
      style={[styles.settingsRow, disabled && styles.settingsRowDisabled]}
      disabled={disabled}
      testID={testID}
    >
      <View style={styles.settingsRowContent}>
        <View style={styles.settingsRowLeft}>
          <Ionicons name={icon} size={22} color={tint} />
          <View style={styles.settingsRowText}>
            <Text style={[styles.settingsRowLabel, { color: tint }]}>{label}</Text>
            {!!hint && (
              <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>{hint}</Text>
            )}
          </View>
        </View>
        {right ?? (destructive
          ? null
          : <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />)}
      </View>
    </TouchableRipple>
  );
};

SettingsNavRow.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  onPress: PropTypes.func,
  right: PropTypes.node,
  disabled: PropTypes.bool,
  destructive: PropTypes.bool,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  settingsRow: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  settingsRowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  settingsRowDisabled: {
    opacity: 0.6,
  },
  settingsRowLabel: {
    fontSize: FONT_SIZE.base,
  },
  settingsRowLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  settingsRowText: {
    flex: 1,
    flexShrink: 1,
  },
  settingsRowValue: {
    fontSize: 13,
    marginTop: 2,
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.pill,
    elevation: 2,
    height: 20,
    position: 'absolute',
    width: 20,
  },
  switchTrack: {
    borderRadius: BORDER_RADIUS.pill,
    height: 24,
    justifyContent: 'center',
    width: 44,
  },
});

// The padding a settings-style list needs around the rows above. Panels that are
// nothing but rows spread this into their own scroll container.
export const SETTINGS_LIST_CONTENT = {
  paddingTop: SPACING.sm,
};
