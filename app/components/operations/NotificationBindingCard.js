import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SimplePicker from '../SimplePicker';
import FormInput from '../FormInput';
import CategoryGridSelector from '../CategoryGridSelector';
import useTopCategoryIds from '../../hooks/useTopCategoryIds';
import { canSaveSuggestion } from '../../hooks/usePendingOperationSuggestions';
import { getCategoryDisplayName } from '../../utils/categoryUtils';
import * as Currency from '../../services/currency';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

// "Jun 28" for an ISO YYYY-MM-DD date, localized to the app's language. The
// T00:00:00 anchors the bare string to local midnight (a bare date parses as UTC
// and shifts a day west of Greenwich). Mirrors the deleted SuggestedOperationsStack.
const formatSuggestionDate = (isoDate) => {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * Full inline binding panel for one pending bank notification — the front card
 * of the deck stacked over the quick-add form. Replicates the review card from
 * Settings → Notification processing: custom-name input, account picker, then a
 * category grid (expense/income) or a target-account picker (ATM transfers),
 * with Dismiss/Save actions pinned to the card's bottom edge.
 *
 * The card's height is pinned to the measured quick-add panel height so the deck
 * reads as cards laid over the form; the body scrolls inside that fixed frame.
 */
const NotificationBindingCard = ({
  item,
  choice = {},
  colors,
  t,
  accounts,
  categories,
  saving = false,
  saveError = false,
  height,
  onChoiceChange,
  onSave,
  onDismiss,
}) => {
  const isTransfer = item.type === 'transfer';
  const canSave = canSaveSuggestion(item, choice);
  // Most-frequent categories drive the QuickAdd-style shortcut grid below, so the
  // card's category picker matches the quick-add form it sits over.
  const topCategoryIds = useTopCategoryIds();

  const accountItems = useMemo(
    () => accounts.map((a) => ({ label: a.name, subLabel: a.currency, value: a.id })),
    [accounts],
  );
  // A transfer must move money between two different accounts.
  const targetAccountItems = useMemo(
    () => accountItems.filter((a) => a.value !== choice.accountId),
    [accountItems, choice.accountId],
  );

  // Preview the converted amount when the chosen account's currency differs from
  // the charge currency — the booking happens in the account currency, so show
  // an offline-rate estimate up front for a sanity check.
  const chosenAccount = accounts.find((a) => a.id === choice.accountId);
  const convertedPreview =
    chosenAccount && item.currency && chosenAccount.currency !== item.currency
      ? Currency.convertAmount(item.amount, item.currency, chosenAccount.currency)
      : null;

  const frameStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftColor: colors.primary,
    // Pinned to the height the deck measured for the quick-add panel (already
    // floored by the stack), so the card never overhangs its overlay container —
    // an overhanging bottom would put the pinned actions outside the parent's
    // bounds, where Android doesn't deliver touches.
    height,
  };

  // A screen reader hears each card's identical buttons ("Dismiss"/"Save")
  // otherwise; naming the merchant + amount disambiguates them.
  const itemContext = `${item.merchant || item.kind}, ${item.amount} ${item.currency}`;

  // Mid-save: swap the body for a compact progress row, keeping the deck frame
  // (its geometry is pinned to the quick-add panel) and dropping the action
  // buttons so the up-to-8s save can't be double-tapped into duplicates.
  if (saving) {
    return (
      <View
        testID="notification-binding-card-saving"
        style={[styles.card, frameStyle]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('bank_notifications_adding') || 'Adding operation…'}
      >
        <View style={styles.savingRow}>
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
        </View>
      </View>
    );
  }

  return (
    <View testID="notification-binding-card" style={[styles.card, frameStyle]}>
      <ScrollView
        style={styles.body}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="card" size={15} color={colors.primary} />
            <Text
              style={[styles.sourceLabel, { color: colors.mutedText }]}
              numberOfLines={1}
            >
              {t('suggested_from_notification') || 'From notification'}
              {/* Date + card mask ride on the same line but in normal case — the
                  sourceLabel's textTransform:'uppercase' would otherwise shout the
                  localized date (e.g. "15 ИЮЛ."). A nested Text resets the case. */}
              <Text testID="binding-card-meta" style={styles.sourceMeta}>
                {[formatSuggestionDate(item.date), item.cardMask]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join('')}
              </Text>
            </Text>
          </View>
          <View style={styles.amountColumn}>
            <Text style={[styles.amount, { color: colors.text }]}>
              {item.amount} {item.currency}
            </Text>
            {convertedPreview && (
              <Text style={[styles.conversionText, { color: colors.mutedText }]}>
                ≈ {convertedPreview} {chosenAccount.currency}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>
          {item.merchant || item.kind}
        </Text>

        <FormInput
          value={choice.labelOverride ?? ''}
          onChangeText={(v) => onChoiceChange({ labelOverride: v })}
          placeholder={item.merchant || ''}
          style={styles.nameInput}
        />

        {isTransfer && (
          <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
            {(t('bank_notifications_transfer_from') || 'From account').toUpperCase()}
          </Text>
        )}
        <View
          style={[styles.pickerWrap, styles.accountPicker, { borderColor: colors.border }]}
          accessibilityLabel={isTransfer
            ? (t('bank_notifications_transfer_from') || 'From account')
            : (t('account') || 'Account')}
        >
          <SimplePicker
            value={choice.accountId}
            onValueChange={(v) => onChoiceChange({ accountId: v })}
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
                onValueChange={(v) => onChoiceChange({ toAccountId: v })}
                items={targetAccountItems}
                colors={colors}
                closeLabel={t('close') || 'Close'}
              />
            </View>
          </>
        ) : (
          <>
            {choice.categoryId ? (
              <View style={styles.selectedCategoryRow}>
                <Ionicons name="pricetag" size={12} color={colors.primary} />
                <Text style={[styles.selectedCategoryText, { color: colors.text }]} numberOfLines={1}>
                  {getCategoryDisplayName(choice.categoryId, categories, t)}
                </Text>
              </View>
            ) : null}
            <CategoryGridSelector
              categories={categories}
              categoryType={item.type}
              selectedCategoryId={choice.categoryId || null}
              onSelect={(categoryId) => onChoiceChange({ categoryId })}
              colors={colors}
              t={t}
              topCategoryIds={topCategoryIds}
            />
          </>
        )}
      </ScrollView>

      {/* Pinned outside the scroll body so Save (and any error) is always
          reachable without scrolling the form. */}
      {saveError ? (
        <Text style={[styles.errorText, { color: colors.delete || '#c0392b' }]} numberOfLines={2}>
          {t('bank_notifications_save_error')
            || 'Couldn’t add this operation. Check the account and try again.'}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={`${t('dismiss') || 'Dismiss'}: ${itemContext}`}
        >
          <Text style={[styles.actionLabel, { color: colors.mutedText }]}>
            {t('dismiss') || 'Dismiss'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          style={[
            styles.actionButton,
            styles.actionButtonPrimary,
            { backgroundColor: canSave ? colors.primary : colors.border },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel={`${t('save') || 'Save'}: ${itemContext}`}
        >
          <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
            {t('save') || 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

NotificationBindingCard.propTypes = {
  item: PropTypes.object.isRequired,
  choice: PropTypes.object,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  accounts: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  saving: PropTypes.bool,
  saveError: PropTypes.bool,
  height: PropTypes.number.isRequired,
  onChoiceChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  accountPicker: {
    marginTop: SPACING.xs,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  body: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  card: {
    borderLeftWidth: 3,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
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
  conversionText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 12,
    marginTop: 2,
  },
  nameInput: {
    marginTop: SPACING.sm,
  },
  pickerWrap: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  savingBody: {
    flex: 1,
  },
  savingRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  selectedCategoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  selectedCategoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sourceLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sourceMeta: {
    fontWeight: '400',
    letterSpacing: 0,
    textTransform: 'none',
  },
});

export default NotificationBindingCard;
