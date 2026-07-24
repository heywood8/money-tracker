// __tests__/components/budgets/BudgetPlanLineModal.test.js
/* eslint-disable react/prop-types */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BudgetPlanLineModal from '../../../app/components/budgets/BudgetPlanLineModal';

const COLORS = {
  background: '#111318',
  surface: '#1a1d24',
  card: '#1a1d24',
  text: '#e8eaf0',
  mutedText: '#7a7f8e',
  border: '#252830',
  primary: '#4A90D9',
  secondary: '#333333',
  danger: '#ff5555',
  delete: '#ff6b6b',
  selected: '#2a2e38',
  inputBackground: '#333333',
  inputBorder: '#555555',
};

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({ colors: COLORS }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn() }),
}));
jest.mock('../../../app/components/ModalBlurOverlay', () => () => null);

// Simple controlled stand-in for the Calculator so tests can set the amount.
jest.mock('../../../app/components/Calculator', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return function MockCalculator({ value, onValueChange }) {
    return React.createElement(TextInput, {
      testID: 'calc-input',
      value: value != null ? String(value) : '',
      onChangeText: onValueChange,
    });
  };
});

const EXPENSE_CATEGORIES = [
  { id: 'cat1', name: 'Food', icon: 'food', categoryType: 'expense' },
];
const ACCOUNTS = [
  { id: 1, name: 'Savings', currency: 'USD' },
];

const baseProps = () => ({
  visible: true,
  mode: 'line',
  line: null,
  currency: 'USD',
  initialIncome: '0',
  expenseCategories: EXPENSE_CATEGORIES,
  accounts: ACCOUNTS,
  onSaveLine: jest.fn(),
  onSaveIncome: jest.fn(),
  onDeleteLine: jest.fn(),
  onClose: jest.fn(),
});

describe('BudgetPlanLineModal', () => {
  it('refuses to save a line with no tracking target', () => {
    const props = baseProps();
    const { getByTestId } = render(<BudgetPlanLineModal {...props} />);
    fireEvent.changeText(getByTestId('calc-input'), '100');
    fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).not.toHaveBeenCalled();
    expect(getByTestId('plan-line-error')).toBeTruthy();
  });

  it('saves a category-linked line once a target is chosen', async () => {
    const props = baseProps();
    const { getByTestId } = render(<BudgetPlanLineModal {...props} />);
    // Open the target picker and select the expense category.
    fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
    fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    fireEvent.changeText(getByTestId('calc-input'), '150');
    fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '150',
      categoryId: 'cat1',
      toAccountId: null,
    }));
  });

  it('saves an account (transfer) target line', async () => {
    const props = baseProps();
    const { getByTestId } = render(<BudgetPlanLineModal {...props} />);
    fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-tab-account')).toBeTruthy());
    fireEvent.press(getByTestId('plan-target-tab-account'));
    await waitFor(() => expect(getByTestId('plan-target-option-acc-1')).toBeTruthy());
    fireEvent.press(getByTestId('plan-target-option-acc-1'));
    fireEvent.changeText(getByTestId('calc-input'), '400');
    fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '400',
      categoryId: null,
      toAccountId: 1,
    }));
  });

  it('income mode saves without requiring a target', () => {
    const props = { ...baseProps(), mode: 'income', initialIncome: '1000' };
    const { getByTestId, queryByTestId } = render(<BudgetPlanLineModal {...props} />);
    expect(queryByTestId('plan-target-picker')).toBeNull();
    fireEvent.changeText(getByTestId('calc-input'), '2500');
    fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveIncome).toHaveBeenCalledWith('2500');
  });
});
