import React, { useMemo, useCallback, forwardRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import DateSeparator from './DateSeparator';
import OperationListItem from './OperationListItem';
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
 * Displays a list of financial operations grouped by date. Each date group
 * renders as a single card containing all operations for that day.
 */
const OperationsList = forwardRef(({
  groupedOperations,
  accounts,
  categories,
  colors,
  t,
  loadingMore,
  hasMoreOperations,
  onLoadMore,
  onEditOperation,
  onDateSeparatorPress,
  onScroll,
  onScrollToIndexFailed,
  onContentSizeChange,
  headerComponent,
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

  // Render a full date group (header + card with operations)
  const renderItem = useCallback(({ item }) => {
    return (
      <View style={styles.groupContainer}>
        <DateSeparator
          date={item.date}
          spendingSums={item.spendingSums}
          formatDate={formatDate}
          colors={colors}
          onPress={() => onDateSeparatorPress(item.date)}
        />
        <View
          style={[
            styles.operationsCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {item.operations.map((operation, index) => (
            <OperationListItem
              key={operation.id}
              operation={operation}
              colors={colors}
              t={t}
              categories={categories}
              getCategoryInfo={getCategoryInfo}
              getAccountName={getAccountName}
              formatCurrency={formatCurrency}
              isLast={index === item.operations.length - 1}
              onPress={() => onEditOperation(operation)}
            />
          ))}
        </View>
      </View>
    );
  }, [colors, t, categories, getCategoryInfo, getAccountName, formatCurrency, formatDate, onEditOperation, onDateSeparatorPress]);

  return (
    <FlatList
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      data={groupedOperations}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      extraData={[accounts, categories]}
      ListHeaderComponent={headerComponent}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Icon name="cash-multiple" size={64} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('no_operations')}
          </Text>
        </View>
      }
      contentContainerStyle={groupedOperations.length === 0 ? styles.emptyList : styles.listContent}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onContentSizeChange={onContentSizeChange}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 10,
      }}
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
  loadingMore: PropTypes.bool,
  hasMoreOperations: PropTypes.bool,
  onLoadMore: PropTypes.func.isRequired,
  onEditOperation: PropTypes.func.isRequired,
  onDateSeparatorPress: PropTypes.func.isRequired,
  onScroll: PropTypes.func,
  onScrollToIndexFailed: PropTypes.func,
  onContentSizeChange: PropTypes.func,
  headerComponent: PropTypes.element,
};

OperationsList.defaultProps = {
  loadingMore: false,
  hasMoreOperations: false,
  onScroll: () => {},
  onScrollToIndexFailed: () => {},
  onContentSizeChange: () => {},
  headerComponent: null,
};

const styles = StyleSheet.create({
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
  groupContainer: {
    marginBottom: SPACING.sm,
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
  operationsCard: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
});

export default OperationsList;
