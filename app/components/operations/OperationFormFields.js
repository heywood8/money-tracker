import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Calculator from '../Calculator';
import MultiCurrencyFields from '../modals/MultiCurrencyFields';
import { SPACING, BORDER_RADIUS } from '../../styles/layout';

/**
 * OperationFormFields Component
 *
 * Reusable form fields for operation entry (expense, income, transfer)
 *
 * DEPENDENCIES:
 * - QuickAddForm (app/components/operations/QuickAddForm.js)
 * - OperationModal (app/modals/OperationModal.js)
 *
 * IMPORTANT: When modifying this component, ensure you test ALL dependent components:
 * 1. QuickAddForm - Verify type selector, account pickers (with icons/balance), calculator, category picker
 * 2. OperationModal - Verify account pickers (no icons), calculator, category picker (type picker is separate)
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
 * @param {boolean} props.showFieldIcons - Whether to show icons in account/category pickers
 * @param {string} props.transferLayout - 'sideBySide' or 'stacked' layout for transfer accounts
 * @param {boolean} props.disabled - Whether form is disabled
 * @param {string} props.containerBackground - Background color for calculator container
 * @param {Function} props.onExchangeRateChange - Callback for exchange rate change (multi-currency transfers)
 * @param {Function} props.onDestinationAmountChange - Callback for destination amount change (multi-currency transfers)
 */
