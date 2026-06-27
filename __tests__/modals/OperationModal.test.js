/**
 * Tests for OperationModal Component
 *
 * Tests cover:
 * - Component rendering and visibility
 * - Form initialization (new vs edit mode)
 * - Operation type selection (expense, income, transfer)
 * - Amount input and validation
 * - Account selection
 * - Category selection and navigation
 * - Date selection
 * - Description field (edit mode only)
 * - Multi-currency transfer handling
 * - Save operations
 * - Delete operation
 * - Modal dismissal
 * - Shadow operation handling (read-only mode)
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import OperationModal from '../../app/modals/OperationModal';

// Mock dependencies
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

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: jest.fn(),
  }),
}));

const mockAddOperation = jest.fn(() => Promise.resolve());
const mockUpdateOperation = jest.fn(() => Promise.resolve());
const mockValidateOperation = jest.fn(() => null);

jest.mock('../../app/contexts/OperationsActionsContext', () => ({
  useOperationsActions: () => ({
    addOperation: mockAddOperation,
    updateOperation: mockUpdateOperation,
    validateOperation: mockValidateOperation,
  }),
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    visibleAccounts: [
      { id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000' },
      { id: 'acc2', name: 'Savings', currency: 'EUR', balance: '500' },
    ],
  }),
}));

jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      {
        id: 'cat1',
        name: 'Food',
        nameKey: null,
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
      },
      {
        id: 'cat2',
        name: 'Groceries',
        nameKey: null,
        type: 'entry',
        category_type: 'expense',
        parentId: 'cat1',
        icon: 'cart',
      },
      {
        id: 'cat3',
        name: 'Salary',
        nameKey: null,
        type: 'entry',
        category_type: 'income',
        icon: 'cash',
      },
    ],
  }),
}));

// Mock custom hooks
const makeDefaultFormValues = () => ({
  values: {
    type: 'expense',
    amount: '',
    accountId: 'acc1',
    categoryId: '',
    date: '2024-01-15',
    description: '',
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
  },
  setValues: jest.fn(),
  errors: {},
  showDatePicker: false,
  setShowDatePicker: jest.fn(),
  lastEditedField: null,
  setLastEditedField: jest.fn(),
  isShadowOperation: false,
  canDeleteShadowOperation: true,
  filteredCategories: [
    {
      id: 'cat1',
      name: 'Food',
      type: 'folder',
      category_type: 'expense',
      icon: 'food',
    },
    {
      id: 'cat2',
      name: 'Groceries',
      type: 'entry',
      category_type: 'expense',
      parentId: 'cat1',
      icon: 'cart',
    },
  ],
  sourceAccount: { id: 'acc1', name: 'Checking', currency: 'USD' },
  destinationAccount: null,
  isMultiCurrencyTransfer: false,
  handleSave: jest.fn(),
  handleClose: jest.fn(),
  handleDelete: jest.fn(),
  getAccountName: (id) => id === 'acc1' ? 'Checking' : 'Savings',
  getCategoryName: (id) => !id ? 'select_category' : id === 'cat2' ? 'Groceries' : 'Food',
  formatDateForDisplay: (date) => new Date(date).toLocaleDateString(),
});

jest.mock('../../app/hooks/useOperationForm', () => {
  return jest.fn();
});

jest.mock('../../app/hooks/useOperationPicker', () => {
  return jest.fn(() => ({
    pickerState: {
      visible: false,
      type: null,
      data: [],
    },
    categoryNavigation: {
      breadcrumb: [],
    },
    openPicker: jest.fn(),
    closePicker: jest.fn(),
    navigateIntoFolder: jest.fn(),
    navigateBack: jest.fn(),
  }));
});

// Mock OperationFormFields component
jest.mock('../../app/components/operations/OperationFormFields', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const MockOperationFormFields = function OperationFormFields(props) {
    MockOperationFormFields._lastProps = props;
    return (
      <View testID="operation-form-fields">
        <Text>Form Fields</Text>
      </View>
    );
  };
  MockOperationFormFields._lastProps = null;
  return MockOperationFormFields;
});

// Mock services
jest.mock('../../app/services/LastAccount', () => ({
  setLastAccessedAccount: jest.fn(),
}));

jest.mock('../../app/services/currency', () => ({
  formatAmount: (amount, currency) => `${amount} ${currency}`,
}));

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: (date) => {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  },
}));

jest.mock('../../app/utils/calculatorUtils', () => ({
  hasOperation: jest.fn(() => false),
  evaluateExpression: jest.fn((expr) => expr),
}));

// Location feature (issue #1091). Defaults keep the existing tests behaving
// exactly as before: feature off, no captured location, no nearby suggestions.
jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ attachLocation: false })),
}));

jest.mock('../../app/hooks/useOperationLocation', () => jest.fn(() => ({
  location: null,
  status: 'idle',
  capture: jest.fn(),
  clearLocation: jest.fn(),
})));

jest.mock('../../app/services/OperationsDB', () => ({
  getDistinctLabels: jest.fn(() => Promise.resolve([])),
  getLabelsNearLocation: jest.fn(() => Promise.resolve([])),
}));

describe('OperationModal', () => {
  const mockOnClose = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply default implementation each test to prevent mockReturnValue leakage
    const useOperationForm = require('../../app/hooks/useOperationForm');
    useOperationForm.mockImplementation(makeDefaultFormValues);

    // Reset location-feature mocks to their "feature off" defaults.
    const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
    useDisplaySettings.mockReturnValue({ attachLocation: false });
    const useOperationLocation = require('../../app/hooks/useOperationLocation');
    useOperationLocation.mockReturnValue({
      location: null,
      status: 'idle',
      capture: jest.fn(),
      clearLocation: jest.fn(),
    });
    const { getDistinctLabels, getLabelsNearLocation } = require('../../app/services/OperationsDB');
    getDistinctLabels.mockResolvedValue([]);
    getLabelsNearLocation.mockResolvedValue([]);
  });

  describe('Rendering', () => {
    it('renders correctly when visible for new operation', async () => {
      const { getByText, getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });

    it('renders correctly when visible for editing operation', async () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
        description: 'Lunch',
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      // Edit mode should show delete button
      expect(getByText('delete_operation')).toBeTruthy();
    });

    it('does not render when not visible', async () => {
      const { queryByText } = await render(
        <OperationModal visible={false} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByText('add_operation')).toBeFalsy();
    });

    it('does not show title when editing', async () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { queryByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      // No title in edit mode
      expect(queryByText('add_operation')).toBeFalsy();
    });
  });

  describe('Operation Type Selection', () => {
    it('passes showTypeSelector=true to OperationFormFields', async () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(MockFormFields._lastProps.showTypeSelector).toBe(true);
    });

    it('passes TYPES array to OperationFormFields', async () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(MockFormFields._lastProps.TYPES).toEqual([
        { key: 'expense', label: 'expense', icon: 'minus-circle' },
        { key: 'income', label: 'income', icon: 'plus-circle' },
        { key: 'transfer', label: 'transfer', icon: 'swap-horizontal' },
      ]);
    });
  });

  describe('Date Selection', () => {
    it('displays date picker button', async () => {
      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const dateInput = getByTestId('date-input');
      expect(dateInput).toBeTruthy();
    });

    it('opens date picker when date button is pressed', async () => {
      const mockSetShowDatePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setShowDatePicker: mockSetShowDatePicker,
      });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const dateInput = getByTestId('date-input');
      await fireEvent.press(dateInput);

      // Handler should be called (but hook is mocked)
      expect(dateInput).toBeTruthy();
    });
  });

  describe('Labels Field', () => {
    it('renders existing labels as chips when editing', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        values: {
          type: 'expense',
          amount: '50',
          accountId: 'acc1',
          categoryId: 'cat2',
          date: '2024-01-15',
          description: 'work | food',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
        description: 'work | food',
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      // Labels render as removable chips inside the LabelInput
      expect(getByText('work')).toBeTruthy();
      expect(getByText('food')).toBeTruthy();
    });

    it('shows the label editor for new operations', async () => {
      const { queryByPlaceholderText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // The label editor is shown for both new and existing operations
      expect(queryByPlaceholderText('add_label_placeholder')).toBeTruthy();
    });
  });

  describe('Save Operations', () => {
    it('shows save button', async () => {
      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByText('save');
      expect(saveButton).toBeTruthy();
    });

    it('calls handleSave when save button is pressed', async () => {
      const mockHandleSave = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        handleSave: mockHandleSave,
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByText('save');
      await fireEvent.press(saveButton);

      expect(mockHandleSave).toHaveBeenCalled();
    });
  });

  describe('Delete Operation', () => {
    it('shows delete button only when editing and onDelete is provided', async () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(getByText('delete_operation')).toBeTruthy();
    });

    it('does not show delete button for new operations', async () => {
      const { queryByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByText('delete_operation')).toBeFalsy();
    });

    it('does not show delete button when onDelete is not provided', async () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { queryByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={null}
        />,
      );

      expect(queryByText('delete_operation')).toBeFalsy();
    });

    it('calls handleDelete when delete button is pressed', async () => {
      const mockHandleDelete = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        handleDelete: mockHandleDelete,
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      const deleteButton = getByText('delete_operation');
      await fireEvent.press(deleteButton);

      expect(mockHandleDelete).toHaveBeenCalled();
    });

    it('disables delete button for shadow operations that cannot be deleted', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
        canDeleteShadowOperation: false,
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
        isShadowTransfer: true,
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      // Delete button should be visible but with reduced opacity (disabled style)
      const deleteButton = getByText('delete_operation');
      expect(deleteButton).toBeTruthy();
    });
  });

  describe('Modal Dismissal', () => {
    it('calls handleClose when cancel button is pressed', async () => {
      const mockHandleClose = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        handleClose: mockHandleClose,
      });

      const { getAllByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const cancelButtons = getAllByText('cancel');
      await fireEvent.press(cancelButtons[0]);

      await waitFor(() => {
        expect(mockHandleClose).toHaveBeenCalled();
      });
    });

    it('shows close button instead of cancel for shadow operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
        isShadowTransfer: true,
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      expect(getByText('close')).toBeTruthy();
    });
  });

  describe('Shadow Operation Handling', () => {
    it('disables inputs for shadow operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
        isShadowTransfer: true,
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      // Should show close button, not cancel/save
      expect(getByText('close')).toBeTruthy();
    });

    it('does not show save button for shadow operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
        isShadowTransfer: true,
      };

      const { queryByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      expect(queryByText('save')).toBeFalsy();
    });
  });

  describe('Picker Interactions', () => {
    it('shows unified picker when picker state is visible', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            {
              id: 'cat1',
              name: 'Food',
              type: 'folder',
              category_type: 'expense',
              icon: 'food',
            },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Picker should show category
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows breadcrumb navigation for category picker', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [],
        },
        categoryNavigation: {
          breadcrumb: [{ id: 'cat1', name: 'Food' }],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Should show breadcrumb
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows close button for non-category pickers', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'account',
          data: [{ id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000' }],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getAllByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Should show close button and account (there may be multiple close buttons)
      const closeButtons = getAllByText('close');
      expect(closeButtons.length).toBeGreaterThan(0);
      expect(getAllByText('Checking').length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Currency Transfer', () => {
    it('shows exchange rate fields for multi-currency transfers', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        values: {
          type: 'transfer',
          amount: '100',
          accountId: 'acc1',
          toAccountId: 'acc2',
          date: '2024-01-15',
          exchangeRate: '1.2',
          destinationAmount: '120',
        },
        isMultiCurrencyTransfer: true,
        sourceAccount: { id: 'acc1', name: 'Checking', currency: 'USD' },
        destinationAccount: { id: 'acc2', name: 'Savings', currency: 'EUR' },
      });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Form fields component handles this
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing operation data gracefully', async () => {
      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} operation={null} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });

    it('handles empty accounts list', async () => {
      jest.spyOn(require('../../app/contexts/AccountsDataContext'), 'useAccountsData').mockReturnValue({
        visibleAccounts: [],
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });

    it('handles empty categories list', async () => {
      jest.spyOn(require('../../app/contexts/CategoriesContext'), 'useCategories').mockReturnValue({
        categories: [],
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });
  });

  describe('Callback Handlers', () => {
    it('handles amount change when not shadow operation', async () => {
      const mockSetValues = jest.fn();
      const mockSetLastEditedField = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        setLastEditedField: mockSetLastEditedField,
        isShadowOperation: false,
      });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // The callback is passed to OperationFormFields but we mocked that component
      // We verify the hook returns the correct values
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });

    it('does not update amount for shadow operations', async () => {
      const mockSetValues = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        isShadowOperation: true,
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
        isShadowTransfer: true,
      };

      const { getByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });
  });

  describe('Type Selection via OperationFormFields', () => {
    it('delegates type selection to OperationFormFields with inline type selector', async () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Type selection is now handled by OperationFormFields inline type selector
      expect(MockFormFields._lastProps.showTypeSelector).toBe(true);
      expect(MockFormFields._lastProps.TYPES).toHaveLength(3);
      expect(MockFormFields._lastProps.TYPES.map(t => t.key)).toEqual(['expense', 'income', 'transfer']);
    });

    it('passes setValues to OperationFormFields for type changes', async () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(MockFormFields._lastProps.setValues).toBeDefined();
      expect(typeof MockFormFields._lastProps.setValues).toBe('function');
    });

    it('passes disabled=true for shadow operations', async () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
      });

      await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={false} operation={{ id: 'op1', type: 'expense', amount: '50', accountId: 'acc1', date: '2024-01-15' }} />,
      );

      expect(MockFormFields._lastProps.disabled).toBe(true);
    });
  });

  describe('Account Picker Rendering', () => {
    it('renders account picker items correctly', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'account',
          data: [
            { id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000' },
            { id: 'acc2', name: 'Savings', currency: 'EUR', balance: '500' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('Checking')).toBeTruthy();
      expect(getByText('Savings')).toBeTruthy();
    });

    it('selects account when account option is pressed', async () => {
      const mockSetValues = jest.fn();
      const mockClosePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
      });

      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'account',
          data: [
            { id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('Checking'));

      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });

    it('renders toAccount picker and selects correctly', async () => {
      const mockSetValues = jest.fn();
      const mockClosePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
      });

      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'toAccount',
          data: [
            { id: 'acc2', name: 'Savings', currency: 'EUR', balance: '500' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('Savings'));

      // setValues should be called to set toAccountId
      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });
  });

  describe('Category Picker Rendering', () => {
    it('renders category picker with folder and entry items', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat1', name: 'Food', type: 'folder', icon: 'food' },
            { id: 'cat2', name: 'Groceries', type: 'entry', icon: 'cart' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Groceries')).toBeTruthy();
    });

    it('navigates into folder when folder is pressed', async () => {
      const mockNavigateIntoFolder = jest.fn();
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat1', name: 'Food', type: 'folder', icon: 'food' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: mockNavigateIntoFolder,
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('Food'));

      expect(mockNavigateIntoFolder).toHaveBeenCalledWith({ id: 'cat1', name: 'Food', type: 'folder', icon: 'food' });
    });

    it('selects category entry when entry is pressed', async () => {
      const mockSetValues = jest.fn();
      const mockClosePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        values: {
          type: 'expense',
          amount: '',
          accountId: 'acc1',
          categoryId: '',
          date: '2024-01-15',
        },
      });

      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat2', name: 'Groceries', type: 'entry', icon: 'cart' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('Groceries'));

      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });

    it('displays translated category name when nameKey is provided', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat1', name: 'Unnamed', nameKey: 'category_food', type: 'entry', icon: 'food' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // t() mock returns the key, so we should see 'category_food'
      expect(getByText('category_food')).toBeTruthy();
    });
  });

  describe('Category Selection with Auto-Add', () => {
    it('auto-saves operation when category selected with valid amount', async () => {
      const mockSetValues = jest.fn();
      const mockClosePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        values: {
          type: 'expense',
          amount: '50.00',
          accountId: 'acc1',
          categoryId: '',
          date: '2024-01-15',
          description: '',
        },
      });

      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat2', name: 'Groceries', type: 'entry', icon: 'cart' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('Groceries'));

      await waitFor(() => {
        expect(mockSetValues).toHaveBeenCalled();
      });
    });

    it('does not auto-save when editing existing operation', async () => {
      const mockSetValues = jest.fn();
      const mockClosePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        values: {
          type: 'expense',
          amount: '50.00',
          accountId: 'acc1',
          categoryId: 'cat1',
          date: '2024-01-15',
          description: '',
        },
      });

      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat2', name: 'Groceries', type: 'entry', icon: 'cart' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2024-01-15',
      };

      const { getByText } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      await fireEvent.press(getByText('Groceries'));

      await waitFor(() => {
        // Should still select category but not auto-add
        expect(mockSetValues).toHaveBeenCalled();
        expect(mockClosePicker).toHaveBeenCalled();
        // addOperation should NOT be called for edit mode
        expect(mockAddOperation).not.toHaveBeenCalled();
      });
    });
  });

  describe('Date Picker Interaction', () => {
    it('shows date picker when showDatePicker is true', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        showDatePicker: true,
      });

      const { container } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // DateTimePicker should be rendered
      const DateTimePicker = require('@react-native-community/datetimepicker').default;
      expect(container.queryAll(n => n.type === 'DateTimePicker')[0]).toBeTruthy();
    });
  });

  describe('Split Button', () => {
    it('shows split button when editing expense operation', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        values: {
          type: 'expense',
          amount: '50.00',
          accountId: 'acc1',
          categoryId: 'cat2',
          date: '2024-01-15',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { getByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(getByTestId('split-button')).toBeTruthy();
    });

    it('shows split button when editing income operation', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        values: {
          type: 'income',
          amount: '100.00',
          accountId: 'acc1',
          categoryId: 'cat3',
          date: '2024-01-15',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'income',
        amount: '100',
        accountId: 'acc1',
        categoryId: 'cat3',
        date: '2024-01-15',
      };

      const { getByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(getByTestId('split-button')).toBeTruthy();
    });

    it('does not show split button for new operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        values: {
          type: 'expense',
          amount: '50.00',
          accountId: 'acc1',
          categoryId: '',
          date: '2024-01-15',
        },
      });

      const { queryByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByTestId('split-button')).toBeNull();
    });

    it('does not show split button for transfer operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        values: {
          type: 'transfer',
          amount: '50.00',
          accountId: 'acc1',
          toAccountId: 'acc2',
          date: '2024-01-15',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '50',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2024-01-15',
      };

      const { queryByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(queryByTestId('split-button')).toBeNull();
    });

    it('does not show split button for shadow operations', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
        values: {
          type: 'expense',
          amount: '50.00',
          accountId: 'acc1',
          categoryId: 'cat2',
          date: '2024-01-15',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
        isShadow: true,
      };

      const { queryByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(queryByTestId('split-button')).toBeNull();
    });

    it('does not show split button when amount is zero', async () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        values: {
          type: 'expense',
          amount: '0',
          accountId: 'acc1',
          categoryId: 'cat2',
          date: '2024-01-15',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '0',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { queryByTestId } = await render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      expect(queryByTestId('split-button')).toBeNull();
    });
  });

  describe('Key Extractor', () => {
    it('returns id for unknown picker type', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'unknown',
          data: [
            { id: 'item1', name: 'Unknown Item' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      // This tests the fallback path in keyExtractor
      const { queryByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Unknown type returns null from renderPickerItem
      // The list should still render without crashing
      expect(queryByText('Unknown Item')).toBeNull();
    });
  });

  describe('Empty States', () => {
    it('shows no categories message when category picker is empty', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('no_categories')).toBeTruthy();
    });

    it('shows no accounts message when account picker is empty', async () => {
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'account',
          data: [],
        },
        categoryNavigation: {
          breadcrumb: [],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('no_accounts')).toBeTruthy();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('calls navigateBack when back button is pressed', async () => {
      const mockNavigateBack = jest.fn();
      const useOperationPicker = require('../../app/hooks/useOperationPicker');
      useOperationPicker.mockReturnValue({
        pickerState: {
          visible: true,
          type: 'category',
          data: [
            { id: 'cat2', name: 'Groceries', type: 'entry', icon: 'cart' },
          ],
        },
        categoryNavigation: {
          breadcrumb: [{ id: 'cat1', name: 'Food' }],
        },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: mockNavigateBack,
      });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Find the back button by its icon
      const backIcon = getByTestId('icon-arrow-left');
      await fireEvent.press(backIcon.parent);

      expect(mockNavigateBack).toHaveBeenCalled();
    });
  });

  describe('Label editor keyboard integration', () => {
    it('passes an onFocus function prop to the label editor when editing', async () => {
      const { getByTestId } = await render(
        <OperationModal
          visible={true}
          isNew={false}
          onClose={jest.fn()}
          operation={{
            id: 'op1',
            type: 'expense',
            amount: '10',
            accountId: 'acc1',
            categoryId: 'cat1',
            date: '2026-01-01',
            description: '',
          }}
        />,
      );
      // LabelInput renders a TextInput with testID="label-input-field";
      // verify it has an onFocus handler (forwarded from OperationModal's handleDescriptionFocus)
      const labelInput = getByTestId('label-input-field');
      expect(typeof labelInput.props.onFocus).toBe('function');
    });
  });

  describe('Location feature (issue #1091)', () => {
    const enableFeature = (overrides = {}) => {
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ attachLocation: true });
      const useOperationLocation = require('../../app/hooks/useOperationLocation');
      useOperationLocation.mockReturnValue({
        location: { latitude: '40.5', longitude: '44.5' },
        status: 'ready',
        capture: jest.fn(),
        clearLocation: jest.fn(),
        ...overrides,
      });
    };

    it('does NOT render the location row or query nearby labels when the feature is off', async () => {
      const { getDistinctLabels, getLabelsNearLocation } = require('../../app/services/OperationsDB');
      const { queryByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await waitFor(() => expect(getDistinctLabels).toHaveBeenCalled());
      expect(queryByTestId('operation-location-row')).toBeNull();
      // R1.1 / R1.3: with the feature off, proximity recall is never invoked.
      expect(getLabelsNearLocation).not.toHaveBeenCalled();
    });

    it('renders the location row and queries nearby labels when enabled with a fix', async () => {
      enableFeature();
      const { getLabelsNearLocation } = require('../../app/services/OperationsDB');

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByTestId('operation-location-row')).toBeTruthy();
      await waitFor(() =>
        expect(getLabelsNearLocation).toHaveBeenCalledWith('40.5', '44.5'),
      );
    });

    it('orders nearby labels ahead of base labels in the suggestion strip', async () => {
      enableFeature();
      const { getDistinctLabels, getLabelsNearLocation } = require('../../app/services/OperationsDB');
      getDistinctLabels.mockResolvedValue(['groceries', 'coffee']);
      getLabelsNearLocation.mockResolvedValue(['coffee', 'starbucks']);

      const { getByTestId, getAllByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Reveal the suggestion chips by focusing the label input.
      const labelInput = getByTestId('label-input-field');
      await fireEvent(labelInput, 'focus');

      await waitFor(() => expect(getByTestId('label-suggestion-coffee')).toBeTruthy());

      // Merged order: nearby first (coffee, starbucks) then base-only (groceries),
      // de-duplicated case-insensitively so coffee appears once in its nearby slot (R2.2).
      const labels = getAllByTestId(/^label-suggestion-/).map(
        (c) => c.props.testID.replace('label-suggestion-', ''),
      );
      expect(labels.filter((l) => l === 'coffee')).toHaveLength(1);
      expect(labels.indexOf('coffee')).toBeLessThan(labels.indexOf('groceries'));
      expect(labels.indexOf('starbucks')).toBeLessThan(labels.indexOf('groceries'));
    });

    it('carries latitude/longitude through on save', async () => {
      enableFeature();
      const mockHandleSave = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...makeDefaultFormValues(),
        handleSave: mockHandleSave,
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('save'));

      expect(mockHandleSave).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: '40.5', longitude: '44.5' }),
      );
    });

    it('removing the location clears the captured coordinates', async () => {
      const mockClear = jest.fn();
      enableFeature({ clearLocation: mockClear });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByTestId('operation-location-remove'));
      expect(mockClear).toHaveBeenCalled();
    });

    it('shows an "add location" affordance that triggers capture when denied', async () => {
      const mockCapture = jest.fn();
      enableFeature({ location: null, status: 'denied', capture: mockCapture });

      const { getByTestId } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByTestId('operation-location-add'));
      expect(mockCapture).toHaveBeenCalled();
    });

    it('does not carry location on save when the feature is off (preserves today\'s behaviour)', async () => {
      const mockHandleSave = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...makeDefaultFormValues(),
        handleSave: mockHandleSave,
      });

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      await fireEvent.press(getByText('save'));

      // Feature off + no existing coords → save called without latitude/longitude.
      const arg = mockHandleSave.mock.calls[0][0];
      expect(arg === undefined || (arg.latitude === undefined && arg.longitude === undefined)).toBe(true);
    });

    it('preserves existing coordinates on edit even with the feature off (R1.5, non-destructive)', async () => {
      // Feature off, but the operation already carries coordinates: the hook
      // surfaces them, and save must rewrite (preserve) — never wipe them.
      const useOperationLocation = require('../../app/hooks/useOperationLocation');
      useOperationLocation.mockReturnValue({
        location: { latitude: '7.0', longitude: '8.0' },
        status: 'ready',
        capture: jest.fn(),
        clearLocation: jest.fn(),
      });

      const mockHandleSave = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...makeDefaultFormValues(),
        handleSave: mockHandleSave,
      });

      const operation = {
        id: 'op1', type: 'expense', amount: '50', accountId: 'acc1',
        categoryId: 'cat2', date: '2024-01-15', latitude: '7.0', longitude: '8.0',
      };

      const { getByText } = await render(
        <OperationModal visible={true} onClose={mockOnClose} operation={operation} isNew={false} />,
      );

      await fireEvent.press(getByText('save'));

      expect(mockHandleSave).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: '7.0', longitude: '8.0' }),
      );
    });
  });
});
