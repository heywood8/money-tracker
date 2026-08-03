import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalBlurOverlay from './ModalBlurOverlay';
import { OverlayPortal } from '../contexts/OverlayHostContext';
import { SPACING, BORDER_RADIUS, FONT_SIZE, ICON_SIZE } from '../styles/designTokens';
import { isReduceMotionEnabled } from '../utils/reducedMotion';

// Height of one row of action buttons; a menu with more actions than fit across
// the row stacks a second one (see `panelRows`), so the reserved height — which
// decides whether the bar fits above the pressed row — follows the count.
const PANEL_ROW_HEIGHT = 68;
const GAP = 10;
// Past four across, the labels stop being readable at a row's width.
const MAX_PER_ROW = 4;

/**
 * How the actions are laid out: at most MAX_PER_ROW across, and when a second row
 * is needed the two are balanced (5 actions read 3 + 2, not 4 + 1) so no single
 * button ends up alone at double width.
 */
const panelRows = (count) => Math.max(1, Math.ceil(count / MAX_PER_ROW));
const perRow = (count) => Math.ceil(count / panelRows(count));

// A closed menu's action list, as one shared value: hosts derive their actions
// from the pressed row, and a fresh `[]` per render would miss this component's
// memo on every render of a screen whose menu isn't even open.
export const NO_ACTIONS = [];

// Icon and label colour per tone. `default` is the accent; `muted` marks an
// action that undoes or hides rather than does; `destructive` is the one red on
// the bar, and it carries the label too so the button reads as dangerous at a
// glance rather than only under its glyph.
const TONES = {
  default: (colors) => ({ icon: colors.primary, text: colors.text }),
  muted: (colors) => ({ icon: colors.mutedText, text: colors.text }),
  destructive: (colors) => ({ icon: colors.destructive, text: colors.destructive }),
};

/**
 * The long-press context menu shared by every list row that offers whole-row
 * actions (operations, budget lines, budget envelopes).
 *
 * Instead of a plain "choose action" dialog, the pressed row is lifted above a
 * blurred backdrop (a static clone rendered at its measured position) and a compact
 * icon bar floats just above (or below) it. Tapping the backdrop or pressing back
 * dismisses it. The row stays visible and in place, so the actions are attached to
 * something the user can still see rather than to a title in a dialog.
 *
 * The clone is drawn in the app-wide overlay layer (OverlayPortal), NOT in a core
 * `<Modal>`. That is the whole trick: a Modal is a separate native window, so a row
 * measured in the app's coordinates and re-drawn inside that window drifts by
 * whatever the two origins disagree on — a status bar's worth of offset on
 * edge-to-edge Android, which is exactly what made the row visibly jump on long
 * press. The overlay shares a parent with the content it covers, so `layout.y` means
 * the same thing on both sides and the clone always lands on the row.
 *
 * The host owns visibility and the action list: pass a `menu` object to open, `null`
 * to close, and the `actions` the pressed row supports. Choosing an action dismisses
 * the menu before it runs — that is this component's job, not each host's, because
 * every action either opens something or asks for a confirmation, and a menu left
 * covering the screen over a dialog is the failure mode.
 *
 * Entrance is animated; closing unmounts immediately (a snappy dismiss is the
 * expected feel for a context menu, and keeping no internal open/close state avoids
 * setState-in-effect churn).
 */
