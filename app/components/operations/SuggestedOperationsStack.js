import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { kindRequiresCategory } from '../../services/notifications/parseBankNotification';
import { getCategoryDisplayName } from '../../utils/categoryUtils';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

// Cards shown inline on the main page; the rest collapse into a "+N more" row
// that opens the full review queue in settings.
const MAX_VISIBLE = 3;

/**
 * Whether a suggestion can be booked with a single tap, i.e. everything the
 * resolver needs is already pre-filled: an account, a category when the kind
 * demands one, and — for ATM-withdrawal transfers — a bound cash target account.
 * Mirrors the settings review panel's canSave logic.
 */
export const canAcceptSuggestion = (item, atmTargetAccountId) => {
  if (item.type === 'transfer') {
    return (
      item.accountId != null &&
      atmTargetAccountId != null &&
      atmTargetAccountId !== item.accountId
    );
  }
  return (
    item.accountId != null &&
    (!kindRequiresCategory(item.kind, item.packageName) || item.categoryId != null)
  );
};

// "Jun 28" for an ISO YYYY-MM-DD date. T00:00:00 anchors the bare string to
// local midnight (bare dates parse as UTC and shift a day west of Greenwich).
const formatSuggestionDate = (isoDate) => {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * One suggested-operation card. Fades and slides into place on mount — a card's
 * key is its stable pending id, so it mounts (and animates) exactly once, when
 * the suggestion first appears on the page.
 */
const SuggestedOperationCard = memo(function SuggestedOperationCard({
  item,
  colors,
  t,
  accounts,
  categories,
  atmTargetAccountId,
  saving,
  canAccept,
  onAccept,
  onDismiss,
  onReviewAll,
}) {
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

  const cardColorStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftColor: colors.primary,
  };

  // Mid-save: collapse into a compact progress row (mirrors the settings review
  // panel) so the accept reads as instant and can't be double-tapped.
  if (saving) {
    return (
      <Animated.View
        style={[styles.card, styles.savingCard, cardColorStyle, enterStyle]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('bank_notifications_adding') || 'Adding operation…'}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <View style={styles.savingBody}>
          <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>
            {item.merchant || item.kind}
          </Text>
          <Text style={[styles.metaText, { color: colors.mutedText }]} numberOfLines={1}>
            {t('bank_notifications_adding') || 'Adding operation…'}
          </Text>
        </View>
        <Text style={[styles.amount, { color: colors.mutedText }]}>
          {item.amount} {item.currency}
        </Text>
      </Animated.View>
    );
  }

  const account = accounts.find((a) => a.id === item.accountId);
  const isTransfer = item.type === 'transfer';
  // ATM-withdrawal transfers land in a bound cash account. Show "source → target"
  // so the user sees where the money goes before one-tap accepting a transfer
  // (mirrors the "To account" field in the settings review panel).
  const targetAccount = isTransfer
    ? accounts.find((a) => a.id === atmTargetAccountId)
    : null;
  const categoryName = !isTransfer && item.categoryId
    ? getCategoryDisplayName(item.categoryId, categories, t)
    : null;
  const accountLabel = isTransfer && account && targetAccount
    ? `${account.name} → ${targetAccount.name}`
    : (account ? account.name : null);
  const metaLabel = [
    formatSuggestionDate(item.date),
    accountLabel,
    categoryName,
  ]
    .filter(Boolean)
    .join(' · ');
  // A screen reader navigating by action hears each card's buttons identically
  // ("Add"/"Dismiss") otherwise; naming the merchant + amount disambiguates them.
  const itemContext = `${item.merchant || item.kind}, ${item.amount} ${item.currency}`;

  return (
    <Animated.View style={[styles.card, cardColorStyle, enterStyle]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="card" size={15} color={colors.primary} />
          <Text style={[styles.sourceLabel, { color: colors.mutedText }]} numberOfLines={1}>
            {t('suggested_from_notification') || 'From notification'}
          </Text>
        </View>
        <Text style={[styles.amount, { color: colors.text }]}>
          {item.amount} {item.currency}
        </Text>
      </View>
      <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>
        {item.merchant || item.kind}
      </Text>
      {metaLabel ? (
        <Text style={[styles.metaText, { color: colors.mutedText }]} numberOfLines={1}>
          {metaLabel}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onDismiss(item)}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={`${t('dismiss') || 'Dismiss'}: ${itemContext}`}
        >
          <Text style={[styles.actionLabel, { color: colors.mutedText }]}>
            {t('dismiss') || 'Dismiss'}
          </Text>
        </TouchableOpacity>
        {canAccept ? (
          <TouchableOpacity
            onPress={() => onAccept(item)}
            style={[styles.actionButton, styles.actionButtonPrimary, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={`${t('add') || 'Add'}: ${itemContext}`}
            accessibilityHint={t('suggested_add_hint') || 'Add this operation with the suggested account and category'}
          >
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
              {t('add') || 'Add'}
            </Text>
          </TouchableOpacity>
        ) : (
          // Not enough is pre-resolved for a one-tap add (unknown card, kind that
          // needs a manual category, unbound ATM target) — route to the full
          // review queue in settings instead of duplicating its pickers here.
          <TouchableOpacity
            onPress={onReviewAll}
            style={[styles.actionButton, styles.actionButtonPrimary, styles.actionButtonOutlined, { borderColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={`${t('suggested_review') || 'Review'}: ${itemContext}`}
            accessibilityHint={t('suggested_review_hint') || 'Open the review queue in settings'}
          >
            <Text style={[styles.actionLabel, { color: colors.primary }]}>
              {t('suggested_review') || 'Review'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

SuggestedOperationCard.propTypes = {
  item: PropTypes.object.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  accounts: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  atmTargetAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  saving: PropTypes.bool,
  canAccept: PropTypes.bool,
  onAccept: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onReviewAll: PropTypes.func.isRequired,
};

SuggestedOperationCard.defaultProps = {
  atmTargetAccountId: null,
  saving: false,
  canAccept: false,
};

/**
 * Stacked "suggested operation from notification" cards shown on the main
 * operations page, directly above the quick-add panel — so the quick-add form
 * reads as the bottom card of the stack. Suggestions come from the same pending
 * review queue that Settings → Notification processing manages; this surface
 * offers one-tap accept/dismiss and defers anything ambiguous to that panel.
 */
const SuggestedOperationsStack = memo(function SuggestedOperationsStack({
  colors,
  t,
  suggestions,
  accounts,
  categories,
  savingIds,
  atmTargetAccountId,
  onAccept,
  onDismiss,
  onReviewAll,
}) {
  if (!suggestions || suggestions.length === 0) return null;

  const visible = suggestions.slice(0, MAX_VISIBLE);
  const overflowCount = suggestions.length - visible.length;

  return (
    <View style={styles.container}>
      {visible.map((item) => (
        <SuggestedOperationCard
          key={item.id}
          item={item}
          colors={colors}
          t={t}
          accounts={accounts}
          categories={categories}
          atmTargetAccountId={atmTargetAccountId}
          saving={!!savingIds[item.id]}
          canAccept={canAcceptSuggestion(item, atmTargetAccountId)}
          onAccept={onAccept}
          onDismiss={onDismiss}
          onReviewAll={onReviewAll}
        />
      ))}
      {overflowCount > 0 ? (
        <TouchableOpacity
          onPress={onReviewAll}
          style={[styles.moreRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={(t('suggested_more_to_review') || '{count} more to review').replace('{count}', String(overflowCount))}
          accessibilityHint={t('suggested_review_hint') || 'Open the review queue in settings'}
        >
          <Text style={[styles.moreLabel, { color: colors.primary }]}>
            {(t('suggested_more_to_review') || '{count} more to review').replace('{count}', String(overflowCount))}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

SuggestedOperationsStack.displayName = 'SuggestedOperationsStack';

SuggestedOperationsStack.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  suggestions: PropTypes.arrayOf(PropTypes.object),
  accounts: PropTypes.array,
  categories: PropTypes.array,
  savingIds: PropTypes.object,
  atmTargetAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onAccept: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onReviewAll: PropTypes.func.isRequired,
};

SuggestedOperationsStack.defaultProps = {
  suggestions: [],
  accounts: [],
  categories: [],
  savingIds: {},
  atmTargetAccountId: null,
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
  },
  actionButtonOutlined: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionButtonPrimary: {
    minWidth: 88,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionLabelPrimary: {
    color: '#ffffff',
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
    marginTop: SPACING.sm,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderLeftWidth: 3,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginRight: SPACING.sm,
  },
  container: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 12,
    marginTop: 2,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  moreRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    minHeight: 44,
    paddingVertical: SPACING.sm,
  },
  savingBody: {
    flex: 1,
  },
  savingCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  sourceLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

export default SuggestedOperationsStack;
