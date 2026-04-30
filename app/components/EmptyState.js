import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING } from '../styles/layout';
import { FONT_SIZE } from '../styles/designTokens';

const EmptyState = ({ icon, iconSize = 48, message, testID }) => {
  const { colors } = useThemeColors();

  return (
    <View testID={testID} style={styles.container}>
      {icon ? (
        <Icon name={icon} size={iconSize} color={colors.mutedText} />
      ) : null}
      <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>
    </View>
  );
};

EmptyState.propTypes = {
  icon: PropTypes.string,
  iconSize: PropTypes.number,
  message: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  message: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
});

export default EmptyState;
