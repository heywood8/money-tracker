import { View, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING } from '../styles/designTokens';

export default function Header({ rightContent = null }) {
  const { colors } = useThemeColors();

  if (!rightContent) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View style={styles.buttonContainer}>{rightContent}</View>
    </View>
  );
}

Header.propTypes = {
  rightContent: PropTypes.node,
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingBottom: 2,
    paddingTop: 2,
  },
});
