import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Calculator from '../Calculator';
import { SPACING, BORDER_RADIUS } from '../../styles/layout';

/**
 * OperationFormFields Component
 *
 * Reusable form fields for operation entry (expense, income, transfer)
 *
 * DEPENDENCIES:
 * - QuickAddForm (app/components/operations/QuickAddForm.js)
 * - Can be used by other operation forms
 *
 * IMPORTANT: When modifying this component, ensure you test ALL dependent components:
 * 1. QuickAddForm - Verify type selector, account pickers, calculator, category picker
 * 2. Any other future consumers of this component
 *
 * Test both:
 * - UI/Layout (side-by-side vs stacked, account balance display, disabled state)
 * - Functionality (picker callbacks, amount changes, type switching, transfer logic)
 *
 * @param {Object} props
 * @param {Object} props.colors - Theme colors
 * @param {Function} props.t - Translation function
 * @param {Object} props.values - Form values {type, accountId, toAccountId, amount, categoryId}
 * @param {Function} props.setValues - Function to update form values
 * @param {Array} props.accounts - Available accounts
 * @param {Array} props.categories - Available categories
 * @param {Function} props.getAccountName - Function to get account name by ID
 * @param {Function} props.getAccountBalance - Function to get formatted account balance by ID (optional)
 * @param {Function} props.getCategoryName - Function to get category name by ID
 * @param {Function} props.openPicker - Function to open picker modal
 * @param {Function} props.onAmountChange - Callback when amount changes
 * @param {Function} props.onAdd - Callback for add action (QuickAdd only)
 * @param {Array} props.TYPES - Operation types [{key, label, icon}]
 * @param {boolean} props.showTypeSelector - Whether to show inline type selector buttons
 * @param {boolean} props.showAccountBalance - Whether to show account balance in picker
 * @param {string} props.transferLayout - 'sideBySide' or 'stacked' layout for transfer accounts
 * @param {boolean} props.disabled - Whether form is disabled
 * @param {string} props.containerBackground - Background color for calculator container
 */
