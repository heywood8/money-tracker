import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import * as Currency from '../services/currency';
import currencies from '../../assets/currencies.json';
import { SPACING, BORDER_RADIUS, FONT_SIZE, HEIGHTS } from '../styles/designTokens';

// Three across, matching the category grid. An account chip carries a name AND a
// balance, so the name gets two lines and the balance a smaller size than the
// category chips need — at two across the row was mostly air.
const COLUMNS = 3;

// Selection is a tint of the accent rather than a solid fill: white-on-accent
// sits at ~2.8:1 in the dark theme. Same treatment as CategoryGridSelector.
const TINT = '1F';
const tintOf = (primary, fallback) => (
  typeof primary === 'string' && /^#[0-9a-f]{6}$/i.test(primary) ? primary + TINT : fallback
);

const DEFAULT_TEST_ID_PREFIX = 'account-grid';

const symbolOf = (code) => (code ? (currencies[code]?.symbol || code) : '');

/**
 * The app's one account picker.
 *
 * A chip grid grouped by currency — the accounts of one currency sit together
 * under its code, because "which account" is nearly always asked inside a
 * currency ("pay this AMD expense from…"), and a flat list of a dozen accounts
 * makes the reader do that sort in their head every time. The groups are NOT a
 * hierarchy: there is nothing to drill into, they are containers you read past.
 *
 * Group order follows the accounts' own order (first appearance wins), so it
 * matches the order the user arranged on the Accounts screen. A single-currency
 * set gets no headers at all — one header over everything says nothing.
 *
 * See CLAUDE.md ("Account selection"). Hosts: PickerModal, OperationModal,
 * BudgetPlanLineModal, AccountsScreen.
 *
 * @param {Array}    accounts          Accounts to offer, already filtered by the
 *   host (e.g. the source account removed from a transfer's destination list).
 * @param {string}   [selectedAccountId] Currently chosen account (highlighted).
 * @param {Array}    [selectedAccountIds] Multi-select: presence switches chips to
 *   checkboxes that toggle, and the host is expected to keep the array. Takes
 *   precedence over `selectedAccountId`. Mirrors CategoryGridSelector's option of
 *   the same shape, so a host that offers both pickers reads the same either way.
 * @param {Function} onSelect          Called with the tapped account id.
 * @param {Object}   colors            Theme colours.
 * @param {Function} t                 Translation function.
 * @param {string}   [query]           Search text; filters by account name.
 * @param {string}   [testIDPrefix]    Chip testID prefix, so a host can keep the
 *   ids its own tests already know.
 * @param {string}   [emptyText]       Message for an empty grid (defaults to
 *   `no_accounts`; a fruitless search always says `no_results`).
 */
