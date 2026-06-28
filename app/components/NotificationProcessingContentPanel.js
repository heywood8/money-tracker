import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import SimplePicker from './SimplePicker';
import { NotificationCard } from './NotificationsContentPanel';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import {
  isBankNotificationsEnabled,
  setBankNotificationsEnabled,
  processBankNotifications,
  resolvePendingNotification,
  dismissPendingNotification,
} from '../services/notifications/processBankNotifications';
import { kindRequiresCategory } from '../services/notifications/parseBankNotification';
import { getPendingNotifications } from '../services/PendingNotificationsDB';
import {
  isNotificationAccessEnabled,
  openNotificationAccessSettings,
  getRecentNotifications,
} from '../services/NotificationAccess';

/**
 * Combined "Notification processing" settings subpanel.
 *
 * Merges what used to be two separate rows — system notification access and
 * bank-notification processing — into a single screen:
 *   1. Access section: grant/manage the OS notification-listener permission.
 *   2. Bank processing: toggle that turns purchase notifications into operations,
 *      plus the review queue for notifications that couldn't be matched
 *      automatically.
 *   3. Recent notifications: the raw feed the listener has captured, where the
 *      ones that parse as bank transactions are highlighted (see NotificationCard).
 *
 * The panel owns all of its async state so the host screen only has to mount it.
 */
export default function NotificationProcessingContentPanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();
  const { categories } = useCategories();

  const [accessEnabled, setAccessEnabled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  // Per-item chosen { accountId, categoryId } keyed by pending id.
  const [choices, setChoices] = useState({});

  const accountItems = accounts.map((a) => ({
    label: a.name,
    subLabel: a.currency,
    value: a.id,
  }));

  // Leaf, non-shadow categories grouped by expense/income for the picker.
  const categoryItemsFor = useCallback((type) => {
    return categories
      .filter((c) => c.type === 'entry' && !c.isShadow && c.categoryType === type)
      .map((c) => ({ label: c.name, value: c.id }));
  }, [categories]);

  const reloadPending = useCallback(async () => {
    const items = await getPendingNotifications();
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
    setRecent(Array.isArray(items) ? items : []);
  }, []);

  // On mount: read access + feature flag, process once (if enabled), then load
  // the review queue and the recent-notifications feed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [access, isOn] = await Promise.all([
          isNotificationAccessEnabled(),
          isBankNotificationsEnabled(),
        ]);
        if (cancelled) return;
        setAccessEnabled(access);
        setEnabled(isOn);
        if (isOn) {
          await processBankNotifications();
        }
        if (!cancelled) await Promise.all([reloadPending(), reloadRecent()]);
      } catch (error) {
        // Non-fatal; show whatever loaded.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadPending, reloadRecent]);

  const handleToggle = useCallback(async (value) => {
    setEnabled(value);
    await setBankNotificationsEnabled(value);
    if (value) {
      setProcessing(true);
      try {
        await processBankNotifications();
        await reloadPending();
      } finally {
        setProcessing(false);
      }
    }
  }, [reloadPending]);

  const handleRefresh = useCallback(async () => {
    setProcessing(true);
    try {
      // Re-check access too: the user may have just granted it in system settings.
      const access = await isNotificationAccessEnabled();
      setAccessEnabled(access);
      if (enabled) {
        await processBankNotifications();
      }
      await Promise.all([reloadPending(), reloadRecent()]);
    } finally {
      setProcessing(false);
    }
  }, [enabled, reloadPending, reloadRecent]);

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
      {/* ── Notification access ── */}
      <View style={[styles.accessRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons
          name={accessEnabled ? 'checkmark-circle' : 'alert-circle-outline'}
          size={22}
          color={accessEnabled ? colors.income : colors.primary}
        />
        <View style={styles.accessText}>
          <Text style={[styles.accessTitle, { color: colors.text }]}>
            {t('notification_access') || 'Notification access'}
          </Text>
          <Text style={[styles.accessHint, { color: colors.mutedText }]}>
            {accessEnabled
              ? (t('notification_access_granted') || 'Penny can read notifications in the background.')
              : (t('notification_access_hint') || 'Allow Penny to read notifications in the background')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openNotificationAccessSettings}
          style={[styles.accessButton, { borderColor: colors.primary }]}
          accessibilityRole="button"
          testID="notification-access-button"
        >
          <Text style={[styles.accessButtonText, { color: colors.primary }]}>
            {accessEnabled ? (t('manage') || 'Manage') : (t('grant_access') || 'Grant')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Bank processing toggle ── */}
      <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.toggleText}>
          <Text style={[styles.toggleTitle, { color: colors.text }]}>
            {t('bank_notifications_enable') || 'Process bank notifications'}
          </Text>
          <Text style={[styles.toggleHint, { color: colors.mutedText }]}>
            {t('bank_notifications_enable_hint') ||
              'Turn purchase notifications into operations automatically'}
          </Text>
        </View>
        <Switch value={enabled} onValueChange={handleToggle} color={colors.primary} />
      </View>

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

              <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                {(t('category') || 'Category').toUpperCase()}
                {categoryRequired ? ' *' : ''}
              </Text>
              <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                <SimplePicker
                  value={choice.categoryId}
                  onValueChange={(v) => setChoice(item.id, { categoryId: v })}
                  items={categoryItemsFor(item.type)}
                  colors={colors}
                  closeLabel={t('close') || 'Close'}
                />
              </View>

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

      {recent.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-off-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('notifications_empty') ||
              'No notifications recorded yet. New notifications will appear here.'}
          </Text>
        </View>
      ) : (
        recent.map((notification, index) => (
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
  accessButton: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  accessButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  accessHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  accessRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  accessText: {
    flex: 1,
  },
  accessTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  toggleHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  toggleRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  toggleText: {
    flex: 1,
    marginRight: SPACING.md,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
});
