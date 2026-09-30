import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FONT_SIZE, FONT_WEIGHT, ICON_SIZE, OPACITY, SPACING } from '../styles/designTokens';

/**
 * "Don't bind to category" checkbox for a bank-notification review card.
 *
 * Ticked, the category chosen on the card books this operation only: the
 * merchant is marked so it never learns a category and every later notification
 * from it waits for a manual pick. Off by default.
 *
 * `locked` is a merchant already marked that way by an earlier save. The box is
 * then ticked and greyed out, and only Settings → Bindings can lift it
 * (`lockReason="saved"`). A kind that never learns a category at all (C2C, DEBIT
 * ACCOUNT) is shown locked too (`lockReason="kind"`), since nothing can change
 * it. A tap on the locked box
 * says why in a line under it, rather than doing nothing — which is why this is
 * a Pressable with no `disabled` prop: Pressable gates presses on that prop alone,
 * so `accessibilityState.disabled` can tell TalkBack the box is disabled while the
 * tap still arrives. (TouchableOpacity would read that state as `disabled` and
 * swallow the tap.) TalkBack hears the explanation as the hint up front.
 */
const SkipCategoryBindingToggle = ({
  checked,
  locked = false,
  lockReason = 'saved',
  onChange,
  colors,
  t,
  testID = 'skip-category-binding',
}) => {
  const [hintVisible, setHintVisible] = useState(false);
  // The hint answers a tap; once the box unlocks there is nothing to explain, so
  // a later re-lock starts without it.
  useEffect(() => {
    if (!locked) setHintVisible(false);
  }, [locked]);
  const label = t('bank_notifications_skip_category_binding') || 'Don’t bind to category';
  const hint = lockReason === 'kind'
    ? (t('bank_notifications_skip_category_kind_hint')
      || 'Operations of this type are never bound to a category.')
    : (t('bank_notifications_skip_category_locked_hint')
      || 'Option saved from previous operations. You can change it in Settings.');

  const handlePress = useCallback(() => {
    if (locked) {
      setHintVisible(true);
      return;
    }
    onChange(!checked);
  }, [locked, checked, onChange]);

  const ticked = checked || locked;
  let iconColor = colors.mutedText;
  if (ticked && !locked) iconColor = colors.primary;

  return (
    <View>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.row,
          locked && styles.rowLocked,
          pressed && !locked && styles.rowPressed,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ticked, disabled: locked }}
        accessibilityLabel={label}
        accessibilityHint={locked ? hint : undefined}
        hitSlop={{ top: SPACING.xs, bottom: SPACING.xs }}
        testID={testID}
      >
        <Ionicons name={ticked ? 'checkbox' : 'square-outline'} size={ICON_SIZE.md} color={iconColor} />
        <Text style={[styles.label, { color: locked ? colors.mutedText : colors.text }]} numberOfLines={2}>
          {label}
        </Text>
        {locked ? <Ionicons name="lock-closed" size={ICON_SIZE.xs} color={colors.mutedText} /> : null}
      </Pressable>
      {locked && hintVisible ? (
        <Text
          testID={`${testID}-hint`}
          style={[styles.hint, { color: colors.mutedText }]}
          accessibilityLiveRegion="polite"
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
};

SkipCategoryBindingToggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  locked: PropTypes.bool,
  // Why a locked box is locked: 'saved' by an earlier save of this merchant
  // (changeable in Settings), or 'kind', a notification kind that never binds.
  lockReason: PropTypes.oneOf(['saved', 'kind']),
  onChange: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

const styles = StyleSheet.create({
  hint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  label: {
    flexShrink: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
  },
  row: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  rowLocked: {
    opacity: OPACITY.subtle,
  },
  rowPressed: {
    opacity: OPACITY.disabled,
  },
});

export default SkipCategoryBindingToggle;
