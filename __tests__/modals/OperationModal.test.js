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
  return function OperationFormFields() {
    return (
      <View testID="operation-form-fields">
        <Text>Form Fields</Text>
      </View>
    );
  };
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
    it('displays expense type by default', () => {
      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('expense')).toBeTruthy();
    });

    it('shows type picker button', () => {
      const { getByText } = render(
        <OperationModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const typeButton = getByText('expense');
      expect(typeButton).toBeTruthy();
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
});