export default function AccountGridSelector({
  accounts,
  selectedAccountId = null,
  selectedAccountIds = null,
  onSelect,
  colors,
  t,
  query = '',
  testIDPrefix = DEFAULT_TEST_ID_PREFIX,
  emptyText = null,
}) {
  // Balances are hidden app-wide from Settings; a picker that spelled them out
  // anyway would be the one place the setting leaks. Read here rather than taken
  // as a prop so no host can forget it. The `|| {}` is for host tests that render
  // the grid outside the provider — in the app it is always there.
  const { hideBalances } = useDisplaySettings() || {};

  const multiSelect = Array.isArray(selectedAccountIds);
  // Keyed by String: account ids are integers in the database but reach a host
  // through JSON, CSV and Sheets round trips as strings just as often, and a
  // chip that silently fails to highlight is indistinguishable from one the user
  // never picked.
  const selectedIds = useMemo(() => new Set(
    (multiSelect ? selectedAccountIds : (selectedAccountId != null ? [selectedAccountId] : []))
      .map(id => String(id)),
  ), [multiSelect, selectedAccountIds, selectedAccountId]);

  const searchTerm = String(query || '').trim().toLowerCase();
  const searching = searchTerm.length > 0;

  const visible = useMemo(
    () => (searching
      ? accounts.filter((a) => String(a.name || '').toLowerCase().includes(searchTerm))
      : accounts),
    [accounts, searching, searchTerm],
  );

  // One group per currency, in the order the currencies first appear, each
  // chunked into rows and padded with invisible spacers so chips keep an even
  // width on the last row.
  const groups = useMemo(() => {
    const byCurrency = new Map();
    visible.forEach((account) => {
      const code = account.currency || '';
      if (!byCurrency.has(code)) byCurrency.set(code, []);
      byCurrency.get(code).push(account);
    });

    return Array.from(byCurrency.entries()).map(([code, items]) => {
      const rows = [];
      for (let i = 0; i < items.length; i += COLUMNS) rows.push(items.slice(i, i + COLUMNS));
      const last = rows[rows.length - 1];
      while (last.length < COLUMNS) last.push(null);
      return { code, rows };
    });
  }, [visible]);

  // Headers earn their space only when there is more than one currency to tell
  // apart.
  const showHeaders = groups.length > 1;

  const selectedBackground = tintOf(colors.primary, colors.selected);

  const renderChip = (account, key) => {
    if (!account) {
      return <View key={key} style={[styles.chip, styles.invisible]} />;
    }

    const isSelected = selectedIds.has(String(account.id));
    const tone = isSelected ? colors.primary : colors.text;

    return (
      <Pressable
        key={key}
        testID={`${testIDPrefix}-${account.id}`}
        onPress={() => onSelect(account.id)}
        accessibilityRole={multiSelect ? 'checkbox' : 'button'}
        accessibilityState={multiSelect ? { checked: isSelected } : { selected: isSelected }}
        accessibilityLabel={account.name}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: colors.inputBackground || colors.surface, borderColor: colors.border },
          isSelected && { backgroundColor: selectedBackground, borderColor: colors.primary },
          pressed && !isSelected && { backgroundColor: colors.selected },
        ]}
      >
        {/* No leading glyph: every chip in the grid drew the same wallet/card
            icon, so it said nothing about which account this one is while
            costing a whole line of chip height on every picker. Name and
            balance are the chip. */}
        <Text style={[styles.chipName, { color: tone }]} numberOfLines={2}>
          {account.name}
        </Text>
        <Text style={[styles.chipBalance, { color: colors.mutedText }]} numberOfLines={1}>
          {hideBalances
            ? '••••'
            : `${symbolOf(account.currency)}${Currency.formatAmount(account.balance, account.currency)}`}
        </Text>
        {isSelected && (
          <View style={styles.checkBadge}>
            <Icon name="check-circle" size={12} color={colors.primary} />
          </View>
        )}
      </Pressable>
    );
  };

  if (groups.length === 0) {
    return (
      <Text testID={`${testIDPrefix}-empty`} style={[styles.empty, { color: colors.mutedText }]}>
        {searching
          ? (t('no_results') || 'Nothing found')
          : (emptyText || t('no_accounts') || 'No accounts')}
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {groups.map((group) => (
        <View key={`group-${group.code}`} style={styles.group}>
          {showHeaders && (
            <View style={styles.groupHeader}>
              <Text
                testID={`${testIDPrefix}-group-${group.code}`}
                style={[styles.groupTitle, { color: colors.mutedText }]}
                numberOfLines={1}
              >
                {group.code}
              </Text>
              <View style={[styles.groupRule, { backgroundColor: colors.border }]} />
            </View>
          )}
          {group.rows.map((row, ri) => (
            <View key={`row-${group.code}-${ri}`} style={styles.row}>
              {row.map((account, ci) => renderChip(account, account ? account.id : `spacer-${ri}-${ci}`))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

AccountGridSelector.propTypes = {
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    balance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currency: PropTypes.string,
  })).isRequired,
  selectedAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedAccountIds: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  query: PropTypes.string,
  testIDPrefix: PropTypes.string,
  emptyText: PropTypes.string,
};

const styles = StyleSheet.create({
  checkBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: HEIGHTS.input,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
    position: 'relative',
  },
  chipBalance: {
    fontSize: FONT_SIZE.xs,
  },
  chipName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    textAlign: 'center',
  },
  empty: {
    fontSize: FONT_SIZE.md,
    paddingVertical: SPACING.md,
    textAlign: 'center',
  },
  grid: {
    gap: SPACING.sm,
  },
  group: {
    gap: SPACING.xs,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  groupRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  groupTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  invisible: {
    opacity: 0,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
});
