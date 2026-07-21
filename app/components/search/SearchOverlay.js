import React, { useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';
import ExpandableFilters from './ExpandableFilters';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useOperationsActions } from '../../contexts/OperationsActionsContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useSearch } from '../../contexts/SearchContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// The panel is pulled up under the search area (which sits at a higher zIndex)
// so its rounded top tucks behind the pill/chip strip and the sheet reads as a
// continuation of the search bar rather than a detached card below it.
// Exported so layout tests can assert the tucked position without a magic number.
export const PANEL_OVERLAP = 14;

const SearchOverlay = ({ colors, t, visible, onHeightChange = null, topOffset = 0, onClose = null }) => {
  const { searchState = { text: '', types: [], accountIds: [], categoryIds: [], dateRange: { startDate: null, endDate: null }, amountRange: { min: null, max: null } } } = useOperationsData();
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
      style={[
        styles.filtersContainer,
        {
          backgroundColor: colors.glassSurface || colors.background,
          borderColor: colors.glassBorder || colors.border,
          top: Math.max(0, topOffset - PANEL_OVERLAP),
        },
        animatedStyle,
      ]}
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
        onCloseSearch={onClose}
      />
    </Animated.View>
  );
};

SearchOverlay.propTypes = {
  onHeightChange: PropTypes.func,
  colors: PropTypes.shape({
    background: PropTypes.string.isRequired,
    border: PropTypes.string,
    glassSurface: PropTypes.string,
    glassBorder: PropTypes.string,
  }).isRequired,
  t: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
  topOffset: PropTypes.number,
  onClose: PropTypes.func,
};

const styles = StyleSheet.create({
  filtersContainer: {
    // Rounded on all corners and inset to the open search pill's width so the
    // sheet reads as one floating unit with the bar. The top tucks behind the
    // search area (see PANEL_OVERLAP), hiding the seam.
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    left: HORIZONTAL_PADDING,
    maxHeight: SCREEN_HEIGHT * 0.62,
    position: 'absolute',
    right: HORIZONTAL_PADDING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    top: 0,
    zIndex: 50,
  },
});

export default SearchOverlay;
