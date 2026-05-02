import React, { useCallback, useEffect } from 'react';
import {
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import PropTypes from 'prop-types';
import ExpandableFilters from './ExpandableFilters';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useOperationsActions } from '../../contexts/OperationsActionsContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useCategories } from '../../contexts/CategoriesContext';
import { useSearch } from '../../contexts/SearchContext';

const SearchOverlay = ({ onClose, colors, t, visible }) => {
  const { searchState, hasActiveSearch, getSearchFilterCount } = useOperationsData();
  const { filtersExpanded, toggleFilters } = useSearch();
  const { updateSearchFilters } = useOperationsActions();
  const { visibleAccounts } = useAccountsData();
  const { categories } = useCategories();

  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    overlayOpacity.value = withTiming(filtersExpanded ? 0.3 : 0, { duration: 200 });
  }, [filtersExpanded, overlayOpacity]);

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: overlayOpacity.value,
    };
  });


  const handleFilterChange = useCallback((partialFilters) => {
    updateSearchFilters(partialFilters);
  }, [updateSearchFilters]);

  if (!visible) {
    return null;
  }

  return (
    <>
      {filtersExpanded && (
        <TouchableWithoutFeedback onPress={() => toggleFilters()}>
          <Animated.View
            style={[styles.overlayBackdrop, overlayAnimatedStyle]}
            pointerEvents="auto"
          />
        </TouchableWithoutFeedback>
      )}

      <Animated.View
        style={[styles.filtersContainer, { backgroundColor: colors.surface }]}
        pointerEvents="box-none"
      >
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
  filtersContainer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 56,
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
