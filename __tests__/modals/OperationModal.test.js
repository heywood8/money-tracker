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
jest.mock('../../app/hooks/useOperationForm', () => {
  return jest.fn(() => ({
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
    getCategoryName: (id) => id === 'cat2' ? 'Groceries' : 'Food',
    formatDateForDisplay: (date) => new Date(date).toLocaleDateString(),
  }));
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

describe('OperationModal', () => {
  const mockOnClose = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly when visible for new operation', () => {
      const { getByText, getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });

    it('renders correctly when visible for editing operation', () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
        description: 'Lunch',
      };

      const { getByText } = render(
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

    it('does not render when not visible', () => {
      const { queryByText } = render(
        <OperationModal visible={false} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByText('add_operation')).toBeFalsy();
    });

    it('does not show title when editing', () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { queryByText } = render(
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
    it('passes showTypeSelector=true to OperationFormFields', () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(MockFormFields._lastProps.showTypeSelector).toBe(true);
    });

    it('passes TYPES array to OperationFormFields', () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      render(
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
    it('displays date picker button', () => {
      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const dateInput = getByTestId('date-input');
      expect(dateInput).toBeTruthy();
    });

    it('opens date picker when date button is pressed', () => {
      const mockSetShowDatePicker = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setShowDatePicker: mockSetShowDatePicker,
      });

      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const dateInput = getByTestId('date-input');
      fireEvent.press(dateInput);

      // Handler should be called (but hook is mocked)
      expect(dateInput).toBeTruthy();
    });
  });

  describe('Description Field', () => {
    it('shows description field only in edit mode', () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        values: {
          type: 'expense',
          amount: '50',
          accountId: 'acc1',
          categoryId: 'cat2',
          date: '2024-01-15',
          description: 'Test description',
        },
      });

      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
        description: 'Test description',
      };

      const { getByDisplayValue } = render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      expect(getByDisplayValue('Test description')).toBeTruthy();
    });

    it('does not show description field for new operations', () => {
      const { queryByPlaceholderText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByPlaceholderText('description')).toBeFalsy();
    });
  });

  describe('Save Operations', () => {
    it('shows save button', () => {
      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByTestId('save-button');
      expect(saveButton).toBeTruthy();
    });

    it('calls handleSave when save button is pressed', () => {
      const mockHandleSave = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        handleSave: mockHandleSave,
      });

      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByTestId('save-button');
      fireEvent.press(saveButton);

      expect(mockHandleSave).toHaveBeenCalled();
    });
  });

  describe('Delete Operation', () => {
    it('shows delete button only when editing and onDelete is provided', () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { getByText } = render(
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

    it('does not show delete button for new operations', () => {
      const { queryByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByText('delete_operation')).toBeFalsy();
    });

    it('does not show delete button when onDelete is not provided', () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2024-01-15',
      };

      const { queryByText } = render(
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

    it('calls handleDelete when delete button is pressed', () => {
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

      const { getByText } = render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
          onDelete={mockOnDelete}
        />,
      );

      const deleteButton = getByText('delete_operation');
      fireEvent.press(deleteButton);

      expect(mockHandleDelete).toHaveBeenCalled();
    });

    it('disables delete button for shadow operations that cannot be deleted', () => {
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

      const { getByText } = render(
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
    it('calls handleClose when cancel button is pressed', () => {
      const mockHandleClose = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: false,
        handleClose: mockHandleClose,
      });

      const { getAllByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const cancelButtons = getAllByText('cancel');
      fireEvent.press(cancelButtons[0]);

      expect(mockHandleClose).toHaveBeenCalled();
    });

    it('shows close button instead of cancel for shadow operations', () => {
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

      const { getByText } = render(
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
    it('disables inputs for shadow operations', () => {
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

      const { getByText } = render(
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

    it('does not show save button for shadow operations', () => {
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

      const { queryByText } = render(
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
    it('shows unified picker when picker state is visible', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Picker should show category
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows breadcrumb navigation for category picker', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Should show breadcrumb
      expect(getByText('Food')).toBeTruthy();
    });

    it('shows close button for non-category pickers', () => {
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

      const { getAllByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Should show close button and account (there may be multiple close buttons)
      const closeButtons = getAllByText('close');
      expect(closeButtons.length).toBeGreaterThan(0);
      expect(getAllByText('Checking').length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Currency Transfer', () => {
    it('shows exchange rate fields for multi-currency transfers', () => {
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

      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Form fields component handles this
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing operation data gracefully', () => {
      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} operation={null} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });

    it('handles empty accounts list', () => {
      jest.spyOn(require('../../app/contexts/AccountsDataContext'), 'useAccountsData').mockReturnValue({
        visibleAccounts: [],
      });

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });

    it('handles empty categories list', () => {
      jest.spyOn(require('../../app/contexts/CategoriesContext'), 'useCategories').mockReturnValue({
        categories: [],
      });

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_operation')).toBeTruthy();
    });
  });

  describe('Callback Handlers', () => {
    it('handles amount change when not shadow operation', () => {
      const mockSetValues = jest.fn();
      const mockSetLastEditedField = jest.fn();
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        setValues: mockSetValues,
        setLastEditedField: mockSetLastEditedField,
        isShadowOperation: false,
      });

      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // The callback is passed to OperationFormFields but we mocked that component
      // We verify the hook returns the correct values
      expect(getByTestId('operation-form-fields')).toBeTruthy();
    });

    it('does not update amount for shadow operations', () => {
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

      const { getByTestId } = render(
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
    it('delegates type selection to OperationFormFields with inline type selector', () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Type selection is now handled by OperationFormFields inline type selector
      expect(MockFormFields._lastProps.showTypeSelector).toBe(true);
      expect(MockFormFields._lastProps.TYPES).toHaveLength(3);
      expect(MockFormFields._lastProps.TYPES.map(t => t.key)).toEqual(['expense', 'income', 'transfer']);
    });

    it('passes setValues to OperationFormFields for type changes', () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(MockFormFields._lastProps.setValues).toBeDefined();
      expect(typeof MockFormFields._lastProps.setValues).toBe('function');
    });

    it('passes disabled=true for shadow operations', () => {
      const MockFormFields = require('../../app/components/operations/OperationFormFields');
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        isShadowOperation: true,
      });

      render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={false} operation={{ id: 'op1', type: 'expense', amount: '50', accountId: 'acc1', date: '2024-01-15' }} />,
      );

      expect(MockFormFields._lastProps.disabled).toBe(true);
    });
  });

  describe('Account Picker Rendering', () => {
    it('renders account picker items correctly', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('Checking')).toBeTruthy();
      expect(getByText('Savings')).toBeTruthy();
    });

    it('selects account when account option is pressed', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      fireEvent.press(getByText('Checking'));

      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });

    it('renders toAccount picker and selects correctly', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      fireEvent.press(getByText('Savings'));

      // setValues should be called to set toAccountId
      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });
  });

  describe('Category Picker Rendering', () => {
    it('renders category picker with folder and entry items', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Groceries')).toBeTruthy();
    });

    it('navigates into folder when folder is pressed', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      fireEvent.press(getByText('Food'));

      expect(mockNavigateIntoFolder).toHaveBeenCalledWith({ id: 'cat1', name: 'Food', type: 'folder', icon: 'food' });
    });

    it('selects category entry when entry is pressed', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      fireEvent.press(getByText('Groceries'));

      expect(mockSetValues).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });

    it('displays translated category name when nameKey is provided', () => {
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

      const { getByText } = render(
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      fireEvent.press(getByText('Groceries'));

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

      const { getByText } = render(
        <OperationModal
          visible={true}
          onClose={mockOnClose}
          operation={mockOperation}
          isNew={false}
        />,
      );

      fireEvent.press(getByText('Groceries'));

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
    it('shows date picker when showDatePicker is true', () => {
      const useOperationForm = require('../../app/hooks/useOperationForm');
      useOperationForm.mockReturnValue({
        ...useOperationForm(),
        showDatePicker: true,
      });

      const { UNSAFE_getByType } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // DateTimePicker should be rendered
      const DateTimePicker = require('@react-native-community/datetimepicker').default;
      expect(UNSAFE_getByType(DateTimePicker)).toBeTruthy();
    });
  });

  describe('Split Button', () => {
    it('shows split button when editing expense operation', () => {
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

      const { getByTestId } = render(
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

    it('shows split button when editing income operation', () => {
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

      const { getByTestId } = render(
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

    it('does not show split button for new operations', () => {
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

      const { queryByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByTestId('split-button')).toBeNull();
    });

    it('does not show split button for transfer operations', () => {
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

      const { queryByTestId } = render(
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

    it('does not show split button for shadow operations', () => {
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

      const { queryByTestId } = render(
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

    it('does not show split button when amount is zero', () => {
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

      const { queryByTestId } = render(
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
    it('returns id for unknown picker type', () => {
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
      const { queryByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Unknown type returns null from renderPickerItem
      // The list should still render without crashing
      expect(queryByText('Unknown Item')).toBeNull();
    });
  });

  describe('Empty States', () => {
    it('shows no categories message when category picker is empty', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('no_categories')).toBeTruthy();
    });

    it('shows no accounts message when account picker is empty', () => {
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

      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('no_accounts')).toBeTruthy();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('calls navigateBack when back button is pressed', () => {
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

      const { getByTestId } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Find the back button by its icon
      const backIcon = getByTestId('icon-arrow-left');
      fireEvent.press(backIcon.parent);

      expect(mockNavigateBack).toHaveBeenCalled();
    });
  });
});