function RowActionMenu({ menu, actions, colors, onClose, testIDPrefix }) {
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

  // Open-ness rather than the `menu` object itself drives both effects below: a
  // host whose lifted copy tracks live data rebuilds that object while the menu
  // is up, and keying off it would re-subscribe to back and restart the entrance
  // spring mid-animation.
  const isOpen = !!menu && actions.length > 0;

  // The overlay is not a native window, so the hardware back button is ours to handle.
  useEffect(() => {
    if (!isOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen, progress]);

  const layout = menu?.layout ?? null;
  const panelHeight = panelRows(actions.length) * PANEL_ROW_HEIGHT;

  // Where the floating icon bar goes. Prefer above the row; fall back to below.
  // Both edges are bounded so the bar never lands under the status bar / notch
  // or under the bottom inset (tab bar / gesture area) for a near-edge row.
  const { panelTop, panelPlacedAbove } = useMemo(() => {
    if (!layout) {
      // No measurement (rare): center the bar on screen.
      return { panelTop: layerHeight / 2 - panelHeight / 2, panelPlacedAbove: false };
    }
    const topLimit = insets.top + SPACING.sm;
    const bottomLimit = layerHeight - insets.bottom - SPACING.sm - panelHeight;
    const above = layout.y - GAP - panelHeight;
    const below = layout.y + layout.height + GAP;
    if (above >= topLimit) return { panelTop: above, panelPlacedAbove: true };
    if (below <= bottomLimit) return { panelTop: below, panelPlacedAbove: false };
    // Neither side fully clears an inset — clamp into the visible area.
    return {
      panelTop: Math.max(topLimit, Math.min(above, bottomLimit)),
      panelPlacedAbove: true,
    };
  }, [layout, panelHeight, layerHeight, insets.top, insets.bottom]);

  // Built once per placement rather than per render: each `interpolate` call
  // creates a native animation node, and rebuilding them while the entrance
  // spring is running tears down and re-creates the node graph under the clone.
  const { backdropStyle, cloneStyle, panelStyle } = useMemo(() => ({
    backdropStyle: { opacity: progress },
    cloneStyle: {
      opacity: progress,
      transform: [
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
      ],
    },
    panelStyle: {
      opacity: progress,
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [panelPlacedAbove ? SPACING.sm : -SPACING.sm, 0],
          }),
        },
      ],
    },
  }), [progress, panelPlacedAbove]);

  if (!isOpen) return null;

  const { row } = menu;
  // A percentage rather than flex: it keeps the buttons of a wrapped second row in
  // the same columns as the first one's, instead of stretching to fill it.
  const buttonWidth = `${100 / perRow(actions.length)}%`;

  return (
    <>
      <ModalBlurOverlay />
      <OverlayPortal>
        <Pressable
          testID={`${testIDPrefix}-menu-backdrop`}
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
                height: panelHeight,
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
            <Pressable style={styles.panelRow} onPress={swallowTap}>
              {actions.map((action) => (
                <ActionButton
                  key={action.key}
                  testID={`${testIDPrefix}-${action.key}`}
                  action={action}
                  colors={colors}
                  width={buttonWidth}
                  onClose={onClose}
                />
              ))}
            </Pressable>
          </Animated.View>
        </Pressable>
      </OverlayPortal>
    </>
  );
}

const swallowTap = () => {};

function ActionButton({ testID, action, colors, width, onClose }) {
  const { icon: iconColor, text: textColor } = (TONES[action.tone] || TONES.default)(colors);
  const handlePress = () => {
    onClose();
    action.onPress();
  };
  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      style={({ pressed }) => [styles.actionButton, { width }, pressed && styles.actionButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={action.a11yLabel || action.label}
    >
      <Icon name={action.icon} size={ICON_SIZE.md} color={iconColor} />
      <Text style={[styles.actionLabel, { color: textColor }]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

const actionShape = PropTypes.shape({
  // Identifies the action and names its testID under the host's prefix.
  key: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  // The full phrase, for screen readers, when the visible label had to be shortened
  // to fit beside its siblings.
  a11yLabel: PropTypes.string,
  tone: PropTypes.oneOf(Object.keys(TONES)),
  onPress: PropTypes.func.isRequired,
});

ActionButton.propTypes = {
  testID: PropTypes.string,
  action: actionShape.isRequired,
  colors: PropTypes.object.isRequired,
  width: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

RowActionMenu.propTypes = {
  menu: PropTypes.shape({
    layout: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    row: PropTypes.node,
  }),
  actions: PropTypes.arrayOf(actionShape).isRequired,
  colors: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  testIDPrefix: PropTypes.string.isRequired,
};

// Memoized because it renders through OverlayPortal, whose effect re-mounts the
// overlay slot whenever its children change identity — one host render would
// otherwise cost a second pass over the whole clone-and-panel subtree. Hosts keep
// `menu` and `actions` stable (see NO_ACTIONS) for this to hold.
export default memo(RowActionMenu);

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
    height: PANEL_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
});
