import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';
import { formatDate } from '../../services/BalanceHistoryDB';
import currencies from '../../../assets/currencies.json';

// Quick date-range presets shown above the manual from/to pickers (QoL-8).
const DATE_PRESETS = [
  { key: 'this_week', label: 'preset_this_week' },
  { key: 'this_month', label: 'preset_this_month' },
  { key: 'last_7_days', label: 'preset_last_7_days' },
  { key: 'last_30_days', label: 'preset_last_30_days' },
  { key: 'this_year', label: 'preset_this_year' },
];

// Compute a preset's [start, end] as local YYYY-MM-DD strings. All arithmetic
// uses local Date parts (no UTC) to match formatDate and the manual pickers.
const computePresetRange = (key) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let start;
  let end;
  switch (key) {
  case 'this_week': {
    // Week starts Monday.
    const diffToMonday = (now.getDay() + 6) % 7;
    start = new Date(y, m, d - diffToMonday);
    end = new Date(y, m, d - diffToMonday + 6);
    break;
  }
  case 'this_month':
    start = new Date(y, m, 1);
    end = new Date(y, m + 1, 0);
    break;
  case 'last_7_days':
    start = new Date(y, m, d - 6);
    end = new Date(y, m, d);
    break;
  case 'last_30_days':
    start = new Date(y, m, d - 29);
    end = new Date(y, m, d);
    break;
  case 'this_year':
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31);
    break;
  default:
    return { startDate: null, endDate: null };
  }
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const ExpandableFilters = ({
  filters,
  onFilterChange,
  accounts,
  colors,
  t,
  isExpanded = true,
}) => {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [localMinAmount, setLocalMinAmount] = useState(
    filters.amountRange?.min != null ? String(filters.amountRange.min) : '',
  );
  const [localMaxAmount, setLocalMaxAmount] = useState(
    filters.amountRange?.max != null ? String(filters.amountRange.max) : '',
  );

  // Sync local amount inputs when filters change externally (Clear all, chip clear, etc.)
  useEffect(() => {
    const min = filters.amountRange?.min;
    const newMin = min != null ? String(min) : '';
    const parsedLocalMin = localMinAmount === '' ? null : parseFloat(localMinAmount.replace(',', '.'));
    if ((min == null && localMinAmount !== '')
      || (min != null && parsedLocalMin !== min)) {
      setLocalMinAmount(newMin);
    }
  }, [filters.amountRange?.min]);

  useEffect(() => {
    const max = filters.amountRange?.max;
    const newMax = max != null ? String(max) : '';
    const parsedLocalMax = localMaxAmount === '' ? null : parseFloat(localMaxAmount.replace(',', '.'));
    if ((max == null && localMaxAmount !== '')
      || (max != null && parsedLocalMax !== max)) {
      setLocalMaxAmount(newMax);
    }
  }, [filters.amountRange?.max]);

  // Currency hint for the amount inputs: shown only when every account shares one
  // currency (the common case). Mixed currencies make a single symbol misleading, so
  // we show none rather than guess.
  const currencySymbol = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    const first = accounts[0]?.currency;
    if (!first || !accounts.every(a => a.currency === first)) return null;
    const meta = currencies[first];
    return meta?.symbol_native || meta?.symbol || first;
  }, [accounts]);

  if (!isExpanded) {
    return null;
  }

  // Locale-tolerant parse: accept "1,5" as 1.5; reject NaN and negatives.
  const parseAmount = (str) => {
    if (str === '' || str === '-' || str === '.') return null;
    const value = parseFloat(str.replace(',', '.'));
    if (isNaN(value) || value < 0) return null;
    return value;
  };

  // Push the parsed min/max into the shared filter state. Wired to both onBlur and
  // onSubmitEditing so the range applies whether the user taps "done" or moves focus
  // away — previously it only committed on blur (QoL-13).
  const commitMinAmount = () => {
    onFilterChange({ amountRange: { ...filters.amountRange, min: parseAmount(localMinAmount) } });
  };
  const commitMaxAmount = () => {
    onFilterChange({ amountRange: { ...filters.amountRange, max: parseAmount(localMaxAmount) } });
  };

  const toggleType = (type) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    onFilterChange({ types: newTypes });
  };

  const toggleAccount = (accountId) => {
    const newAccountIds = filters.accountIds.includes(accountId)
      ? filters.accountIds.filter(id => id !== accountId)
      : [...filters.accountIds, accountId];
    onFilterChange({ accountIds: newAccountIds });
  };

  const handleStartDateChange = (event, selectedDate) => {
    setShowStartDatePicker(false);
    if (selectedDate) {
      const dateStr = formatDate(selectedDate);
      onFilterChange({
        dateRange: { ...filters.dateRange, startDate: dateStr },
      });
    }
  };

  const handleEndDateChange = (event, selectedDate) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      const dateStr = formatDate(selectedDate);
      onFilterChange({
        dateRange: { ...filters.dateRange, endDate: dateStr },
      });
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Date(y, m - 1, d).toLocaleDateString();
  };

  const parseDateLocal = (dateStr) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    const parsed = new Date(y, m - 1, d);
    if (isNaN(parsed.getTime())) return new Date();
    return parsed;
  };

  const applyDatePreset = (key) => {
    onFilterChange({ dateRange: computePresetRange(key) });
  };

  // A preset is active when the current range exactly matches its computed span.
  const isPresetActive = (key) => {
    const { startDate, endDate } = computePresetRange(key);
    return filters.dateRange.startDate === startDate && filters.dateRange.endDate === endDate;
  };

  // Count of active filter facets, surfaced in the sticky footer so the user
  // sees how much is applied without scrolling back through every section.
  const activeCount = (filters.types?.length || 0)
    + (filters.accountIds?.length || 0)
    + (filters.categoryIds?.length || 0)
    + (filters.labels?.length || 0)
    + (filters.dateRange?.startDate || filters.dateRange?.endDate ? 1 : 0)
    + (filters.amountRange?.min != null || filters.amountRange?.max != null ? 1 : 0)
    + (filters.text ? 1 : 0);

  const tileStyle = [styles.section, { backgroundColor: colors.glassSurfaceStrong, borderColor: colors.glassBorder }];

  return (
    <View testID="expandable-filters" style={styles.container}>
      {/* Thin light edge along the top sells the frosted-glass layering. */}
      <View style={[styles.topHighlight, { backgroundColor: colors.glassHighlight }]} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Type Section */}
        <View style={tileStyle}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('operation_type')}
          </Text>
          <View style={styles.chipContainer}>
            {['expense', 'income', 'transfer'].map(type => {
              const isSelected = filters.types.includes(type);
              const chipStyle = {
                backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                borderColor: colors.glassBorder,
              };
              const chipTextColor = isSelected ? '#fff' : colors.text;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, chipStyle]}
                  onPress={() => toggleType(type)}
                >
                  <Icon
                    name={type === 'expense' ? 'minus-circle' : type === 'income' ? 'plus-circle' : 'swap-horizontal'}
                    size={18}
                    color={chipTextColor}
                  />
                  <Text style={[styles.chipText, { color: chipTextColor }]}>
                    {t(type)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Date Range Section */}
        <View style={tileStyle}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('date_range')}
          </Text>
          <View style={[styles.chipContainer, styles.datePresetContainer]}>
            {DATE_PRESETS.map((preset) => {
              const active = isPresetActive(preset.key);
              const chipTextColor = active ? '#fff' : colors.text;
              return (
                <TouchableOpacity
                  key={preset.key}
                  style={[styles.chip, {
                    backgroundColor: active ? colors.primary : colors.inputBackground,
                    borderColor: colors.glassBorder,
                  }]}
                  onPress={() => applyDatePreset(preset.key)}
                  testID={`date-preset-${preset.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: chipTextColor }]}>
                    {t(preset.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.dateRangeContainer}>
            <TouchableOpacity
              style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.glassBorder }]}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Icon name="calendar" size={20} color={colors.mutedText} />
              <Text style={[styles.dateInputText, { color: filters.dateRange.startDate ? colors.text : colors.mutedText }]}>
                {filters.dateRange.startDate ? formatDateDisplay(filters.dateRange.startDate) : t('from_date')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.glassBorder }]}
              onPress={() => setShowEndDatePicker(true)}
            >
              <Icon name="calendar" size={20} color={colors.mutedText} />
              <Text style={[styles.dateInputText, { color: filters.dateRange.endDate ? colors.text : colors.mutedText }]}>
                {filters.dateRange.endDate ? formatDateDisplay(filters.dateRange.endDate) : t('to_date')}
              </Text>
            </TouchableOpacity>
          </View>
          {(filters.dateRange.startDate || filters.dateRange.endDate) && (
            <TouchableOpacity
              style={styles.clearDateButton}
              onPress={() => onFilterChange({ dateRange: { startDate: null, endDate: null } })}
            >
              <Text style={[styles.clearDateButtonText, { color: colors.primary }]}>
                {t('clear')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Amount Range Section */}
        <View style={tileStyle}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('amount_range')}
          </Text>
          <View style={styles.amountRangeContainer}>
            <View style={[styles.amountInputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.glassBorder }]}>
              {currencySymbol && (
                <Text style={[styles.amountCurrencyHint, { color: colors.mutedText }]}>{currencySymbol}</Text>
              )}
              <TextInput
                style={[styles.amountInputField, { color: colors.text }]}
                value={localMinAmount}
                onChangeText={setLocalMinAmount}
                onBlur={commitMinAmount}
                onSubmitEditing={commitMinAmount}
                returnKeyType="done"
                placeholder={t('min_amount')}
                placeholderTextColor={colors.mutedText}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.amountRangeSeparator, { color: colors.mutedText }]}>-</Text>
            <View style={[styles.amountInputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.glassBorder }]}>
              {currencySymbol && (
                <Text style={[styles.amountCurrencyHint, { color: colors.mutedText }]}>{currencySymbol}</Text>
              )}
              <TextInput
                style={[styles.amountInputField, { color: colors.text }]}
                value={localMaxAmount}
                onChangeText={setLocalMaxAmount}
                onBlur={commitMaxAmount}
                onSubmitEditing={commitMaxAmount}
                returnKeyType="done"
                placeholder={t('max_amount')}
                placeholderTextColor={colors.mutedText}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Accounts Section */}
        <View style={[tileStyle, styles.sectionLast]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('accounts')}
          </Text>
          <View style={styles.chipContainer}>
            {accounts.map(account => {
              const isSelected = filters.accountIds.includes(account.id);
              const chipTextColor = isSelected ? '#fff' : colors.text;
              return (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.chip, {
                    backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                    borderColor: colors.glassBorder,
                  }]}
                  onPress={() => toggleAccount(account.id)}
                >
                  <Text style={[styles.chipText, { color: chipTextColor }]}>
                    {account.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer: clear-all + active-filter count, always reachable
          without scrolling to the end of the sections. */}
      <View style={[styles.footer, { borderTopColor: colors.glassBorder }]}>
        <View style={styles.footerCountWrap}>
          {activeCount > 0 && (
            <>
              <Icon name="filter-variant" size={15} color={colors.mutedText} />
              <Text style={[styles.footerCount, { color: colors.mutedText }]}>
                {activeCount}
              </Text>
            </>
          )}
        </View>
        <TouchableOpacity
          testID="clear-all-button"
          style={[styles.clearAllButton, activeCount === 0 && styles.clearAllButtonDisabled]}
          onPress={() => onFilterChange({
            text: '',
            types: [],
            accountIds: [],
            categoryIds: [],
            labels: [],
            dateRange: { startDate: null, endDate: null },
            amountRange: { min: null, max: null },
          })}
        >
          <Icon name="filter-remove-outline" size={16} color={colors.primary} />
          <Text style={[styles.clearAllText, { color: colors.primary }]}>
            {t('clear_all')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={parseDateLocal(filters.dateRange.startDate)}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
        />
      )}
      {showEndDatePicker && (
        <DateTimePicker
          value={parseDateLocal(filters.dateRange.endDate)}
          mode="date"
          display="default"
          onChange={handleEndDateChange}
        />
      )}
    </View>
  );
};

ExpandableFilters.propTypes = {
  filters: PropTypes.shape({
    text: PropTypes.string,
    types: PropTypes.array,
    accountIds: PropTypes.array,
    categoryIds: PropTypes.array,
    labels: PropTypes.array,
    dateRange: PropTypes.object,
    amountRange: PropTypes.object,
  }).isRequired,
  onFilterChange: PropTypes.func.isRequired,
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    currency: PropTypes.string,
  })).isRequired,
  colors: PropTypes.shape({
    background: PropTypes.string,
    text: PropTypes.string,
    mutedText: PropTypes.string,
    border: PropTypes.string,
    primary: PropTypes.string,
    inputBackground: PropTypes.string,
    inputBorder: PropTypes.string,
    glassSurface: PropTypes.string,
    glassSurfaceStrong: PropTypes.string,
    glassBorder: PropTypes.string,
    glassHighlight: PropTypes.string,
  }).isRequired,
  t: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool,
};

const styles = StyleSheet.create({
  amountCurrencyHint: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  amountInputField: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 9,
  },
  amountInputWrap: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  amountRangeContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  amountRangeSeparator: {
    fontSize: 16,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  clearAllButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  clearAllButtonDisabled: {
    opacity: 0.4,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearDateButton: {
    marginTop: 7,
  },
  clearDateButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  container: {
    flex: 1,
  },
  dateInput: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dateInputText: {
    fontSize: 14,
  },
  datePresetContainer: {
    marginBottom: 10,
  },
  dateRangeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  footer: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 10,
  },
  footerCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerCountWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 18,
  },
  scrollContent: {
    paddingBottom: 8,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 10,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sectionLast: {
    marginBottom: 0,
  },
  topHighlight: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});

export default ExpandableFilters;
