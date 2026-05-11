import { View, Text, TouchableOpacity, StyleSheet, Image, Animated } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from './search/SearchBar';
import PropTypes from 'prop-types';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { useSearch } from '../contexts/SearchContext';
import FilterBadge from './search/FilterBadge';
import FilterChipStrip from './search/FilterChipStrip';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';

const APP_VERSION = require('../../package.json').version;

export default function Header({ onOpenSettings, rightContent, activeScreen, operationsData }) {
  console.debug('[Header] Rendering - activeScreen:', activeScreen, ', operationsData exists:', !!operationsData);
  const { colorScheme, setTheme } = useThemeConfig();
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { isDownloading, downloadProgress } = useUpdateDownload();
  const { openSearch, searchMode, closeSearch, reopenSearch, toggleFilters } = useSearch();
  console.debug('[Header] openSearch exists:', !!openSearch);
  console.debug('[Header] searchMode:', searchMode);
  const downloadArrowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isDownloading) {
      downloadArrowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(downloadArrowAnim, { toValue: 5, duration: 400, useNativeDriver: true }),
        Animated.timing(downloadArrowAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isDownloading, downloadArrowAnim]);

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
      types: { types: [] },
      dateRange: { dateRange: { startDate: null, endDate: null } },
      amountRange: { amountRange: { min: null, max: null } },
      accountIds: { accountIds: [] },
      categoryIds: { categoryIds: [] },
    };
    updateSearchFilters(clearValues[groupKey]);
  }, [updateSearchFilters]);

  const toggleTheme = () => {
    const newTheme = colorScheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
        searchMode === 'open' && activeScreen === 'Operations' && styles.containerSearchMode,
      ]}
    >
      {searchMode === 'open' && activeScreen === 'Operations' ? (
        <>
          <SearchBar
            searchText={searchState?.text || ''}
            onSearchTextChange={setSearchText}
            onToggleFilters={handleToggleFilters}
            onClose={handleCloseSearch}
            filterCount={getSearchFilterCount ? getSearchFilterCount() : 0}
            colors={colors}
            t={t}
          />
          {hasActiveSearch && (
            <FilterChipStrip
              searchState={searchState}
              onClearGroup={handleClearFilterGroup}
              colors={colors}
              t={t}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.titleContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.icon}
              accessibilityLabel="Penny app icon"
            />
            <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
          </View>
          <View style={styles.buttonContainer}>
            {rightContent || (
              <>
                {isDownloading && (
                  <View
                    style={styles.downloadIndicator}
                    accessibilityLabel={`${t('downloading_update') || 'Downloading update'} ${Math.round((downloadProgress ?? 0) * 100)}%`}
                    accessibilityRole="progressbar"
                    testID="download-indicator"
                  >
                    <Animated.View style={{ transform: [{ translateY: downloadArrowAnim }] }}>
                      <Ionicons name="arrow-down-outline" size={20} color={colors.primary} />
                    </Animated.View>
                    <Text style={[styles.downloadPercent, { color: colors.mutedText }]}>
                      {`${Math.round((downloadProgress ?? 0) * 100)}%`}
                    </Text>
                  </View>
                )}
                {activeScreen === 'Operations' && (
                  <View style={styles.searchButtonContainer}>
                    <TouchableOpacity
                      onPress={() => {
                        console.debug('[Header] Search button pressed, mode:', searchMode);
                        if (searchMode === 'collapsed') {
                          // Reopen with smart logic
                          const hasTextOnly = (searchState?.text !== '') &&
                            (searchState?.types?.length === 0) &&
                            (searchState?.accountIds?.length === 0) &&
                            (searchState?.categoryIds?.length === 0) &&
                            (!searchState?.dateRange?.startDate) &&
                            (!searchState?.amountRange?.min);
                          const hasOtherFilters = !hasTextOnly && hasActiveSearch;

                          reopenSearch(searchState?.text !== '', hasOtherFilters, (shouldExpand) => {
                            console.debug('[Header] Should expand filters:', shouldExpand);
                            // This callback will be handled by SearchOverlay in task 10
                          });
                        } else {
                          openSearch();
                        }
                      }}
                      testID="search-button"
                      accessibilityLabel="Search operations"
                      accessibilityRole="button"
                      style={styles.searchButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="search-outline" size={24} color={colors.text} />
                    </TouchableOpacity>
                    {searchMode === 'collapsed' && hasActiveSearch && (
                      <FilterBadge
                        count={getSearchFilterCount()}
                        colors={colors}
                      />
                    )}
                  </View>
                )}
                <TouchableOpacity
                  onPress={toggleTheme}
                  testID="theme-toggle-button"
                  accessibilityLabel={colorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                  accessibilityRole="button"
                  accessibilityHint="Toggles between light and dark theme"
                  style={styles.themeButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={colorScheme === 'dark' ? 'moon' : 'sunny'}
                    size={24}
                    color={colors.text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onOpenSettings}
                  testID="settings-button"
                  accessibilityLabel={t('settings')}
                  accessibilityRole="button"
                  accessibilityHint="Opens settings menu"
                  style={styles.settingsButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="settings-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

Header.propTypes = {
  onOpenSettings: PropTypes.func,
  rightContent: PropTypes.node,
  activeScreen: PropTypes.string,
  operationsData: PropTypes.object,
};

Header.defaultProps = {
  onOpenSettings: () => {},
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
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
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
  icon: {
    height: 50,
    marginRight: 4,
    width: 50,
  },
  searchButton: {
    padding: 8,
  },
  searchButtonContainer: {
    position: 'relative',
  },
  settingsButton: {
    padding: 8,
  },
  themeButton: {
    padding: 8,
  },
  title: { fontSize: 14, fontWeight: '700' },
  titleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
