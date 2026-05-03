import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';
import PropTypes from 'prop-types';
import ExpandableFilters from './ExpandableFilters';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useOperationsActions } from '../../contexts/OperationsActionsContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useSearch } from '../../contexts/SearchContext';

const SearchOverlay = ({ onClose, colors, t, visible }) => {
  const { searchState } = useOperationsData();
  const { filtersExpanded } = useSearch();
  const { updateSearchFilters } = useOperationsActions();
  const { visibleAccounts } = useAccountsData();

  const handleFilterChange = useCallback((partialFilters) => {
    updateSearchFilters(partialFilters);
  }, [updateSearchFilters]);

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.filtersContainer, { backgroundColor: colors.background }]}>
      <ExpandableFilters
        filters={searchState}
        onFilterChange={handleFilterChange}
        accounts={visibleAccounts}
        colors={colors}
        t={t}
        isExpanded={filtersExpanded}
      />
    </View>
  );
};

SearchOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  colors: PropTypes.shape({
    background: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
  visible: PropTypes.bool.isRequired,
};

const styles = StyleSheet.create({
  filtersContainer: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
});

export default SearchOverlay;
