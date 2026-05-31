import React, { useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import PropTypes from 'prop-types';
import ExpandableFilters from './ExpandableFilters';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useOperationsActions } from '../../contexts/OperationsActionsContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useSearch } from '../../contexts/SearchContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const SearchOverlay = ({ onClose, colors, t, visible, onHeightChange }) => {
  const { searchState } = useOperationsData();
  const { filtersExpanded } = useSearch();
  const { updateSearchFilters } = useOperationsActions();
  const { visibleAccounts } = useAccountsData();

  const translateY = useSharedValue(-SCREEN_HEIGHT);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleFilterChange = useCallback((partialFilters) => {
    updateSearchFilters(partialFilters);
  }, [updateSearchFilters]);

  const handleLayout = useCallback((event) => {
    if (onHeightChange) {
      onHeightChange(event.nativeEvent.layout.height);
    }
  }, [onHeightChange]);

  // Reset reported height when the overlay hides so parents don't keep a phantom
  // spacer once search is closed.
  useEffect(() => {
    if (!visible && onHeightChange) {
      onHeightChange(0);
    }
  }, [visible, onHeightChange]);

  return (
    <Animated.View
      style={[styles.filtersContainer, { backgroundColor: colors.background }, animatedStyle]}
      pointerEvents={visible ? 'box-none' : 'none'}
      onLayout={handleLayout}
    >
      <ExpandableFilters
        filters={searchState}
        onFilterChange={handleFilterChange}
        accounts={visibleAccounts}
        colors={colors}
        t={t}
        isExpanded={filtersExpanded}
      />
    </Animated.View>
  );
};

SearchOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  onHeightChange: PropTypes.func,
  colors: PropTypes.shape({
    background: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
};

SearchOverlay.defaultProps = {
  onHeightChange: null,
};

const styles = StyleSheet.create({
  filtersContainer: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    elevation: 8,
    left: 0,
    maxHeight: SCREEN_HEIGHT * 0.75,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    top: 0,
    zIndex: 50,
  },
});

export default SearchOverlay;
