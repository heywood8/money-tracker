// app/components/ModalShell.js
import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  ScrollView,
  PanResponder,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { Text, TouchableRipple } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../styles/designTokens';
import { useBackShrink } from '../hooks/useBackShrink';
import ModalBlurOverlay from './ModalBlurOverlay';
import {
  ANIMATED_SPRING_SETTLE,
  PAN_VELOCITY_TO_PER_SECOND,
  rubberband,
} from '../utils/motion';
import { isReduceMotionEnabled } from '../utils/reducedMotion';
import { MODAL_TITLE } from '../styles/componentStyles';

// Pressable that can animate layout props (paddingBottom) for keyboard avoidance.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// How far the sheet may be lifted above its resting place, in px. The card is
// glued to the bottom of the screen, so every pixel of lift opens a gap beneath
// it — the give here is token by design: enough that an upward drag registers as
// a boundary rather than a dead touch, not enough to show a visible strip of
// background. (Downward has no such limit; that direction is the dismiss.)
const UPWARD_GIVE = 32;

/**
 * ModalShell — shared bottom-sheet wrapper for all modals.
 *
 * Renders: blur overlay → RNModal → KAV → overlay Pressable →
 *   card (drag handle, header, ScrollView[children],
 *          optional delete row, optional extraActions, cancel/save row)
 *   + optional overlayPanel covering the whole card
 *
 * When onSave is omitted (shadow operations), only the cancel button is shown.
 * When onDelete is omitted, the delete row is hidden.
 *
 * `overlayPanel` is the subpanel slot (see CLAUDE.md): a secondary view inside a
 * modal slides in over the sheet instead of opening a modal of its own. It is a
 * sibling of the card rather than a child so it covers the header and the action
 * row too — a picker that leaves the sheet's Save button tappable underneath it
 * is a form the user can submit while looking at something else.
 */
