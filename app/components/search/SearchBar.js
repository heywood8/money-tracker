import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Keyboard } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';

const SearchBar = ({
  searchText,
  onSearchTextChange,
  onToggleFilters,
  onClose,
  filterCount,
  colors,
  t,
  collapsed,
  onCollapsedPress,
}) => {
  const [localText, setLocalText] = useState(searchText);
  // Track the last value we sent to the parent so we can distinguish
  // "the parent just received our debounced update" (no-op) from
  // "the parent changed searchText externally" (e.g. clear-all).
  const lastSentRef = useRef(searchText);
  const localTextRef = useRef(localText);
  localTextRef.current = localText;
  const onChangeRef = useRef(onSearchTextChange);
  onChangeRef.current = onSearchTextChange;

  // Debounce local text into parent state.
  // Skip the initial mount call — there's nothing new to send.
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      lastSentRef.current = localText;
      onSearchTextChange(localText);
    }, 300);
    return () => clearTimeout(timer);
  }, [localText, onSearchTextChange]);

  // Sync local text when searchText changes externally (e.g. clear-all from outside).
  useEffect(() => {
    if (searchText !== lastSentRef.current) {
      lastSentRef.current = searchText;
      setLocalText(searchText);
    }
  }, [searchText]);

  // Flush any pending debounced change on unmount so closing the search bar
  // mid-typing doesn't discard the last keystrokes.
  useEffect(() => {
    return () => {
      if (lastSentRef.current !== localTextRef.current) {
        onChangeRef.current(localTextRef.current);
      }
    };
  }, []);

  const handleClear = useCallback(() => {
    setLocalText('');
    lastSentRef.current = '';
    onSearchTextChange('');
  }, [onSearchTextChange]);

  return (
    <View
      testID="search-bar-container"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <TouchableOpacity
        testID="search-input-container"
        activeOpacity={collapsed ? 0.6 : 1}
        onPress={collapsed ? onCollapsedPress : undefined}
        accessibilityRole={collapsed ? 'button' : undefined}
        accessibilityLabel={collapsed ? t('search') : undefined}
        style={[
          styles.searchInputContainer,
          { backgroundColor: colors.background, borderBottomColor: colors.border },
          collapsed && styles.searchInputContainerCollapsed,
        ]}
      >
        <View style={styles.iconWrapper}>
          <Icon name="magnify" size={20} color={colors.text} />
          {collapsed && filterCount > 0 && (
            <View testID="filter-count-badge-collapsed" style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </View>
        {!collapsed && (
          <>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={localText}
              onChangeText={setLocalText}
              placeholder={t('search_operations_placeholder')}
              placeholderTextColor={colors.mutedText}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
            {localText.length > 0 && (
              <TouchableOpacity
                testID="clear-search-button"
                onPress={handleClear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close-circle" size={20} color={colors.mutedText} />
              </TouchableOpacity>
            )}
          </>
        )}
      </TouchableOpacity>
      {!collapsed && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            testID="filters-toggle-button"
            onPress={() => { Keyboard.dismiss(); onToggleFilters(); }}
            style={[styles.iconButton, filterCount > 0 && { backgroundColor: `${colors.primary}15` }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <View style={styles.filterButtonContent}>
              <Icon name="filter-variant" size={22} color={filterCount > 0 ? colors.primary : colors.text} />
              {filterCount > 0 && (
                <View testID="filter-count-badge" style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            testID="close-search-button"
            onPress={onClose}
            style={styles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

SearchBar.propTypes = {
  searchText: PropTypes.string.isRequired,
  onSearchTextChange: PropTypes.func.isRequired,
  onToggleFilters: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  filterCount: PropTypes.number,
  colors: PropTypes.shape({
    background: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    mutedText: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
  collapsed: PropTypes.bool,
  onCollapsedPress: PropTypes.func,
};

SearchBar.defaultProps = {
  filterCount: 0,
  collapsed: false,
  onCollapsedPress: undefined,
};

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    width: 96, // 44 + 44 + 8
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 25,
    paddingHorizontal: HORIZONTAL_PADDING,
    width: '100%',
    zIndex: 100,
  },
  filterBadge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  filterButtonContent: {
    position: 'relative',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconWrapper: {
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: 40,
  },
  searchInputContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRadius: 4,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    height: 44,
    marginRight: 12,
    paddingHorizontal: 12,
  },
  searchInputContainerCollapsed: {
    borderBottomWidth: 0,
    flex: 0,
    marginRight: 0,
  },
});

export default SearchBar;
