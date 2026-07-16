import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import SimplePicker from './SimplePicker';
import FormInput from './FormInput';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import { parseCardMasks } from '../utils/cardMask';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import {
  getAllMerchantRules,
  clearMerchantRuleCategory,
  clearMerchantRuleLabel,
  upsertMerchantRule,
  upsertMerchantLabel,
} from '../services/NotificationRulesDB';
import * as AccountsDB from '../services/AccountsDB';
import {
  resolveAtmTargetAccount,
  setAtmTargetAccount,
  clearAtmTargetAccount,
} from '../services/notifications/processBankNotifications';

/**
 * "Bindings" subpanel for notification processing (header three-dots → Bindings).
 *
 * Surfaces the associations Penny learns while processing bank notifications so
 * the user can review and edit them in one place, grouped by kind:
 *
 *   1. Card bindings: which account each card mask maps to, plus the cash account
 *      ATM withdrawals are booked into. Learned the first time a card / ATM
 *      notification is resolved.
 *   2. Category bindings: merchant -> category rules that auto-categorize future
 *      notifications from the same shop.
 *   3. Name bindings: merchant -> custom-name overrides that relabel a shop's
 *      transactions (e.g. "ECOSENSE BYUZAND" -> "Ecosense").
 *
 * Card bindings live on the account rows (AccountsDB); the ATM target is a
 * preference; category and name bindings share the notification_merchant_rules
 * table (one row may carry both). Each row can be re-pointed or removed.
 */
