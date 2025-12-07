import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

/**
 * FilterModal Component
 * Modal dialog for filtering and searching operations
 */
const FilterModal = ({ visible, onClose, filters, onApplyFilters, accounts, categories, t, colors }) => {
  // Ensure filters has default values
  const safeFilters = filters || {
    types: [],
    accountIds: [],
    categoryIds: [],
    searchText: '',
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  const [localFilters, setLocalFilters] = useState(safeFilters);
  const [searchInput, setSearchInput] = useState(safeFilters.searchText || '');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Update local filters when prop changes
  useEffect(() => {
    const newFilters = filters || {
      types: [],
      accountIds: [],
      categoryIds: [],
      searchText: '',
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    };
    setLocalFilters(newFilters);
    setSearchInput(newFilters.searchText || '');
  }, [filters]);

  // Debounced search (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalFilters(f => ({ ...f, searchText: searchInput }));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Toggle type filter
  const toggleType = (type) => {
    setLocalFilters(f => ({
      ...f,
      types: f.types.includes(type)
        ? f.types.filter(t => t !== type)
        : [...f.types, type]
    }));
  };

  // Toggle account filter
  const toggleAccount = (accountId) => {
    setLocalFilters(f => ({
      ...f,
      accountIds: f.accountIds.includes(accountId)
        ? f.accountIds.filter(id => id !== accountId)
        : [...f.accountIds, accountId]
    }));
  };

  // Toggle category filter
  const toggleCategory = (categoryId) => {
    setLocalFilters(f => ({
      ...f,
      categoryIds: f.categoryIds.includes(categoryId)
        ? f.categoryIds.filter(id => id !== categoryId)
        : [...f.categoryIds, categoryId]
    }));
  };

  // Clear all filters
  const handleClearAll = () => {
    const emptyFilters = {
      types: [],
      accountIds: [],
      categoryIds: [],
      searchText: '',
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    };
    setLocalFilters(emptyFilters);
    setSearchInput('');
  };

  // Apply filters
  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  // Get visible categories (excluding shadow categories)
  const visibleCategories = categories.filter(c => !c.isShadow);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('filter_operations')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            {/* Search Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('search')}
              </Text>
              <View style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                <Icon name="magnify" size={20} color={colors.mutedText} />
                <TextInput
                  style={[styles.searchTextInput, { color: colors.text }]}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder={t('search_operations_placeholder')}
                  placeholderTextColor={colors.mutedText}
                />
                {searchInput && searchInput.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchInput('')}>
                    <Icon name="close-circle" size={20} color={colors.mutedText} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.helperText, { color: colors.mutedText }]}>
                {t('search_helper_text')}
              </Text>
            </View>

            {/* Type Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('operation_type')}
              </Text>
              <View style={styles.chipContainer}>
                {['expense', 'income', 'transfer'].map(type => {
                  const isSelected = localFilters.types && localFilters.types.includes(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                          borderColor: colors.border,
                        }
                      ]}
                      onPress={() => toggleType(type)}
                    >
                      <Icon
                        name={type === 'expense' ? 'minus-circle' : type === 'income' ? 'plus-circle' : 'swap-horizontal'}
                        size={18}
                        color={isSelected ? '#fff' : colors.text}
                      />
                      <Text style={[styles.chipText, { color: isSelected ? '#fff' : colors.text }]}>
                        {t(type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Accounts Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('accounts')}
              </Text>
              {accounts.map(account => {
                const isSelected = localFilters.accountIds && localFilters.accountIds.includes(account.id);
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[styles.checkboxItem, { borderBottomColor: colors.border }]}
                    onPress={() => toggleAccount(account.id)}
                  >
                    <View style={styles.checkboxLeft}>
                      <Icon
                        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={isSelected ? colors.primary : colors.mutedText}
                      />
                      <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                        {account.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Categories Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('categories')}
              </Text>
              {visibleCategories.map(category => {
                const isSelected = localFilters.categoryIds && localFilters.categoryIds.includes(category.id);
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.checkboxItem, { borderBottomColor: colors.border }]}
                    onPress={() => toggleCategory(category.id)}
                  >
                    <View style={styles.checkboxLeft}>
                      <Icon
                        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={isSelected ? colors.primary : colors.mutedText}
                      />
                      <View style={styles.categoryInfo}>
                        <Icon name={category.icon || 'tag'} size={20} color={colors.text} />
                        <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                          {category.name}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date Range Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('date_range')}
              </Text>
              <View style={styles.dateRangeContainer}>
                <TouchableOpacity
                  style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <Icon name="calendar" size={20} color={colors.mutedText} />
                  <Text style={[styles.dateInputText, { color: localFilters.dateRange && localFilters.dateRange.startDate ? colors.text : colors.mutedText }]}>
                    {localFilters.dateRange && localFilters.dateRange.startDate ? formatDate(localFilters.dateRange.startDate) : t('from_date')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Icon name="calendar" size={20} color={colors.mutedText} />
                  <Text style={[styles.dateInputText, { color: localFilters.dateRange && localFilters.dateRange.endDate ? colors.text : colors.mutedText }]}>
                    {localFilters.dateRange && localFilters.dateRange.endDate ? formatDate(localFilters.dateRange.endDate) : t('to_date')}
                  </Text>
                </TouchableOpacity>
              </View>
              {localFilters.dateRange && (localFilters.dateRange.startDate || localFilters.dateRange.endDate) && (
                <TouchableOpacity
                  style={styles.clearDateButton}
                  onPress={() => setLocalFilters(f => ({ ...f, dateRange: { startDate: null, endDate: null } }))}
                >
                  <Text style={[styles.clearDateButtonText, { color: colors.primary }]}>
                    {t('clear')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount Range Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('amount_range')}
              </Text>
              <View style={styles.amountRangeContainer}>
                <TextInput
                  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  value={localFilters.amountRange && localFilters.amountRange.min !== null ? String(localFilters.amountRange.min) : ''}
                  onChangeText={(text) => {
                    const value = text === '' ? null : parseFloat(text);
                    setLocalFilters(f => ({ ...f, amountRange: { ...(f.amountRange || {}), min: value } }));
                  }}
                  placeholder={t('min_amount')}
                  placeholderTextColor={colors.mutedText}
                  keyboardType="numeric"
                />
                <Text style={[styles.amountRangeSeparator, { color: colors.mutedText }]}>-</Text>
                <TextInput
                  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  value={localFilters.amountRange && localFilters.amountRange.max !== null ? String(localFilters.amountRange.max) : ''}
                  onChangeText={(text) => {
                    const value = text === '' ? null : parseFloat(text);
                    setLocalFilters(f => ({ ...f, amountRange: { ...(f.amountRange || {}), max: value } }));
                  }}
                  placeholder={t('max_amount')}
                  placeholderTextColor={colors.mutedText}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.clearButton, { borderColor: colors.border }]}
              onPress={handleClearAll}
            >
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                {t('clear_all')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.applyButton, { backgroundColor: colors.primary }]}
              onPress={handleApply}
            >
              <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                {t('apply_filters')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Date Pickers */}
          {showStartDatePicker && (
            <DateTimePicker
              value={localFilters.dateRange.startDate ? new Date(localFilters.dateRange.startDate) : new Date()}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowStartDatePicker(false);
                if (selectedDate) {
                  const dateStr = selectedDate.toISOString().split('T')[0];
                  setLocalFilters(f => ({ ...f, dateRange: { ...f.dateRange, startDate: dateStr } }));
                }
              }}
            />
          )}
          {showEndDatePicker && (
            <DateTimePicker
              value={localFilters.dateRange.endDate ? new Date(localFilters.dateRange.endDate) : new Date()}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowEndDatePicker(false);
                if (selectedDate) {
                  const dateStr = selectedDate.toISOString().split('T')[0];
                  setLocalFilters(f => ({ ...f, dateRange: { ...f.dateRange, endDate: dateStr } }));
                }
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    maxHeight: 500,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 14,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  checkboxItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  checkboxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxLabel: {
    fontSize: 14,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateRangeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  dateInputText: {
    fontSize: 14,
  },
  clearDateButton: {
    marginTop: 8,
  },
  clearDateButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  amountRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  amountRangeSeparator: {
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {
    borderWidth: 1,
  },
  applyButton: {},
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FilterModal;
