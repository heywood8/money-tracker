import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { useEffect, useCallback } from 'react';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SearchBar from './search/SearchBar';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useSearch } from '../contexts/SearchContext';
import FilterChipStrip from './search/FilterChipStrip';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';

export default function Header({ rightContent, activeScreen, operationsData }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { openSearch, searchMode, closeSearch, reopenSearch, toggleFilters, filtersExpanded } = useSearch();

  const { searchState, hasActiveSearch, getSearchFilterCount } = useOperationsData();
  const { setSearchText, updateSearchFilters } = useOperationsActions();

  const handleCloseSearch = useCallback(() => {
    closeSearch(hasActiveSearch);
  }, [closeSearch, hasActiveSearch]);

  const handleToggleFilters = useCallback(() => {
    toggleFilters();
  }, [toggleFilters]);

  const handleClearFilterGroup = useCallback((groupKey) => {
    const clearValues = {
      text: { text: '' },
      types: { types: [] },
      dateRange: { dateRange: { startDate: null, endDate: null } },
      amountRange: { amountRange: { min: null, max: null } },
      accountIds: { accountIds: [] },
      categoryIds: { categoryIds: [] },
    };
    updateSearchFilters(clearValues[groupKey]);
  }, [updateSearchFilters]);

  const handleCollapsedPress = useCallback(() => {
    if (searchMode === 'collapsed') {
      const hasOtherFilters =
        (searchState?.types?.length > 0) ||
        (searchState?.accountIds?.length > 0) ||
        (searchState?.categoryIds?.length > 0) ||
        !!searchState?.dateRange?.startDate ||
        !!searchState?.dateRange?.endDate ||
        (searchState?.amountRange?.min !== null && searchState?.amountRange?.min !== undefined) ||
        (searchState?.amountRange?.max !== null && searchState?.amountRange?.max !== undefined);
      reopenSearch(searchState?.text !== '', hasOtherFilters, (shouldExpand) => {
        if (shouldExpand !== filtersExpanded) toggleFilters();
      });
    } else {
      openSearch();
    }
  }, [searchMode, searchState, reopenSearch, filtersExpanded, toggleFilters, openSearch]);

  const isSearchOpen = searchMode === 'open' && activeScreen === 'Operations';
  const showSearchBar = activeScreen === 'Operations';

  useEffect(() => {
    if (!isSearchOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (filtersExpanded) {
        toggleFilters();
      } else {
        handleCloseSearch();
      }
      return true;
    });
    return () => sub.remove();
  }, [isSearchOpen, filtersExpanded, toggleFilters, handleCloseSearch]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isSearchOpen && styles.containerSearchMode,
      ]}
    >
      {rightContent && !showSearchBar && (
        <View style={styles.buttonContainer}>{rightContent}</View>
      )}
      {showSearchBar && (
        <>
          <SearchBar
            searchText={searchState?.text || ''}
            onSearchTextChange={setSearchText}
            onToggleFilters={handleToggleFilters}
            onClose={handleCloseSearch}
            filterCount={getSearchFilterCount ? getSearchFilterCount() : 0}
            colors={colors}
            t={t}
            collapsed={!isSearchOpen}
            onCollapsedPress={handleCollapsedPress}
          />
          {isSearchOpen && hasActiveSearch && (
            <FilterChipStrip
              searchState={searchState}
              onClearGroup={handleClearFilterGroup}
              colors={colors}
              t={t}
            />
          )}
        </>
      )}
    </View>
  );
}

Header.propTypes = {
  rightContent: PropTypes.node,
  activeScreen: PropTypes.string,
  operationsData: PropTypes.object,
};

Header.defaultProps = {
  rightContent: null,
  activeScreen: null,
  operationsData: null,
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingBottom: 2,
    paddingTop: 2,
  },
  containerSearchMode: {
    alignItems: 'stretch',
    flexDirection: 'column',
    paddingHorizontal: 0,
  },
});