export default function ModalShell({
  visible,
  onDismiss,
  title,
  subtitle = null,
  onSave = null,
  onCancel,
  saveLabel = null,
  cancelLabel = null,
  saveDisabled = false,
  saveTestID = null,
  onDelete = null,
  deleteLabel = null,
  deleteDisabled = false,
  deleteTestID = null,
  extraActions = null,
  scrollRef = null,
  showBlurOverlay = false,
  overlayPanel = null,
  onBackIntercept = null,
  children,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();

  const screenHeight = Dimensions.get('window').height;
  // Start offscreen so the first render is invisible — eliminates open flicker
  const translateY = useRef(new Animated.Value(screenHeight)).current;

  // Keyboard avoidance. With edge-to-edge enabled (SDK 54) the Modal window no
  // longer resizes for the IME, so we lift the bottom sheet ourselves: the
  // overlay is justifyContent: 'flex-end', so animating its paddingBottom to the
  // keyboard height raises the card to sit just above the keyboard. Resetting to
  // 0 on hide guarantees the sheet is glued back to the bottom (no residual
  // offset, the bug the old behavior="height" KeyboardAvoidingView left behind).
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // ModalShell instances stay permanently mounted (e.g. OperationModal, and all
    // tab screens mount eagerly), so without this gate every closed modal would run
    // a JS-driven paddingBottom animation on every keyboard show/hide app-wide.
    // Only the visible modal needs keyboard avoidance.
    if (!visible) return undefined;

    // If a keyboard is already open when this modal becomes visible (e.g. focus
    // retained from a prior field / quick-add flow), keyboardDidShow has already
    // fired and will not fire again for this subscription — so seed the offset from
    // the current keyboard metrics, otherwise the sheet stays glued to the bottom
    // and the keyboard overlaps its input until the user dismisses and refocuses.
    const currentMetrics = Keyboard.metrics?.();
    if (currentMetrics?.height) {
      keyboardOffset.setValue(currentMetrics.height);
    }

    const onShow = (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e?.endCoordinates?.height ?? 0,
        duration: e?.duration || 220,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e?.duration || 180,
        useNativeDriver: false,
      }).start();
    };
    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset, visible]);
  // Use a ref so the PanResponder closure always calls the latest onDismiss
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  // Same reason: the PanResponder is built once, so it must not close over a
  // screen height captured at mount (it would go stale on rotation).
  const screenHeightRef = useRef(screenHeight);
  useEffect(() => { screenHeightRef.current = screenHeight; }, [screenHeight]);

  // Live copy of translateY. The open/close animations run on the native driver,
  // where the JS-side value is never updated and `stopAnimation`'s callback comes
  // back asynchronously over the bridge — too late for the first frames of a drag.
  // A listener keeps a ~1-frame-fresh value the drag can rebase onto
  // synchronously. Gated on `visible` because every ModalShell stays mounted for
  // the whole session and an idle sheet has nothing worth subscribing to; it is
  // declared before the open effect so the subscription is live for that first
  // animation too.
  const currentY = useRef(screenHeight);
  useEffect(() => {
    if (!visible) return undefined;
    const id = translateY.addListener(({ value }) => { currentY.current = value; });
    return () => translateY.removeListener(id);
  }, [translateY, visible]);

  // Telegram-style predictive "back" shrink — played when the Android back
  // button/gesture closes the sheet (onRequestClose). The card keeps its
  // rounded top, so start from the existing 24px radius rather than square.
  const { animatedStyle: shrinkStyle, originStyle, reset: resetShrink, commit: commitShrink } =
    useBackShrink({ baseBorderRadius: 24, borderRadius: 24 });

  // Slide in from bottom when modal opens
  useEffect(() => {
    if (visible) {
      // Always start offscreen and un-shrunk so the open animation is correct
      // no matter how the sheet was previously dismissed (slide or shrink).
      translateY.setValue(screenHeight);
      keyboardOffset.setValue(0);
      resetShrink();
      // A sheet rising from the bottom edge is travel, which is what the OS
      // "Remove animations" setting is about — so under it the sheet is simply
      // there. `Animated` has no reduceMotion of its own (Reanimated does, which
      // is why the shrink above needs no equivalent branch).
      if (isReduceMotionEnabled()) {
        translateY.setValue(0);
        return;
      }
      // The same spring the drag release and the snap-back use. It used to be a
      // `bounciness: 2 / speed: 14` spring of its own, which put two problems in
      // one line: the sheet arrived on a different physics than the one that
      // takes it away (so opening and dismissing read as different objects), and
      // the bounce overshot a card pinned to `justifyContent: 'flex-end'` — the
      // overshoot travels the card past the bottom edge and briefly opens a strip
      // of the screen behind it. ANIMATED_SPRING_SETTLE clamps exactly that.
      Animated.spring(translateY, {
        ...ANIMATED_SPRING_SETTLE,
        toValue: 0,
      }).start();
    }
  }, [visible, translateY, screenHeight, resetShrink, keyboardOffset]);

  // Back button / gesture: play the shrink, then dismiss.
  //
  // A sheet showing an overlay panel gets first refusal: back there means "close
  // the picker", and the shrink is the whole sheet leaving — playing it would
  // take the half-filled form with it.
  const handleBackDismiss = useCallback(() => {
    if (onBackIntercept?.()) return;
    commitShrink(() => onDismissRef.current?.());
  }, [commitShrink, onBackIntercept]);

  // Animate out then call callback — used for overlay tap and cancel button
  const animateOut = useCallback((callback) => {
    if (isReduceMotionEnabled()) {
      translateY.setValue(screenHeight);
      callback?.();
      return;
    }
    // A spring, not a 200ms timing with React Native's default `inOut(ease)`.
    // Tapping the overlay and flicking the sheet down are the same act — getting
    // rid of this sheet — and they were leaving on visibly different curves. The
    // tap simply has no velocity to hand over, so it starts from rest.
    Animated.spring(translateY, {
      ...ANIMATED_SPRING_SETTLE,
      toValue: screenHeight,
      // The card is out of sight long before the spring mathematically settles,
      // so finish on "off-screen" rather than on the tail — same thresholds the
      // drag dismissal uses.
      restDisplacementThreshold: 40,
      restSpeedThreshold: 100,
      // Leave translateY at screenHeight after close so the next open
      // renders offscreen immediately (no reset-to-0 flicker)
    }).start(({ finished }) => {
      // Only dismiss if the slide actually completed. A drag started while the
      // sheet is sliding away cancels this animation (see onPanResponderGrant),
      // and the sheet is now following the finger — closing it here would yank
      // it out from under them.
      if (finished) callback?.();
    });
  }, [translateY, screenHeight]);

  // translateY at the instant the drag began. The sheet is grabbable while it is
  // still animating (opening, or sliding away after an overlay tap), so the drag
  // has to continue from wherever the card actually sits on screen — feeding the
  // raw gesture `dy` would teleport it to `dy` measured from zero.
  const dragStartY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderGrant: () => {
        // Cancel whatever is in flight so it can't keep writing to translateY
        // behind the finger, then rebase the drag onto where the card actually
        // is right now (no callback — see the currentY listener above).
        translateY.stopAnimation();
        dragStartY.current = currentY.current;
      },
      onPanResponderMove: (_, gs) => {
        const next = dragStartY.current + gs.dy;
        // Downward is free. Upward resists progressively instead of not moving
        // at all — a sheet that ignores the finger reads as frozen, one that
        // resists reads as "this is as far as it goes".
        translateY.setValue(next >= 0 ? next : rubberband(next, UPWARD_GIVE));
      },
      onPanResponderRelease: (_, gs) => {
        const offset = dragStartY.current + gs.dy;
        // PanResponder velocity is px/ms; Animated.spring wants px/s.
        const velocity = gs.vy * PAN_VELOCITY_TO_PER_SECOND;
        // Direction of travel outranks distance travelled: someone who has
        // dragged the sheet well past the threshold but is now pulling it back
        // up has changed their mind, and dismissing there fights the finger.
        const pullingBack = gs.vy < -0.3;
        if (!pullingBack && (offset > 80 || gs.vy > 0.3)) {
          Animated.spring(translateY, {
            ...ANIMATED_SPRING_SETTLE,
            toValue: screenHeightRef.current,
            // Carry the throw through: a hard flick now leaves fast and a gentle
            // drag-past-threshold leaves gently, instead of both taking 200ms.
            velocity,
            // The card is out of sight long before the spring mathematically
            // settles, so finish on "off-screen" rather than on the tail.
            restDisplacementThreshold: 40,
            restSpeedThreshold: 100,
          }).start(({ finished }) => {
            // Leave translateY at screen height — no reset to avoid close flicker
            if (finished) onDismissRef.current?.();
          });
        } else {
          Animated.spring(translateY, {
            ...ANIMATED_SPRING_SETTLE,
            toValue: 0,
            velocity,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          ...ANIMATED_SPRING_SETTLE,
          toValue: 0,
        }).start();
      },
    }),
  ).current;

  return (
    <>
      {showBlurOverlay && visible && <ModalBlurOverlay />}
      <RNModal
        visible={visible}
        animationType="none"
        transparent={true}
        onRequestClose={handleBackDismiss}
      >
        <AnimatedPressable
          style={[styles.overlay, { paddingBottom: keyboardOffset }]}
          onPress={() => animateOut(onDismiss)}
        >
          <Animated.View style={{ transform: [{ translateY }] }}>
            <Reanimated.View style={[originStyle, shrinkStyle]}>
              <Pressable
                style={[styles.card, { backgroundColor: colors.card, maxHeight: Dimensions.get('window').height * 0.88 }]}
                onPress={() => {}}
              >
                {/* Drag zone: handle + header — touch here to dismiss by dragging down */}
                <View {...panResponder.panHandlers}>
                  <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                    {subtitle ? (
                      <Text style={[styles.subtitle, { color: colors.mutedText }]}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Scrollable form content */}
                <ScrollView
                  ref={scrollRef}
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>

                {/* Secondary actions: delete + extra actions in one compact row */}
                {(onDelete || extraActions) ? (
                  <View style={styles.deleteWrapper}>
                    {onDelete ? (
                      <TouchableRipple
                        onPress={deleteDisabled ? undefined : onDelete}
                        disabled={deleteDisabled}
                        testID={deleteTestID}
                        rippleColor={colors.delete + '18'}
                        style={[
                          styles.btn,
                          styles.deleteRow,
                          { borderColor: colors.delete + '40' },
                          deleteDisabled && styles.disabled,
                        ]}
                        borderless={false}
                      >
                        <View style={styles.deleteRowContent}>
                          <Icon name="delete-outline" size={18} color={colors.delete} />
                          <Text style={[styles.deleteRowText, { color: colors.delete }]}>
                            {deleteLabel || t('delete')}
                          </Text>
                        </View>
                      </TouchableRipple>
                    ) : null}
                    {extraActions || null}
                  </View>
                ) : null}

                {/* Cancel / Save (or full-width Cancel when onSave is absent) */}
                <View style={[styles.actions, { borderTopColor: colors.border, paddingBottom: SPACING.md + insets.bottom }]}>
                  <TouchableRipple
                    onPress={() => animateOut(onCancel)}
                    style={[
                      styles.btn,
                      styles.cancelBtn,
                      { borderColor: colors.border },
                      !onSave && styles.fullWidthBtn,
                    ]}
                    rippleColor="rgba(0,0,0,0.05)"
                    borderless={false}
                  >
                    <Text style={[styles.btnText, { color: colors.text }]}>
                      {cancelLabel || t('cancel')}
                    </Text>
                  </TouchableRipple>

                  {onSave ? (
                    <TouchableRipple
                      onPress={saveDisabled ? undefined : onSave}
                      disabled={saveDisabled}
                      testID={saveTestID}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: saveDisabled, busy: saveDisabled }}
                      style={[
                        styles.btn,
                        { backgroundColor: colors.primary },
                        saveDisabled && styles.disabled,
                      ]}
                      rippleColor="rgba(255,255,255,0.2)"
                      borderless={false}
                    >
                      <Text style={[styles.btnText, styles.saveBtnText]}>
                        {saveLabel || t('save')}
                      </Text>
                    </TouchableRipple>
                  ) : null}
                </View>
              </Pressable>

              {/* Subpanel slot — a sibling of the card, so it covers the header
                  and the action row as well as the form. Rounds its own top
                  corners because it stands in for the card's while it is up. */}
              {overlayPanel ? (
                <View style={styles.overlayPanel}>{overlayPanel}</View>
              ) : null}
            </Reanimated.View>
          </Animated.View>
        </AnimatedPressable>
      </RNModal>
    </>
  );
}

