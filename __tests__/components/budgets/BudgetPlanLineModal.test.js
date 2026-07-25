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
  it('refuses to save a line with no tracking target', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await waitFor(() => expect(getByTestId('calc-input')).toBeTruthy());
    await fireEvent.changeText(getByTestId('calc-input'), '100');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).not.toHaveBeenCalled();
    await waitFor(() => expect(getByTestId('plan-line-error')).toBeTruthy());
  });

  it('saves a category-linked line once a target is chosen', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    // Open the target picker and select the expense category.
    await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    await fireEvent.changeText(getByTestId('calc-input'), '150');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '150',
      categoryId: 'cat1',
      toAccountId: null,
    }));
  });

  it('saves an account (transfer) target line', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-tab-account')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-tab-account'));
    await waitFor(() => expect(getByTestId('plan-target-option-acc-1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-acc-1'));
    await fireEvent.changeText(getByTestId('calc-input'), '400');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '400',
      categoryId: null,
      toAccountId: 1,
    }));
  });

  it('income mode saves without requiring a target', async () => {
    const props = { ...baseProps(), mode: 'income', initialIncome: '1000' };
    const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
    expect(queryByTestId('plan-target-picker')).toBeNull();
    await waitFor(() => expect(getByTestId('calc-input')).toBeTruthy());
    await fireEvent.changeText(getByTestId('calc-input'), '2500');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveIncome).toHaveBeenCalledWith('2500');
  });

  describe('Recurring toggle (Budgets v3 phase 2)', () => {
    it('defaults a new line to one-off (isRecurring false, currency null)', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('calc-input'), '150');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ isRecurring: false, currency: null }));
    });

    it('the currency picker is hidden until the recurring toggle is on', async () => {
      const props = baseProps();
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      expect(queryByTestId('plan-line-currency-USD')).toBeNull();
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await waitFor(() => expect(getByTestId('plan-line-currency-USD')).toBeTruthy());
    });

    it('saves a recurring line with the chosen currency and no plan-specific target requirement change', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('calc-input'), '65000');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        amount: '65000', categoryId: 'cat1', isRecurring: true, currency: 'USD',
      }));
    });

    it('picking a different currency chip changes the saved currency', async () => {
      const props = { ...baseProps(), accounts: [...ACCOUNTS, { id: 2, name: 'Foreign', currency: 'EUR' }] };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-currency-EUR'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('calc-input'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' }));
    });

    it('initializes the toggle and currency from an existing recurring line when editing', async () => {
      const props = {
        ...baseProps(),
        line: {
          id: 'l1', amount: '65000', label: 'Rent', comment: null,
          categoryId: 'cat1', toAccountId: null, isRecurring: true, currency: 'EUR',
        },
      };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ isRecurring: true, currency: 'EUR' }));
    });
  });

  describe('saving prop (Bug 4, adversarial review — double-tap Save guard)', () => {
    it('disables the Save button while a save is in flight', async () => {
      const props = { ...baseProps(), saving: true };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      expect(getByTestId('plan-line-save').props.accessibilityState.disabled).toBe(true);
    });

    it('ignores a Save tap while saving=true, even if the disabled style has not applied yet', async () => {
      // Belt-and-suspenders: handleSave itself checks `saving` and bails, so a
      // tap that somehow lands on the button before its disabled prop commits
      // still can't fire a second onSaveLine.
      const props = { ...baseProps(), saving: true };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).not.toHaveBeenCalled();
    });

    it('re-enables the Save button once saving becomes false', async () => {
      const props = { ...baseProps(), saving: false };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      expect(getByTestId('plan-line-save').props.accessibilityState.disabled).toBe(false);
    });
  });
});
