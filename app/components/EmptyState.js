import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { FONT_SIZE, SPACING } from '../styles/designTokens';

const ICON_SETS = {
  material: Icon,
  ionicons: Ionicons,
};

/**
 * EmptyState — the "there is nothing here yet" block.
 *
 * Every list, chart and panel that can come up empty renders this. Before it
 * was adopted app-wide there were eleven hand-rolled versions: message text at
 * 14px and 16px, one with a fixed 120px height, one with 80px of top padding,
 * some with `lineHeight: 20` and the rest without — all of them saying the same
 * thing in a slightly different voice.
 *
 * Two props exist so the hosts that differ for real reasons can use it rather
 * than fork it again:
 *
 *  - `iconSet` — the notification panels draw from Ionicons and everything else
 *    from MaterialCommunityIcons. That is a glyph choice, not a layout one, so
 *    it is a prop instead of a reason to keep a second component.
 *  - `fill` — an empty state that owns a whole list viewport centres itself in
 *    it (`flexGrow: 1`); one that sits inline in a scrolling panel, with other
 *    content above and below it, must take only the height it needs.
 */
const EmptyState = ({
  icon,
  iconSet = 'material',
  iconSize = 48,
  message,
  fill = true,
  style,
  testID,
}) => {
  const { colors } = useThemeColors();
  const IconComponent = ICON_SETS[iconSet];

  return (
    <View testID={testID} style={[styles.container, fill && styles.fill, style]}>
      {icon ? (
        <IconComponent name={icon} size={iconSize} color={colors.mutedText} />
      ) : null}
      <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>
    </View>
  );
};

EmptyState.propTypes = {
  icon: PropTypes.string,
  iconSet: PropTypes.oneOf(['material', 'ionicons']),
  iconSize: PropTypes.number,
  message: PropTypes.node.isRequired,
  fill: PropTypes.bool,
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  fill: {
    flexGrow: 1,
  },
  message: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
    textAlign: 'center',
  },
});

export default EmptyState;
