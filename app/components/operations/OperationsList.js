import React, { memo, useMemo, useCallback, forwardRef, useRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, SectionList, ActivityIndicator } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import DateSeparator from './DateSeparator';
import OperationListItem from './OperationListItem';
import OperationsListPlaceholder from './OperationsListPlaceholder';
import currencies from '../../../assets/currencies.json';
import { BORDER_RADIUS, FONT_SIZE, HEIGHTS, SPACING } from '../../styles/designTokens';
import EmptyState from '../EmptyState';

/**
 * Get currency symbol from currency code
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

// ── getItemLayout constants ────────────────────────────────────────────────
// The SectionList flattens to [sectionHeader, ...rows, sectionFooter] per
// section. getItemLayout lets scrollToLocation compute a target offset directly
// instead of measuring every cell on the way (which is slow and trips the
// onScrollToIndexFailed fallback). These cover the fixed-height pieces:
//
//   • Row height: OperationListItem's row uses minHeight HEIGHTS.listItem and
//     single-line content, so a row is exactly this tall in the common case.
//   • Separator: the 1px divider rendered INSIDE OperationListItem for every
//     row except the last in a section (see styles.separator there).
//   • Section footer: the cardBottom cap (height BORDER_RADIUS.md) plus its
//     marginBottom (SPACING.xs); the margin is folded in so the following
//     section header lands at the correct offset.
//
// The section header (DateSeparator + cardTop) contains text whose exact line
// height is font/platform dependent, and the list header (the QuickAdd form) is
// dynamic, so both are measured at runtime via onLayout rather than hardcoded.
const ITEM_ROW_HEIGHT = HEIGHTS.listItem;
const ITEM_SEPARATOR_HEIGHT = 1;
const SECTION_FOOTER_HEIGHT = BORDER_RADIUS.md + SPACING.xs;
// Used only until the first DateSeparator card reports its real height:
// paddingTop (SPACING.sm) + ~17px text line + paddingBottom (SPACING.xs) for the
// DateSeparator, plus the cardTop cap (BORDER_RADIUS.md).
const SECTION_HEADER_HEIGHT_FALLBACK = SPACING.sm + 17 + SPACING.xs + BORDER_RADIUS.md;

// Hoisted so an omitted prop keeps a stable identity across renders. Inline
// `[]` / `() => {}` defaults would allocate anew on every render and, since
// several of these feed the renderItem useCallback deps, would churn its
// identity and defeat the list's row memoization.
const NOOP = () => {};
const NO_SUGGESTIONS = [];
const NO_SECTIONS = [];

// Shown where a reference cannot be resolved to a name. An em dash is
// language-neutral and reads as "not available", which is what it means.
const UNRESOLVED_PLACEHOLDER = '—';

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
  initialLoading = false,
  referenceDataLoading = false,
  loadingMore = false,
  hasMoreOperations = false,
  onLoadMore,
  onEditOperation,
  onLongPressOperation = NOOP,
  onDateSeparatorPress,
  onScroll = NOOP,
  onScrollToIndexFailed = NOOP,
  onContentSizeChange = NOOP,
  refreshing = false,
  onRefresh = null,
  headerComponent = null,
  topInset = 0,
  pendingSuggestionId = null,
  pendingSuggestions = NO_SUGGESTIONS,
  onApplySuggestion = NOOP,
  onDismissSuggestion = NOOP,
}, ref) => {

  // Format date label for the separator header.
  // Append T00:00:00 so the bare YYYY-MM-DD string parses as LOCAL midnight —
  // bare date strings parse as UTC, which shifts the day west of Greenwich
  // (today's section would read "Yesterday" in UTC-negative timezones).
  const formatDate = useCallback((dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
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

  // Get account name. The fallback is a neutral dash rather than a word: a row
  // that cannot resolve its account should read as "nothing here yet", not as a
  // label the user might mistake for an account actually called "Unknown".
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : UNRESOLVED_PLACEHOLDER;
  }, [accounts]);

  // The list has nothing trustworthy to paint: either the operations query is
  // still running with no rows yet, or the reference data has not arrived (see
  // `sections` below, which withholds the rows for the latter).
  const showPlaceholder = initialLoading || referenceDataLoading;

  // Handle end reached for lazy loading.
  //
  // Suppressed while the placeholder is up: the skeleton means the list is
  // empty, so VirtualizedList reports the end reached immediately and would
  // prefetch further weeks before the first page has even been painted.
  const handleEndReached = useCallback(() => {
    if (!showPlaceholder && !loadingMore && hasMoreOperations) {
      onLoadMore();
    }
  }, [showPlaceholder, loadingMore, hasMoreOperations, onLoadMore]);

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

  // ── Runtime-measured heights for getItemLayout ────────────────────────────
  // Read lazily inside getItemLayout (which RN calls fresh each time), so these
  // are plain refs — updating them needs no re-render and never churns mid-scroll.
  const listHeaderHeightRef = useRef(0);
  const sectionHeaderHeightRef = useRef(SECTION_HEADER_HEIGHT_FALLBACK);
  const sectionHeaderMeasuredRef = useRef(false);

  // The QuickAdd form (list header) grows/shrinks, so always track its latest height.
  const handleListHeaderLayout = useCallback((e) => {
    listHeaderHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  // Section headers are uniform; capture the first real measurement, then keep the
  // tallest seen (expense days show a spending total, income-only days do not).
  const handleSectionHeaderLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    if (!sectionHeaderMeasuredRef.current) {
      sectionHeaderHeightRef.current = h;
      sectionHeaderMeasuredRef.current = true;
    } else if (h > sectionHeaderHeightRef.current) {
      sectionHeaderHeightRef.current = h;
    }
  }, []);

  // Convert groupedOperations array into SectionList sections.
  //
  // While the reference data (accounts, categories) is still on its FIRST load,
  // the rows are deliberately withheld. Operations come from their own query and
  // routinely arrive first, and a row rendered against an empty categories array
  // resolves its title to t('unknown_category') and its icon to a question mark
  // — content that reads as data loss rather than as loading, and that the next
  // frame contradicts. The skeleton below stands in for that window instead.
  const sections = useMemo(() => (
    referenceDataLoading
      ? NO_SECTIONS
      : groupedOperations.map(group => ({
        title: group.date,
        spendingSums: group.spendingSums,
        data: group.operations,
      }))
  ), [groupedOperations, referenceDataLoading]);

  // Cumulative geometry per section, recomputed only when the sections change.
  // Keeps getItemLayout to an O(log n) binary search instead of an O(items) walk.
  // Stores the parts that don't depend on the measured header heights; those are
  // added at lookup time so a header-height change never invalidates this cache.
  const layoutCache = useMemo(() => {
    const flatStarts = new Array(sections.length); // flattened index where each section starts
    const dataBefore = new Array(sections.length); // Σ(rows + footer) of all earlier sections
    const counts = new Array(sections.length);     // rows in each section
    const itemsHeights = new Array(sections.length); // total row height of each section
    let flat = 0;
    let data = 0;
    for (let s = 0; s < sections.length; s++) {
      const n = sections[s].data.length;
      flatStarts[s] = flat;
      dataBefore[s] = data;
      counts[s] = n;
      const itemsH = n > 0
        ? n * ITEM_ROW_HEIGHT + (n - 1) * ITEM_SEPARATOR_HEIGHT
        : 0;
      itemsHeights[s] = itemsH;
      flat += n + 2; // section header + rows + section footer
      data += itemsH + SECTION_FOOTER_HEIGHT;
    }
    return { flatStarts, dataBefore, counts, itemsHeights, totalCount: flat };
  }, [sections]);

  // Exact offsets for the SectionList's flattened cells. Section header and list
  // header heights come from the measured refs; rows/separators/footers are fixed.
  const getItemLayout = useCallback((_data, index) => {
    const { flatStarts, dataBefore, counts, itemsHeights, totalCount } = layoutCache;
    const headerH = sectionHeaderHeightRef.current;
    const listHeaderH = listHeaderHeightRef.current;

    if (totalCount === 0 || index < 0 || index >= totalCount) {
      return { length: 0, offset: listHeaderH, index };
    }

    // Largest section s whose flattened start is <= index.
    let lo = 0;
    let hi = flatStarts.length - 1;
    let s = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (flatStarts[mid] <= index) { s = mid; lo = mid + 1; } else { hi = mid - 1; }
    }

    // Offset of section s's header: list header + earlier rows/footers + earlier headers.
    const base = listHeaderH + dataBefore[s] + s * headerH;
    const local = index - flatStarts[s];
    const n = counts[s];

    if (local === 0) {
      return { length: headerH, offset: base, index }; // section header
    }
    if (local <= n) {
      const j = local - 1; // row index within the section
      const offset = base + headerH + j * (ITEM_ROW_HEIGHT + ITEM_SEPARATOR_HEIGHT);
      const isLast = j === n - 1; // last row has no trailing separator
      return { length: ITEM_ROW_HEIGHT + (isLast ? 0 : ITEM_SEPARATOR_HEIGHT), offset, index };
    }
    // section footer
    return { length: SECTION_FOOTER_HEIGHT, offset: base + headerH + itemsHeights[s], index };
  }, [layoutCache]);

  // Render the date separator as a section header
  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.groupContainer} onLayout={handleSectionHeaderLayout}>
      <DateSeparator
        date={section.title}
        spendingSums={section.spendingSums}
        formatDate={formatDate}
        colors={colors}
        onPress={onDateSeparatorPress}
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
  ), [formatDate, colors, onDateSeparatorPress, handleSectionHeaderLayout]);

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

  // A static, non-interactive copy of a row, handed to the long-press action
  // menu so it can lift the pressed row above the blurred backdrop. Built here
  // because this is where the category/account/amount formatters live.
  const renderClonedRow = useCallback((op) => (
    <OperationListItem
      operation={op}
      colors={colors}
      t={t}
      categories={categories}
      getCategoryInfo={getCategoryInfo}
      getAccountName={getAccountName}
      formatCurrency={formatCurrency}
      isLast
      onEdit={NOOP}
    />
  ), [colors, t, categories, getCategoryInfo, getAccountName, formatCurrency]);

  // Bridge OperationListItem's (operation, layout) long-press up to the screen,
  // attaching the lifted-row clone for the action menu.
  const handleItemLongPress = useCallback((op, layout) => {
    onLongPressOperation({ operation: op, layout, row: renderClonedRow(op) });
  }, [onLongPressOperation, renderClonedRow]);

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
          onEdit={onEditOperation}
          onLongPress={handleItemLongPress}
          suggestionChips={item.id === pendingSuggestionId ? pendingSuggestions : null}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
      </View>
    );
  }, [colors, t, categories, getCategoryInfo, getAccountName, formatCurrency, onEditOperation, handleItemLongPress, pendingSuggestionId, pendingSuggestions, onApplySuggestion, onDismissSuggestion]);

  const keyExtractor = useCallback((item) => item.id, []);

  // Stable identity for the SectionList's extraData. An inline array literal
  // allocates anew every render, so the list's shallow-compare bailout never
  // holds and rows re-render even when nothing they depend on changed.
  const listExtraData = useMemo(
    () => [accounts, categories, pendingSuggestionId],
    [accounts, categories, pendingSuggestionId],
  );

  const sectionListRef = useRef(null);

  // Expose FlatList-compatible scroll methods so OperationsScreen can call
  // scrollToOffset/scrollToIndex without knowing the underlying list type.
  useImperativeHandle(ref, () => ({
    scrollToOffset: ({ offset, animated }) => {
      sectionListRef.current?.getScrollResponder()?.scrollTo({ y: offset, animated });
    },
    scrollToIndex: ({ index, animated, viewPosition }) => {
      if (!sectionListRef.current || index < 0 || index >= sections.length) return;
      if (!sections[index] || sections[index].data.length === 0) return;
      sectionListRef.current.scrollToLocation({
        sectionIndex: index,
        itemIndex: 0,
        animated: animated ?? false,
        viewPosition: viewPosition ?? 0,
      });
    },
  }), [sections]);

  return (
    <SectionList
      ref={sectionListRef}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
      keyExtractor={keyExtractor}
      extraData={listExtraData}
      getItemLayout={getItemLayout}
      ListHeaderComponent={
        (topInset > 0 || headerComponent)
          ? (
            <View onLayout={handleListHeaderLayout}>
              {/* Spacer so the first content sits below the floating search bar
                  and scrolls up behind it. Measured as part of the header, so
                  getItemLayout offsets stay correct. */}
              {topInset > 0 ? <View style={{ height: topInset }} /> : null}
              {headerComponent}
            </View>
          )
          : null
      }
      ListFooterComponent={renderFooter}
      ListEmptyComponent={
        showPlaceholder ? (
          <OperationsListPlaceholder colors={colors} t={t} />
        ) : (
          <EmptyState
            icon="cash-multiple"
            iconSize={64}
            message={t('no_operations')}
            style={styles.emptyContainer}
          />
        )
      }
      contentContainerStyle={
        showPlaceholder
          ? styles.listContent
          : sections.length === 0
            ? styles.emptyList
            : styles.listContent
      }
      onScroll={onScroll}
      scrollEventThrottle={16}
      // Swipe-down-to-update: re-runs the bank-notification ingestion and
      // reloads the suggested-operations stack. VirtualizedList renders its own
      // RefreshControl when onRefresh is set; progressViewOffset drops the
      // spinner below the floating search pill that overlays the list top.
      refreshing={onRefresh ? refreshing : undefined}
      onRefresh={onRefresh || undefined}
      progressViewOffset={onRefresh ? topInset : undefined}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onContentSizeChange={onContentSizeChange}
      stickySectionHeadersEnabled={false}
      windowSize={10}
      maxToRenderPerBatch={5}
      initialNumToRender={10}
      updateCellsBatchingPeriod={50}
      // NEVER toggle this at runtime. On Fabric (New Architecture, enabled for
      // this app) flipping removeClippedSubviews on a mounted list desyncs the
      // JS-side view list from SurfaceMountingManager's native one, crashing
      // with "IllegalStateException: addViewAt: failed to insert view ... at
      // index N" (IndexOutOfBoundsException) — see PENNY-16, caused by an
      // earlier attempt to gate this on the (now removed) inline undo bar. The
      // undo affordance now floats outside the list (OperationsScreen), so it is
      // immune to this clipping entirely.
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
  referenceDataLoading: PropTypes.bool,
  loadingMore: PropTypes.bool,
  hasMoreOperations: PropTypes.bool,
  onLoadMore: PropTypes.func.isRequired,
  onEditOperation: PropTypes.func.isRequired,
  onLongPressOperation: PropTypes.func,
  onDateSeparatorPress: PropTypes.func.isRequired,
  onScroll: PropTypes.func,
  onScrollToIndexFailed: PropTypes.func,
  onContentSizeChange: PropTypes.func,
  refreshing: PropTypes.bool,
  onRefresh: PropTypes.func,
  headerComponent: PropTypes.element,
  topInset: PropTypes.number,
  pendingSuggestionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  pendingSuggestions: PropTypes.arrayOf(PropTypes.string),
  onApplySuggestion: PropTypes.func,
  onDismissSuggestion: PropTypes.func,
};

// Wrapped in memo so a parent re-render with unchanged props skips re-rendering
// the whole list. Paired with the stable extraData above, this keeps the
// SectionList from redoing work when nothing it depends on has changed.
const MemoizedOperationsList = memo(OperationsList);

MemoizedOperationsList.displayName = 'OperationsList';

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
    flex: 1,
    paddingTop: 80,
  },
  emptyList: {
    flex: 1,
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
    fontSize: FONT_SIZE.md,
    marginTop: SPACING.sm,
  },
});

export default MemoizedOperationsList;
