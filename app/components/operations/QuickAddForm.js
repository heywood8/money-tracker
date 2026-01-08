import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Calculator from '../Calculator';
import { useTheme } from '../../contexts/ThemeContext';
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

  return (
    <View style={[styles.quickAddForm, containerThemed]}>
      <View style={innerCardThemed}>
        {/* Type Selector */}
        <View style={styles.typeSelector}>
          {TYPES.map(type => (
            <Pressable
              key={type.key}
              style={[
                styles.typeButton,
                {
                  backgroundColor: quickAddValues.type === type.key ? colors.primary : colors.inputBackground,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => setQuickAddValues(v => ({
                ...v,
                type: type.key,
                categoryId: type.key === 'transfer' ? '' : v.categoryId,
                toAccountId: '',
              }))}
            >
              <Icon
                name={type.icon}
                size={18}
                color={quickAddValues.type === type.key ? '#fff' : colors.text}
              />
              <Text style={quickAddValues.type === type.key ? [styles.typeButtonText, { color: '#fff' }] : [styles.typeButtonText, { color: colors.text }]}>
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Account Pickers - Side by side for transfers */}
        {quickAddValues.type === 'transfer' ? (
          <View style={styles.accountPickersRow}>
            {/* From Account Picker */}
            <Pressable
              style={[styles.formInputHalf, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
              onPress={() => openPicker('account', visibleAccounts)}
            >
              <Icon name="wallet" size={18} color={colors.mutedText} />
              <View style={styles.flex1}>
                <Text style={[styles.formInputText, { color: colors.text }]} numberOfLines={1}>
                  {quickAddValues.accountId ? getAccountName(quickAddValues.accountId) : t('select_account')}
                </Text>
                {quickAddValues.accountId && (
                  <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
                    {getAccountBalance(quickAddValues.accountId)}
                  </Text>
                )}
              </View>
              <Icon name="chevron-down" size={18} color={colors.mutedText} />
            </Pressable>

            {/* To Account Picker */}
            <Pressable
              style={[styles.formInputHalf, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
              onPress={() => openPicker('toAccount', visibleAccounts.filter(acc => acc.id !== quickAddValues.accountId))}
            >
              <Icon name="swap-horizontal" size={18} color={colors.mutedText} />
              <View style={styles.flex1}>
                <Text style={[styles.formInputText, { color: colors.text }]} numberOfLines={1}>
                  {quickAddValues.toAccountId ? getAccountName(quickAddValues.toAccountId) : t('to_account')}
                </Text>
                {quickAddValues.toAccountId && (
                  <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
                    {getAccountBalance(quickAddValues.toAccountId)}
                  </Text>
                )}
              </View>
              <Icon name="chevron-down" size={18} color={colors.mutedText} />
            </Pressable>
          </View>
        ) : (
        /* Account Picker for non-transfer operations */
          <Pressable
            style={[styles.formInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => openPicker('account', visibleAccounts)}
          >
            <Icon name="wallet" size={18} color={colors.mutedText} />
            <View style={styles.flex1}>
              <Text style={[styles.formInputText, { color: colors.text }]}>
                {quickAddValues.accountId ? getAccountName(quickAddValues.accountId) : t('select_account')}
              </Text>
              {quickAddValues.accountId && (
                <Text style={[styles.accountBalanceText, { color: colors.mutedText }]}>
                  {getAccountBalance(quickAddValues.accountId)}
                </Text>
              )}
            </View>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </Pressable>
        )}

        {/* Amount Calculator */}
        <Calculator
          value={quickAddValues.amount}
          onValueChange={text => setQuickAddValues(v => ({ ...v, amount: text }))}
          colors={colors}
          placeholder={t('amount')}
          onAdd={handleQuickAdd}
        />

        {/* Category Picker */}
        {quickAddValues.type !== 'transfer' && (
          <Pressable
            style={[styles.formInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => openPicker('category', filteredCategories)}
          >
            <Icon name="tag" size={18} color={colors.mutedText} />
            <Text style={[styles.formInputText, { color: colors.text }]}>
              {getCategoryName(quickAddValues.categoryId)}
            </Text>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </Pressable>
        )}
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
  accountBalanceText: {
    fontSize: 12,
    marginTop: 2,
  },
  accountPickersRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
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

export default QuickAddForm;
