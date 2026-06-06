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
  onAutoAddWithCategory,
  topTransferAccounts,
  onAutoAddWithAccount,
  TYPES,
  rateSource,
  onOperationCurrencyChange,
  foreignRateSource,
  foreignExchangeRate,
  flashCategoryError,
}) => {
  const containerThemed = React.useMemo(() => ({
    backgroundColor: colors.background,
  }), [colors]);

  const innerCardThemed = React.useMemo(() => ({
    backgroundColor: colors.background,
    borderRadius: BORDER_RADIUS.lg,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
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
          containerBackground={colors.background}
          TYPES={TYPES}
          showAccountBalance={true}
          showFieldIcons={true}
          transferLayout="sideBySide"
          onExchangeRateChange={handleExchangeRateChange}
          onDestinationAmountChange={handleDestinationAmountChange}
          onAutoAddWithCategory={onAutoAddWithCategory}
          topTransferAccounts={topTransferAccounts}
          onAutoAddWithAccount={onAutoAddWithAccount}
          rateSource={rateSource}
          compact={true}
          onOperationCurrencyChange={onOperationCurrencyChange}
          foreignRateSource={foreignRateSource}
          foreignExchangeRate={foreignExchangeRate}
          flashCategoryError={flashCategoryError}
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
  onAutoAddWithCategory: PropTypes.func,
  topTransferAccounts: PropTypes.array,
  onAutoAddWithAccount: PropTypes.func,
  TYPES: PropTypes.array.isRequired,
  rateSource: PropTypes.oneOf(['loading', 'live', 'offline']),
  onOperationCurrencyChange: PropTypes.func,
  foreignRateSource: PropTypes.oneOf(['loading', 'live', 'offline']),
  foreignExchangeRate: PropTypes.string,
  flashCategoryError: PropTypes.number,
};

const styles = StyleSheet.create({
  quickAddForm: {
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
    marginHorizontal: SPACING.sm,
    marginTop: 0,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
});

export default QuickAddForm;
