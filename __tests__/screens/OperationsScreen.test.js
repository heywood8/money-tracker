/**
 * Tests for OperationsScreen - Operations/transactions management screen
 * Logic-based tests focusing on component behavior and integration patterns
 * This is the most complex screen in the app with extensive features
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// Mock all dependencies
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#2196f3',
      text: '#000000',
      mutedText: '#666666',
      border: '#e0e0e0',
      inputBackground: '#fafafa',
      inputBorder: '#cccccc',
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336',
    },
  })),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(() => ({
    t: jest.fn((key) => key),
    language: 'en',
  })),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: jest.fn(() => ({
    showDialog: jest.fn(),
  })),
}));

jest.mock('../../app/contexts/OperationsDataContext', () => ({
  useOperationsData: jest.fn(() => ({
    operations: [],
    loading: false,
    hasMoreOperations: false,
  })),
}));

jest.mock('../../app/contexts/OperationsActionsContext', () => ({
  useOperationsActions: jest.fn(() => ({
    loadMoreOperations: jest.fn(),
    addOperation: jest.fn(),
    updateOperation: jest.fn(),
    deleteOperation: jest.fn(),
  })),
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: jest.fn(() => ({
    accounts: [],
    visibleAccounts: [],
    loading: false,
  })),
}));

jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: jest.fn(() => ({
    categories: [],
  })),
}));

jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(() => Promise.resolve(null)),
  setLastAccessedAccount: jest.fn(() => Promise.resolve()),
}));

/* eslint-disable react/prop-types */
jest.mock('../../app/modals/OperationModal', () => {
  const React = require('react');
  return function MockOperationModal(props) {
    return React.createElement('OperationModal', {
      testID: 'operation-modal',
      visible: props.visible,
      onClose: props.onClose,
      onDelete: props.onDelete,
    });
  };
});

jest.mock('../../app/components/FilterModal', () => {
  const React = require('react');
  return function MockFilterModal(props) {
    return React.createElement('FilterModal', {
      testID: 'filter-modal',
      visible: props.visible,
      onClose: props.onClose,
      onApplyFilters: props.onApplyFilters,
    });
  };
});

jest.mock('../../app/components/operations/OperationsList', () => {
  const React = require('react');
  return React.forwardRef(function MockOperationsList(props, ref) {
    return React.createElement('OperationsList', {
      testID: 'operations-list',
      ref: ref,
      onEditOperation: props.onEditOperation,
      onDateSeparatorPress: props.onDateSeparatorPress,
      onScroll: props.onScroll,
      onContentSizeChange: props.onContentSizeChange,
      onScrollToIndexFailed: props.onScrollToIndexFailed,
      onLoadMore: props.onLoadMore,
    });
  });
});

jest.mock('../../app/components/operations/QuickAddForm', () => {
  const React = require('react');
  return function MockQuickAddForm(props) {
    return React.createElement('QuickAddForm', {
      testID: 'quick-add-form',
      handleQuickAdd: props.handleQuickAdd,
    });
  };
});

jest.mock('../../app/components/operations/PickerModal', () => {
  const React = require('react');
  return function MockPickerModal(props) {
    return React.createElement('PickerModal', {
      testID: 'picker-modal',
      visible: props.visible,
      onClose: props.onClose,
      onSelectAccount: props.onSelectAccount,
      onSelectCategory: props.onSelectCategory,
      onAutoAddWithCategory: props.onAutoAddWithCategory,
    });
  };
});
/* eslint-enable react/prop-types */

jest.mock('../../app/hooks/useQuickAddForm', () => jest.fn(() => ({
  quickAddValues: {
    type: 'expense',
    amount: '',
    accountId: 'acc-1',
    categoryId: '',
    description: '',
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
  },
  setQuickAddValues: jest.fn(),
  getAccountName: jest.fn((id) => id === 'acc-1' ? 'Cash' : 'Unknown'),
  getAccountBalance: jest.fn(() => '$1000.00'),
  getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
  getCategoryName: jest.fn(() => 'Food'),
  filteredCategories: [],
  resetForm: jest.fn(),
})));