ModalShell.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  onSave: PropTypes.func,
  onCancel: PropTypes.func.isRequired,
  saveLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  saveDisabled: PropTypes.bool,
  saveTestID: PropTypes.string,
  onDelete: PropTypes.func,
  deleteLabel: PropTypes.string,
  deleteDisabled: PropTypes.bool,
  deleteTestID: PropTypes.string,
  extraActions: PropTypes.node,
  scrollRef: PropTypes.object,
  showBlurOverlay: PropTypes.bool,
  overlayPanel: PropTypes.node,
  onBackIntercept: PropTypes.func,
  children: PropTypes.node.isRequired,
};

const styles = StyleSheet.create({
  actions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  btn: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    overflow: 'hidden',
    paddingVertical: SPACING.sm,
  },
  btnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: undefined,
    overflow: 'hidden',
    paddingBottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  deleteRow: {
    borderWidth: 1,
  },
  deleteRowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  deleteRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
  deleteWrapper: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  dragHandle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 4,
    marginBottom: SPACING.md,
    width: 44,
  },
  fullWidthBtn: {
    flex: 1,
  },
  header: {
    marginBottom: SPACING.sm,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayPanel: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  saveBtnText: {
    color: '#fff',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  title: {
    ...MODAL_TITLE,
  },
});
