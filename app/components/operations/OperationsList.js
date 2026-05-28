import React, { useMemo, useCallback, forwardRef } from 'react';
import { View, Text, StyleSheet, SectionList, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import DateSeparator from './DateSeparator';
import OperationListItem from './OperationListItem';
import OperationsListPlaceholder from './OperationsListPlaceholder';
import currencies from '../../../assets/currencies.json';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * Get currency symbol from currency code
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * OperationsList Component
 *
 * Displays a list of financial operations grouped by date using SectionList so
 * that individual operation rows are properly virtualized. Each section
 * represents one date group; the section header is a DateSeparator and each
 * item is an OperationListItem rendered inside a shared card surface.
 */
const OperationsList = forwardRef(({
  groupedOperations,
  accounts,
  categories,
  colors,
  t,
  initialLoading,
  loadingMore,
  hasMoreOperations,
  onLoadMore,
  onEditOperation,
  onDateSeparatorPress,
  onScroll,
  onScrollToIndexFailed,
  onContentSizeChange,
  headerComponent,
  pendingSuggestionId,
  pendingSuggestions,
  onApplySuggestion,
  onDismissSuggestion,
}, ref) => {

  // Format date label for the separator header
  const formatDate = useCallback((dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - compareDate) / 86400000);

    if (diffDays === 0) {
      return t('today');
    } else if (diffDays === 1) {
      return t('yesterday');
    } else {
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  }, [t]);

  // Format amount with currency symbol
  const formatCurrency = useCallback((accountId, amount) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return amount;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return amount;

    const currency = currencies[account.currency];
    const decimals = currency?.decimal_digits ?? 2;

    const symbol = getCurrencySymbol(account.currency || 'USD');
    return `${symbol}${numAmount.toFixed(decimals)}`;
  }, [accounts]);

  // Get category info (icon + name)
  const getCategoryInfo = useCallback((categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { name: t('unknown_category'), icon: 'help-circle' };

    const getCategoryDisplayName = (catId, cats, translate) => {
      const cat = cats.find(c => c.id === catId);
      if (!cat) return null;

      const name = cat.nameKey ? translate(cat.nameKey) : cat.name;

      if (cat.parentId) {
        const parent = cats.find(c => c.id === cat.parentId);
        if (parent) {
          const parentName = parent.nameKey ? translate(parent.nameKey) : parent.name;
          return `${parentName} / ${name}`;
        }
      }

      return name;
    };

    const categoryName = getCategoryDisplayName(categoryId, categories, t);

    return {
      name: categoryName || t('unknown_category'),
      icon: category.icon || 'help-circle',
    };
  }, [categories, t]);

  // Get account name
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : 'Unknown';
  }, [accounts]);

  // Handle end reached for lazy loading
  const handleEndReached = useCallback(() => {
    if (!loadingMore && hasMoreOperations) {
      onLoadMore();
    }
  }, [loadingMore, hasMoreOperations, onLoadMore]);

  // Footer component showing loading indicator
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingMoreText, { color: colors.mutedText }]}>
          {t('loading_more')}
        </Text>
      </View>
    );
  }, [loadingMore, colors, t]);

  // Convert groupedOperations array into SectionList sections
  const sections = useMemo(() => groupedOperations.map(group => ({
    title: group.date,
    spendingSums: group.spendingSums,
    data: group.operations,
  })), [groupedOperations]);

  // Render the date separator as a section header
  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.groupContainer}>
      <DateSeparator
        date={section.title}
        spendingSums={section.spendingSums}
        formatDate={formatDate}
        colors={colors}
        onPress={() => onDateSeparatorPress(section.title)}
      />
      {/* Top of the card surface — provides border, radius, and background */}
      <View
        style={[
          styles.cardTop,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
  ), [formatDate, colors, onDateSeparatorPress]);

  // Render a closing cap at the bottom of each section's card
  const renderSectionFooter = useCallback(({ section }) => (
    <View
      style={[
        styles.cardBottom,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    />
  ), [colors]);

  // Render an individual operation row inside the card
  const renderItem = useCallback(({ item, index, section }) => {
    const isLast = index === section.data.length - 1;
    return (
      <View
        style={[
          styles.itemWrapper,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <OperationListItem
          testID={`operation-item-${index}`}
          operation={item}
          colors={colors}
          t={t}
          categories={categories}
          getCategoryInfo={getCategoryInfo}
          getAccountName={getAccountName}
          formatCurrency={formatCurrency}
          isLast={isLast}
          onPress={() => onEditOperation(item)}
          suggestionChips={item.id === pendingSuggestionId ? pendingSuggestions : null}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
      </View>
    );
  }, [colors, t, categories, getCategoryInfo, getAccountName, formatCurrency, onEditOperation, pendingSuggestionId, pendingSuggestions, onApplySuggestion, onDismissSuggestion]);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SectionList
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
      keyExtractor={keyExtractor}
      extraData={[accounts, categories, pendingSuggestionId]}
      ListHeaderComponent={headerComponent}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={
        initialLoading ? (
          <OperationsListPlaceholder colors={colors} />
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="cash-multiple" size={64} color={colors.mutedText} />
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {t('no_operations')}
            </Text>
          </View>
        )
      }
      contentContainerStyle={
        initialLoading
          ? styles.listContent
          : sections.length === 0
            ? styles.emptyList
            : styles.listContent
      }
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onContentSizeChange={onContentSizeChange}
      stickySectionHeadersEnabled={false}
      windowSize={10}
      maxToRenderPerBatch={5}
      initialNumToRender={10}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={true}
    />
  );
});

OperationsList.displayName = 'OperationsList';

OperationsList.propTypes = {
  groupedOperations: PropTypes.arrayOf(PropTypes.object).isRequired,
  accounts: PropTypes.arrayOf(PropTypes.object).isRequired,
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  initialLoading: PropTypes.bool,
  loadingMore: PropTypes.bool,
  hasMoreOperations: PropTypes.bool,
  onLoadMore: PropTypes.func.isRequired,
  onEditOperation: PropTypes.func.isRequired,
  onDateSeparatorPress: PropTypes.func.isRequired,
  onScroll: PropTypes.func,
  onScrollToIndexFailed: PropTypes.func,
  onContentSizeChange: PropTypes.func,
  headerComponent: PropTypes.element,
  pendingSuggestionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  pendingSuggestions: PropTypes.arrayOf(PropTypes.string),
  onApplySuggestion: PropTypes.func,
  onDismissSuggestion: PropTypes.func,
};

OperationsList.defaultProps = {
  initialLoading: false,
  loadingMore: false,
  hasMoreOperations: false,
  onScroll: () => {},
  onScrollToIndexFailed: () => {},
  onContentSizeChange: () => {},
  headerComponent: null,
  pendingSuggestionId: null,
  pendingSuggestions: [],
  onApplySuggestion: () => {},
  onDismissSuggestion: () => {},
};

const styles = StyleSheet.create({
  cardBottom: {
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    height: BORDER_RADIUS.md,
    marginBottom: SPACING.xs,
    marginHorizontal: SPACING.lg,
  },
  cardTop: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderTopRightRadius: BORDER_RADIUS.md,
    borderTopWidth: 1,
    height: BORDER_RADIUS.md,
    marginHorizontal: SPACING.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.lg,
  },
  groupContainer: {},
  itemWrapper: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    marginHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: 180,
  },
  loadingMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  loadingMoreText: {
    fontSize: 14,
    marginTop: SPACING.sm,
  },
});

export default OperationsList;
