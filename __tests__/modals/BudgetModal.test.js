/**
 * Tests for BudgetModal Component
 */

import React from 'react';
import PropTypes from 'prop-types';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BudgetModal from '../../app/modals/BudgetModal';

// Mock theme colors
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      secondary: '#f0f0f0',
      mutedText: '#666666',
      inputBackground: '#f5f5f5',
      inputBorder: '#dddddd',
      error: '#ff6b6b',
      selected: '#e0e0e0',
      delete: '#ff3b30',
    },
  }),
}));

// Localization
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (k) => k,
  }),
}));

// Dialog context
jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn() }),
}));

// Mock DateTimePicker native module to avoid open handles in tests
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function DateTimePicker(props) {
    return React.createElement(View, { testID: 'mock-datetimepicker' });
  };
});

// Mock expo vector icons to simple Text element
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypesLocal = require('prop-types');
  const MCIcon = (props) => React.createElement(Text, { testID: `icon-${props.name}` }, props.name);
  MCIcon.propTypes = { name: PropTypesLocal.string };
  return { MaterialCommunityIcons: MCIcon };
});

// BalanceHistoryDB.formatDate used for initialization
jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: (d) => (d instanceof Date ? d.toISOString().split('T')[0] : d),
}));

const mockAddBudget = jest.fn();
const mockUpdateBudget = jest.fn();
const mockDeleteBudget = jest.fn();

// Budgets context
jest.mock('../../app/contexts/BudgetsContext', () => ({
  useBudgets: () => ({
    addBudget: mockAddBudget,
    updateBudget: mockUpdateBudget,
    deleteBudget: mockDeleteBudget,
  }),
}));

// Accounts data (to supply available currencies) - stable reference to avoid re-triggering effects
const _mockAccounts = [
  { id: 'a1', currency: 'USD' },
  { id: 'a2', currency: 'EUR' },
];
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({ accounts: _mockAccounts }),
}));

describe('BudgetModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when visible for new budget', () => {
    const { getByText, getByPlaceholderText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    expect(getByText('set_budget')).toBeTruthy();
    expect(getByText('budget_for_category: Food') || getByText('budget_for_category')).toBeTruthy();
    // Amount input placeholder
    expect(getByPlaceholderText('0.00')).toBeTruthy();
  });

  it('opens currency picker and selects currency', async () => {
    const { getByText, queryByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // find displayed currency value and press it
    const valueBtn = getByText(/USD/);
    fireEvent.press(valueBtn);

    // Currency modal should open
    expect(getByText('select_currency')).toBeTruthy();

    // Select EUR option (FlatList renders code text)
    const eurOption = getByText('EUR');
    fireEvent.press(eurOption);

    // Currency modal should close
    await waitFor(() => {
      expect(queryByText('select_currency')).toBeFalsy();
    });
  });

  it('validates amount and shows error when invalid', async () => {
    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(getByText('amount_must_be_greater_than_zero')).toBeTruthy();
    });
    expect(mockAddBudget).not.toHaveBeenCalled();
  });

  it('saves new budget with valid data', async () => {
    const { getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '123.45');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({
        categoryId: 'c1',
        amount: '123.45',
      }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('initializes form with existing budget and allows delete', async () => {
    const mockBudget = {
      id: 'b1',
      amount: '200',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    // Mock showDialog to trigger delete immediately
    const mockShowDialog = jest.fn((title, message, buttons) => {
      const del = buttons.find(b => b.style === 'destructive');
      if (del && del.onPress) del.onPress();
    });
    jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({ showDialog: mockShowDialog });

    const { getByText, getByDisplayValue } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    expect(getByText('edit_budget')).toBeTruthy();
    expect(getByDisplayValue('200')).toBeTruthy();

    const deleteButton = getByText('delete_budget');
    fireEvent.press(deleteButton);

    await waitFor(() => {
      expect(mockDeleteBudget).toHaveBeenCalledWith('b1');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('changes period type when selected from picker', async () => {
    const { getByText, queryByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // default period label is 'monthly'
    const periodBtn = getByText('monthly');
    fireEvent.press(periodBtn);

    // Period modal should open (options rendered)
    await waitFor(() => expect(getByText('weekly')).toBeTruthy());

    // Select 'weekly'
    const weeklyOption = getByText('weekly');
    fireEvent.press(weeklyOption);

    // Label should update to weekly after selection
    await waitFor(() => expect(getByText('weekly')).toBeTruthy());
  });

  it('shows error when end date is not after start date', async () => {
    const mockBudget = {
      id: 'b2',
      amount: '50',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-10',
      endDate: '2020-01-05',
      isRecurring: true,
      rolloverEnabled: false,
    };

    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // Attempt to save should trigger validation and not call update
    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockUpdateBudget).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  it('saves with recurring and rollover toggles applied', async () => {
    const mockBudget = {
      id: 'b3',
      amount: '100',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: false,
      rolloverEnabled: true,
    };

    const { getByText, getByDisplayValue } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // Ensure initial values reflected
    expect(getByDisplayValue('100')).toBeTruthy();

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockUpdateBudget).toHaveBeenCalledWith('b3', expect.objectContaining({
        isRecurring: false,
        rolloverEnabled: true,
      }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('selects EUR currency then saves with EUR', async () => {
    const { getByText, queryByText, getByPlaceholderText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open currency picker
    const valueBtn = getByText(/USD/);
    fireEvent.press(valueBtn);

    expect(getByText('select_currency')).toBeTruthy();

    // Select EUR
    const eurOption = getByText('EUR');
    fireEvent.press(eurOption);

    await waitFor(() => {
      expect(queryByText('select_currency')).toBeFalsy();
    });

    // Fill amount and save
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '9.99');
    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR', amount: '9.99' }));
    });
  });
});
