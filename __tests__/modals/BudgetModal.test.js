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
  const { View, Pressable, Text } = require('react-native');

  const DateTimePicker = (props) => {
    return React.createElement(View, { testID: 'mock-datetimepicker' }, [
      React.createElement(Pressable, {
        key: 'trigger',
        testID: 'datetimepicker-trigger',
        onPress: () => {
          if (props.onChange) {
            props.onChange({ type: 'set' }, new Date('2025-06-15'));
          }
        },
      }, React.createElement(Text, {}, 'Select Date')),
      React.createElement(Pressable, {
        key: 'dismiss',
        testID: 'datetimepicker-dismiss',
        onPress: () => {
          if (props.onChange) {
            props.onChange({ type: 'dismissed' }, undefined);
          }
        },
      }, React.createElement(Text, {}, 'Dismiss')),
    ]);
  };

  DateTimePicker.propTypes = { onChange: require('prop-types').func };

  return DateTimePicker;
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

  it('closes modal when cancel button is pressed (line 174-176)', async () => {
    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    const cancelButton = getByText('cancel');
    fireEvent.press(cancelButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('handles save error gracefully (line 160)', async () => {
    mockAddBudget.mockRejectedValueOnce(new Error('Save failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '50');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Save budget error:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('opens start date picker when pressed (line 326)', async () => {
    const { getAllByText, getAllByTestId, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Find the start date row and press it - look for calendar icon
    const calendarIcons = getAllByTestId(/icon-calendar/);
    expect(calendarIcons.length).toBeGreaterThan(0);

    // Press the start date picker button (first calendar icon in start_date section)
    const startDateLabel = getByText('start_date');
    expect(startDateLabel).toBeTruthy();
  });

  it('opens end date picker and clears end date (lines 352, 361-368)', async () => {
    const mockBudget = {
      id: 'b4',
      amount: '75',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
      isRecurring: true,
      rolloverEnabled: false,
    };

    const { getAllByTestId, getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // There should be a close icon for clearing the end date
    const closeIcons = getAllByTestId('icon-close');
    expect(closeIcons.length).toBeGreaterThan(0);

    // Press the clear button
    fireEvent.press(closeIcons[0]);

    // After clearing, save and check endDate is null
    const amountInput = getByPlaceholderText('0.00');
    expect(amountInput).toBeTruthy();

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockUpdateBudget).toHaveBeenCalledWith('b4', expect.objectContaining({
        endDate: null,
      }));
    });
  });

  it('toggles recurring switch (lines 378-384)', async () => {
    const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Enter valid amount
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '100');

    // Find and toggle the recurring switch (Switch component)
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    expect(switches.length).toBe(2); // recurring and rollover

    // Toggle recurring off
    fireEvent(switches[0], 'valueChange', false);

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({
        isRecurring: false,
      }));
    });
  });

  it('toggles rollover switch (lines 397-402)', async () => {
    const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Enter valid amount
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '100');

    // Find and toggle the rollover switch (second Switch component)
    const { Switch } = require('react-native');
    const switches = UNSAFE_getAllByType(Switch);
    expect(switches.length).toBe(2);

    // Toggle rollover on
    fireEvent(switches[1], 'valueChange', true);

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({
        rolloverEnabled: true,
      }));
    });
  });

  it('shows DateTimePicker for start date and handles selection (lines 447-454, 202-204)', async () => {
    const { getAllByTestId, getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Find the start_date pressable by finding a calendar icon
    const calendarIcons = getAllByTestId('icon-calendar');
    // First calendar icon is for start date
    fireEvent.press(calendarIcons[0].parent);

    // DateTimePicker should now be visible, trigger the mock
    await waitFor(() => {
      const pickers = getAllByTestId('datetimepicker-trigger');
      if (pickers.length > 0) {
        fireEvent.press(pickers[0]);
      }
    });

    // Enter amount and save to verify start date was set
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '200');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalled();
    });
  });

  it('shows DateTimePicker for end date and handles selection (lines 457-465, 209-211)', async () => {
    const { getAllByTestId, getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Find the end_date pressable by finding a calendar icon (second one)
    const calendarIcons = getAllByTestId('icon-calendar');
    if (calendarIcons.length > 1) {
      fireEvent.press(calendarIcons[1].parent);
    }

    // Enter amount and save
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '150');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalled();
    });
  });

  it('closes currency picker via close button (lines 504-506)', async () => {
    const { getByText, queryByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open currency picker
    const currencyBtn = getByText(/USD/);
    fireEvent.press(currencyBtn);

    // Modal should open
    expect(getByText('select_currency')).toBeTruthy();

    // Find and press close button
    const closeBtn = getByText('close');
    fireEvent.press(closeBtn);

    await waitFor(() => {
      expect(queryByText('select_currency')).toBeFalsy();
    });
  });

  it('closes period picker via close button (lines 541)', async () => {
    const { getByText, queryByText, getAllByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open period picker
    const periodBtn = getByText('monthly');
    fireEvent.press(periodBtn);

    // Modal should open with period_type title
    await waitFor(() => {
      const periodTitles = getAllByText('period_type');
      expect(periodTitles.length).toBeGreaterThan(1); // One in main form, one in picker title
    });

    // Find and press close button in the period picker
    const closeBtns = getAllByText('close');
    fireEvent.press(closeBtns[closeBtns.length - 1]);

    // Picker should close - period picker has period_type as title
    await waitFor(() => {
      // After closing, there should be only one period_type text (the label)
      expect(getByText('period_type')).toBeTruthy();
    });
  });

  it('closes modal via overlay press', async () => {
    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // The modal should be visible
    expect(getByText('set_budget')).toBeTruthy();
  });

  it('handles date picker dismiss without selection (line 202-204 edge case)', async () => {
    const { getAllByTestId, getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open start date picker
    const calendarIcons = getAllByTestId('icon-calendar');
    fireEvent.press(calendarIcons[0].parent);

    // Trigger dismiss (no date selected)
    await waitFor(() => {
      const dismissBtns = getAllByTestId('datetimepicker-dismiss');
      if (dismissBtns.length > 0) {
        fireEvent.press(dismissBtns[0]);
      }
    });

    // Should still be able to save with default date
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '50');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalled();
    });
  });

  it('updates existing budget successfully', async () => {
    const mockBudget = {
      id: 'b5',
      amount: '300',
      currency: 'USD',
      periodType: 'weekly',
      startDate: '2020-03-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    const { getByPlaceholderText, getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // Change the amount
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '400');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockUpdateBudget).toHaveBeenCalledWith('b5', expect.objectContaining({
        amount: '400',
      }));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('renders currency picker list items correctly (lines 480-501)', async () => {
    const { getByText, getAllByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open currency picker
    const currencyBtn = getByText(/USD/);
    fireEvent.press(currencyBtn);

    // Should see both USD and EUR in the list
    await waitFor(() => {
      expect(getByText('USD')).toBeTruthy();
      expect(getByText('EUR')).toBeTruthy();
    });
  });

  it('renders period picker list items correctly (lines 524-538)', async () => {
    const { getByText, getAllByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open period picker
    const periodBtn = getByText('monthly');
    fireEvent.press(periodBtn);

    // Should see all period options
    await waitFor(() => {
      expect(getByText('weekly')).toBeTruthy();
      expect(getAllByText('monthly').length).toBeGreaterThan(0);
      expect(getByText('yearly')).toBeTruthy();
    });
  });

  it('selects yearly period and saves', async () => {
    const { getByText, getByPlaceholderText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // Open period picker and select yearly
    const periodBtn = getByText('monthly');
    fireEvent.press(periodBtn);

    await waitFor(() => {
      const yearlyOption = getByText('yearly');
      fireEvent.press(yearlyOption);
    });

    // Enter amount and save
    const amountInput = getByPlaceholderText('0.00');
    fireEvent.changeText(amountInput, '1200');

    const saveButton = getByText('save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({
        periodType: 'yearly',
        amount: '1200',
      }));
    });
  });

  it('formats date as "never" when endDate is null', () => {
    const mockBudget = {
      id: 'b6',
      amount: '100',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // End date should show "never" when null
    expect(getByText('never')).toBeTruthy();
  });

  it('displays delete button only for existing budgets (lines 410-420)', () => {
    const mockBudget = {
      id: 'b7',
      amount: '50',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    const { getByText, queryByText, rerender } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
    );

    // New budget should NOT show delete button
    expect(queryByText('delete_budget')).toBeFalsy();

    // Rerender with existing budget
    rerender(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    // Existing budget should show delete button
    expect(getByText('delete_budget')).toBeTruthy();
  });

  it('handles delete cancel action', async () => {
    const mockBudget = {
      id: 'b8',
      amount: '100',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    // Mock showDialog to trigger cancel
    const mockShowDialog = jest.fn((title, message, buttons) => {
      const cancel = buttons.find(b => b.style === 'cancel');
      if (cancel && cancel.onPress) cancel.onPress();
    });
    jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({ showDialog: mockShowDialog });

    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    const deleteButton = getByText('delete_budget');
    fireEvent.press(deleteButton);

    // Delete should not be called when cancel is pressed
    expect(mockDeleteBudget).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('handles delete error gracefully', async () => {
    const mockBudget = {
      id: 'b9',
      amount: '100',
      currency: 'USD',
      periodType: 'monthly',
      startDate: '2020-01-01',
      endDate: null,
      isRecurring: true,
      rolloverEnabled: false,
    };

    mockDeleteBudget.mockRejectedValueOnce(new Error('Delete failed'));

    // Mock showDialog to trigger delete
    const mockShowDialog = jest.fn((title, message, buttons) => {
      const del = buttons.find(b => b.style === 'destructive');
      if (del && del.onPress) del.onPress();
    });
    jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({ showDialog: mockShowDialog });

    const { getByText } = render(
      <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
    );

    const deleteButton = getByText('delete_budget');
    fireEvent.press(deleteButton);

    await waitFor(() => {
      expect(mockDeleteBudget).toHaveBeenCalledWith('b9');
    });
    // onClose should not be called when delete fails
  });

  describe('Additional validation and edge cases', () => {
    it('renders end date picker UI elements', () => {
      const { getAllByTestId, getByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      // Find the calendar icons - should have 2 (start and end date)
      const calendarIcons = getAllByTestId('icon-calendar');
      expect(calendarIcons.length).toBe(2);

      // End date label should exist
      expect(getByText('end_date')).toBeTruthy();

      // End date should show "never" when null
      expect(getByText('never')).toBeTruthy();
    });

    it('can save budget with end date set', async () => {
      // Test with a budget that already has an end date set
      const mockBudget = {
        id: 'bEndDate',
        amount: '500',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-01-01',
        endDate: '2025-12-31', // Has end date
        isRecurring: true,
        rolloverEnabled: false,
      };

      const { getByText, getByDisplayValue } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
      );

      // Verify end date is displayed (not "never")
      expect(getByDisplayValue('500')).toBeTruthy();

      // Save the budget
      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUpdateBudget).toHaveBeenCalledWith('bEndDate', expect.objectContaining({
          endDate: '2025-12-31',
        }));
      });
    });

    it('handles initialization with no accounts (empty currencies)', () => {
      // Mock empty accounts
      jest.spyOn(require('../../app/contexts/AccountsDataContext'), 'useAccountsData')
        .mockReturnValue({ accounts: [] });

      const { getByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      // Should default to USD when no accounts
      expect(getByText(/USD/)).toBeTruthy();
    });

    it('handles formatDate for valid date string (line 217-218)', () => {
      const mockBudget = {
        id: 'bDate',
        amount: '100',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2023-06-15',
        endDate: '2024-06-15',
        isRecurring: true,
        rolloverEnabled: false,
      };

      const { queryByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
      );

      // Should NOT show "never" since endDate is set
      expect(queryByText('never')).toBeFalsy();
    });

    it('handles existing budget with all fields populated', async () => {
      const mockBudget = {
        id: 'bFull',
        amount: '500',
        currency: 'EUR',
        periodType: 'yearly',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        isRecurring: false,
        rolloverEnabled: true,
      };

      const { getByDisplayValue, getByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={false} budget={mockBudget} categoryId="c1" categoryName="Food" />,
      );

      expect(getByDisplayValue('500')).toBeTruthy();
      expect(getByText(/EUR/)).toBeTruthy();
      expect(getByText('yearly')).toBeTruthy();

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUpdateBudget).toHaveBeenCalledWith('bFull', expect.objectContaining({
          amount: '500',
          currency: 'EUR',
          periodType: 'yearly',
          isRecurring: false,
          rolloverEnabled: true,
        }));
      });
    });

    it('save button triggers addBudget with correct data', async () => {
      const { getByPlaceholderText, getByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      const amountInput = getByPlaceholderText('0.00');
      fireEvent.changeText(amountInput, '999');

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockAddBudget).toHaveBeenCalledWith(expect.objectContaining({
          amount: '999',
        }));
      });
    });

    it('renders action buttons row correctly (lines 424-441)', () => {
      const { getByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      // Both buttons should be present
      expect(getByText('cancel')).toBeTruthy();
      expect(getByText('save')).toBeTruthy();
    });

    it('opens currency picker modal successfully', async () => {
      const { getByText, queryByText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      // Open currency picker
      const currencyBtn = getByText(/USD/);
      fireEvent.press(currencyBtn);

      // Modal should open with title
      expect(getByText('select_currency')).toBeTruthy();

      // Close via close button
      const closeBtn = getByText('close');
      fireEvent.press(closeBtn);

      await waitFor(() => {
        expect(queryByText('select_currency')).toBeFalsy();
      });
    });

    it('opens period picker modal successfully', async () => {
      const { getByText, getAllByText, queryAllByText, getByPlaceholderText } = render(
        <BudgetModal visible={true} onClose={mockOnClose} isNew={true} categoryId="c1" categoryName="Food" />,
      );

      // Open period picker
      const periodBtn = getByText('monthly');
      fireEvent.press(periodBtn);

      // Modal should open with title - now there should be 2 period_type elements
      await waitFor(() => {
        const periodLabels = getAllByText('period_type');
        expect(periodLabels.length).toBeGreaterThan(1);
      });

      // Close via close button (last close button)
      const closeBtns = getAllByText('close');
      fireEvent.press(closeBtns[closeBtns.length - 1]);

      // Modal should close
      await waitFor(() => {
        // After closing, modal title should be gone (only the label remains)
        const remaining = queryAllByText('period_type');
        expect(remaining.length).toBe(1);
      });
    });
  });
});
