import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';
import { formatDate } from '../../services/BalanceHistoryDB';

const ExpandableFilters = ({
  filters,
  onFilterChange,
  accounts,
  categories,
  colors,
  t,
  isExpanded,
}) => {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [localMinAmount, setLocalMinAmount] = useState(
    filters.amountRange.min !== null ? String(filters.amountRange.min) : '',
  );
  const [localMaxAmount, setLocalMaxAmount] = useState(
    filters.amountRange.max !== null ? String(filters.amountRange.max) : '',
  );

  if (!isExpanded) {
    return null;
  }

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

  const toggleCategory = (categoryId) => {
    const newCategoryIds = filters.categoryIds.includes(categoryId)
      ? filters.categoryIds.filter(id => id !== categoryId)
      : [...filters.categoryIds, categoryId];
    onFilterChange({ categoryIds: newCategoryIds });
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
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  return (
    <View testID="expandable-filters" style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Type Section */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('operation_type')}
          </Text>
          <View style={styles.chipContainer}>
            {['expense', 'income', 'transfer'].map(type => {
              const isSelected = filters.types.includes(type);
              const chipStyle = {
                backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                borderColor: colors.border,
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
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('date_range')}
          </Text>
          <View style={styles.dateRangeContainer}>
            <TouchableOpacity
              style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Icon name="calendar" size={20} color={colors.mutedText} />
              <Text style={[styles.dateInputText, { color: filters.dateRange.startDate ? colors.text : colors.mutedText }]}>
                {filters.dateRange.startDate ? formatDateDisplay(filters.dateRange.startDate) : t('from_date')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
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
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('amount_range')}
          </Text>
          <View style={styles.amountRangeContainer}>
            <TextInput
              style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={localMinAmount}
              onChangeText={setLocalMinAmount}
              onBlur={() => {
                const value = localMinAmount === '' ? null : parseFloat(localMinAmount);
                onFilterChange({ amountRange: { ...filters.amountRange, min: isNaN(value) ? null : value } });
              }}
              placeholder={t('min_amount')}
              placeholderTextColor={colors.mutedText}
              keyboardType="numeric"
            />
            <Text style={[styles.amountRangeSeparator, { color: colors.mutedText }]}>-</Text>
            <TextInput
              style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={localMaxAmount}
              onChangeText={setLocalMaxAmount}
              onBlur={() => {
                const value = localMaxAmount === '' ? null : parseFloat(localMaxAmount);
                onFilterChange({ amountRange: { ...filters.amountRange, max: isNaN(value) ? null : value } });
              }}
              placeholder={t('max_amount')}
              placeholderTextColor={colors.mutedText}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Accounts Section */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
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
                    borderColor: colors.border,
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

        {/* Categories Section */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('categories')}
          </Text>
          <View style={styles.chipContainer}>
            {categories.filter(c => !c.isShadow).map(category => {
              const isSelected = filters.categoryIds.includes(category.id);
              const chipTextColor = isSelected ? '#fff' : colors.text;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.chip, {
                    backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                    borderColor: colors.border,
                  }]}
                  onPress={() => toggleCategory(category.id)}
                >
                  <Icon
                    name={category.icon || 'tag'}
                    size={14}
                    color={chipTextColor}
                  />
                  <Text style={[styles.chipText, { color: chipTextColor }]}>
                    {category.nameKey ? t(category.nameKey) : category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          testID="clear-all-button"
          style={styles.clearAllButton}
          onPress={() => onFilterChange({
            types: [],
            accountIds: [],
            categoryIds: [],
            dateRange: { startDate: null, endDate: null },
            amountRange: { min: null, max: null },
          })}
        >
          <Text style={[styles.clearAllText, { color: colors.primary }]}>
            {t('clear_all')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={filters.dateRange.startDate ? new Date(filters.dateRange.startDate) : new Date()}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
        />
      )}
      {showEndDatePicker && (
        <DateTimePicker
          value={filters.dateRange.endDate ? new Date(filters.dateRange.endDate) : new Date()}
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
    types: PropTypes.array,
    accountIds: PropTypes.array,
    categoryIds: PropTypes.array,
    dateRange: PropTypes.object,
    amountRange: PropTypes.object,
  }).isRequired,
  onFilterChange: PropTypes.func.isRequired,
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  })).isRequired,
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  colors: PropTypes.shape({
    surface: PropTypes.string,
    text: PropTypes.string,
    mutedText: PropTypes.string,
    border: PropTypes.string,
    primary: PropTypes.string,
    inputBackground: PropTypes.string,
    inputBorder: PropTypes.string,
  }).isRequired,
  t: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool,
};

ExpandableFilters.defaultProps = {
  isExpanded: true,
};

const styles = StyleSheet.create({
  amountInput: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 7,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  clearAllButton: {
    alignItems: 'center',
    paddingVertical: 14,
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
    maxHeight: '60%',
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
  dateRangeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    borderBottomWidth: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
});

export default ExpandableFilters;
