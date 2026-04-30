import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING } from '../styles/layout';

const LoadingView = ({ message, testID }) => {
  const { colors } = useThemeColors();

  return (
    <View
      testID={testID}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text variant="bodyLarge" style={[styles.message, { color: colors.mutedText }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
};

LoadingView.propTypes = {
  message: PropTypes.string,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    marginTop: SPACING.md,
  },
});

export default LoadingView;
