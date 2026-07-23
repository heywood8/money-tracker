import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import SimplePicker from './SimplePicker';
import FormInput from './FormInput';
import CategoryGridSelector from './CategoryGridSelector';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import { NotificationCard } from './NotificationsContentPanel';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import {
  isBankNotificationsEnabled,
  processBankNotifications,
  resolvePendingNotification,
  dismissPendingNotification,
  reAddNotification,
  resolveAtmTargetAccount,
} from '../services/notifications/processBankNotifications';
import { kindRequiresCategory } from '../services/notifications/parseBankNotification';
import {
  getHiddenPackages,
  registerSeenPackages,
  filterNotificationsByApp,
  hidePackage,
} from '../services/notifications/notificationFilters';
import { getPendingNotifications } from '../services/PendingNotificationsDB';
import { getLabelForMerchant } from '../services/NotificationRulesDB';
import { getRecentNotifications } from '../services/NotificationAccess';
import * as Currency from '../services/currency';

// How often the panel silently re-runs the pipeline and reloads its lists so
// newly-arrived notifications surface on their own, without a manual pull.
const AUTO_REFRESH_MS = 3000;

// Enable LayoutAnimation on the classic Android renderer. It is a no-op on Fabric
// (the New Architecture drives layout animations natively), and the guard keeps it
// from throwing when the method is absent.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// A short ease used when a review card collapses into its "Adding…" state and when
// the finished card leaves the queue, so a save reads as a smooth transition
// instead of an abrupt jump. Kept snappy to match the app's other 200–260ms moves.
const CARD_COLLAPSE_ANIMATION = {
  duration: 220,
  create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeIn, property: LayoutAnimation.Properties.opacity },
};

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
export default function NotificationProcessingContentPanel({ bottomInset = 0 }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();
  const { categories } = useCategories();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [hidden, setHidden] = useState([]);
  // Per-item chosen { accountId, categoryId, toAccountId, labelOverride } keyed by
  // pending id. `toAccountId` is only used by transfer items (ATM withdrawals).
  const [choices, setChoices] = useState({});
  // Per-recent-card re-add feedback: key -> 'loading' | 'created' | 'pending'.
  const [reAddState, setReAddState] = useState({});
  // Per-review-card save state: pending id -> true while its save is in flight.
  // A card mid-save collapses into a compact "Adding…" row and drops its action
  // buttons, so the up-to-8s best-effort location fix inside the save can't be
  // double-tapped into duplicate operations (the reason this is async at all).
  const [savingIds, setSavingIds] = useState({});
  // Mirror of `choices` so reloadPending can read the latest values without
  // taking `choices` as a dependency (which would re-create it on every keystroke).
  const choicesRef = useRef(choices);
  useEffect(() => { choicesRef.current = choices; }, [choices]);
  // Guards async setters from firing after unmount — the panel is remounted
  // whenever the user toggles between the main and filters views.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // Keys of recent-feed cards already shown. New keys (notifications captured
  // after the panel opened) animate in; the initial batch is seeded silently so
  // opening the panel doesn't fire a flurry of animations. `null` until seeded.
  const seenRecentKeys = useRef(null);
  // Guards the auto-refresh timer so a slow run can't overlap the next tick.
  const autoRefreshingRef = useRef(false);

  const accountItems = accounts.map((a) => ({
    label: a.name,
    subLabel: a.currency,
    value: a.id,
  }));

  const reloadPending = useCallback(async () => {
    const items = await getPendingNotifications();
    // The bound cash account pre-fills the target picker on transfer (ATM) items.
    let atmAccount = null;
    try {
      atmAccount = await resolveAtmTargetAccount();
    } catch (error) {
      atmAccount = null;
    }
    const atmId = atmAccount ? atmAccount.id : null;
    const prevChoices = choicesRef.current;
    // Pre-fill the custom-name field with any override already learned for the
    // merchant. Cards whose field already holds a name are settled and skipped —
    // avoiding an O(N) lookup fan-out on every reload (each save/dismiss reloads).
    // New and still-blank cards are looked up, so a name just learned on one card
    // surfaces on its siblings from the same shop.
    const overrides = await Promise.all(
      items.map((item) => {
        const settled = prevChoices[item.id]?.labelOverride;
        if (settled) return Promise.resolve(settled);
        return item.merchant
          ? getLabelForMerchant(item.merchant, item.packageName).catch(() => null)
          : Promise.resolve(null);
      }),
    );
    if (!mountedRef.current) return;
    setPending(items);
    // Seed choices with any suggested account/category/target and learned label.
    setChoices((prev) => {
      const next = { ...prev };
      items.forEach((item, i) => {
        const learned = overrides[i] ?? '';
        if (!next[item.id]) {
          next[item.id] = {
            accountId: item.accountId ?? null,
            categoryId: item.categoryId ?? null,
            // Transfer (ATM) items pre-fill the target with the bound cash account.
            toAccountId: item.type === 'transfer' ? atmId : null,
            labelOverride: learned,
          };
        } else if (learned && !next[item.id].labelOverride) {
          // A sibling save just learned this shop's name — surface it on a
          // still-blank card without clobbering a value the user is editing.
          next[item.id] = { ...next[item.id], labelOverride: learned };
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

  // Silent variant of handleRefresh for the auto-refresh timer: same work, but no
  // RefreshControl spinner and guarded against overlapping runs.
  const runSilentRefresh = useCallback(async () => {
    if (autoRefreshingRef.current) return;
    autoRefreshingRef.current = true;
    try {
      if (await isBankNotificationsEnabled()) {
        await processBankNotifications();
      }
      if (mountedRef.current) await Promise.all([reloadPending(), reloadRecent()]);
    } catch (error) {
      // Non-fatal; keep the last good data until the next tick.
    } finally {
      autoRefreshingRef.current = false;
    }
  }, [reloadPending, reloadRecent]);

  // Auto-refresh every AUTO_REFRESH_MS once the initial load has finished, so
  // notifications arriving while the panel is open surface without a manual pull.
  useEffect(() => {
    if (loading) return undefined;
    const intervalId = setInterval(runSilentRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [loading, runSilentRefresh]);

  const setChoice = useCallback((id, patch) => {
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // Drop save flags for cards that have left the queue (saved or dismissed) so the
  // map only ever tracks cards still on screen.
  useEffect(() => {
    setSavingIds((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const live = new Set(pending.map((p) => p.id));
      let changed = false;
      const next = {};
      keys.forEach((id) => {
        if (live.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [pending]);

  const handleSave = useCallback(async (item) => {
    const choice = choices[item.id] || {};
    if (choice.accountId == null) return;
    // Transfers (ATM withdrawals) need a target account and no category.
    if (item.type === 'transfer' && (choice.toAccountId == null || choice.toAccountId === choice.accountId)) {
      return;
    }
    // Ignore repeat taps while this item's save is already running.
    if (savingIds[item.id]) return;

    // Collapse the card into an "Adding…" state right away so the save feels
    // instant even while the best-effort location fix inside resolve resolves in
    // the background (it can take up to 8s). Dropping the Save button from the
    // tree, together with the guard above, stops a second tap from booking a
    // duplicate operation during the capture.
    LayoutAnimation.configureNext(CARD_COLLAPSE_ANIMATION);
    setSavingIds((prev) => ({ ...prev, [item.id]: true }));

    try {
      await resolvePendingNotification(item.id, {
        accountId: choice.accountId,
        categoryId: choice.categoryId || null,
        toAccountId: choice.toAccountId ?? null,
        // Send the field verbatim (string, possibly blank) so resolve treats it as
        // authoritative — a cleared field reverts to the raw shop name.
        labelOverride: choice.labelOverride ?? '',
      });
      // The pending row is deleted now; reloading drops the collapsed card from
      // the queue (the effect above prunes its stale saving flag).
      LayoutAnimation.configureNext(CARD_COLLAPSE_ANIMATION);
      await reloadPending();
    } catch (error) {
      // The save failed (e.g. no exchange rate for a cross-currency booking) —
      // expand the card again so the user can retry or adjust their choices.
      if (mountedRef.current) {
        LayoutAnimation.configureNext(CARD_COLLAPSE_ANIMATION);
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    }
  }, [choices, reloadPending, savingIds]);

  const handleDismiss = useCallback(async (item) => {
    await dismissPendingNotification(item.id);
    await reloadPending();
  }, [reloadPending]);

  // Re-add an already-processed bank notification from the recent feed. Shows a
  // brief spinner, then created/queued feedback, and refreshes the review queue.
  const handleReAdd = useCallback(async (notification, key) => {
    setReAddState((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const result = await reAddNotification(notification);
      const outcome = result.created > 0 ? 'created' : result.pending > 0 ? 'pending' : undefined;
      await reloadPending();
      if (!mountedRef.current) return;
      setReAddState((prev) => ({ ...prev, [key]: outcome }));
    } catch (error) {
      if (mountedRef.current) {
        setReAddState((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }, [reloadPending]);

  // Deactivate an app straight from the recent feed: swiping a card left reveals
  // a "Hide" action that filters out every notification from that app. Hiding
  // updates the local set immediately so the swiped card (and its siblings from
  // the same app) drop out of the feed at once, without waiting for a refresh.
  const handleDeactivateApp = useCallback(async (packageName) => {
    if (!packageName) return;
    try {
      const next = await hidePackage(packageName);
      if (mountedRef.current) setHidden(Array.isArray(next) ? next : []);
    } catch (error) {
      // Non-fatal; the next silent refresh reconciles the hidden set from storage.
    }
  }, []);

  const renderDeactivateAction = useCallback((packageName) => (
    <Pressable
      testID={`deactivate-app-${packageName}`}
      style={[styles.swipeDeactivate, { backgroundColor: colors.delete }]}
      onPress={() => handleDeactivateApp(packageName)}
      accessibilityRole="button"
      accessibilityLabel={t('notification_filter_hide') || 'Hide'}
      accessibilityHint={t('notification_filter_hide_app') || 'Hide notifications from this app'}
    >
      <Ionicons name="notifications-off" size={20} color="#ffffff" />
      <Text style={styles.swipeDeactivateText} numberOfLines={1}>
        {t('notification_filter_hide') || 'Hide'}
      </Text>
    </Pressable>
  ), [colors.delete, handleDeactivateApp, t]);

  // The feed, with hidden apps filtered out.
  const visibleRecent = useMemo(
    () => filterNotificationsByApp(recent, hidden),
    [recent, hidden],
  );

  // Give each card a content-stable key (not the array index) so a card keeps
  // its identity across refreshes even as newer notifications are prepended —
  // only genuinely new cards mount, so only they animate. A per-render counter
  // disambiguates the rare notifications that share every field.
  const keyedRecent = useMemo(() => {
    const counts = {};
    return visibleRecent.map((notification) => {
      const base = `${notification.postTime || 0}|${notification.packageName || ''}|${notification.title || ''}|${notification.text || ''}`;
      counts[base] = (counts[base] || 0) + 1;
      const key = counts[base] > 1 ? `${base}#${counts[base]}` : base;
      return { notification, key };
    });
  }, [visibleRecent]);

  // Track which keys have been shown. Runs after render, so the render below sees
  // the pre-update set and can flag brand-new cards. The first feed load seeds the
  // set without animating anything.
  const previouslySeen = seenRecentKeys.current;
  useEffect(() => {
    if (seenRecentKeys.current === null) {
      seenRecentKeys.current = new Set(keyedRecent.map((k) => k.key));
      return;
    }
    keyedRecent.forEach((k) => seenRecentKeys.current.add(k.key));
  }, [keyedRecent]);

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
          // Mid-save: the full form is collapsed into a compact progress row so
          // the save reads as instant, and the (now-absent) Save button can't be
          // tapped again while the location fix resolves.
          if (savingIds[item.id]) {
            return (
              <View
                key={item.id}
                style={[styles.card, styles.savingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="progressbar"
                accessibilityLabel={t('bank_notifications_adding') || 'Adding operation…'}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <View style={styles.savingBody}>
                  <Text style={[styles.savingMerchant, { color: colors.text }]} numberOfLines={1}>
                    {item.merchant || item.kind}
                  </Text>
                  <Text style={[styles.savingStatus, { color: colors.mutedText }]} numberOfLines={1}>
                    {t('bank_notifications_adding') || 'Adding operation…'}
                  </Text>
                </View>
                <Text style={[styles.cardAmount, { color: colors.mutedText }]}>
                  {item.amount} {item.currency}
                </Text>
              </View>
            );
          }
          const choice = choices[item.id] || {};
          // ATM withdrawals resolve to a target (cash) account instead of a
          // category — they are booked as a transfer between the user's accounts.
          const isTransfer = item.type === 'transfer';
          // C2C transfers / DEBIT ACCOUNT must have a category chosen before saving.
          const categoryRequired = kindRequiresCategory(item.kind, item.packageName);
          const canSave = isTransfer
            ? (choice.accountId != null
              && choice.toAccountId != null
              && choice.toAccountId !== choice.accountId)
            : (choice.accountId != null && (!categoryRequired || choice.categoryId != null));
          // Target-account options exclude the chosen source account (a transfer
          // must move money between two different accounts).
          const targetAccountItems = accountItems.filter((a) => a.value !== choice.accountId);
          // Preview the converted amount when the chosen account's currency differs
          // from the charge currency — the operation is booked in the account
          // currency at save time, so show an estimate (offline rate) up front so
          // the user can sanity-check it. The actual booking uses the live rate.
          const chosenAccount = accounts.find((a) => a.id === choice.accountId);
          const convertedPreview =
            chosenAccount && item.currency && chosenAccount.currency !== item.currency
              ? Currency.convertAmount(item.amount, item.currency, chosenAccount.currency)
              : null;
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
              {convertedPreview && (
                <Text style={[styles.cardConversion, { color: colors.mutedText }]}>
                  ≈ {convertedPreview} {chosenAccount.currency}
                </Text>
              )}

              <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                {(t('bank_notifications_custom_label') || 'Custom name').toUpperCase()}
              </Text>
              <FormInput
                value={choice.labelOverride ?? ''}
                onChangeText={(v) => setChoice(item.id, { labelOverride: v })}
                placeholder={item.merchant || ''}
              />
              <Text style={[styles.helpText, { color: colors.mutedText }]}>
                {isTransfer
                  ? (t('bank_notifications_transfer_label_help')
                    || 'Optional label for this transfer')
                  : (t('bank_notifications_custom_label_help')
                    || 'Used as the label for this and future transactions from this shop')}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                {(isTransfer
                  ? (t('bank_notifications_transfer_from') || 'From account')
                  : (t('account') || 'Account')).toUpperCase()}
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

              {isTransfer ? (
                <>
                  {/* ATM withdrawals move money from the card account into a cash
                      account. The chosen target is bound and reused next time. */}
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {(t('bank_notifications_transfer_to') || 'To account').toUpperCase()}
                    {' *'}
                  </Text>
                  <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                    <SimplePicker
                      value={choice.toAccountId}
                      onValueChange={(v) => setChoice(item.id, { toAccountId: v })}
                      items={targetAccountItems}
                      colors={colors}
                      closeLabel={t('close') || 'Close'}
                    />
                  </View>
                </>
              ) : (
                <>
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
                </>
              )}

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
        keyedRecent.map(({ notification, key }) => {
          // A card is "new" (and animates in) when its key wasn't shown before.
          // Before the first seed (`null`) nothing is new, so the initial batch
          // renders at rest.
          const isNew = previouslySeen != null && !previouslySeen.has(key);
          const card = (
            <NotificationCard
              notification={notification}
              colors={colors}
              t={t}
              onReAdd={(n) => handleReAdd(n, key)}
              reAddState={reAddState[key]}
              animateIn={isNew}
            />
          );
          // Only offer swipe-to-hide when the source app is known — a card with no
          // packageName can't be filtered by app, so it stays a plain card. A keyed
          // Fragment carries the list key without adding an extra layout node.
          if (!notification.packageName) {
            return <React.Fragment key={key}>{card}</React.Fragment>;
          }
          return (
            <Swipeable
              key={key}
              renderRightActions={() => renderDeactivateAction(notification.packageName)}
              overshootRight={false}
              friction={2}
              rightThreshold={60}
              // The card only reveals right actions (leftward drag). Leave the
              // rightward direction unrecognized so a rightward swipe passes
              // through to the panel's swipe-to-dismiss gesture instead of being
              // swallowed by this Swipeable's pan handler (activeOffsetX positive
              // threshold is dragOffsetFromLeftEdge).
              dragOffsetFromLeftEdge={Number.MAX_SAFE_INTEGER}
            >
              {card}
            </Swipeable>
          );
        })
      )}
    </ScrollView>
  );
}

NotificationProcessingContentPanel.propTypes = {
  bottomInset: PropTypes.number,
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
  cardConversion: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
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
  helpText: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  pickerWrap: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  savingBody: {
    flex: 1,
  },
  savingCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  savingMerchant: {
    fontSize: 15,
    fontWeight: '700',
  },
  savingStatus: {
    fontSize: 12,
    marginTop: 2,
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
  // Swipe-to-deactivate action revealed under a recent-notification card. The
  // marginBottom matches the card's own marginBottom (SPACING.md) so the button's
  // bottom edge lines up with the card's.
  swipeDeactivate: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
    paddingHorizontal: SPACING.md,
    width: 72,
  },
  swipeDeactivateText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
