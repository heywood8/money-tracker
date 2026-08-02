import React, { useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Animated, Easing, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { parseBankNotification } from '../services/notifications/parseBankNotification';
import {
  notificationHighlights,
  segmentHighlights,
} from '../services/notifications/notificationHighlights';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';
import { motionDuration } from '../utils/reducedMotion';
import { CARD_SURFACE, SECTION_LABEL } from '../styles/componentStyles';

/**
 * Tint for a highlighted span, by what the parser read it as.
 *
 * Two hues, not seven. The amount carries real meaning — money in or money out —
 * so it takes the operation-type colour the rest of the app uses for that. Every
 * other parsed span (the keyword that classified the notification, the payee,
 * the card, the date) is tinted with one accent: the point is "these words are
 * what Penny read", and a different colour per field would turn the card into a
 * legend the reader has to learn.
 *
 * The tint is the colour at 0x1f alpha with the normal text colour on top, so it
 * stays legible on both the light and dark card backgrounds — the same treatment
 * budget rows use for their status colours.
 *
 * @param {string} field - highlight field name
 * @param {string} type - descriptor operation type
 * @param {Object} colors - theme palette
 * @returns {string} a hex colour with an alpha channel
 */
const highlightTint = (field, type, colors) => {
  if (field !== 'amount' && field !== 'currency') return `${colors.primary}1f`;
  if (type === 'income') return `${colors.income}33`;
  if (type === 'transfer') return `${colors.transfer}33`;
  return `${colors.expense}33`;
};

/**
 * Render a notification string with its parsed spans tinted in place.
 *
 * Highlighted spans are nested <Text> elements inside the paragraph, so the text
 * still wraps and copies as one block — the tint rides along with the words
 * instead of being positioned over them.
 *
 * @param {string} value - the original string
 * @param {Array} ranges - from notificationHighlights
 * @param {string} type - descriptor operation type (drives the amount's tint)
 * @param {Object} colors
 * @returns {React.ReactNode}
 */
const renderHighlighted = (value, ranges, type, colors) => {
  if (!ranges || ranges.length === 0) return value;
  return segmentHighlights(value, ranges).map((segment, index) => (
    segment.field ? (
      <Text
        // Segments are positional and the string is immutable for this render,
        // so the index is the stable identity here.
        key={`${segment.field}-${index}`}
        style={[styles.highlight, { backgroundColor: highlightTint(segment.field, type, colors) }]}
      >
        {segment.text}
      </Text>
    ) : segment.text
  ));
};

// Renders the "date · time" label for a notification's post time. Mirrors the
// update panel's timestamp treatment so the two subpanels read alike.
const formatPostTime = (postTime) => {
  if (!postTime) return null;
  const parsed = new Date(postTime);
  if (Number.isNaN(parsed.getTime())) return null;
  const datePart = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
};

export function NotificationCard({
  notification,
  colors,
  t,
  onReAdd = null,
  reAddState = undefined,
  animateIn = false,
  onCreateTemplate = null,
}) {
  const { title, text, packageName, postTime } = notification;
  const timeLabel = formatPostTime(postTime);
  // A notification that parses into a bank transaction is surfaced with an
  // accent tint + badge so the user can tell at a glance which of the many
  // notifications the listener sees actually become operations.
  const descriptor = useMemo(() => parseBankNotification(notification), [notification]);
  const isBank = descriptor !== null;
  // …and within such a card, the words the parser actually read are tinted, so
  // "why did this become a 3,900 AMD purchase at GURMAN" is answerable by
  // looking at the message rather than by trusting the badge.
  const highlights = useMemo(
    () => notificationHighlights(notification, descriptor),
    [notification, descriptor],
  );
  const cardColorStyle = isBank
    ? { backgroundColor: colors.selected, borderColor: colors.primary, borderLeftColor: colors.primary }
    : { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.border };
  // Entry animation: a freshly-captured card fades and slides down into place.
  // `animateIn` is read once at mount — the card only animates the first time it
  // appears (its stable key keeps it mounted across auto-refreshes), so existing
  // cards never re-animate. Non-animated callers get it at rest (value 1).
  const enterAnim = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  useEffect(() => {
    if (!animateIn) return;
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: motionDuration(320),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Mount-only: capture the initial `animateIn`; later prop changes are ignored.
  }, []);
  const enterStyle = {
    opacity: enterAnim,
    transform: [
      { translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
    ],
  };
  // Long-press turns any captured notification into a new parse template. It is
  // offered on parsed cards too — that is how a user overrides a built-in parser
  // that reads their bank's message wrongly — but only the *unparsed* ones get a
  // visible button, since those are the ones that need the invitation.
  const handleLongPress = onCreateTemplate ? () => onCreateTemplate(notification) : undefined;

  return (
    <Animated.View style={[styles.card, isBank && styles.cardBank, cardColorStyle, enterStyle]}>
      <Pressable
        onLongPress={handleLongPress}
        disabled={!handleLongPress}
        delayLongPress={400}
        accessibilityRole={handleLongPress ? 'button' : undefined}
        accessibilityLabel={handleLongPress
          ? (t('notification_template_create') || 'Create parse template')
          : undefined}
        accessibilityHint={handleLongPress
          ? (t('notification_template_create_hint')
            || 'Teach Penny to read this app’s notifications')
          : undefined}
        testID={handleLongPress ? 'notification-card-longpress' : undefined}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons
              name={isBank ? 'card' : 'notifications-outline'}
              size={15}
              color={isBank ? colors.primary : colors.mutedText}
            />
            {packageName ? (
              <Text style={[styles.cardSource, { color: colors.mutedText }]} numberOfLines={1}>
                {packageName}
              </Text>
            ) : null}
          </View>
          {timeLabel ? (
            <Text style={[styles.cardTime, { color: colors.mutedText }]}>{timeLabel}</Text>
          ) : null}
        </View>
        {isBank ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Ionicons name="pricetag" size={10} color="#ffffff" />
            <Text style={styles.badgeText}>
              {t('notification_bank_badge') || 'Bank operation'}
            </Text>
          </View>
        ) : null}
        {title ? (
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {renderHighlighted(title, highlights.title, descriptor?.type, colors)}
          </Text>
        ) : null}
        {text ? (
          <Text style={[styles.cardBody, { color: colors.text }]}>
            {renderHighlighted(text, highlights.text, descriptor?.type, colors)}
          </Text>
        ) : null}
        {!title && !text ? (
          <Text style={[styles.cardBody, { color: colors.mutedText }]}>
            {t('notification_no_text') || 'No text'}
          </Text>
        ) : null}
        {/* Re-add lets the user turn an already-processed bank notification into an
          operation again (e.g. after deleting the original or dismissing it). */}
        {isBank && onReAdd ? (
          <View style={styles.reAddRow}>
            {reAddState === 'loading' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : reAddState === 'created' ? (
              <View style={styles.reAddFeedback}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.reAddFeedbackText, { color: colors.primary }]}>
                  {t('bank_notifications_readd_created') || 'Operation added'}
                </Text>
              </View>
            ) : reAddState === 'pending' ? (
              <View style={styles.reAddFeedback}>
                <Ionicons name="list-outline" size={15} color={colors.mutedText} />
                <Text style={[styles.reAddFeedbackText, { color: colors.mutedText }]}>
                  {t('bank_notifications_readd_queued') || 'Added to review queue'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => onReAdd(notification)}
                style={[styles.reAddButton, { borderColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={t('bank_notifications_readd') || 'Re-add operation'}
              >
                <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                <Text style={[styles.reAddButtonText, { color: colors.primary }]}>
                  {t('bank_notifications_readd') || 'Re-add operation'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
        {/* An app Penny can't read yet is the whole reason parse templates exist,
          so those cards carry the invitation rather than hiding it behind the
          long-press. */}
        {!isBank && onCreateTemplate ? (
          <View style={styles.reAddRow}>
            <TouchableOpacity
              onPress={() => onCreateTemplate(notification)}
              style={[styles.reAddButton, { borderColor: colors.mutedText }]}
              accessibilityRole="button"
              accessibilityLabel={t('notification_template_create') || 'Create parse template'}
              testID="notification-create-template"
            >
              <Ionicons name="create-outline" size={15} color={colors.mutedText} />
              <Text style={[styles.reAddButtonText, { color: colors.mutedText }]}>
                {t('notification_template_create') || 'Create parse template'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

NotificationCard.propTypes = {
  notification: PropTypes.shape({
    title: PropTypes.string,
    text: PropTypes.string,
    packageName: PropTypes.string,
    postTime: PropTypes.number,
  }).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  // Optional: when provided, bank-parseable cards show a "Re-add operation" action.
  onReAdd: PropTypes.func,
  // Optional: 'loading' | 'created' | 'pending' feedback state for this card.
  reAddState: PropTypes.oneOf(['loading', 'created', 'pending']),
  // Optional: when true, the card plays a fade + slide-in animation on mount.
  animateIn: PropTypes.bool,
  // Optional: when provided, a long-press (and, on unparsed cards, a button)
  // starts a new parse template from this notification.
  onCreateTemplate: PropTypes.func,
};

export default function NotificationsContentPanel({ isLoading = false, notifications = [], onRefresh = null, bottomInset = 0 }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLoading) {
      contentAnim.setValue(0);
      return;
    }
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: motionDuration(280),
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isLoading, contentAnim]);

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centeredText, { color: colors.text }]}>
          {t('notifications_loading') || 'Loading recent notifications…'}
        </Text>
      </View>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="notifications-off-outline" size={48} color={colors.mutedText} style={styles.emptyIcon} />
        <Text style={[styles.centeredText, { color: colors.text }]}>
          {t('notifications_empty') || 'No notifications recorded yet. New notifications will appear here.'}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.resultContainer, { opacity: contentAnim }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {t('notifications_recent') || 'Recent notifications'}
      </Text>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} /> : undefined}
      >
        {notifications.map((notification, index) => (
          <NotificationCard
            // Notifications carry no stable id; the post time + index keeps keys
            // unique even when two arrive at the same millisecond.
            key={`${notification.postTime || 0}-${index}`}
            notification={notification}
            colors={colors}
            t={t}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

NotificationsContentPanel.propTypes = {
  isLoading: PropTypes.bool,
  notifications: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string,
      text: PropTypes.string,
      packageName: PropTypes.string,
      postTime: PropTypes.number,
    }),
  ),
  onRefresh: PropTypes.func,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: BORDER_RADIUS.sm,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  cardBank: {
    borderLeftWidth: 3,
  },
  cardBody: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cardHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginRight: SPACING.sm,
  },
  cardSource: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  cardTime: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  centeredContainer: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.lg,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
  },
  centeredText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyIcon: {
    marginBottom: SPACING.xs,
  },
  highlight: {
    fontWeight: '700',
  },
  reAddButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  reAddButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reAddFeedback: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  reAddFeedbackText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reAddRow: {
    alignItems: 'flex-start',
    marginTop: SPACING.sm,
  },
  resultContainer: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.lg,
  },
  scroll: {
    flex: 1,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    ...SECTION_LABEL,
    marginTop: SPACING.md,
  },
});