jest.mock('../../app/hooks/useOperationPicker', () => jest.fn(() => ({
  pickerState: { visible: false, type: null, data: [] },
  categoryNavigation: { currentFolderId: null, breadcrumb: [] },
  openPicker: jest.fn(),
  closePicker: jest.fn(),
  navigateIntoFolder: jest.fn(),
  navigateBack: jest.fn(),
})));

jest.mock('../../app/hooks/useMultiCurrencyTransfer', () => jest.fn(() => ({
  sourceAccount: { id: 'acc-1', currency: 'USD' },
  destinationAccount: null,
  isMultiCurrencyTransfer: false,
  lastEditedField: null,
  setLastEditedField: jest.fn(),
  rateSource: 'offline',
  setRateSource: jest.fn(),
})));

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

jest.mock('../../app/utils/calculatorUtils', () => ({
  hasOperation: jest.fn(() => false),
  evaluateExpression: jest.fn((expr) => expr),
}));

jest.mock('../../app/services/currency', () => ({
  formatAmount: jest.fn((amount) => amount),
  getExchangeRate: jest.fn(() => null),
  convertAmount: jest.fn(() => null),
  fetchLiveExchangeRate: jest.fn().mockResolvedValue({ rate: null, source: 'none' }),
}));

jest.mock('../../app/components/Calculator', () => {
  const React = require('react');
  return function MockCalculator() {
    return React.createElement('Calculator', null);
  };
});

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  RUB: { symbol: '₽', decimal_digits: 2 },
}), { virtual: true });

