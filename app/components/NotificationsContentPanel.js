import React, { useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Animated, Easing, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { parseBankNotification } from '../services/notifications/parseBankNotification';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';

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

export function NotificationCard({ notification, colors, t, onReAdd, reAddState }) {
  const { title, text, packageName, postTime } = notification;
  const timeLabel = formatPostTime(postTime);
  // A notification that parses into a bank transaction is surfaced with an
  // accent tint + badge so the user can tell at a glance which of the many
  // notifications the listener sees actually become operations.
  const isBank = useMemo(() => parseBankNotification(notification) !== null, [notification]);
  const cardColorStyle = isBank
    ? { backgroundColor: colors.selected, borderColor: colors.primary, borderLeftColor: colors.primary }
    : { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.border };
  return (
    <View style={[styles.card, isBank && styles.cardBank, cardColorStyle]}>
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
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      ) : null}
      {text ? (
        <Text style={[styles.cardBody, { color: colors.text }]}>{text}</Text>
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
    </View>
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
};

NotificationCard.defaultProps = {
  onReAdd: null,
  reAddState: undefined,
};

export default function NotificationsContentPanel({ isLoading, notifications, onRefresh, bottomInset }) {
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
      duration: 280,
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

NotificationsContentPanel.defaultProps = {
  isLoading: false,
  notifications: [],
  onRefresh: null,
  bottomInset: 0,
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: BORDER_RADIUS.sm,
    flexDirection: 'row',
    gap: 4,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  cardBank: {
    borderLeftWidth: 3,
  },
  cardBody: {
    fontSize: 14,
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
    fontSize: 12,
    fontWeight: '500',
  },
  cardTime: {
    fontSize: 12,
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
  reAddButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
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
    gap: 4,
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
  },
});
