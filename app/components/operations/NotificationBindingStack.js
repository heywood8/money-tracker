import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import NotificationBindingCard from './NotificationBindingCard';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';
import { motionDuration } from '../../utils/reducedMotion';
import { BADGE, BADGE_TEXT } from '../../styles/componentStyles';

// At most this many cards render as deck layers; the rest are summed up in the
// "+N" badge and surface as the front cards drain.
export const MAX_DECK = 4;
// How far each card behind the front one peeks above its neighbour.
export const PEEK_OFFSET = 10;
// Horizontal shrink per depth level — reads as the deck receding without a real
// scale transform (which would shift the top edge and need translate compensation).
const EDGE_INSET = 8;
// Floor for the card frame when the measured quick-add panel is implausibly small
// (a transient near-zero layout pass). It is also the floor the deck opens with
// before the panel has reported any height at all: a queue that fills while the
// panel sits collapsed behind the + button must still put its cards on screen,
// and an unmeasured panel is the normal state there, not a transient.
export const MIN_CARD_HEIGHT = 260;
// Share of the window a card may grow to before its body scrolls instead, so
// Save stays on screen when "All categories" opens a long grid. Kept well under
// the viewport: the search pill above the list and the floating tab bar below
// it take roughly a fifth of the window between them.
const MAX_CARD_WINDOW_SHARE = 0.6;

/**
 * The shortest a card may be: the measured quick-add panel height, so the
 * list below does not jump when the queue drains and the form comes back,
 * floored so a transient near-zero layout pass cannot shrink it. A floor only:
 * the card grows past it to fit its content. Pinning the frame to this value
 * clipped the category chips whenever the panel had not been measured yet.
 */
export const deckCardMinHeight = (quickAddHeight) => Math.max(quickAddHeight, MIN_CARD_HEIGHT);

/**
 * The tallest a card may grow before its body scrolls: a share of the window,
 * never below the card's own floor.
 */
export const deckCardMaxHeight = (windowHeight, minHeight) =>
  Math.max(minHeight, Math.round(windowHeight * MAX_CARD_WINDOW_SHARE));

/**
 * Vertical headroom the deck needs above the front card so the cards behind it
 * have room to peek. The deck pads its own top by this much.
 */
export const deckPeekAllowance = (count) =>
  Math.max(0, Math.min(count, MAX_DECK) - 1) * PEEK_OFFSET;

/**
 * Wraps a card so it fades/slides in exactly once, when it first appears in the
 * deck — the key is the stable pending id, so promotions (depth changes) don't
 * re-trigger the entrance.
 */
const DeckSlot = memo(function DeckSlot({
  style = null,
  pointerEvents = 'auto',
  importantForAccessibility = 'auto',
  testID = undefined,
  children = null,
}) {
  const enterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: motionDuration(320),
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

/**
 * FIFO deck of notification binding cards, shown in place of the quick-add panel.
 *
 * The oldest pending notification is the front, interactive card, laid out in
 * normal flow so its content decides the deck's height (never shorter than the
 * quick-add form it stands in for); up to three older siblings peek above it as
 * receding deck layers, anchored to its edges. Anything beyond MAX_DECK is summed
 * in a "+N" badge over the deepest visible edge. The deck pads its own top by
 * deckPeekAllowance() for the peeking edges, so the host needs no height for it.
 */
const NotificationBindingStack = memo(function NotificationBindingStack({
  suggestions = [],
  choices = {},
  saveErrors = {},
  quickAddHeight,
  colors,
  t,
  accounts = [],
  categories = [],
  onChoiceChange,
  onSave,
  onDismiss,
}) {
  const count = suggestions ? suggestions.length : 0;
  const { height: windowHeight } = useWindowDimensions();
  const minCardHeight = deckCardMinHeight(quickAddHeight);
  const maxCardHeight = deckCardMaxHeight(windowHeight, minCardHeight);
  // Before the early return, as hooks must be: the line that says the cards
  // reached the tree, and with what bounds.
  useEffect(() => {
    if (count > 0) {
      console.log('[deck] stack rendered', { count, minCardHeight, maxCardHeight, quickAddHeight });
    }
  }, [count, minCardHeight, maxCardHeight, quickAddHeight]);

  // An unmeasured panel (quickAddHeight 0) is not a reason to hold the cards
  // back — the front card sizes to its own content either way.
  if (count === 0) return null;

  const visible = suggestions.slice(0, MAX_DECK);
  const overflowCount = suggestions.length - visible.length;
  const peekDepth = visible.length - 1;

  return (
    <View
      style={{ paddingTop: deckPeekAllowance(count) }}
      pointerEvents="box-none"
    >
      {/* Deepest card first: later siblings draw on top, so the front card wins
          without zIndex juggling. */}
      {visible
        .map((item, depth) => ({ item, depth }))
        .reverse()
        .map(({ item, depth }) => {
          const inset = SPACING.sm + depth * EDGE_INSET;
          if (depth > 0) {
            // Only the top PEEK_OFFSET strip of a behind card is ever visible —
            // render just its chrome, invisible to touch and screen readers.
            // Anchored top AND bottom rather than given a height, so it tracks
            // the front card as that card grows to fit its content: each layer
            // sits `depth` peeks higher than the front card, bottom edge included.
            return (
              <DeckSlot
                key={item.id}
                testID="notification-binding-peek"
                style={[
                  styles.peekCard,
                  {
                    top: (peekDepth - depth) * PEEK_OFFSET,
                    bottom: depth * PEEK_OFFSET,
                    left: inset,
                    right: inset,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: colors.primary,
                  },
                ]}
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
              />
            );
          }
          // The front card stays in normal flow: it is what gives the deck (and
          // the host container) its height.
          return (
            <DeckSlot
              key={item.id}
              testID="notification-binding-front"
              style={{ marginHorizontal: inset }}
            >
              <NotificationBindingCard
                item={item}
                choice={choices[item.id] || {}}
                colors={colors}
                t={t}
                accounts={accounts}
                categories={categories}
                saveError={!!saveErrors[item.id]}
                minHeight={minCardHeight}
                maxHeight={maxCardHeight}
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
  saveErrors: PropTypes.object,
  quickAddHeight: PropTypes.number.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  accounts: PropTypes.array,
  categories: PropTypes.array,
  onChoiceChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  overflowBadge: {
    ...BADGE,
    minWidth: 26,
    position: 'absolute',
    right: SPACING.lg + (MAX_DECK - 1) * EDGE_INSET,
    top: -2,
  },
  overflowBadgeText: {
    ...BADGE_TEXT,
    color: '#ffffff',
  },
  peekCard: {
    borderLeftWidth: 3,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
  },
});

export default NotificationBindingStack;
