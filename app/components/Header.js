import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from './search/SearchBar';
import PropTypes from 'prop-types';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { HORIZONTAL_PADDING } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { getDatabaseVersion } from '../services/db';
import { appEvents } from '../services/eventEmitter';
import { IMPORT_PROGRESS_EVENT } from '../services/BackupRestore';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { useSearch } from '../contexts/SearchContext';
import FilterBadge from './search/FilterBadge';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';

const APP_VERSION = require('../../package.json').version;

export default function Header({ onOpenSettings, rightContent, activeScreen, operationsData }) {
  console.log('[Header] Rendering - activeScreen:', activeScreen, ', operationsData exists:', !!operationsData);
  const { colorScheme, setTheme } = useThemeConfig();
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { isDownloading, downloadProgress } = useUpdateDownload();
  const { openSearch, searchMode, closeSearch, reopenSearch, toggleFilters } = useSearch();
  console.log('[Header] openSearch exists:', !!openSearch);
  console.log('[Header] searchMode:', searchMode);
  const [dbVersion, setDbVersion] = useState(null);

  const { searchState, hasActiveSearch, getSearchFilterCount } = useOperationsData();
  const { setSearchText } = useOperationsActions();

  const handleCloseSearch = useCallback(() => {
    closeSearch(hasActiveSearch);
  }, [closeSearch, hasActiveSearch]);

  const handleToggleFilters = useCallback(() => {
    toggleFilters();
  }, [toggleFilters]);

  const fetchDbVersion = useCallback(async () => {
    try {
      const version = await getDatabaseVersion();
      setDbVersion(version);
    } catch (error) {
      console.error('Failed to fetch database version:', error);
    }
  }, []);

  useEffect(() => {
    fetchDbVersion();

    // Listen for import completion to refresh DB version
    const handleImportProgress = (event) => {
      if (event.stepId === 'complete' && event.status === 'completed') {
        console.log('Import completed, refreshing DB version...');
        fetchDbVersion();
      }
    };

    appEvents.on(IMPORT_PROGRESS_EVENT, handleImportProgress);

    return () => {
      appEvents.off(IMPORT_PROGRESS_EVENT, handleImportProgress);
    };
  }, [fetchDbVersion]);

  const toggleTheme = () => {
    const newTheme = colorScheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {searchMode === 'open' ? (
        <SearchBar
          searchText={searchState?.text || ''}
          onSearchTextChange={setSearchText}
          onToggleFilters={handleToggleFilters}
          onClose={handleCloseSearch}
          filterCount={getSearchFilterCount ? getSearchFilterCount() : 0}
          colors={colors}
          t={t}
        />
      ) : (
        <>
          <View style={styles.titleContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.icon}
              accessibilityLabel="Penny app icon"
            />
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
              <Text style={[styles.version, { color: colors.mutedText }]}>
                v{APP_VERSION} | DB v{dbVersion || '?'}
              </Text>
            </View>
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
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.downloadPercent, { color: colors.mutedText }]}>
                      {`${Math.round((downloadProgress ?? 0) * 100)}%`}
                    </Text>
                  </View>
                )}
                {activeScreen === 'Operations' && (
                  <View style={styles.searchButtonContainer}>
                    <TouchableOpacity
                      onPress={() => {
                        console.log('[Header] Search button pressed, mode:', searchMode);
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
                            console.log('[Header] Should expand filters:', shouldExpand);
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
  version: {
    fontSize: 10,
    marginTop: 2,
  },
});
