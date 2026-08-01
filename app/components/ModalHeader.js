import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { FONT_SIZE, SPACING } from '../styles/designTokens';
import { MODAL_TITLE } from '../styles/componentStyles';

const ModalHeader = ({ title, testID }) => {
  const { colors } = useThemeColors();

  return (
    <Text testID={testID} style={[styles.title, { color: colors.text }]}>
      {title}
    </Text>
  );
};

ModalHeader.propTypes = {
  title: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  title: {
    ...MODAL_TITLE,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
});

export default ModalHeader;
