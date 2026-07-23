import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { SPACING, BORDER_RADIUS, FONT_SIZE, ICON_SIZE } from '../../styles/designTokens';

// Height reserved for the floating action bar; used to decide whether it fits
// above the pressed row or has to sit below it.
const PANEL_HEIGHT = 68;
const GAP = 10;

/**
 * Context action menu shown on long-pressing an operation row.
 *
 * Instead of a plain "choose action" dialog, the pressed row is lifted above a
 * blurred backdrop (a static clone rendered at its measured window position) and
 * a compact icon bar floats just above (or below) it. Tapping the backdrop or
 * pressing back dismisses it.
 *
 * The parent owns visibility: pass a `menu` object to open, `null` to close.
 * Entrance is animated; closing unmounts immediately (a snappy dismiss is the
 * expected feel for a context menu, and keeping no internal open/close state
 * avoids setState-in-effect churn).
 */
export default function OperationActionMenu({ menu, colors, t, onClose, onEdit, onRepeat, onDelete }) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (menu) {
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }).start();
    }
  }, [menu, progress]);

  if (!menu) return null;

  const { layout, row } = menu;
  const screenHeight = Dimensions.get('window').height;

  // Where the floating icon bar goes. Prefer above the row; fall back to below.
  // Both edges are bounded so the bar never lands under the status bar / notch
  // or under the bottom inset (tab bar / gesture area) for a near-edge row.
  let panelTop;
  let panelPlacedAbove = true;
  if (layout) {
    const topLimit = insets.top + SPACING.sm;
    const bottomLimit = screenHeight - insets.bottom - SPACING.sm - PANEL_HEIGHT;
    const above = layout.y - GAP - PANEL_HEIGHT;
    const below = layout.y + layout.height + GAP;
    if (above >= topLimit) {
      panelTop = above;
    } else if (below <= bottomLimit) {
      panelTop = below;
      panelPlacedAbove = false;
    } else {
      // Neither side fully clears an inset — clamp into the visible area.
      panelTop = Math.max(topLimit, Math.min(above, bottomLimit));
    }
  } else {
    // No measurement (rare): center the bar on screen.
    panelTop = screenHeight / 2 - PANEL_HEIGHT / 2;
    panelPlacedAbove = false;
  }

  const backdropStyle = { opacity: progress };
  const cloneStyle = {
    opacity: progress,
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };
  const panelStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [panelPlacedAbove ? SPACING.sm : -SPACING.sm, 0],
        }),
      },
    ],
  };

  const deleteColor = colors.delete || colors.expense || '#d32f2f';

  return (
    <>
      <ModalBlurOverlay />
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <Pressable
          testID="operation-action-menu-backdrop"
          style={styles.fill}
          onPress={onClose}
        >
          <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />

          {/* Lifted clone of the pressed row */}
          {layout && row && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.clone,
                cloneStyle,
                {
                  top: layout.y,
                  left: layout.x,
                  width: layout.width,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {row}
            </Animated.View>
          )}

          {/* Floating icon action bar. Wrapped in a non-press-through Pressable so
              taps on the bar don't fall through to the dismiss backdrop. */}
          <Animated.View
            style={[
              styles.panel,
              panelStyle,
              {
                top: panelTop,
                left: layout ? layout.x : SPACING.lg,
                width: layout ? layout.width : Dimensions.get('window').width - SPACING.lg * 2,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Pressable style={styles.panelRow} onPress={() => {}}>
              <ActionButton
                testID="operation-action-edit"
                icon="pencil"
                label={t('edit')}
                color={colors.primary}
                textColor={colors.text}
                onPress={onEdit}
              />
              <ActionButton
                testID="operation-action-repeat"
                icon="repeat"
                label={t('repeat')}
                color={colors.primary}
                textColor={colors.text}
                onPress={onRepeat}
              />
              <ActionButton
                testID="operation-action-delete"
                icon="trash-can-outline"
                label={t('delete')}
                color={deleteColor}
                textColor={deleteColor}
                onPress={onDelete}
              />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function ActionButton({ testID, icon, label, color, textColor, onPress }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={ICON_SIZE.md} color={color} />
      <Text style={[styles.actionLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

ActionButton.propTypes = {
  testID: PropTypes.string,
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  textColor: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
};

OperationActionMenu.propTypes = {
  menu: PropTypes.shape({
    operation: PropTypes.object,
    layout: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    row: PropTypes.node,
  }),
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onRepeat: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  actionButtonPressed: {
    opacity: 0.55,
  },
  actionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  clone: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    elevation: 8,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  fill: {
    flex: 1,
  },
  panel: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    elevation: 10,
    height: PANEL_HEIGHT,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  panelRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: SPACING.sm,
  },
});
