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
import { parseCardMasks, cardMaskLast4 } from '../utils/cardMask';
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
 *      notification is resolved; a card can also be bound by hand here.
 *   2. Category bindings: merchant -> category rules that auto-categorize future
 *      notifications from the same shop.
 *   3. Name bindings: merchant -> custom-name overrides that relabel a shop's
 *      transactions (e.g. "ECOSENSE BYUZAND" -> "Ecosense").
 *
 * Card bindings live on the account rows (AccountsDB); the ATM target is a
 * preference; category and name bindings share the notification_merchant_rules
 * table (one row may carry both). Merchant rules are ordered most-recently-matched
 * first, so a binding re-hit by a new notification floats to the top even when its
 * category/label were unchanged. Each row can be re-pointed or removed (removal is
 * two-tap: tap the trash, then confirm). A search box filters every section, and
 * the card section can add a binding by hand.
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
  // Free-text search applied across every section (empty = show all + editing
  // affordances; non-empty = filter-only, hide the add/assign controls).
  const [query, setQuery] = useState('');
  // The row currently awaiting delete confirmation (a stable per-row key), or
  // null. A destructive tap arms it; a second tap on the same row commits.
  const [pendingDelete, setPendingDelete] = useState(null);
  // Inline "add card by hand" editor state.
  const [addingCard, setAddingCard] = useState(false);
  const [newCardAccountId, setNewCardAccountId] = useState(null);
  const [newCardMask, setNewCardMask] = useState('');

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

  // Add a card binding by hand: bind the typed mask (matched by its last 4
  // digits) to the chosen account. Reuses addAccountCardMask so a mask already
  // held elsewhere moves rather than duplicating.
  const handleAddCard = useCallback(async () => {
    const accountId = newCardAccountId ?? (accounts[0] ? accounts[0].id : null);
    if (accountId == null || !cardMaskLast4(newCardMask)) return;
    await AccountsDB.addAccountCardMask(accountId, newCardMask.trim());
    await reloadAccounts();
    if (!mountedRef.current) return;
    setAddingCard(false);
    setNewCardMask('');
    setNewCardAccountId(null);
  }, [newCardAccountId, newCardMask, accounts, reloadAccounts]);

  const startAddCard = useCallback(() => {
    setNewCardAccountId(accounts[0] ? accounts[0].id : null);
    setNewCardMask('');
    setAddingCard(true);
  }, [accounts]);

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

  // ── Search ──
  const isSearching = query.trim().length > 0;
  const matches = useCallback(
    (...fields) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return fields.some((f) => (f || '').toString().toLowerCase().includes(q));
    },
    [query],
  );

  const accountName = useCallback(
    (id) => {
      const a = accounts.find((acc) => acc.id === id);
      return a ? a.name : '';
    },
    [accounts],
  );

  // The filters short-circuit to the full list when not searching — evaluating a
  // match key (notably getCategoryDisplayName) for every row on every render is
  // wasted work when there is no query to test it against.
  const visibleCards = useMemo(
    () => (isSearching
      ? cardBindings.filter(({ account, mask }) => matches(mask, account.name))
      : cardBindings),
    [cardBindings, matches, isSearching],
  );
  const visibleCategories = useMemo(
    () => (isSearching
      ? categoryBindings.filter(
        (r) => matches(r.merchant, getCategoryDisplayName(r.categoryId, categories, t)),
      )
      : categoryBindings),
    [categoryBindings, matches, categories, t, isSearching],
  );
  const visibleLabels = useMemo(
    () => (isSearching
      ? labelBindings.filter((r) => matches(r.merchant, r.labelOverride))
      : labelBindings),
    [labelBindings, matches, isSearching],
  );
  const atmVisible = atmAccount
    && matches(t('notification_bindings_atm'), accountName(atmAccount.id));

  const hasAnyBinding = cardBindings.length > 0 || !!atmAccount
    || categoryBindings.length > 0 || labelBindings.length > 0;
  const noSearchResults = isSearching
    && visibleCards.length === 0 && !atmVisible
    && visibleCategories.length === 0 && visibleLabels.length === 0;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Two-tap delete control: a muted trash arms the row; once armed it becomes a
  // cancel + a coloured confirm so a stray tap never silently drops a binding.
  const renderRemoveControl = (rowKey, onConfirm, label) => {
    if (pendingDelete === rowKey) {
      return (
        <View style={styles.confirmRow}>
          <TouchableOpacity
            onPress={() => setPendingDelete(null)}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={t('cancel') || 'Cancel'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPendingDelete(null); onConfirm(); }}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={t('delete') || 'Delete'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash" size={20} color={colors.delete || '#d9534f'} />
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <TouchableOpacity
        onPress={() => setPendingDelete(rowKey)}
        style={styles.removeButton}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={20} color={colors.mutedText} />
      </TouchableOpacity>
    );
  };

  const renderSectionTitle = (titleKey, fallback, count, inRow = false) => (
    <Text style={[styles.sectionTitle, inRow && styles.sectionTitleInRow, { color: colors.mutedText }]}>
      {`${(t(titleKey) || fallback).toUpperCase()}  ·  ${count}`}
    </Text>
  );

  // A binding row: an icon + key on top, a picker "field" (chip style, left
  // aligned with a chevron — not a centred button) below, and the delete control.
  const renderPickerRow = (rowKey, icon, keyText, pickerProps, onRemove) => (
    <View
      key={rowKey}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleText}>
          <Ionicons name={icon} size={16} color={colors.mutedText} />
          <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
            {keyText}
          </Text>
        </View>
        {onRemove}
      </View>
      <View style={[styles.pickerWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <SimplePicker
          {...pickerProps}
          colors={colors}
          closeLabel={t('close') || 'Close'}
        />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {hasAnyBinding && (
        <View style={styles.searchWrap}>
          <FormInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search') || 'Search'}
            leftIcon="magnify"
          />
        </View>
      )}

      {!hasAnyBinding && !addingCard && (
        <View style={styles.emptyState}>
          <Ionicons name="link-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('notification_bindings_empty')
              || 'No bindings yet. Penny learns them as you review notifications.'}
          </Text>
        </View>
      )}

      {noSearchResults && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('notification_bindings_no_results') || 'Nothing matches your search.'}
          </Text>
        </View>
      )}

      {/* ── Card bindings ── */}
      {(!isSearching ? accounts.length > 0 : (visibleCards.length > 0 || atmVisible)) && (
        <>
          <View style={styles.sectionHeaderRow}>
            {renderSectionTitle(
              'notification_bindings_cards', 'Card bindings',
              cardBindings.length + (atmAccount ? 1 : 0), true,
            )}
            {!isSearching && accounts.length > 0 && !addingCard && (
              <TouchableOpacity
                onPress={startAddCard}
                style={styles.addButton}
                accessibilityRole="button"
                accessibilityLabel={t('notification_bindings_add_card') || 'Add card'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>
                  {t('notification_bindings_add_card') || 'Add card'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {!isSearching && cardBindings.length === 0 && !atmAccount && !addingCard && (
            <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
              {t('notification_bindings_cards_hint')
                || 'Which account each card, and ATM cash, maps to'}
            </Text>
          )}

          {addingCard && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.pickerWrap, styles.addFirstField, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <SimplePicker
                  value={newCardAccountId}
                  onValueChange={setNewCardAccountId}
                  items={accountItems}
                  colors={colors}
                  leftIcon="wallet-outline"
                  closeLabel={t('close') || 'Close'}
                />
              </View>
              <FormInput
                value={newCardMask}
                onChangeText={setNewCardMask}
                placeholder={t('notification_bindings_card_last4') || 'Last 4 digits'}
                keyboardType="number-pad"
              />
              <View style={styles.editorButtons}>
                <TouchableOpacity
                  onPress={() => setAddingCard(false)}
                  style={[styles.editorButton, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel') || 'Cancel'}
                >
                  <Text style={[styles.editorButtonText, { color: colors.text }]}>{t('cancel') || 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddCard}
                  disabled={!cardMaskLast4(newCardMask)}
                  style={[
                    styles.editorButton,
                    { backgroundColor: cardMaskLast4(newCardMask) ? colors.primary : colors.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('save') || 'Save'}
                >
                  <Text style={styles.editorButtonPrimaryText}>{t('save') || 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {visibleCards.map(({ account, mask }) => renderPickerRow(
            `card-${account.id}-${mask}`,
            'card-outline',
            mask,
            {
              value: account.id,
              onValueChange: (v) => handleReassignCard(account, mask, v),
              items: accountItems,
              leftIcon: 'wallet-outline',
            },
            renderRemoveControl(
              `card-${account.id}-${mask}`,
              () => handleRemoveCard(account, mask),
              t('notification_bindings_remove') || 'Remove binding',
            ),
          ))}

          {atmVisible && renderPickerRow(
            'atm-target',
            'cash-outline',
            t('notification_bindings_atm') || 'ATM cash account',
            {
              value: atmAccount.id,
              onValueChange: handleChangeAtm,
              items: accountItems,
              leftIcon: 'wallet-outline',
            },
            renderRemoveControl(
              'atm-target',
              handleRemoveAtm,
              t('notification_bindings_remove') || 'Remove binding',
            ),
          )}

          {/* Assign the ATM cash account by hand when none is bound yet. */}
          {!isSearching && !atmAccount && accounts.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleText}>
                  <Ionicons name="cash-outline" size={16} color={colors.mutedText} />
                  <Text style={[styles.bindingKey, { color: colors.text }]} numberOfLines={1}>
                    {t('notification_bindings_atm') || 'ATM cash account'}
                  </Text>
                </View>
              </View>
              <View style={[styles.pickerWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <SimplePicker
                  value={null}
                  onValueChange={handleChangeAtm}
                  items={accountItems}
                  colors={colors}
                  leftText={t('notification_bindings_atm_assign') || 'Assign account'}
                  closeLabel={t('close') || 'Close'}
                />
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Category bindings ── */}
      {(!isSearching ? categoryBindings.length > 0 : visibleCategories.length > 0) && (
        <>
          {renderSectionTitle('notification_bindings_categories', 'Category bindings', categoryBindings.length)}
          {!isSearching && (
            <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
              {t('notification_bindings_categories_hint') || 'Merchants auto-assigned to a category'}
            </Text>
          )}

          {visibleCategories.map((rule) => renderPickerRow(
            `cat-${rule.id}`,
            'storefront-outline',
            rule.merchant,
            {
              value: rule.categoryId,
              onValueChange: (v) => handleChangeCategory(rule, v),
              items: categoryItems,
              leftIcon: 'shape-outline',
            },
            renderRemoveControl(
              `cat-${rule.id}`,
              () => handleRemoveCategory(rule),
              t('notification_bindings_remove') || 'Remove binding',
            ),
          ))}
        </>
      )}

      {/* ── Name bindings ── */}
      {(!isSearching ? labelBindings.length > 0 : visibleLabels.length > 0) && (
        <>
          {renderSectionTitle('notification_bindings_labels', 'Name bindings', labelBindings.length)}
          {!isSearching && (
            <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
              {t('notification_bindings_labels_hint') || 'Custom names shown instead of the raw shop name'}
            </Text>
          )}

          {visibleLabels.map((rule) => {
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
                  {renderRemoveControl(
                    `label-${rule.id}`,
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
  addButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addFirstField: {
    marginBottom: SPACING.sm,
    marginTop: 0,
  },
  bindingKey: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
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
  confirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  editorButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  editorButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  editorButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editorButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
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
  searchWrap: {
    marginTop: SPACING.md,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
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
  sectionTitleInRow: {
    marginTop: 0,
  },
});
