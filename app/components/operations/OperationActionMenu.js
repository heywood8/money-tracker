import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { OverlayPortal } from '../../contexts/OverlayHostContext';
import { SPACING, BORDER_RADIUS, FONT_SIZE, ICON_SIZE } from '../../styles/designTokens';
import { isReduceMotionEnabled } from '../../utils/reducedMotion';

// Height reserved for the floating action bar; used to decide whether it fits
// above the pressed row or has to sit below it.
const PANEL_HEIGHT = 68;
const GAP = 10;

/**
 * Context action menu shown on long-pressing an operation row.
 *
 * Instead of a plain "choose action" dialog, the pressed row is lifted above a
 * blurred backdrop (a static clone rendered at its measured position) and a compact
 * icon bar floats just above (or below) it. Tapping the backdrop or pressing back
 * dismisses it.
 *
 * The clone is drawn in the app-wide overlay layer (OverlayPortal), NOT in a core
 * `<Modal>`. That is the whole trick: a Modal is a separate native window, so a row
 * measured in the app's coordinates and re-drawn inside that window drifts by
 * whatever the two origins disagree on — a status bar's worth of offset on
 * edge-to-edge Android, which is exactly what made the row visibly jump on long
 * press. The overlay shares a parent with the content it covers, so `layout.y` means
 * the same thing on both sides and the clone always lands on the row.
 *
 * Actions: edit, repeat, hide-from-charts (expense/income only — see below) and
 * delete.
 *
 * The parent owns visibility: pass a `menu` object to open, `null` to close.
 * Entrance is animated; closing unmounts immediately (a snappy dismiss is the
 * expected feel for a context menu, and keeping no internal open/close state
 * avoids setState-in-effect churn).
 */
export default function OperationActionMenu({ menu, colors, t, onClose, onEdit, onRepeat, onToggleCharts, onDelete }) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // Height of the overlay layer itself, not of the screen: the layer is the box the
  // panel is being placed in, so clamping against anything else re-introduces the
  // guesswork this component just got rid of. Seeded from window height for the
  // first frame, corrected by the first onLayout.
  const [layerHeight, setLayerHeight] = useState(() => Dimensions.get('window').height);

  const handleLayerLayout = useCallback((e) => {
    const { height } = e.nativeEvent.layout;
    setLayerHeight((prev) => (height > 0 && height !== prev ? height : prev));
  }, []);

  // The overlay is not a native window, so the hardware back button is ours to handle.
  useEffect(() => {
    if (!menu) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [menu, onClose]);

  useEffect(() => {
    if (menu) {
      // Under the OS "Remove animations" setting the menu is simply present: the
      // lift is what carries the meaning here, and there is no fade left to keep
      // once it is gone (`progress` drives the backdrop and the clone together).
      if (isReduceMotionEnabled()) {
        progress.setValue(1);
        return;
      }
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

  // Where the floating icon bar goes. Prefer above the row; fall back to below.
  // Both edges are bounded so the bar never lands under the status bar / notch
  // or under the bottom inset (tab bar / gesture area) for a near-edge row.
  let panelTop;
  let panelPlacedAbove = true;
  if (layout) {
    const topLimit = insets.top + SPACING.sm;
    const bottomLimit = layerHeight - insets.bottom - SPACING.sm - PANEL_HEIGHT;
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
    panelTop = layerHeight / 2 - PANEL_HEIGHT / 2;
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

  // Transfers feed no chart, so the hide/show action would be a no-op for them.
  // Balance adjustments DO get it: they have no editable form, which makes this
  // menu their only way to leave the charts.
  const operationType = menu.operation?.type;
  const showChartsAction = operationType === 'expense' || operationType === 'income';
  const hiddenFromCharts = !!menu.operation?.excludeFromCharts;

  return (
    <>
      <ModalBlurOverlay />
      <OverlayPortal>
        <Pressable
          testID="operation-action-menu-backdrop"
          style={styles.fill}
          onPress={onClose}
          onLayout={handleLayerLayout}
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
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              // Anchored to the row when it was measured; otherwise inset from both
              // edges of the layer, which needs no width arithmetic at all.
              layout
                ? { left: layout.x, width: layout.width }
                : { left: SPACING.lg, right: SPACING.lg },
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
              {showChartsAction && (
                <ActionButton
                  testID="operation-action-charts"
                  icon={hiddenFromCharts ? 'eye-outline' : 'eye-off-outline'}
                  // Short label — four buttons share the row width. The full
                  // phrase goes to the accessibility label.
                  label={hiddenFromCharts ? t('show_in_charts') : t('hide_from_charts')}
                  a11yLabel={hiddenFromCharts ? t('include_in_charts') : t('exclude_from_charts')}
                  color={hiddenFromCharts ? colors.mutedText : colors.primary}
                  textColor={colors.text}
                  onPress={onToggleCharts}
                />
              )}
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
      </OverlayPortal>
    </>
  );
}

function ActionButton({ testID, icon, label, a11yLabel, color, textColor, onPress }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel || label}
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
  a11yLabel: PropTypes.string,
  color: PropTypes.string.isRequired,
  textColor: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
};

OperationActionMenu.propTypes = {
  menu: PropTypes.shape({
    // Carries `type` and `excludeFromCharts`, which decide whether the
    // hide/show-in-charts action is offered and which way it points.
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
  onToggleCharts: PropTypes.func.isRequired,
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
