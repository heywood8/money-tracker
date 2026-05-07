// app/components/ModalShell.js
import React, { useRef, useEffect } from 'react';
import {
  View,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  PanResponder,
  Animated,
} from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import ModalBlurOverlay from './ModalBlurOverlay';

/**
 * ModalShell — shared bottom-sheet wrapper for all modals.
 *
 * Renders: blur overlay → RNModal → KAV → overlay Pressable →
 *   card (drag handle, header, ScrollView[children],
 *          optional delete row, optional extraActions, cancel/save row)
 *
 * When onSave is omitted (shadow operations), only the cancel button is shown.
 * When onDelete is omitted, the delete row is hidden.
 */
export default function ModalShell({
  visible,
  onDismiss,
  title,
  subtitle,
  onSave,
  onCancel,
  saveLabel,
  cancelLabel,
  onDelete,
  deleteLabel,
  deleteDisabled,
  extraActions,
  scrollRef,
  showBlurOverlay,
  children,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();

  const translateY = useRef(new Animated.Value(0)).current;
  // Use a ref so the PanResponder closure always calls the latest onDismiss
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.3) {
          Animated.timing(translateY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onDismissRef.current?.();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    }),
  ).current;

  return (
    <>
      {showBlurOverlay && visible && <ModalBlurOverlay />}
      <RNModal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onDismiss}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.flex1}>
          <Pressable style={styles.overlay} onPress={onDismiss}>
            <Animated.View style={{ transform: [{ translateY }] }}>
              <Pressable
                style={[styles.card, { backgroundColor: colors.card }]}
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

                {/* Delete row (shown only when onDelete is provided) */}
                {onDelete ? (
                  <View style={styles.deleteWrapper}>
                    <TouchableRipple
                      onPress={deleteDisabled ? undefined : onDelete}
                      disabled={deleteDisabled}
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
                  </View>
                ) : null}

                {/* Extra actions slot (e.g. Split button in OperationModal) */}
                {extraActions || null}

                {/* Cancel / Save (or full-width Cancel when onSave is absent) */}
                <View style={[styles.actions, { borderTopColor: colors.border }]}>
                  <TouchableRipple
                    onPress={onCancel}
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
                      onPress={onSave}
                      style={[styles.btn, { backgroundColor: colors.primary }]}
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
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
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
  onDelete: PropTypes.func,
  deleteLabel: PropTypes.string,
  deleteDisabled: PropTypes.bool,
  extraActions: PropTypes.node,
  scrollRef: PropTypes.object,
  showBlurOverlay: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

ModalShell.defaultProps = {
  subtitle: null,
  onSave: null,
  saveLabel: null,
  cancelLabel: null,
  onDelete: null,
  deleteLabel: null,
  deleteDisabled: false,
  extraActions: null,
  scrollRef: null,
  showBlurOverlay: false,
};

const styles = StyleSheet.create({
  actions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
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
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
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
  flex1: {
    flex: 1,
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
  saveBtnText: {
    color: '#fff',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
