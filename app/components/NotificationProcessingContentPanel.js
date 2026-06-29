import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import SimplePicker from './SimplePicker';
import CategoryGridSelector from './CategoryGridSelector';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import { NotificationCard } from './NotificationsContentPanel';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import {
  isBankNotificationsEnabled,
  processBankNotifications,
  resolvePendingNotification,
  dismissPendingNotification,
} from '../services/notifications/processBankNotifications';
import { kindRequiresCategory } from '../services/notifications/parseBankNotification';
import {
  getHiddenPackages,
  registerSeenPackages,
  filterNotificationsByApp,
} from '../services/notifications/notificationFilters';
import { getPendingNotifications } from '../services/PendingNotificationsDB';
import { getRecentNotifications } from '../services/NotificationAccess';

/**
 * "Notification processing" settings subpanel — the main view.
 *
 * Shows two things:
 *   1. Review queue: notifications that parsed as bank transactions but couldn't
 *      be matched automatically, each with an account + category picker.
 *   2. Recent notifications: the raw feed the listener has captured, with the
 *      bank-parseable ones highlighted (see NotificationCard). The feed is
 *      filtered by the per-app filters the user manages from the "Filters" menu
 *      (three-dots → Filters), so hidden apps don't clutter the list.
 *
 * The notification-access permission and the "process bank notifications" toggle
 * live on the Filters subpanel (NotificationFiltersContentPanel), reachable from
 * the header overflow menu.
 *
 * The panel owns all of its async state so the host screen only has to mount it.
 */
