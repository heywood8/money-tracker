import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import OperationFormFields from './OperationFormFields';
import { SPACING, BORDER_RADIUS } from '../../styles/layout';

/**
 * QuickAddForm Component
 *
 * A compact form for quickly adding operations (expenses, income, transfers)
 * Displays different fields based on operation type
 *
 * DEPENDENCIES:
 * - OperationFormFields (app/components/operations/OperationFormFields.js) - Shared form fields
 *
 * NOTE: This component uses OperationFormFields for rendering form inputs.
 * If modifying form field behavior, check if changes should be made in
 * OperationFormFields instead to benefit all consumers.
 */
const QuickAddForm = memo(({
  colors,
  t,
  quickAddValues,
  setQuickAddValues,
  accounts: visibleAccounts,
  filteredCategories,
  topCategoriesForType,
  getCategoryInfo,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  handleQuickAdd,
  handleAmountChange,
  handleExchangeRateChange,
  handleDestinationAmountChange,
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
          topCategoriesForType={topCategoriesForType}
          getCategoryInfo={getCategoryInfo}
          getAccountName={getAccountName}
          getAccountBalance={getAccountBalance}
          getCategoryName={getCategoryName}
          openPicker={openPicker}
          onAmountChange={handleAmountChange}
          onAdd={handleQuickAdd}
          TYPES={TYPES}
          showAccountBalance={true}
          showFieldIcons={true}
          transferLayout="sideBySide"
          onExchangeRateChange={handleExchangeRateChange}
          onDestinationAmountChange={handleDestinationAmountChange}
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
  topCategoriesForType: PropTypes.array,
  getCategoryInfo: PropTypes.func.isRequired,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func.isRequired,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  handleQuickAdd: PropTypes.func.isRequired,
  handleAmountChange: PropTypes.func.isRequired,
  handleExchangeRateChange: PropTypes.func.isRequired,
  handleDestinationAmountChange: PropTypes.func.isRequired,
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