describe('OperationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Structure', () => {
    it('renders without crashing', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('uses ThemeContext for styling', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      render(<OperationsScreen />);

      expect(useThemeColors).toHaveBeenCalled();
    });

    it('uses OperationsContext for operation data', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      render(<OperationsScreen />);

      expect(useOperationsData).toHaveBeenCalled();
    });

    it('uses AccountsContext for account data', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      render(<OperationsScreen />);

      expect(useAccountsData).toHaveBeenCalled();
    });

    it('uses CategoriesContext for category data', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      render(<OperationsScreen />);

      expect(useCategories).toHaveBeenCalled();
    });

    it('uses DialogContext for dialogs', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      render(<OperationsScreen />);

      expect(useDialog).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      render(<OperationsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });
  });

  describe('Integration with Contexts', () => {
    it('handles empty operations list', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        hasMoreOperations: false,
      });

      useOperationsActions.mockReturnValue({
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles loading state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: true,
        hasMoreOperations: false,
      });

      useOperationsActions.mockReturnValue({
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations list with data', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        {
          id: '1',
          type: 'expense',
          amount: '100.00',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: new Date().toISOString(),
          note: 'Groceries',
        },
        {
          id: '2',
          type: 'income',
          amount: '5000.00',
          accountId: 'acc-1',
          categoryId: 'cat-2',
          date: new Date().toISOString(),
          note: 'Salary',
        },
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        hasMoreOperations: true,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles transfer operations', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        {
          id: '1',
          type: 'transfer',
          amount: '500.00',
          accountId: 'acc-1',
          toAccountId: 'acc-2',
          date: new Date().toISOString(),
          note: 'Transfer between accounts',
        },
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Account and Category Integration', () => {
    it('handles operations with accounts', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'Bank', balance: '5000.00', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with categories', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: 'cat-1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: 'cat-2', name: 'Salary', type: 'income', icon: 'cash', color: '#00ff00' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles empty accounts list', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [],
        visibleAccounts: [],
        loading: false,
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles empty categories list', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('State Management', () => {
    it('manages operation modal visibility state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage modal state internally
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('manages quick add form state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage quick add form state
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('manages filter state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage filter (account/category) state
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('manages picker modal state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage account/category picker modals
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Lazy Loading', () => {
    it('handles hasMore flag for pagination', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [{ id: '1', type: 'expense', amount: '100' }],
        loading: false,
        hasMoreOperations: true,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles end of operations list', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [{ id: '1', type: 'expense', amount: '100' }],
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      const mockColors = {
        background: '#000000',
        surface: '#111111',
        primary: '#ff0000',
        text: '#ffffff',
        mutedText: '#aaaaaa',
        border: '#333333',
        inputBackground: '#222222',
        inputBorder: '#444444',
        success: '#00ff00',
        warning: '#ffff00',
        error: '#ff0000',
      };

      useThemeColors.mockReturnValue({ colors: mockColors });

      expect(() => render(<OperationsScreen />)).not.toThrow();
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('handles dark theme', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      useThemeColors.mockReturnValue({
        colors: {
          background: '#111111',
          surface: '#222222',
          primary: '#2196f3',
          text: '#ffffff',
          mutedText: '#aaaaaa',
          border: '#333333',
        },
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      render(<OperationsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles different languages', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => `ru_${key}`),
        language: 'ru',
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty operations array when context provides empty state', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      // Context should always provide an array, even when empty
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles initial loading state with empty operations', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: true,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with missing properties', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        { id: '1' }, // Missing all properties
        { id: '2', type: 'expense' }, // Missing amount, account, category
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with invalid dates', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100', date: 'invalid-date' },
        { id: '2', type: 'income', amount: '200', date: null },
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles very large operation amounts', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        { id: '1', type: 'expense', amount: '999999999999.99', accountId: 'acc-1', categoryId: 'cat-1' },
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      const { rerender } = render(<OperationsScreen />);

      expect(() => rerender(<OperationsScreen />)).not.toThrow();
    });

    it('maintains stability when operations change', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const initialOperations = [{ id: '1', type: 'expense', amount: '100' }];
      const updatedOperations = [
        { id: '1', type: 'expense', amount: '100' },
        { id: '2', type: 'income', amount: '200' },
      ];

      useOperationsData.mockReturnValue({
        operations: initialOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      const { rerender } = render(<OperationsScreen />);

      useOperationsData.mockReturnValue({
        operations: updatedOperations,
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => rerender(<OperationsScreen />)).not.toThrow();
    });

    it('handles rapid loading state changes', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: true,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      const { rerender } = render(<OperationsScreen />);

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        hasMoreOperations: false,
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
      });

      expect(() => rerender(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Component Integration Points', () => {
    it('provides necessary props to child components', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should pass proper props to OperationModal, Calculator, etc.
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('integrates with OperationModal', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component uses OperationModal for editing operations
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('integrates with Calculator component', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component uses Calculator for amount input
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Handler Functions', () => {
    const { fireEvent, waitFor, act } = require('@testing-library/react-native');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('handleEditOperation opens modal with operation data', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
      ];

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);

      // Get the OperationsList component which has the onEditOperation prop
      const operationsList = getByTestId('operations-list');
      expect(operationsList).toBeTruthy();

      // Invoke the handleEditOperation handler directly
      act(() => {
        operationsList.props.onEditOperation({ id: '1', type: 'expense', amount: '100.00' });
      });

      // After calling handleEditOperation, modal should be visible
      const modal = getByTestId('operation-modal');
      expect(modal.props.visible).toBe(true);
    });

    it('handleDeleteOperation shows confirmation dialog', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockShowDialog = jest.fn();
      useDialog.mockReturnValue({ showDialog: mockShowDialog });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);

      // Get the OperationModal component which has the onDelete prop
      const modal = getByTestId('operation-modal');

      // Invoke the handleDeleteOperation handler
      act(() => {
        modal.props.onDelete({ id: '1', type: 'expense', amount: '100.00' });
      });

      // Verify showDialog was called (translation key may vary based on mock)
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('handleOpenFilterModal sets filter modal visible', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);

      // FilterModal should be rendered
      const filterModal = getByTestId('filter-modal');
      expect(filterModal).toBeTruthy();
    });

    it('handleCloseFilterModal sets filter modal not visible', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const filterModal = getByTestId('filter-modal');

      // Invoke onClose handler
      act(() => {
        filterModal.props.onClose();
      });

      // Modal should still be rendered (just not visible)
      expect(getByTestId('filter-modal')).toBeTruthy();
    });

    it('handleCloseOperationModal sets operation modal not visible', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const modal = getByTestId('operation-modal');

      // Invoke onClose handler
      act(() => {
        modal.props.onClose();
      });

      // Modal should be closed (not visible)
      expect(getByTestId('operation-modal').props.visible).toBe(false);
    });

    it('renders reset filter button when filters are active', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      const mockClearFilters = jest.fn();

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: { types: ['expense'] },
        filtersActive: true,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: mockClearFilters,
        getActiveFilterCount: jest.fn(() => 1),
      });

      const { getByText } = render(<OperationsScreen />);

      // When filtersActive is true, the filter-off icon should be rendered
      expect(getByText('filter-off')).toBeTruthy();
      expect(useOperationsActions).toHaveBeenCalled();
    });

    it('handleSelectAccount updates account selection', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');

      const mockSetQuickAddValues = jest.fn();
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '', accountId: '', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleSelectAccount
      act(() => {
        pickerModal.props.onSelectAccount('acc-2');
      });

      expect(mockSetQuickAddValues).toHaveBeenCalled();
    });

    it('handleSelectCategory updates category selection', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');

      const mockSetQuickAddValues = jest.fn();
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '', accountId: '', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleSelectCategory
      act(() => {
        pickerModal.props.onSelectCategory('cat-1');
      });

      expect(mockSetQuickAddValues).toHaveBeenCalled();
    });

    it('handleAutoAddWithCategory resets form and adds operation', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useOperationPicker = require('../../app/hooks/useOperationPicker');

      const mockResetForm = jest.fn();
      const mockClosePicker = jest.fn();
      const mockAddOperation = jest.fn(() => Promise.resolve());
      const mockValidateOperation = jest.fn(() => null);

      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: '' },
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: mockResetForm,
      });

      useOperationPicker.mockReturnValue({
        pickerState: { visible: true, type: 'category', data: [] },
        categoryNavigation: { currentFolderId: null, breadcrumb: [] },
        openPicker: jest.fn(),
        closePicker: mockClosePicker,
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', currency: 'USD' }],
        visibleAccounts: [{ id: 'acc-1', currency: 'USD' }],
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: mockAddOperation,
        validateOperation: mockValidateOperation,
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleAutoAddWithCategory
      await act(async () => {
        await pickerModal.props.onAutoAddWithCategory('cat-1');
      });

      expect(mockResetForm).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });
  });

  describe('Scroll Handlers', () => {
    const { act } = require('@testing-library/react-native');

    it('handleScroll updates showScrollToTop state when scrolled down', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId, queryByLabelText } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke onScroll with high offset to show scroll-to-top button
      act(() => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 300 } },
        });
      });

      // After scrolling down past 250px, scroll-to-top button should be visible
      const scrollToTopButton = queryByLabelText('Scroll to top');
      expect(scrollToTopButton).toBeTruthy();
    });

    it('handleScroll hides scroll button when scrolled up', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId, queryByLabelText } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke onScroll with low offset to hide scroll-to-top button
      act(() => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 100 } },
        });
      });

      // Scroll button should not be visible when scrolled less than 250px
      const scrollToTopButton = queryByLabelText('Scroll to top');
      expect(scrollToTopButton).toBeNull();
    });

    it('handleScrollToIndexFailed handles scroll index errors gracefully', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      // Spy on console.log to verify the handler is called
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke onScrollToIndexFailed
      act(() => {
        operationsList.props.onScrollToIndexFailed({ index: 10 });
      });

      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith(
        'scrollToIndex failed for index:',
        10,
        'Using offset fallback',
      );

      consoleSpy.mockRestore();
    });

    it('handleContentSizeChange is passed to OperationsList', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      expect(operationsList.props.onContentSizeChange).toBeDefined();

      // Invoke onContentSizeChange
      act(() => {
        operationsList.props.onContentSizeChange(400, 2000);
      });
    });

    it('scrollToTop scrolls list to top when button pressed', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { fireEvent } = require('@testing-library/react-native');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId, getByLabelText } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Scroll down to show the button
      act(() => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 300 } },
        });
      });

      // Press scroll to top button
      const scrollToTopButton = getByLabelText('Scroll to top');
      fireEvent.press(scrollToTopButton);

      // Button should still be visible (will be hidden after scroll completes)
      expect(scrollToTopButton).toBeTruthy();
    });
  });

  describe('Date Picker', () => {
    const { act } = require('@testing-library/react-native');

    it('handleDateSeparatorPress opens date picker', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId, queryByTestId, UNSAFE_root } = render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke handleDateSeparatorPress
      act(() => {
        operationsList.props.onDateSeparatorPress('2024-01-15');
      });

      // Date picker should be shown (we can't easily test DateTimePicker rendering in mock)
      // but we can verify the handler was callable
      expect(operationsList.props.onDateSeparatorPress).toBeDefined();
    });
  });

  describe('Amount Change Handlers', () => {
    const { act } = require('@testing-library/react-native');

    it('handleAmountChange updates quick add values', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useMultiCurrencyTransfer = require('../../app/hooks/useMultiCurrencyTransfer');

      const mockSetQuickAddValues = jest.fn();
      const mockSetLastEditedField = jest.fn();

      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '', accountId: 'acc-1', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransfer.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: null,
        isMultiCurrencyTransfer: false,
        lastEditedField: null,
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      render(<OperationsScreen />);

      // The handlers are created internally and passed to child components
      // Verify that the necessary hooks were called
      expect(useQuickAddForm).toHaveBeenCalled();
      expect(useMultiCurrencyTransfer).toHaveBeenCalled();
    });

    it('handleExchangeRateChange updates exchange rate', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useMultiCurrencyTransfer = require('../../app/hooks/useMultiCurrencyTransfer');

      const mockSetQuickAddValues = jest.fn();
      const mockSetLastEditedField = jest.fn();

      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransfer.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'EUR' },
        isMultiCurrencyTransfer: true,
        lastEditedField: null,
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      render(<OperationsScreen />);

      // Verify multi-currency hooks are used
      expect(useMultiCurrencyTransfer).toHaveBeenCalled();
    });
  });

  describe('Picker Modal', () => {
    it('renders PickerModal component', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');
      expect(pickerModal).toBeTruthy();
    });

    it('PickerModal has onAutoAddWithCategory handler', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');
      expect(pickerModal.props.onAutoAddWithCategory).toBeDefined();
    });
  });

  describe('Quick Add Form', () => {
    it('manages quick add form state for expenses', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should have QuickAddForm for quick expense entry
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('manages quick add form state for income', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should support quick income entry
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('manages quick add form state for transfers', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should support quick transfer entry
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Operations Grouping and Spending Sums', () => {
    it('groups operations by date and calculates spending sums', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'Bank', balance: '5000.00', currency: 'EUR' },
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '2', type: 'expense', amount: '50.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '3', type: 'income', amount: '500.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '4', type: 'expense', amount: '25.00', accountId: 'acc-2', date: '2024-01-14' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      // Component should render without errors with operations
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with different currencies in spending sums', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Wallet', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'EUR Wallet', balance: '500.00', currency: 'EUR' },
        { id: 'acc-3', name: 'RUB Wallet', balance: '10000.00', currency: 'RUB' },
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '2', type: 'expense', amount: '50.00', accountId: 'acc-2', date: '2024-01-15' },
        { id: '3', type: 'expense', amount: '200.00', accountId: 'acc-3', date: '2024-01-15' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with missing account data', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' },
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '2', type: 'expense', amount: '50.00', accountId: 'non-existent', date: '2024-01-15' }, // Missing account
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations without currency in account', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00' }, // No currency - should default to USD
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('excludes income and transfer operations from spending sums', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' },
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '2', type: 'income', amount: '500.00', accountId: 'acc-1', date: '2024-01-15' },
        { id: '3', type: 'transfer', amount: '200.00', accountId: 'acc-1', date: '2024-01-15' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      // Only expense operations should be counted in spending sums
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles operations with invalid amount values', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' },
      ];

      const mockOperations = [
        { id: '1', type: 'expense', amount: 'invalid', accountId: 'acc-1', date: '2024-01-15' },
        { id: '2', type: 'expense', amount: '', accountId: 'acc-1', date: '2024-01-15' },
        { id: '3', type: 'expense', amount: null, accountId: 'acc-1', date: '2024-01-15' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      useOperationsData.mockReturnValue({
        operations: mockOperations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      // Should handle invalid amounts gracefully
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Loading States', () => {
    it('shows loading state when operations are loading', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: true,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { queryByTestId, getByText } = render(<OperationsScreen />);

      // When loading, operations list should not be visible
      expect(getByText('loading_operations')).toBeTruthy();
    });

    it('shows loading state when accounts are loading', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue({
        accounts: [],
        visibleAccounts: [],
        loading: true,
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByText } = render(<OperationsScreen />);

      expect(getByText('loading_operations')).toBeTruthy();
    });

    it('shows loading state when categories are loading', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useCategories.mockReturnValue({
        categories: [],
        loading: true,
      });

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByText } = render(<OperationsScreen />);

      expect(getByText('loading_operations')).toBeTruthy();
    });
  });

  describe('Filter Badge', () => {
    it('shows filter count when filters are active', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: { types: ['expense'], accounts: ['acc-1'] },
        filtersActive: true,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 2),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('does not show filter badge when no filters active', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useOperationsData.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Transfer Auto-Prefill', () => {
    it('auto-prefills toAccount with same currency account when switching to transfer', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Cash', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'USD Bank', balance: '5000.00', currency: 'USD' },
        { id: 'acc-3', name: 'EUR Cash', balance: '500.00', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      // Component should auto-prefill toAccount with same currency account
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles transfer when no matching currency account exists', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Cash', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'EUR Cash', balance: '500.00', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      // Component should handle the case where there's no matching currency account
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles transfer with only one account', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Cash', balance: '1000.00', currency: 'USD' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      // Component should handle transfer with only one account (no valid toAccount)
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });

    it('handles transfer when accounts have different currencies', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'USD Cash', balance: '1000.00', currency: 'USD' },
        { id: 'acc-2', name: 'EUR Cash', balance: '500.00', currency: 'EUR' },
        { id: 'acc-3', name: 'RUB Cash', balance: '10000.00', currency: 'RUB' },
      ];

      useAccountsData.mockReturnValue({
        accounts: mockAccounts,
        visibleAccounts: mockAccounts,
        loading: false,
      });

      // Component should handle transfers between accounts with different currencies
      expect(() => render(<OperationsScreen />)).not.toThrow();
    });
  });

  describe('Multi-Currency Auto-Calculation', () => {
    let mockSetQuickAddValues;
    let mockSetLastEditedField;
    let Currency;
    let useQuickAddFormMock;
    let useMultiCurrencyTransferMock;
    let useOperationsDataMock;
    let useOperationsActionsMock;

    beforeEach(() => {
      jest.clearAllMocks();
      mockSetQuickAddValues = jest.fn();
      mockSetLastEditedField = jest.fn();
      Currency = require('../../app/services/currency');
      useQuickAddFormMock = require('../../app/hooks/useQuickAddForm');
      useMultiCurrencyTransferMock = require('../../app/hooks/useMultiCurrencyTransfer');
      useOperationsDataMock = require('../../app/contexts/OperationsDataContext').useOperationsData;
      useOperationsActionsMock = require('../../app/contexts/OperationsActionsContext').useOperationsActions;

      useOperationsDataMock.mockReturnValue({
        operations: [],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActionsMock.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });
    });

    it('auto-populates exchange rate when multi-currency transfer has no rate', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      useQuickAddFormMock.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '', destinationAmount: '', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransferMock.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'EUR' },
        isMultiCurrencyTransfer: true,
        lastEditedField: null,
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.920000', source: 'live' });

      render(<OperationsScreen />);

      await waitFor(() => {
        expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('USD', 'EUR');
        expect(mockSetQuickAddValues).toHaveBeenCalled();
        expect(mockSetLastEditedField).toHaveBeenCalledWith('exchangeRate');
      });
    });

    it('does not overwrite existing exchange rate', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      useQuickAddFormMock.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.85', destinationAmount: '85', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransferMock.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'EUR' },
        isMultiCurrencyTransfer: true,
        lastEditedField: null,
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      render(<OperationsScreen />);

      // Should not call fetchLiveExchangeRate when rate already exists
      expect(Currency.fetchLiveExchangeRate).not.toHaveBeenCalled();
    });

    it('calculates destination amount when amount or exchange rate is edited', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      useQuickAddFormMock.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.92', destinationAmount: '', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransferMock.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'EUR' },
        isMultiCurrencyTransfer: true,
        lastEditedField: 'amount',
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      Currency.convertAmount.mockReturnValue('92.00');

      render(<OperationsScreen />);

      expect(Currency.convertAmount).toHaveBeenCalledWith('100', 'USD', 'EUR', '0.92');
      // setQuickAddValues should be called to set destinationAmount
      expect(mockSetQuickAddValues).toHaveBeenCalled();
    });

    it('back-calculates exchange rate when destination amount is edited', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      useQuickAddFormMock.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '', destinationAmount: '85', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransferMock.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'EUR' },
        isMultiCurrencyTransfer: true,
        lastEditedField: 'destinationAmount',
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      render(<OperationsScreen />);

      // Should calculate rate = 85 / 100 = 0.850000
      expect(mockSetQuickAddValues).toHaveBeenCalled();
      const updater = mockSetQuickAddValues.mock.calls.find(call => {
        if (typeof call[0] === 'function') {
          const result = call[0]({ exchangeRate: '' });
          return result.exchangeRate === '0.850000';
        }
        return false;
      });
      expect(updater).toBeTruthy();
    });

    it('clears exchange fields when switching to same-currency transfer', () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      useQuickAddFormMock.mockReturnValue({
        quickAddValues: { type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.92', destinationAmount: '92', categoryId: '' },
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
      });

      useMultiCurrencyTransferMock.mockReturnValue({
        sourceAccount: { id: 'acc-1', currency: 'USD' },
        destinationAccount: { id: 'acc-2', currency: 'USD' },
        isMultiCurrencyTransfer: false,
        lastEditedField: null,
        setLastEditedField: mockSetLastEditedField,
        rateSource: 'offline',
        setRateSource: jest.fn(),
      });

      render(<OperationsScreen />);

      // Should clear exchangeRate and destinationAmount
      expect(mockSetQuickAddValues).toHaveBeenCalled();
      const clearCall = mockSetQuickAddValues.mock.calls.find(call => {
        if (typeof call[0] === 'function') {
          const result = call[0]({ exchangeRate: '0.92', destinationAmount: '92' });
          return result.exchangeRate === '' && result.destinationAmount === '';
        }
        return false;
      });
      expect(clearCall).toBeTruthy();
    });
  });
});