const OperationFormFields = memo(({
  colors,
  t,
  values,
  setValues,
  accounts,
  categories,
  topCategoriesForType,
  getCategoryInfo,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  onAmountChange,
  onAdd,
  TYPES,
  showTypeSelector = true,
  showAccountBalance = false,
  showFieldIcons = true,
  transferLayout = 'stacked',
  disabled = false,
  containerBackground,
  onExchangeRateChange,
  onDestinationAmountChange,
}) => {
  // Memoize input styles
  const inputStyle = useMemo(() => ({
    backgroundColor: colors.inputBackground,
    borderColor: colors.inputBorder,
  }), [colors]);

  const disabledStyle = useMemo(() =>
    disabled ? styles.disabledInput : null
  , [disabled]);

  // Get source and destination accounts for multi-currency detection
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.accountId);
  }, [accounts, values.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.toAccountId);
  }, [accounts, values.toAccountId]);

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = useMemo(() => {
    if (values.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [values.type, sourceAccount, destinationAccount]);

  // Render type selector buttons
  const renderTypeSelector = () => (
    <View style={styles.typeSelector}>
      {TYPES.map(type => {
        const isSelected = values.type === type.key;
        const textColor = isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text);

        return (
          <Pressable
            key={type.key}
            style={[
              styles.typeButton,
              {
                backgroundColor: isSelected ? colors.primary : colors.inputBackground,
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
              color={textColor}
            />
            <Text style={[
              styles.typeButtonText,
              { color: textColor },
            ]}>
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Render account picker with optional balance and icon
  const renderAccountPicker = (
    accountId,
    onPress,
    label,
    iconName = 'wallet',
    style = styles.formInput,
  ) => (
    <Pressable
      style={[style, inputStyle, disabledStyle]}
      onPress={onPress}
      disabled={disabled}
    >
      {showFieldIcons && (
        <Icon name={iconName} size={18} color={disabled ? colors.mutedText : colors.mutedText} />
      )}
      {showFieldIcons || showAccountBalance ? (
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
      ) : (
        <Text
          style={[styles.formInputText, { color: disabled ? colors.mutedText : colors.text }]}
        >
          {accountId ? getAccountName(accountId) : label}
        </Text>
      )}
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
            styles.formInputHalf,
          )}
          <View style={styles.arrowContainer}>
            <Icon name="arrow-right" size={20} color={colors.mutedText} />
          </View>
          {renderAccountPicker(
            values.toAccountId,
            () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
            t('to_account'),
            'swap-horizontal',
            styles.formInputHalf,
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
            t('select_account'),
          )}
          {renderAccountPicker(
            values.toAccountId,
            () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
            `${t('to_account')}: ${values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}`,
          )}
        </>
      );
    } else {
      // Single account picker for non-transfer
      return renderAccountPicker(
        values.accountId,
        () => !disabled && openPicker('account', accounts),
        t('select_account'),
      );
    }
  };

  // Render category picker with shortcuts
  const renderCategoryPicker = () => {
    if (values.type === 'transfer') return null;

    // If showing shortcuts (topCategoriesForType is available), render button layout
    if (topCategoriesForType && topCategoriesForType.length > 0) {
      // Handler for category button press
      const handleCategoryPress = (categoryId) => {
        if (!disabled) {
          setValues(v => ({ ...v, categoryId }));
        }
      };

      return (
        <View style={styles.categoryButtonsContainer}>
          {/* Button to open picker */}
          <Pressable
            style={[styles.categoryPickerButton, inputStyle, disabledStyle]}
            onPress={() => !disabled && openPicker('category', categories)}
            disabled={disabled}
          >
            <Icon name="format-list-bulleted" size={18} color={disabled ? colors.mutedText : colors.mutedText} />
          </Pressable>

          {/* Top 3 category shortcut buttons */}
          {topCategoriesForType.map((category, index) => {
            const categoryInfo = getCategoryInfo ? getCategoryInfo(category.id) : { name: category.name, icon: category.icon };
            const isSelected = values.categoryId === category.id;

            return (
              <Pressable
                key={category.id}
                style={[
                  styles.categoryShortcutButton,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                  disabledStyle,
                ]}
                onPress={() => handleCategoryPress(category.id)}
                disabled={disabled}
              >
                <Icon
                  name={categoryInfo.icon}
                  size={16}
                  color={isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text)}
                />
                <Text
                  style={[
                    styles.categoryShortcutText,
                    {
                      color: isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {categoryInfo.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    // Fallback: render single full-width picker (for OperationModal or when no top categories)
    return (
      <Pressable
        style={[styles.formInput, inputStyle, disabledStyle]}
        onPress={() => !disabled && openPicker('category', categories)}
        disabled={disabled}
      >
        {showFieldIcons && (
          <Icon name="tag" size={18} color={disabled ? colors.mutedText : colors.mutedText} />
        )}
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
      {isMultiCurrencyTransfer && sourceAccount && destinationAccount && onExchangeRateChange && onDestinationAmountChange && (
        <MultiCurrencyFields
          colors={colors}
          t={t}
          sourceAccount={sourceAccount}
          destinationAccount={destinationAccount}
          exchangeRate={values.exchangeRate || ''}
          destinationAmount={values.destinationAmount || ''}
          isShadowOperation={disabled}
          onExchangeRateChange={onExchangeRateChange}
          onDestinationAmountChange={onDestinationAmountChange}
        />
      )}
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
    exchangeRate: PropTypes.string,
    destinationAmount: PropTypes.string,
  }).isRequired,
  setValues: PropTypes.func.isRequired,
  accounts: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  topCategoriesForType: PropTypes.array,
  getCategoryInfo: PropTypes.func,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  onAmountChange: PropTypes.func.isRequired,
  onAdd: PropTypes.func,
  TYPES: PropTypes.array.isRequired,
  showTypeSelector: PropTypes.bool,
  showAccountBalance: PropTypes.bool,
  showFieldIcons: PropTypes.bool,
  transferLayout: PropTypes.oneOf(['sideBySide', 'stacked']),
  disabled: PropTypes.bool,
  containerBackground: PropTypes.string,
  onExchangeRateChange: PropTypes.func,
  onDestinationAmountChange: PropTypes.func,
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
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  categoryButtonsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  categoryPickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    padding: SPACING.md,
    width: 48,
  },
  categoryShortcutButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  categoryShortcutText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
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
    marginBottom: SPACING.md,
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
