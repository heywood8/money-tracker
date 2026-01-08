import React, { memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import OperationFormFields from './OperationFormFields';
import { SPACING, BORDER_RADIUS } from '../../styles/layout';

/**
 * QuickAddForm Component
 *
 * A compact form for quickly adding operations (expenses, income, transfers)
 * Displays different fields based on operation type
 */
const QuickAddForm = memo(({
  colors,
  t,
  quickAddValues,
  setQuickAddValues,
  accounts: visibleAccounts,
  filteredCategories,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  handleQuickAdd,
  TYPES,
}) => {
  const containerThemed = React.useMemo(() => ({
    // Use altRow for outer background so QuickAdd area appears slightly gray
    backgroundColor: colors.altRow,
    borderWidth: 1,
    borderColor: colors.border,
  }), [colors]);

  const innerCardThemed = React.useMemo(() => ({
    // Make inner card also gray so the whole form area is grayish
    backgroundColor: colors.altRow,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  }), [colors]);

  const handleAmountChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, amount: text }));
  }, [setQuickAddValues]);

  return (
    <View style={[styles.quickAddForm, containerThemed]}>
      <View style={innerCardThemed}>
        <OperationFormFields
          colors={colors}
          t={t}
          values={quickAddValues}
          setValues={setQuickAddValues}
          accounts={visibleAccounts}
          categories={filteredCategories}
          getAccountName={getAccountName}
          getAccountBalance={getAccountBalance}
          getCategoryName={getCategoryName}
          openPicker={openPicker}
          onAmountChange={handleAmountChange}
          onAdd={handleQuickAdd}
          TYPES={TYPES}
          showAccountBalance={true}
          transferLayout="sideBySide"
        />
      </View>
    </View>
  );
});

QuickAddForm.displayName = 'QuickAddForm';

QuickAddForm.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  quickAddValues: PropTypes.object.isRequired,
  setQuickAddValues: PropTypes.func.isRequired,
  accounts: PropTypes.array,
  filteredCategories: PropTypes.array,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func.isRequired,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  handleQuickAdd: PropTypes.func.isRequired,
  TYPES: PropTypes.array.isRequired,
};

const styles = StyleSheet.create({
  quickAddForm: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 0,
    elevation: 2,
    gap: SPACING.sm,
    marginHorizontal: SPACING.sm,
    marginVertical: SPACING.md,
    padding: SPACING.xsm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});

export default QuickAddForm;