export default function NotificationBindingsContentPanel({ bottomInset = 0 }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();
  const { reloadAccounts } = useAccountsActions();
  const { categories } = useCategories();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rules, setRules] = useState([]);
  const [atmAccount, setAtmAccount] = useState(null);
  // Editable draft text for each name binding, keyed by rule id. Kept separate
  // from `rules` so typing doesn't fight the reload cycle.
  const [labelDrafts, setLabelDrafts] = useState({});

  // Guards async setters from firing after the panel unmounts (it is remounted
  // whenever the user toggles between the main/filters/bindings views).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const accountItems = useMemo(
    () => accounts.map((a) => ({ label: a.name, subLabel: a.currency, value: a.id })),
    [accounts],
  );

  const categoryItems = useMemo(
    () => categories.map((c) => ({ label: getCategoryDisplayName(c.id, categories, t), value: c.id })),
    [categories, t],
  );

  const reload = useCallback(async () => {
    const [ruleList, atm] = await Promise.all([
      getAllMerchantRules().catch(() => []),
      resolveAtmTargetAccount().catch(() => null),
    ]);
    if (!mountedRef.current) return;
    const safeRules = Array.isArray(ruleList) ? ruleList : [];
    setRules(safeRules);
    setAtmAccount(atm || null);
    // Seed a draft for any name binding we don't already hold one for, without
    // clobbering text the user is mid-edit on.
    setLabelDrafts((prev) => {
      const next = { ...prev };
      safeRules.forEach((r) => {
        if (r.labelOverride && !(r.id in next)) next[r.id] = r.labelOverride;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (error) {
        // Non-fatal; show whatever loaded.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [reload]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [reload]);

  // ── Card bindings ──
  // One row per bound card: an account can hold several, stored as a list.
  const cardBindings = useMemo(
    () => accounts.flatMap((a) => parseCardMasks(a.cardMask).map((mask) => ({ account: a, mask }))),
    [accounts],
  );

  const handleReassignCard = useCallback(async (account, mask, newAccountId) => {
    if (newAccountId == null || newAccountId === account.id) return;
    // addAccountCardMask moves just this card: it strips it from the old owner and
    // adds it to the new one in one transaction, leaving both accounts' other
    // cards untouched. Reload refreshes both rows.
    await AccountsDB.addAccountCardMask(newAccountId, mask);
    await reloadAccounts();
  }, [reloadAccounts]);

  const handleRemoveCard = useCallback(async (account, mask) => {
    // Drop only this card; the account keeps its other bindings.
    await AccountsDB.removeAccountCardMask(account.id, mask);
    await reloadAccounts();
  }, [reloadAccounts]);

  const handleChangeAtm = useCallback(async (newAccountId) => {
    if (newAccountId == null) return;
    await setAtmTargetAccount(newAccountId);
    await reload();
  }, [reload]);

  const handleRemoveAtm = useCallback(async () => {
    await clearAtmTargetAccount();
    await reload();
  }, [reload]);

  // ── Category bindings ──
  const categoryBindings = useMemo(
    () => rules.filter((r) => r.categoryId),
    [rules],
  );

  const handleChangeCategory = useCallback(async (rule, categoryId) => {
    if (!categoryId || categoryId === rule.categoryId) return;
    await upsertMerchantRule(rule.merchant, categoryId, rule.packageName);
    await reload();
  }, [reload]);

  const handleRemoveCategory = useCallback(async (rule) => {
    await clearMerchantRuleCategory(rule.id);
    await reload();
  }, [reload]);

  // ── Name bindings ──
  const labelBindings = useMemo(
    () => rules.filter((r) => r.labelOverride),
    [rules],
  );

  const handleSaveLabel = useCallback(async (rule) => {
    const text = (labelDrafts[rule.id] ?? '').trim();
    // A cleared field removes the binding rather than storing an empty override.
    if (!text) {
      await clearMerchantRuleLabel(rule.id);
      setLabelDrafts((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
    } else {
      await upsertMerchantLabel(rule.merchant, text, rule.packageName);
    }
    await reload();
  }, [labelDrafts, reload]);

  const handleRemoveLabel = useCallback(async (rule) => {
    await clearMerchantRuleLabel(rule.id);
    setLabelDrafts((prev) => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
    await reload();
  }, [reload]);

  const setLabelDraft = useCallback((id, value) => {
    setLabelDrafts((prev) => ({ ...prev, [id]: value }));
  }, []);

  const isEmpty = cardBindings.length === 0
    && !atmAccount
    && categoryBindings.length === 0
    && labelBindings.length === 0;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderRemoveButton = (onPress, label) => (
    <TouchableOpacity
      onPress={onPress}
      style={styles.removeButton}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="trash-outline" size={20} color={colors.delete || colors.mutedText} />
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {isEmpty && (
        <View style={styles.emptyState}>
          <Ionicons name="link-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('notification_bindings_empty')
              || 'No bindings yet. Penny learns them as you review notifications.'}
          </Text>
        </View>
      )}

      {/* ── Card bindings ── */}
      {(cardBindings.length > 0 || atmAccount) && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
            {(t('notification_bindings_cards') || 'Card bindings').toUpperCase()}
          </Text>
          <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
            {t('notification_bindings_cards_hint')
              || 'Which account each card, and ATM cash, maps to'}
          </Text>

          {cardBindings.map(({ account, mask }) => (
            <View
              key={`card-${account.id}-${mask}`}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleText}>
                  <Ionicons name="card-outline" size={16} color={colors.mutedText} />
                  <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
                    {mask}
                  </Text>
                </View>
                {renderRemoveButton(
                  () => handleRemoveCard(account, mask),
                  t('notification_bindings_remove') || 'Remove binding',
                )}
              </View>
              <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                <SimplePicker
                  value={account.id}
                  onValueChange={(v) => handleReassignCard(account, mask, v)}
                  items={accountItems}
                  colors={colors}
                  closeLabel={t('close') || 'Close'}
                />
              </View>
            </View>
          ))}

          {atmAccount && (
            <View
              key="atm-target"
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleText}>
                  <Ionicons name="cash-outline" size={16} color={colors.mutedText} />
                  <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
                    {t('notification_bindings_atm') || 'ATM cash account'}
                  </Text>
                </View>
                {renderRemoveButton(
                  handleRemoveAtm,
                  t('notification_bindings_remove') || 'Remove binding',
                )}
              </View>
              <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                <SimplePicker
                  value={atmAccount.id}
                  onValueChange={handleChangeAtm}
                  items={accountItems}
                  colors={colors}
                  closeLabel={t('close') || 'Close'}
                />
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Category bindings ── */}
      {categoryBindings.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
            {(t('notification_bindings_categories') || 'Category bindings').toUpperCase()}
          </Text>
          <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
            {t('notification_bindings_categories_hint')
              || 'Merchants auto-assigned to a category'}
          </Text>

          {categoryBindings.map((rule) => (
            <View
              key={`cat-${rule.id}`}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleText}>
                  <Ionicons name="storefront-outline" size={16} color={colors.mutedText} />
                  <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
                    {rule.merchant}
                  </Text>
                </View>
                {renderRemoveButton(
                  () => handleRemoveCategory(rule),
                  t('notification_bindings_remove') || 'Remove binding',
                )}
              </View>
              <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
                <SimplePicker
                  value={rule.categoryId}
                  onValueChange={(v) => handleChangeCategory(rule, v)}
                  items={categoryItems}
                  colors={colors}
                  closeLabel={t('close') || 'Close'}
                />
              </View>
            </View>
          ))}
        </>
      )}

      {/* ── Name bindings ── */}
      {labelBindings.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
            {(t('notification_bindings_labels') || 'Name bindings').toUpperCase()}
          </Text>
          <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
            {t('notification_bindings_labels_hint')
              || 'Custom names shown instead of the raw shop name'}
          </Text>

          {labelBindings.map((rule) => {
            const draft = labelDrafts[rule.id] ?? rule.labelOverride ?? '';
            const dirty = draft.trim() !== (rule.labelOverride ?? '');
            return (
              <View
                key={`label-${rule.id}`}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleText}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.mutedText} />
                    <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
                      {rule.merchant}
                    </Text>
                  </View>
                  {renderRemoveButton(
                    () => handleRemoveLabel(rule),
                    t('notification_bindings_remove') || 'Remove binding',
                  )}
                </View>
                <View style={styles.labelEditRow}>
                  <View style={styles.labelInput}>
                    <FormInput
                      value={draft}
                      onChangeText={(v) => setLabelDraft(rule.id, v)}
                      placeholder={rule.merchant}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleSaveLabel(rule)}
                    disabled={!dirty}
                    style={[
                      styles.saveButton,
                      { backgroundColor: dirty ? colors.primary : colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('save') || 'Save'}
                  >
                    <Text style={styles.saveButtonText}>{t('save') || 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

NotificationBindingsContentPanel.propTypes = {
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  bindingKey: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  cardTitleText: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginRight: SPACING.sm,
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
  labelEditRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  labelInput: {
    flex: 1,
  },
  pickerWrap: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
  },
  removeButton: {
    padding: SPACING.xs,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: SPACING.lg,
  },
});