export default function NotificationProcessingContentPanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();
  const { categories } = useCategories();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [hidden, setHidden] = useState([]);
  // Per-item chosen { accountId, categoryId } keyed by pending id.
  const [choices, setChoices] = useState({});
  // Guards async setters from firing after unmount — the panel is remounted
  // whenever the user toggles between the main and filters views.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const accountItems = accounts.map((a) => ({
    label: a.name,
    subLabel: a.currency,
    value: a.id,
  }));

  const reloadPending = useCallback(async () => {
    const items = await getPendingNotifications();
    if (!mountedRef.current) return;
    setPending(items);
    // Seed choices with any suggested account/category already on the item.
    setChoices((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        if (!next[item.id]) {
          next[item.id] = { accountId: item.accountId ?? null, categoryId: item.categoryId ?? null };
        }
      });
      return next;
    });
  }, []);

  const reloadRecent = useCallback(async () => {
    const items = await getRecentNotifications();
    const list = Array.isArray(items) ? items : [];
    // Remember which apps we've seen so they appear in the Filters list, and
    // refresh the hidden set so the feed reflects the latest filter choices.
    await registerSeenPackages(list.map((n) => n.packageName));
    const hiddenList = await getHiddenPackages();
    if (!mountedRef.current) return;
    setRecent(list);
    setHidden(Array.isArray(hiddenList) ? hiddenList : []);
  }, []);

  // On mount: read the feature flag, process once (if enabled), then load the
  // review queue and the recent-notifications feed.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const isOn = await isBankNotificationsEnabled();
        if (!mountedRef.current) return;
        if (isOn) {
          await processBankNotifications();
        }
        if (mountedRef.current) await Promise.all([reloadPending(), reloadRecent()]);
      } catch (error) {
        // Non-fatal; show whatever loaded.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [reloadPending, reloadRecent]);

  const handleRefresh = useCallback(async () => {
    setProcessing(true);
    try {
      if (await isBankNotificationsEnabled()) {
        await processBankNotifications();
      }
      await Promise.all([reloadPending(), reloadRecent()]);
    } finally {
      if (mountedRef.current) setProcessing(false);
    }
  }, [reloadPending, reloadRecent]);

  const setChoice = useCallback((id, patch) => {
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSave = useCallback(async (item) => {
    const choice = choices[item.id] || {};
    if (choice.accountId == null) return;
    await resolvePendingNotification(item.id, {
      accountId: choice.accountId,
      categoryId: choice.categoryId || null,
    });
    await reloadPending();
  }, [choices, reloadPending]);

  const handleDismiss = useCallback(async (item) => {
    await dismissPendingNotification(item.id);
    await reloadPending();
  }, [reloadPending]);

  // The feed, with hidden apps filtered out.
  const visibleRecent = useMemo(
    () => filterNotificationsByApp(recent, hidden),
    [recent, hidden],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      refreshControl={<RefreshControl refreshing={processing} onRefresh={handleRefresh} />}
    >
      {/* ── Review queue ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {(t('bank_notifications_review') || 'Review queue').toUpperCase()}
      </Text>

      {pending.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('bank_notifications_empty') || 'Nothing to review. Matched notifications are saved automatically.'}
          </Text>
        </View>
      ) : (
        pending.map((item) => {
          const choice = choices[item.id] || {};
          // C2C transfers must have a category chosen before they can be saved.
          const categoryRequired = kindRequiresCategory(item.kind, item.packageName);
          const canSave =
            choice.accountId != null && (!categoryRequired || choice.categoryId != null);
          return (
            <View
              key={item.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardMerchant, { color: colors.text }]} numberOfLines={1}>
                  {item.merchant || item.kind}
                </Text>
                <Text style={[styles.cardAmount, { color: colors.text }]}>
                  {item.amount} {item.currency}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: colors.mutedText }]}>
                {[item.date, item.cardMask].filter(Boolean).join(' · ')}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                {(t('account') || 'Account').toUpperCase()}
              </Text>
              <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                <SimplePicker
                  value={choice.accountId}
                  onValueChange={(v) => setChoice(item.id, { accountId: v })}
                  items={accountItems}
                  colors={colors}
                  closeLabel={t('close') || 'Close'}
                />
              </View>

              <View style={styles.categoryLabelRow}>
                <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                  {(t('category') || 'Category').toUpperCase()}
                  {categoryRequired ? ' *' : ''}
                </Text>
                {choice.categoryId ? (
                  <View style={styles.selectedCategoryRow}>
                    <Ionicons name="pricetag" size={12} color={colors.primary} />
                    <Text style={[styles.selectedCategoryText, { color: colors.text }]} numberOfLines={1}>
                      {getCategoryDisplayName(choice.categoryId, categories, t)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <CategoryGridSelector
                categories={categories}
                categoryType={item.type}
                selectedCategoryId={choice.categoryId || null}
                onSelect={(categoryId) => setChoice(item.id, { categoryId })}
                colors={colors}
                t={t}
              />

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => handleDismiss(item)}
                  style={styles.actionButton}
                  accessibilityRole="button"
                >
                  <Text style={[styles.actionLabel, { color: colors.mutedText }]}>
                    {t('dismiss') || 'Dismiss'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSave(item)}
                  disabled={!canSave}
                  style={[
                    styles.actionButton,
                    styles.actionButtonPrimary,
                    { backgroundColor: canSave ? colors.primary : colors.border },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
                    {t('save') || 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* ── Recent notifications (bank-parseable ones highlighted) ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {(t('notifications_recent') || 'Recent notifications').toUpperCase()}
      </Text>

      {visibleRecent.length === 0 ? (
        <View style={styles.emptyState}>
          {/* Distinguish "nothing captured" from "everything is hidden by the
              app filters" so an empty feed never looks like a broken listener. */}
          <Ionicons
            name={recent.length > 0 ? 'funnel-outline' : 'notifications-off-outline'}
            size={40}
            color={colors.mutedText}
          />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {recent.length > 0
              ? (t('notifications_all_filtered') ||
                'All recent notifications are hidden by your app filters.')
              : (t('notifications_empty') ||
                'No notifications recorded yet. New notifications will appear here.')}
          </Text>
        </View>
      ) : (
        visibleRecent.map((notification, index) => (
          <NotificationCard
            // Notifications carry no stable id; post time + index keeps keys
            // unique even when two arrive at the same millisecond.
            key={`${notification.postTime || 0}-${index}`}
            notification={notification}
            colors={colors}
            t={t}
          />
        ))
      )}
    </ScrollView>
  );
}

NotificationProcessingContentPanel.propTypes = {
  bottomInset: PropTypes.number,
};

NotificationProcessingContentPanel.defaultProps = {
  bottomInset: 0,
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  actionButtonPrimary: {
    minWidth: 88,
  },
  actionLabel: {
    fontSize: 14,
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
    marginTop: SPACING.md,
  },
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardMerchant: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    marginRight: SPACING.sm,
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  pickerWrap: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  selectedCategoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
  },
  selectedCategoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
