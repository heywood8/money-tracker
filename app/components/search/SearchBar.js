import React, { useState, useCallback, useEffect } from 'react';
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
}) => {
  const [localText, setLocalText] = useState(searchText);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchTextChange(localText);
    }, 300);
    return () => clearTimeout(timer);
  }, [localText, onSearchTextChange]);

  const handleClear = useCallback(() => {
    setLocalText('');
    onSearchTextChange('');
  }, [onSearchTextChange]);

  return (
    <View
      testID="search-bar-container"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View
        testID="search-input-container"
        style={[styles.searchInputContainer, {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        }]}
      >
        <Icon name="magnify" size={20} color={colors.text} />
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
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          testID="filters-toggle-button"
          onPress={() => {
            Keyboard.dismiss();
            onToggleFilters();
          }}
          style={[
            styles.iconButton,
            filterCount > 0 && { backgroundColor: `${colors.primary}15` },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <View style={styles.filterButtonContent}>
            <Icon name="filter-variant" size={22} color={filterCount > 0 ? colors.primary : colors.text} />
            {filterCount > 0 && (
              <View
                testID="filter-count-badge"
                style={[styles.filterBadge, { backgroundColor: colors.primary }]}
              >
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
    inputBorder: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    mutedText: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
};

SearchBar.defaultProps = {
  filterCount: 0,
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
    height: 56,
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
});

export default SearchBar;