const OperationFormFields = memo(({
  colors,
  t,
  values,
  setValues,
  accounts,
  categories,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  onAmountChange,
  onAdd,
  TYPES,
  showTypeSelector = true,
  showAccountBalance = false,
  transferLayout = 'stacked',
  disabled = false,
  containerBackground,
}) => {
  // Memoize input styles
  const inputStyle = useMemo(() => ({
    backgroundColor: colors.inputBackground,
    borderColor: colors.inputBorder,
  }), [colors]);

  const disabledStyle = useMemo(() =>
    disabled ? styles.disabledInput : null
  , [disabled]);

  // Render type selector buttons
  const renderTypeSelector = () => (
    <View style={styles.typeSelector}>
      {TYPES.map(type => (
        <Pressable
          key={type.key}
          style={[
            styles.typeButton,
            {
              backgroundColor: values.type === type.key ? colors.primary : colors.inputBackground,
              borderColor: colors.border,
            },
            disabledStyle,
          ]}
          onPress={() => !disabled && setValues(v => ({
            ...v,
            type: type.key,
            categoryId: type.key === 'transfer' ? '' : v.categoryId,
            toAccountId: '',
          }))}
          disabled={disabled}
        >
          <Icon
            name={type.icon}
            size={18}
            color={values.type === type.key ? '#fff' : (disabled ? colors.mutedText : colors.text)}
          />
          <Text style={[
            styles.typeButtonText,
            { color: values.type === type.key ? '#fff' : (disabled ? colors.mutedText : colors.text) }
          ]}>
            {type.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  // Render account picker with optional balance
  const renderAccountPicker = (
    accountId,
    onPress,
    label,
    iconName = 'wallet',
    style = styles.formInput
  ) => (
    <Pressable
      style={[style, inputStyle, disabledStyle]}
      onPress={onPress}
      disabled={disabled}
    >
      <Icon name={iconName} size={18} color={disabled ? colors.mutedText : colors.mutedText} />
      <View style={styles.flex1}>
        <Text
          style={[styles.formInputText, { color: disabled ? colors.mutedText : colors.text }]}
          numberOfLines={1}
        >
          {accountId ? getAccountName(accountId) : label}
        </Text>
        {showAccountBalance && accountId && (
          <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
            {getAccountBalance(accountId)}
          </Text>
        )}
      </View>
    </Pressable>
  );

  // Render account pickers based on transfer layout
  const renderAccountPickers = () => {
    if (values.type === 'transfer' && transferLayout === 'sideBySide') {
      // Side-by-side layout for QuickAdd
      return (
        <View style={styles.accountPickersRow}>
          {renderAccountPicker(
            values.accountId,
            () => !disabled && openPicker('account', accounts),
            t('select_account'),
            'wallet',
            styles.formInputHalf
          )}
          {renderAccountPicker(
            values.toAccountId,
            () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
            t('to_account'),
            'swap-horizontal',
            styles.formInputHalf
          )}
        </View>
      );
    } else if (values.type === 'transfer' && transferLayout === 'stacked') {
      // Stacked layout for OperationModal
      return (
        <>
          {renderAccountPicker(
            values.accountId,
            () => !disabled && openPicker('account', accounts),
            t('select_account')
          )}
          {renderAccountPicker(
            values.toAccountId,
            () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
            `${t('to_account')}: ${values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}`
          )}
        </>
      );
    } else {
      // Single account picker for non-transfer
      return renderAccountPicker(
        values.accountId,
        () => !disabled && openPicker('account', accounts),
        t('select_account')
      );
    }
  };

  // Render category picker
  const renderCategoryPicker = () => {
    if (values.type === 'transfer') return null;

    return (
      <Pressable
        style={[styles.formInput, inputStyle, disabledStyle]}
        onPress={() => !disabled && openPicker('category', categories)}
        disabled={disabled}
      >
        <Icon name="tag" size={18} color={disabled ? colors.mutedText : colors.mutedText} />
        <Text style={[styles.formInputText, { color: disabled ? colors.mutedText : colors.text }]}>
          {getCategoryName(values.categoryId)}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      {showTypeSelector && renderTypeSelector()}
      {renderAccountPickers()}
      <View style={disabledStyle}>
        <Calculator
          value={values.amount}
          onValueChange={onAmountChange}
          colors={colors}
          placeholder={t('amount')}
          onAdd={onAdd}
          containerBackground={containerBackground}
        />
      </View>
      {renderCategoryPicker()}
    </>
  );
});

OperationFormFields.displayName = 'OperationFormFields';

OperationFormFields.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  values: PropTypes.shape({
    type: PropTypes.string.isRequired,
    accountId: PropTypes.string,
    toAccountId: PropTypes.string,
    amount: PropTypes.string,
    categoryId: PropTypes.string,
  }).isRequired,
  setValues: PropTypes.func.isRequired,
  accounts: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  onAmountChange: PropTypes.func.isRequired,
  onAdd: PropTypes.func,
  TYPES: PropTypes.array.isRequired,
  showTypeSelector: PropTypes.bool,
  showAccountBalance: PropTypes.bool,
  transferLayout: PropTypes.oneOf(['sideBySide', 'stacked']),
  disabled: PropTypes.bool,
  containerBackground: PropTypes.string,
};

const styles = StyleSheet.create({
  accountBalanceText: {
    fontSize: 12,
    marginTop: 2,
  },
  accountPickersRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  disabledInput: {
    opacity: 0.6,
  },
  flex1: {
    flex: 1,
  },
  formInput: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 48,
    padding: SPACING.md,
  },
  formInputHalf: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 48,
    padding: SPACING.md,
  },
  formInputText: {
    fontSize: 14,
    fontWeight: '500',
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
});

export default OperationFormFields;
