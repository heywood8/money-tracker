import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SearchBar from './search/SearchBar';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { useSearch } from '../contexts/SearchContext';
import FilterChipStrip from './search/FilterChipStrip';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';

export default function Header({ rightContent, activeScreen, operationsData }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();
  const { openSearch, searchMode, closeSearch, reopenSearch, toggleFilters, filtersExpanded } = useSearch();
  const downloadArrowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isDownloading) {
      downloadArrowAnim.setValue(0);
      rotateAnim.setValue(0);
      return;
    }
    if (downloadPhase === 'verifying') {
      downloadArrowAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
      return () => loop.stop();
    }
    rotateAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(downloadArrowAnim, { toValue: 5, duration: 400, useNativeDriver: true }),
        Animated.timing(downloadArrowAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isDownloading, downloadPhase, downloadArrowAnim, rotateAnim]);

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
      {isDownloading && !showSearchBar && (
        <View
          style={styles.downloadIndicator}
          accessibilityLabel={
            downloadPhase === 'verifying'
              ? (t('verifying_update') || 'Checking…')
              : `${t('downloading_update') || 'Downloading update'} ${Math.round((downloadProgress ?? 0) * 100)}%`
          }
          accessibilityRole="progressbar"
          testID="download-indicator"
        >
          {downloadPhase === 'verifying' ? (
            <Animated.View style={{
              transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }}>
              <Icon name="sync" size={20} color={colors.primary} />
            </Animated.View>
          ) : (
            <Animated.View style={{ transform: [{ translateY: downloadArrowAnim }] }}>
              <Icon name="arrow-down" size={20} color={colors.primary} />
            </Animated.View>
          )}
          <Text style={[styles.downloadPercent, { color: colors.mutedText }]}>
            {downloadPhase === 'verifying'
              ? (t('verifying_update') || 'Checking…')
              : `${Math.round((downloadProgress ?? 0) * 100)}%`}
          </Text>
        </View>
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
  downloadIndicator: {
    alignItems: 'center',
    gap: 2,
  },
  downloadPercent: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
});
