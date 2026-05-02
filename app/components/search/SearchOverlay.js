import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import PropTypes from 'prop-types';
import SearchBar from './SearchBar';
import ExpandableFilters from './ExpandableFilters';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useOperationsActions } from '../../contexts/OperationsActionsContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useCategories } from '../../contexts/CategoriesContext';

const SearchOverlay = ({ onClose, colors, t, visible }) => {
  const { searchState, hasActiveSearch, getSearchFilterCount } = useOperationsData();

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const { setSearchText, updateSearchFilters, clearAllSearch } = useOperationsActions();
  const { visibleAccounts } = useAccountsData();
  const { categories } = useCategories();

  const slideAnim = useSharedValue(visible ? 0 : -100);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      slideAnim.value = withTiming(0, { duration: 200 });
    } else {
      slideAnim.value = withTiming(-100, { duration: 200 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideAnim.value }],
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: overlayOpacity.value,
    };
  });

  const handleToggleFilters = useCallback(() => {
    console.log('[SearchOverlay] handleToggleFilters called');
    const willExpand = !filtersExpanded;
    setFiltersExpanded(willExpand);
    overlayOpacity.value = withTiming(willExpand ? 0.3 : 0, { duration: 200 });
  }, [filtersExpanded, overlayOpacity]);

  const handleCloseOverlay = useCallback(() => {
    console.log('[SearchOverlay] handleCloseOverlay called, hasActiveSearch:', hasActiveSearch);
    // Check if filters are active
    if (hasActiveSearch) {
      Alert.alert(
        t('keep_filters_active'),
        '',
        [
          {
            text: t('clear_all'),
            style: 'destructive',
            onPress: () => {
              console.log('[SearchOverlay] Clear all pressed');
              clearAllSearch();
              onClose();
            },
          },
          {
            text: t('keep_filters'),
            onPress: () => {
              console.log('[SearchOverlay] Keep filters pressed');
              onClose();
            },
          },
        ],
        { cancelable: true },
      );
    } else {
      console.log('[SearchOverlay] Calling onClose directly (no active filters)');
      onClose();
    }
  }, [hasActiveSearch, clearAllSearch, onClose, t]);

  const handleOverlayPress = useCallback(() => {
    if (filtersExpanded) {
      setFiltersExpanded(false);
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [filtersExpanded, overlayOpacity]);

  const handleFilterChange = useCallback((partialFilters) => {
    updateSearchFilters(partialFilters);
  }, [updateSearchFilters]);

  const filterCount = getSearchFilterCount ? getSearchFilterCount() : 0;

  if (!visible) {
    return null;
  }

  return (
    <>
      {/* Overlay backdrop (only when filters expanded) */}
      {filtersExpanded && (
        <TouchableWithoutFeedback onPress={handleOverlayPress}>
          <Animated.View
            style={[styles.overlayBackdrop, overlayAnimatedStyle]}
            pointerEvents="auto"
          />
        </TouchableWithoutFeedback>
      )}

      {/* Search overlay container */}
      <Animated.View
        style={[styles.container, { backgroundColor: colors.surface }, animatedStyle]}
        pointerEvents="box-none"
      >
        <SearchBar
          searchText={searchState?.text || ''}
          onSearchTextChange={setSearchText}
          onToggleFilters={handleToggleFilters}
          onClose={handleCloseOverlay}
          filterCount={filterCount}
          colors={colors}
          t={t}
        />
        <ExpandableFilters
          filters={searchState}
          onFilterChange={handleFilterChange}
          accounts={visibleAccounts}
          categories={categories}
          colors={colors}
          t={t}
          isExpanded={filtersExpanded}
        />
      </Animated.View>
    </>
  );
};

SearchOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  colors: PropTypes.shape({
    surface: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
};

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  overlayBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 999,
  },
});

export default SearchOverlay;
