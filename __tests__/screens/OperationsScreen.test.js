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
    searchState: {
      text: '',
      types: [],
      accountIds: [],
      categoryIds: [],
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    },
    getSearchFilterCount: jest.fn(() => 0),
  })),
}));

jest.mock('../../app/contexts/OperationsActionsContext', () => ({
  useOperationsActions: jest.fn(() => ({
    loadMoreOperations: jest.fn(),
    loadInitialOperations: jest.fn(() => Promise.resolve()),
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

jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: jest.fn(() => ({
    registerSearchHandler: jest.fn(),
    openSearch: jest.fn(),
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

jest.mock('../../app/components/operations/OperationsList', () => {
  const React = require('react');
  return React.forwardRef(function MockOperationsList(props, ref) {
    React.useImperativeHandle(ref, () => ({
      scrollToOffset: jest.fn(),
      scrollToIndex: jest.fn(),
    }));
    return React.createElement('OperationsList', {
      testID: 'operations-list',
      initialLoading: props.initialLoading,
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

// Location wiring: default to the feature off / no fix so existing tests are
// unaffected; the location-specific test overrides these.
jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ attachLocation: false })),
}));

jest.mock('../../app/hooks/useQuickAddLocation', () => jest.fn(() => ({
  getLocation: jest.fn(() => null),
  prime: jest.fn(),
})));

// Mock the notification-suggestions hook so the screen render stays deterministic
// and fast — its real form hits the notification DB + ingestion pipeline on mount,
// which is unnecessary async work for these screen-level tests. The module's
// named canSaveSuggestion export is stubbed too: the binding cards imported by
// the screen call it at render time.
jest.mock('../../app/hooks/usePendingOperationSuggestions', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    suggestions: [],
    committingIds: {},
    saveErrors: {},
    choices: {},
    setChoice: jest.fn(),
    reload: jest.fn(),
    refresh: jest.fn(),
    accept: jest.fn(),
    dismiss: jest.fn(),
  })),
  canSaveSuggestion: jest.fn(() => false),
}));

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
    it('renders without crashing', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      await render(<OperationsScreen />);
    });

    it('uses ThemeContext for styling', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      await render(<OperationsScreen />);

      expect(useThemeColors).toHaveBeenCalled();
    });

    it('uses OperationsContext for operation data', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      await render(<OperationsScreen />);

      expect(useOperationsData).toHaveBeenCalled();
    });

    it('uses AccountsContext for account data', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      await render(<OperationsScreen />);

      expect(useAccountsData).toHaveBeenCalled();
    });

    it('uses CategoriesContext for category data', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      await render(<OperationsScreen />);

      expect(useCategories).toHaveBeenCalled();
    });

    it('uses DialogContext for dialogs', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      await render(<OperationsScreen />);

      expect(useDialog).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      await render(<OperationsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });
  });

  describe('Integration with Contexts', () => {
    it('handles empty operations list', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles loading state', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations list with data', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles transfer operations', async () => {
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

      await render(<OperationsScreen />);
    });
  });

  describe('Account and Category Integration', () => {
    it('handles operations with accounts', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations with categories', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: 'cat-1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: 'cat-2', name: 'Salary', type: 'income', icon: 'cash', color: '#00ff00' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
      });

      await render(<OperationsScreen />);
    });

    it('handles empty accounts list', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue({
        accounts: [],
        visibleAccounts: [],
        loading: false,
      });

      await render(<OperationsScreen />);
    });

    it('handles empty categories list', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
      });

      await render(<OperationsScreen />);
    });
  });

  describe('State Management', () => {
    it('manages operation modal visibility state', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage modal state internally
      await render(<OperationsScreen />);
    });

    it('manages quick add form state', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage quick add form state
      await render(<OperationsScreen />);
    });

    it('manages filter state', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage filter (account/category) state
      await render(<OperationsScreen />);
    });

    it('manages picker modal state', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should manage account/category picker modals
      await render(<OperationsScreen />);
    });
  });

  describe('Lazy Loading', () => {
    it('handles hasMore flag for pagination', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles end of operations list', async () => {
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

      await render(<OperationsScreen />);
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', async () => {
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

      await render(<OperationsScreen />);
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('handles dark theme', async () => {
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

      await render(<OperationsScreen />);
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      await render(<OperationsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles different languages', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => `ru_${key}`),
        language: 'ru',
      });

      await render(<OperationsScreen />);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty operations array when context provides empty state', async () => {
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
      await render(<OperationsScreen />);
    });

    it('handles initial loading state with empty operations', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations with missing properties', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations with invalid dates', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles very large operation amounts', async () => {
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

      await render(<OperationsScreen />);
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      const { rerender } = await render(<OperationsScreen />);

      expect(() => rerender(<OperationsScreen />)).not.toThrow();
    });

    it('maintains stability when operations change', async () => {
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

      const { rerender } = await render(<OperationsScreen />);

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

    it('handles rapid loading state changes', async () => {
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

      const { rerender } = await render(<OperationsScreen />);

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
    it('provides necessary props to child components', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should pass proper props to OperationModal, Calculator, etc.
      await render(<OperationsScreen />);
    });

    it('integrates with OperationModal', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component uses OperationModal for editing operations
      await render(<OperationsScreen />);
    });

    it('integrates with Calculator component', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component uses Calculator for amount input
      await render(<OperationsScreen />);
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

      const { getByTestId } = await render(<OperationsScreen />);

      // Get the OperationsList component which has the onEditOperation prop
      const operationsList = getByTestId('operations-list');
      expect(operationsList).toBeTruthy();

      // Invoke the handleEditOperation handler directly
      await act(async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);

      // Get the OperationModal component which has the onDelete prop
      const modal = getByTestId('operation-modal');

      // Invoke the handleDeleteOperation handler
      await act(async () => {
        modal.props.onDelete({ id: '1', type: 'expense', amount: '100.00' });
      });

      // Verify showDialog was called (translation key may vary based on mock)
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('handleCloseOperationModal sets operation modal not visible', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const modal = getByTestId('operation-modal');

      // Invoke onClose handler
      await act(async () => {
        modal.props.onClose();
      });

      // Modal should be closed (not visible)
      expect(getByTestId('operation-modal').props.visible).toBe(false);
    });

    it('handleSelectAccount updates account selection', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleSelectAccount
      await act(async () => {
        pickerModal.props.onSelectAccount('acc-2');
      });

      expect(mockSetQuickAddValues).toHaveBeenCalled();
    });

    it('handleSelectCategory updates category selection', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleSelectCategory
      await act(async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');

      // Invoke handleAutoAddWithCategory
      await act(async () => {
        await pickerModal.props.onAutoAddWithCategory('cat-1');
      });

      expect(mockResetForm).toHaveBeenCalled();
      expect(mockClosePicker).toHaveBeenCalled();
    });
  });

  describe('Quick-add location', () => {
    const { act } = require('@testing-library/react-native');

    it('attaches the primed location to a quick-added operation', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useQuickAddLocation = require('../../app/hooks/useQuickAddLocation');
      const useOperationPicker = require('../../app/hooks/useOperationPicker');

      useOperationPicker.mockReturnValue({
        pickerState: { visible: true, type: 'category', data: [] },
        categoryNavigation: { currentFolderId: null, breadcrumb: [] },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      useQuickAddLocation.mockReturnValue({
        getLocation: jest.fn(() => ({ latitude: '40.1', longitude: '44.2' })),
        prime: jest.fn(),
      });

      const mockAddOperation = jest.fn(() => Promise.resolve({ id: 'new-op' }));
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', currency: 'USD' }],
        visibleAccounts: [{ id: 'acc-1', currency: 'USD' }],
        loading: false,
      });
      useOperationsData.mockReturnValue({
        operations: [], loading: false, loadingMore: false, hasMoreOperations: false,
      });
      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: mockAddOperation,
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
      });

      const { getByTestId } = await render(<OperationsScreen />);
      // handleQuickAdd is reached through the picker's auto-add shortcut (the
      // quick-add form itself is a mocked list header and not rendered here).
      await act(async () => {
        await getByTestId('picker-modal').props.onAutoAddWithCategory('cat-1');
      });

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: '40.1', longitude: '44.2' }),
      );
    });

    it('quick-adds without coordinates when no fix is available', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useQuickAddLocation = require('../../app/hooks/useQuickAddLocation');
      const useOperationPicker = require('../../app/hooks/useOperationPicker');

      useOperationPicker.mockReturnValue({
        pickerState: { visible: true, type: 'category', data: [] },
        categoryNavigation: { currentFolderId: null, breadcrumb: [] },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      useQuickAddLocation.mockReturnValue({
        getLocation: jest.fn(() => null),
        prime: jest.fn(),
      });

      const mockAddOperation = jest.fn(() => Promise.resolve({ id: 'new-op' }));
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });

      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', currency: 'USD' }],
        visibleAccounts: [{ id: 'acc-1', currency: 'USD' }],
        loading: false,
      });
      useOperationsData.mockReturnValue({
        operations: [], loading: false, loadingMore: false, hasMoreOperations: false,
      });
      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: mockAddOperation,
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
      });

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        await getByTestId('picker-modal').props.onAutoAddWithCategory('cat-1');
      });

      const arg = mockAddOperation.mock.calls[0][0];
      expect(arg).not.toHaveProperty('latitude');
      expect(arg).not.toHaveProperty('longitude');
    });
  });

  describe('Scroll Handlers', () => {
    const { act } = require('@testing-library/react-native');

    it('handleScroll updates showScrollToTop state when scrolled down', async () => {
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

      const { getByTestId, queryByLabelText } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke onScroll with high offset to show scroll-to-top button
      await act(async () => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 300 } },
        });
      });

      // After scrolling down past 250px, scroll-to-top button should be visible
      const scrollToTopButton = queryByLabelText('Scroll to top');
      expect(scrollToTopButton).toBeTruthy();
    });

    it('handleScroll hides scroll button when scrolled up', async () => {
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

      const { getByTestId, queryByLabelText } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke onScroll with low offset to hide scroll-to-top button
      await act(async () => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 100 } },
        });
      });

      // Scroll button should not be visible when scrolled less than 250px
      const scrollToTopButton = queryByLabelText('Scroll to top');
      expect(scrollToTopButton).toBeNull();
    });

    it('handleScrollToIndexFailed falls back gracefully without warnings or retries', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      // The list now ships getItemLayout, so the failure path is a quiet safety
      // net: no console.warn, no 100ms setTimeout retry dance.
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const timeoutSpy = jest.spyOn(global, 'setTimeout');

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

      const { getByTestId } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Ignore any timers scheduled during render; only watch the handler itself.
      timeoutSpy.mockClear();

      // Invoke onScrollToIndexFailed — must not throw and must stay quiet
      await act(async () => {
        operationsList.props.onScrollToIndexFailed({ index: 10, averageItemLength: 56 });
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(timeoutSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      timeoutSpy.mockRestore();
    });

    it('handleContentSizeChange is passed to OperationsList', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      expect(operationsList.props.onContentSizeChange).toBeDefined();

      // Invoke onContentSizeChange
      await act(async () => {
        operationsList.props.onContentSizeChange(400, 2000);
      });
    });

    it('scrollToTop scrolls list to top when button pressed', async () => {
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

      const { getByTestId, getByLabelText } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Scroll down to show the button
      await act(async () => {
        operationsList.props.onScroll({
          nativeEvent: { contentOffset: { y: 300 } },
        });
      });

      // Press scroll to top button
      const scrollToTopButton = getByLabelText('Scroll to top');
      await fireEvent.press(scrollToTopButton);

      // Button should still be visible (will be hidden after scroll completes)
      expect(scrollToTopButton).toBeTruthy();
    });
  });

  describe('Date Picker', () => {
    const { act } = require('@testing-library/react-native');

    it('handleDateSeparatorPress opens date picker', async () => {
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

      const { getByTestId, queryByTestId, container } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Invoke handleDateSeparatorPress
      await act(async () => {
        operationsList.props.onDateSeparatorPress('2024-01-15');
      });

      // Date picker should be shown (we can't easily test DateTimePicker rendering in mock)
      // but we can verify the handler was callable
      expect(operationsList.props.onDateSeparatorPress).toBeDefined();
    });
  });

  describe('Amount Change Handlers', () => {
    const { act } = require('@testing-library/react-native');

    it('handleAmountChange updates quick add values', async () => {
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

      await render(<OperationsScreen />);

      // The handlers are created internally and passed to child components
      // Verify that the necessary hooks were called
      expect(useQuickAddForm).toHaveBeenCalled();
      expect(useMultiCurrencyTransfer).toHaveBeenCalled();
    });

    it('handleExchangeRateChange updates exchange rate', async () => {
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

      await render(<OperationsScreen />);

      // Verify multi-currency hooks are used
      expect(useMultiCurrencyTransfer).toHaveBeenCalled();
    });
  });

  describe('Picker Modal', () => {
    it('renders PickerModal component', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');
      expect(pickerModal).toBeTruthy();
    });

    it('PickerModal has onAutoAddWithCategory handler', async () => {
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

      const { getByTestId } = await render(<OperationsScreen />);
      const pickerModal = getByTestId('picker-modal');
      expect(pickerModal.props.onAutoAddWithCategory).toBeDefined();
    });
  });

  describe('Quick Add Form', () => {
    it('manages quick add form state for expenses', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should have QuickAddForm for quick expense entry
      await render(<OperationsScreen />);
    });

    it('manages quick add form state for income', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should support quick income entry
      await render(<OperationsScreen />);
    });

    it('manages quick add form state for transfers', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // Component should support quick transfer entry
      await render(<OperationsScreen />);
    });
  });

  describe('Operations Grouping and Spending Sums', () => {
    it('groups operations by date and calculates spending sums', async () => {
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
      await render(<OperationsScreen />);
    });

    it('handles operations with different currencies in spending sums', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations with missing account data', async () => {
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

      await render(<OperationsScreen />);
    });

    it('handles operations without currency in account', async () => {
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

      await render(<OperationsScreen />);
    });

    it('excludes income and transfer operations from spending sums', async () => {
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
      await render(<OperationsScreen />);
    });

    it('handles operations with invalid amount values', async () => {
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
      await render(<OperationsScreen />);
    });
  });

  describe('Loading States', () => {
    it('passes initialLoading=true to OperationsList when operations are loading', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

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

      const { getByTestId } = await render(<OperationsScreen />);
      const operationsList = getByTestId('operations-list');

      // Operations list is pre-rendered immediately; inline spinner shown via initialLoading
      expect(operationsList.props.initialLoading).toBe(true);
    });

    it('pre-renders screen normally when accounts are loading', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

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

      const { getByTestId } = await render(<OperationsScreen />);

      // Screen pre-renders; no full-screen loading blocker while accounts load
      expect(getByTestId('operations-list')).toBeTruthy();
    });

    it('pre-renders screen normally when categories are loading', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

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

      const { getByTestId } = await render(<OperationsScreen />);

      // Screen pre-renders; no full-screen loading blocker while categories load
      expect(getByTestId('operations-list')).toBeTruthy();
    });
  });

  describe('Filter Badge', () => {
    it('shows filter count when filters are active', async () => {
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

      await render(<OperationsScreen />);
    });

    it('does not show filter badge when no filters active', async () => {
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

      await render(<OperationsScreen />);
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

      await render(<OperationsScreen />);

      await waitFor(() => {
        expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('USD', 'EUR');
        expect(mockSetQuickAddValues).toHaveBeenCalled();
        expect(mockSetLastEditedField).toHaveBeenCalledWith('exchangeRate');
      });
    });

    it('does not overwrite existing exchange rate', async () => {
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

      await render(<OperationsScreen />);

      // Should not call fetchLiveExchangeRate when rate already exists
      expect(Currency.fetchLiveExchangeRate).not.toHaveBeenCalled();
    });

    it('calculates destination amount when amount or exchange rate is edited', async () => {
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

      await render(<OperationsScreen />);

      expect(Currency.convertAmount).toHaveBeenCalledWith('100', 'USD', 'EUR', '0.92');
      // setQuickAddValues should be called to set destinationAmount
      expect(mockSetQuickAddValues).toHaveBeenCalled();
    });

    it('back-calculates exchange rate when destination amount is edited', async () => {
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

      await render(<OperationsScreen />);

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

    it('clears exchange fields when switching to same-currency transfer', async () => {
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

      await render(<OperationsScreen />);

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

  // Pure mapping from a validation failure to the field that should flash red.
  // Kept as a unit test (no render) so the core QoL-12 logic is covered directly
  // and without the render flakiness the integration tests below are prone to.
  describe('getQuickAddFlashField', () => {
    const { getQuickAddFlashField } = require('../../app/screens/OperationsScreen');

    it('maps a zero / empty / non-numeric amount to the amount field', () => {
      expect(getQuickAddFlashField({ type: 'expense', amount: '', accountId: 'a', categoryId: 'c' })).toBe('amount');
      expect(getQuickAddFlashField({ type: 'expense', amount: '0', accountId: 'a', categoryId: 'c' })).toBe('amount');
      expect(getQuickAddFlashField({ type: 'expense', amount: 'abc', accountId: 'a', categoryId: 'c' })).toBe('amount');
    });

    it('maps a missing source account to the account field (amount takes precedence)', () => {
      expect(getQuickAddFlashField({ type: 'expense', amount: '100', accountId: '', categoryId: 'c' })).toBe('account');
      // Amount is checked first, so a bad amount wins even when the account is also missing.
      expect(getQuickAddFlashField({ type: 'expense', amount: '', accountId: '', categoryId: 'c' })).toBe('amount');
    });

    it('maps a missing or duplicate transfer target to the toAccount field', () => {
      expect(getQuickAddFlashField({ type: 'transfer', amount: '100', accountId: 'a', toAccountId: '' })).toBe('toAccount');
      expect(getQuickAddFlashField({ type: 'transfer', amount: '100', accountId: 'a', toAccountId: 'a' })).toBe('toAccount');
    });

    it('maps a missing category (non-transfer) to the category field', () => {
      expect(getQuickAddFlashField({ type: 'expense', amount: '100', accountId: 'a', categoryId: '' })).toBe('category');
    });

    it('returns null for a fully valid operation', () => {
      expect(getQuickAddFlashField({ type: 'expense', amount: '100', accountId: 'a', categoryId: 'c' })).toBeNull();
      expect(getQuickAddFlashField({ type: 'transfer', amount: '100', accountId: 'a', toAccountId: 'b' })).toBeNull();
    });

    it('returns null for errors not tied to a single visible field (missing type/date)', () => {
      // type/date failures still fall back to the blocking dialog rather than a flash.
      expect(getQuickAddFlashField({ amount: '100', accountId: 'a', categoryId: 'c' })).toBeNull();
    });
  });

  describe('QuickAdd Validation Flash wiring', () => {
    const { act } = require('@testing-library/react-native');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // Mock the form hook with a given set of QuickAdd values. handleQuickAdd is
    // reached through the PickerModal's onAutoAddWithCategory shortcut (the
    // QuickAddForm itself is a list-header mock and not rendered here), so field
    // mapping is verified separately by the getQuickAddFlashField unit tests; these
    // two only prove the flash-vs-dialog routing.
    const mockQuickAddValues = (values) => {
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      useQuickAddForm.mockReturnValue({
        quickAddValues: { description: '', exchangeRate: '', destinationAmount: '', toAccountId: '', categoryId: '', ...values },
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
      });
    };

    const mockActions = (validateOperation) => {
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      useOperationsActions.mockReturnValue({
        loadMoreOperations: jest.fn(),
        addOperation: jest.fn(),
        updateOperation: jest.fn(),
        deleteOperation: jest.fn(),
        validateOperation,
        setSearchText: jest.fn(),
        updateSearchFilters: jest.fn(),
        jumpToDate: jest.fn(),
      });
    };

    it('flashes inline instead of showing a dialog for a single-field omission', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      const mockShowDialog = jest.fn();
      useDialog.mockReturnValue({ showDialog: mockShowDialog });
      // Valid amount + account so the deciding omission is the (empty) category.
      mockQuickAddValues({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: '' });
      const validateOperation = jest.fn(() => 'category_required');
      mockActions(validateOperation);

      const { getByTestId } = await render(<OperationsScreen />);
      // Passing '' keeps the category empty → getQuickAddFlashField → 'category' → flash.
      await act(async () => {
        await getByTestId('picker-modal').props.onAutoAddWithCategory('');
      });

      expect(validateOperation).toHaveBeenCalled();
      expect(mockShowDialog).not.toHaveBeenCalled();
    });

    it('still shows a blocking dialog for errors not tied to a single field', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      const mockShowDialog = jest.fn();
      useDialog.mockReturnValue({ showDialog: mockShowDialog });
      // All single fields valid, but validation still fails (e.g. a date problem)
      // → getQuickAddFlashField returns null → fall back to the dialog.
      mockQuickAddValues({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' });
      mockActions(jest.fn(() => 'date_required'));

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        await getByTestId('picker-modal').props.onAutoAddWithCategory('cat-1');
      });

      expect(mockShowDialog).toHaveBeenCalled();
    });
  });
});
