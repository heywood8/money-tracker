import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { HEIGHTS, BORDER_RADIUS, SPACING, ICON_SIZE } from '../styles/designTokens';

/**
 * ListCard - Unified card component for all list rows
 *
 * This component standardizes the appearance and behavior of list items across
 * the app (accounts, operations, categories). It provides:
 * - Consistent 56px height
 * - Variant-based styling (default, expense, income, transfer)
 * - Optional left icon with circular background
 * - Optional right action area (drag handles, etc.)
 * - Alternating row backgrounds
 * - Ripple effect and accessibility support
 *
 * Usage examples:
 *
 * // Account row with drag handle
 * <ListCard
 *   variant="default"
 *   alternateBackground={index % 2 === 1}
 *   onPress={() => handleEdit(account.id)}
 *   rightAction={<DragHandle onLongPress={drag} />}
 * >
 *   <AccountContent account={account} />
 * </ListCard>
 *
 * // Operation row with category icon
 * <ListCard
 *   variant="expense"
 *   leftIcon="cart"
 *   leftIconBackground
 *   onPress={() => handleEdit(operation.id)}
 * >
 *   <OperationContent operation={operation} />
 * </ListCard>
 *
 * // Category row (nested with indent)
 * <ListCard
 *   variant="expense"
 *   leftIcon="folder"
 *   onPress={() => toggleExpand(category.id)}
 *   onLongPress={() => handleLongPress(category)}
 *   style={{ paddingLeft: depth * 20 }}
 * >
 *   <CategoryContent category={category} />
 * </ListCard>
 */
export default function ListCard({
  variant = 'default',
  onPress,
  onLongPress,
  leftIcon,
  leftIconColor,
  leftIconSize = ICON_SIZE.base,
  leftIconBackground = false,
  rightAction,
  showBorder = true,
  alternateBackground = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  children,
}) {
  const { colors } = useThemeColors();

  /**
   * Determine background color based on variant and alternateBackground
   */
  const getBackgroundColor = () => {
    // Alternating backgrounds take precedence for default variant
    if (variant === 'default' && alternateBackground) {
      return colors.altRow;
    }

    switch (variant) {
    case 'expense':
      return colors.altRow;
    case 'income':
      return colors.altRow;
    case 'transfer':
      return colors.altRow;
    default:
      return colors.background;
    }
  };

  /**
   * Determine icon color based on variant or explicit override
   */
  const getIconColor = () => {
    if (leftIconColor) return leftIconColor;

    switch (variant) {
    case 'expense':
      return colors.expense || colors.text;
    case 'income':
      return colors.income || colors.text;
    case 'transfer':
      return colors.transfer || colors.text;
    default:
      return colors.text;
    }
  };

  // Memoized themed style object to avoid inline style objects in JSX
  const cardThemed = React.useMemo(() => ({
    backgroundColor: getBackgroundColor(),
    borderColor: showBorder ? colors.border : 'transparent',
  }), [colors, showBorder, variant, alternateBackground]);

  /**
   * Determine icon background color when leftIconBackground is true
   */
  const getIconBackgroundColor = () => {
    switch (variant) {
    case 'expense':
      return colors.altRow;
    case 'income':
      return colors.altRow;
    case 'transfer':
      return colors.altRow;
    default:
      return colors.surface;
    }
  };

  return (
    <Card
      mode="outlined"
      style={[
        styles.card,
        cardThemed,
        style,
      ]}
    >
      <TouchableRipple
        onPress={onPress}
        onLongPress={onLongPress}
        rippleColor="rgba(0, 0, 0, .12)"
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View style={styles.content}>
          {/* Left Icon */}
          {leftIcon && (
            <View
              style={[
                styles.leftIconContainer,
                leftIconBackground && [
                  styles.iconBackground,
                  { backgroundColor: getIconBackgroundColor() },
                ],
              ]}
            >
              <Icon
                name={leftIcon}
                size={leftIconSize}
                color={getIconColor()}
              />
            </View>
          )}

          {/* Main Content Area */}
          <View style={styles.childrenContainer}>
            {children}
          </View>

          {/* Right Action Area */}
          {rightAction && (
            <View style={styles.rightActionContainer}>
              {rightAction}
            </View>
          )}
        </View>
      </TouchableRipple>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.md,
    marginHorizontal: SPACING.sm,
    marginVertical: SPACING.xs,
  },
  childrenContainer: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  iconBackground: {
    alignItems: 'center',
    borderRadius: ICON_SIZE.xl / 2,
    height: ICON_SIZE.xl,
    justifyContent: 'center',
    width: ICON_SIZE.xl, // Circular background
  },
  leftIconContainer: {
    marginRight: SPACING.md,
  },
  rightActionContainer: {
    marginLeft: SPACING.md,
  },
  touchable: {
    minHeight: HEIGHTS.listItem,
  },
});

ListCard.propTypes = {
  /**
   * Visual variant that determines color scheme
   */
  variant: PropTypes.oneOf(['default', 'expense', 'income', 'transfer']),

  /**
   * Callback when card is pressed
   */
  onPress: PropTypes.func,

  /**
   * Callback when card is long-pressed (e.g., for drag-and-drop)
   */
  onLongPress: PropTypes.func,

  /**
   * Material Community Icon name for left icon
   */
  leftIcon: PropTypes.string,

  /**
   * Override icon color (if not using variant colors)
   */
  leftIconColor: PropTypes.string,

  /**
   * Icon size in pixels (default: 24)
   */
  leftIconSize: PropTypes.number,

  /**
   * Whether to show circular background behind icon
   */
  leftIconBackground: PropTypes.bool,

  /**
   * Custom component to render in right action area
   * (e.g., drag handle, delete button)
   */
  rightAction: PropTypes.element,

  /**
   * Whether to show border around card (default: true)
   */
  showBorder: PropTypes.bool,

  /**
   * Whether to use alternate background color (for striped lists)
   */
  alternateBackground: PropTypes.bool,

  /**
   * Additional style overrides for the card
   */
  style: PropTypes.object,

  /**
   * Accessibility label for screen readers
   */
  accessibilityLabel: PropTypes.string,

  /**
   * Accessibility hint for screen readers
   */
  accessibilityHint: PropTypes.string,

  /**
   * Card content (required)
   */
  children: PropTypes.node.isRequired,
};
