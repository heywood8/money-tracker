import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import NotificationBindingCard from './NotificationBindingCard';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

// At most this many cards render as deck layers; the rest are summed up in the
// "+N" badge and surface as the front cards drain.
export const MAX_DECK = 4;
// How far each card behind the front one peeks above its neighbour.
export const PEEK_OFFSET = 10;
// Horizontal shrink per depth level — reads as the deck receding without a real
// scale transform (which would shift the top edge and need translate compensation).
const EDGE_INSET = 8;

/**
 * Vertical headroom the deck needs above the quick-add panel so the cards
 * behind the front one have room to peek. The host screen adds this as padding
 * above the quick-add wrapper; exported so both share one source of truth.
 */
export const deckPeekAllowance = (count) =>
  Math.max(0, Math.min(count, MAX_DECK) - 1) * PEEK_OFFSET;

/**
 * Wraps a card so it fades/slides in exactly once, when it first appears in the
 * deck — the key is the stable pending id, so promotions (depth changes) don't
 * re-trigger the entrance.
 */
const DeckSlot = memo(function DeckSlot({ style, pointerEvents, importantForAccessibility, testID, children }) {
  const enterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Mount-only entrance.
  }, []);
  const enterStyle = {
    opacity: enterAnim,
    transform: [
      { translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
    ],
  };
  return (
    <Animated.View
      style={[style, enterStyle]}
      pointerEvents={pointerEvents}
      importantForAccessibility={importantForAccessibility}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
});

DeckSlot.propTypes = {
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  pointerEvents: PropTypes.string,
  importantForAccessibility: PropTypes.string,
  testID: PropTypes.string,
  children: PropTypes.node,
};

DeckSlot.defaultProps = {
  style: null,
  pointerEvents: 'auto',
  importantForAccessibility: 'auto',
  testID: undefined,
  children: null,
};

/**
 * FIFO deck of notification binding cards laid over the quick-add panel.
 *
 * The oldest pending notification is the front, interactive card, sized and
 * positioned to cover the quick-add form exactly; up to three older siblings
 * peek above it as receding deck layers. Anything beyond MAX_DECK is summed in
 * a "+N" badge over the deepest visible edge. The host renders this inside a
 * relatively-positioned container that also holds the quick-add form and adds
 * deckPeekAllowance() of top padding for the peeking edges.
 */
const NotificationBindingStack = memo(function NotificationBindingStack({
  suggestions,
  choices,
  savingIds,
  quickAddHeight,
  colors,
  t,
  accounts,
  categories,
  onChoiceChange,
  onSave,
  onDismiss,
}) {
  if (!suggestions || suggestions.length === 0 || quickAddHeight <= 0) return null;

  const visible = suggestions.slice(0, MAX_DECK);
  const overflowCount = suggestions.length - visible.length;
  const peekDepth = visible.length - 1;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Deepest card first: later siblings draw on top, so the front card wins
          without zIndex juggling. */}
      {visible
        .map((item, depth) => ({ item, depth }))
        .reverse()
        .map(({ item, depth }) => {
          const slotStyle = {
            position: 'absolute',
            top: (peekDepth - depth) * PEEK_OFFSET,
            left: SPACING.sm + depth * EDGE_INSET,
            right: SPACING.sm + depth * EDGE_INSET,
          };
          if (depth > 0) {
            // Only the top PEEK_OFFSET strip of a behind card is ever visible —
            // render just its chrome, invisible to touch and screen readers.
            return (
              <DeckSlot
                key={item.id}
                testID="notification-binding-peek"
                style={[
                  styles.peekCard,
                  slotStyle,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: colors.primary,
                    height: quickAddHeight,
                  },
                ]}
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
              />
            );
          }
          return (
            <DeckSlot key={item.id} style={slotStyle}>
              <NotificationBindingCard
                item={item}
                choice={choices[item.id] || {}}
                colors={colors}
                t={t}
                accounts={accounts}
                categories={categories}
                saving={!!savingIds[item.id]}
                height={quickAddHeight}
                onChoiceChange={(patch) => onChoiceChange(item.id, patch)}
                onSave={() => onSave(item)}
                onDismiss={() => onDismiss(item)}
              />
            </DeckSlot>
          );
        })}
      {overflowCount > 0 ? (
        // Drawn last (on top) but positioned over the deepest card's visible
        // strip, so the count survives the front cards covering that card's body.
        <View
          style={[styles.overflowBadge, { backgroundColor: colors.primary }]}
          pointerEvents="none"
          accessibilityLabel={(t('suggested_more_to_review') || '{count} more to review')
            .replace('{count}', String(overflowCount))}
        >
          <Text style={styles.overflowBadgeText}>+{overflowCount}</Text>
        </View>
      ) : null}
    </View>
  );
});

NotificationBindingStack.displayName = 'NotificationBindingStack';

NotificationBindingStack.propTypes = {
  suggestions: PropTypes.arrayOf(PropTypes.object),
  choices: PropTypes.object,
  savingIds: PropTypes.object,
  quickAddHeight: PropTypes.number.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  accounts: PropTypes.array,
  categories: PropTypes.array,
  onChoiceChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

NotificationBindingStack.defaultProps = {
  suggestions: [],
  choices: {},
  savingIds: {},
  accounts: [],
  categories: [],
};

const styles = StyleSheet.create({
  overflowBadge: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    minWidth: 26,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: 'absolute',
    right: SPACING.lg + (MAX_DECK - 1) * EDGE_INSET,
    top: -2,
  },
  overflowBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  peekCard: {
    borderLeftWidth: 3,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export default NotificationBindingStack;
