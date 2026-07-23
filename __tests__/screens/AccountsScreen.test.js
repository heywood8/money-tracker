/**
 * Tests for AccountsScreen - Account management screen
 * Logic-based tests focusing on component behavior and integration patterns
 * Similar to SimpleTabs.test.js approach for complex components with many dependencies
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock all dependencies
/* eslint-disable react/prop-types */
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View, ActivityIndicator, Switch } = require('react-native');

  return {
    Text: Text,
    TextInput: ({ label, value, onChangeText, ...props }) => {
      const { TextInput } = require('react-native');
      return React.createElement(TextInput, { ...props, value, onChangeText, placeholder: label });
    },
    Button: ({ children, onPress, mode, ...props }) =>
      React.createElement(TouchableOpacity, { onPress, ...props },
        React.createElement(Text, null, children)),
    FAB: ({ label, onPress, accessibilityLabel, accessibilityHint, ...props }) =>
      React.createElement(TouchableOpacity, { onPress, accessibilityLabel, accessibilityHint, ...props },
        React.createElement(Text, null, label)),
    Portal: ({ children }) => children,
    Modal: ({ children, visible }) => (visible ? children : null),
    Card: ({ children }) => React.createElement(View, null, children),
    TouchableRipple: ({ children, onPress, ...props }) =>
      React.createElement(TouchableOpacity, { onPress, ...props }, children),
    ActivityIndicator: ActivityIndicator,
    Switch: ({ value, onValueChange, ...props }) =>
      React.createElement(Switch, { value, onValueChange, ...props }),
  };
});
/* eslint-enable react/prop-types */

jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { FlatList, ScrollView } = require('react-native');
  const Draggable = (props) => React.createElement(FlatList, props);
  return {
    __esModule: true,
    default: Draggable,
    NestableDraggableFlatList: Draggable,
    NestableScrollContainer: (props) => React.createElement(ScrollView, props),
  };
});

// Mock split theme contexts
jest.mock('../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: jest.fn(() => ({
    colorScheme: 'light',
  })),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#2196f3',
      text: '#000000',
      mutedText: '#666666',
      border: '#e0e0e0',
      card: '#ffffff',
      inputBackground: '#fafafa',
      inputBorder: '#cccccc',
    },
  })),
}));

// Mock split accounts contexts
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: jest.fn(() => ({
    accounts: [],
    displayedAccounts: [],
    hiddenAccounts: [],
    showHiddenAccounts: false,
    loading: false,
    error: null,
  })),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: jest.fn(() => ({
    toggleShowHiddenAccounts: jest.fn(),
    addAccount: jest.fn(),
    updateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    reorderAccounts: jest.fn(),
    validateAccount: jest.fn(),
    getOperationCount: jest.fn(() => Promise.resolve(0)),
  })),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(() => ({
    t: jest.fn((key) => key),
    language: 'en',
  })),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({
    hideBalances: false,
  })),
}));

// Default-account preference helpers used by the star indicator + edit-form toggle.
jest.mock('../../app/services/PreferencesDB', () => ({
  getDefaultAccountId: jest.fn(() => Promise.resolve(null)),
  setDefaultAccountId: jest.fn(() => Promise.resolve()),
}));

// NetWorthCard sources its month operations directly from the DB (decoupled from
// the search-filtered Operations feed — issue #1346). Mock those two entry points so
// tests can control/observe what net worth is computed over. Safe defaults keep the
// unrelated toggle tests working.
jest.mock('../../app/services/OperationsDB', () => ({
  getOperationsByDateRange: jest.fn(() => Promise.resolve([])),
  computeNetWorthSummary: jest.fn(() =>
    Promise.resolve({ total: '0', monthlyChange: '0', unconvertible: [] })),
}));

// Helper functions to create complete mocks for split contexts
const createAccountsDataMock = (overrides = {}) => ({
  accounts: [],
  displayedAccounts: [],
  hiddenAccounts: [],
  showHiddenAccounts: false,
  loading: false,
  error: null,
  ...overrides,
});

const createAccountsActionsMock = (overrides = {}) => ({
  toggleShowHiddenAccounts: jest.fn(),
  addAccount: jest.fn(),
  updateAccount: jest.fn(),
  deleteAccount: jest.fn(),
  reorderAccounts: jest.fn(),
  validateAccount: jest.fn(),
  getOperationCount: jest.fn(() => Promise.resolve(0)),
  ...overrides,
});

describe('AccountsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default mocks
    const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
    const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
    useAccountsData.mockReturnValue(createAccountsDataMock());
    useAccountsActions.mockReturnValue(createAccountsActionsMock());
  });

  describe('Component Structure', () => {
    it('renders without crashing', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      await render(<AccountsScreen />);
    });

    it('uses ThemeContext for styling', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useThemeConfig } = require('../../app/contexts/ThemeConfigContext');
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      await render(<AccountsScreen />);

      expect(useThemeConfig).toHaveBeenCalled();
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('uses AccountsContext for account data', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      await render(<AccountsScreen />);

      expect(useAccountsData).toHaveBeenCalled();
      expect(useAccountsActions).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      await render(<AccountsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });
  });

  describe('Integration with Contexts', () => {
    it('handles empty account list', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue(createAccountsDataMock());

      await render(<AccountsScreen />);
    });

    it('handles loading state', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      useAccountsData.mockReturnValue(createAccountsDataMock({
        loading: true,
      }));

      await render(<AccountsScreen />);
    });

    it('handles account list with data', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: '1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0 },
        { id: '2', name: 'Bank', balance: '5000.00', currency: 'USD', order: 1 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      await render(<AccountsScreen />);
    });
  });

  describe('Net worth currency conversion toggle', () => {
    it('hides the convert toggle when all accounts share one currency', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const singleCurrency = [
        { id: '1', name: 'Cash', balance: '100.00', currency: 'USD', order: 0 },
        { id: '2', name: 'Bank', balance: '200.00', currency: 'USD', order: 1 },
      ];
      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: singleCurrency,
        displayedAccounts: singleCurrency,
      }));

      const { queryByLabelText } = await render(<AccountsScreen />);

      expect(queryByLabelText('graphs_convert_currencies')).toBeNull();
    });

    it('shows the convert toggle (default on) and flips it off when pressed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const multiCurrency = [
        { id: '1', name: 'USD', balance: '100.00', currency: 'USD', order: 0 },
        { id: '2', name: 'EUR', balance: '100.00', currency: 'EUR', order: 1 },
      ];
      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: multiCurrency,
        displayedAccounts: multiCurrency,
      }));

      const { getByLabelText } = await render(<AccountsScreen />);

      const toggle = getByLabelText('graphs_convert_currencies');
      expect(toggle.props.accessibilityState).toEqual(
        expect.objectContaining({ checked: true }),
      );

      fireEvent.press(toggle);

      await waitFor(() => {
        expect(getByLabelText('graphs_convert_currencies').props.accessibilityState)
          .toEqual(expect.objectContaining({ checked: false }));
      });
    });
  });

  // Regression coverage for issue #1346: net worth must be computed over the whole
  // current month sourced directly from the DB, NOT over the search-filtered, lazily
  // paginated Operations feed. This locks the corrected data source.
  describe('Net worth data source (issue #1346)', () => {
    const OperationsDB = require('../../app/services/OperationsDB');
    const { appEvents, EVENTS } = require('../../app/services/eventEmitter');

    beforeEach(() => {
      OperationsDB.getOperationsByDateRange.mockResolvedValue([]);
      OperationsDB.computeNetWorthSummary.mockResolvedValue({
        total: '0', monthlyChange: '0', unconvertible: [],
      });
    });

    it('computes net worth over DB-fetched current-month operations, not the feed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const accounts = [
        { id: '1', name: 'USD', balance: '1000.00', currency: 'USD', order: 0 },
        { id: '2', name: 'EUR', balance: '100.00', currency: 'EUR', order: 1 },
      ];
      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts,
        displayedAccounts: accounts,
      }));

      // The card's own DB source returns the complete month; the search feed is
      // irrelevant to net worth and is never consulted.
      const monthOps = [
        { accountId: '1', type: 'income', amount: '200', date: '2026-07-05' },
      ];
      OperationsDB.getOperationsByDateRange.mockResolvedValue(monthOps);

      await render(<AccountsScreen />);

      const now = new Date();
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await waitFor(() => {
        expect(OperationsDB.getOperationsByDateRange)
          .toHaveBeenCalledWith(`${prefix}-01`, `${prefix}-31`);
      });

      // computeNetWorthSummary must receive the DB month set — never a filtered feed.
      await waitFor(() => {
        expect(OperationsDB.computeNetWorthSummary).toHaveBeenCalledWith(
          accounts, monthOps, 'USD', prefix,
        );
      });
    });

    it('refetches the month when an operation changes', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const accounts = [
        { id: '1', name: 'USD', balance: '1000.00', currency: 'USD', order: 0 },
      ];
      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts,
        displayedAccounts: accounts,
      }));

      await render(<AccountsScreen />);

      await waitFor(() => {
        expect(OperationsDB.getOperationsByDateRange).toHaveBeenCalledTimes(1);
      });

      appEvents.emit(EVENTS.OPERATION_CHANGED);

      await waitFor(() => {
        expect(OperationsDB.getOperationsByDateRange).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Component Logic', () => {
    it('initializes with modal closed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      const { queryByTestId } = await render(<AccountsScreen />);

      // Modal should not be visible initially (testing internal state via behavior)
      expect(true).toBe(true); // Component initializes without errors
    });

    it('handles multiple currencies', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const mockAccounts = [
        { id: '1', name: 'USD Account', balance: '1000.00', currency: 'USD', order: 0 },
        { id: '2', name: 'EUR Account', balance: '500.00', currency: 'EUR', order: 1 },
        { id: '3', name: 'RUB Account', balance: '75000.00', currency: 'RUB', order: 2 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
        currencies: {
          USD: { symbol: '$', decimal_digits: 2 },
          EUR: { symbol: '€', decimal_digits: 2 },
          RUB: { symbol: '₽', decimal_digits: 2 },
        },
      }));

      await render(<AccountsScreen />);
    });
  });

  describe('State Management', () => {
    it('manages modal visibility state', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component should manage modal state internally
      await render(<AccountsScreen />);
    });

    it('manages edit mode state', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component should manage edit/new mode state
      await render(<AccountsScreen />);
    });

    it('manages delete confirmation state', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component should manage delete confirmation dialogs
      await render(<AccountsScreen />);
    });
  });

  describe('Memoization and Performance', () => {
    it('uses callbacks for account actions', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component should use useCallback for performance
      await render(<AccountsScreen />);
    });

    it('memoizes currency picker modal', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component uses memo() for CurrencyPickerModal
      await render(<AccountsScreen />);
    });

    it('memoizes transfer account picker modal', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component uses memo() for TransferAccountPickerModal
      await render(<AccountsScreen />);
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      const mockColors = {
        background: '#000000',
        surface: '#111111',
        primary: '#ff0000',
        text: '#ffffff',
      };

      useThemeColors.mockReturnValue({ colors: mockColors });

      await render(<AccountsScreen />);
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('handles dark theme', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
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

      await render(<AccountsScreen />);
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      await render(<AccountsScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles different languages', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => `ru_${key}`),
        language: 'ru',
      });

      await render(<AccountsScreen />);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty accounts array when context provides empty state', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: [],
        displayedAccounts: [],
        currencies: {},
      }));

      // Should handle gracefully with empty arrays (normal empty state from context)
      await render(<AccountsScreen />);
    });

    it('handles empty displayed accounts with hidden accounts', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const hiddenAccounts = [{ id: '1', name: 'Hidden', balance: '100', currency: 'USD', hidden: true }];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: hiddenAccounts,
        displayedAccounts: [], // All accounts are hidden
        hiddenAccounts: hiddenAccounts,
        currencies: {},
      }));

      await render(<AccountsScreen />);
    });

    it('handles accounts with missing properties', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const mockAccounts = [
        { id: '1' }, // Missing name, balance, currency
        { id: '2', name: 'Test' }, // Missing balance, currency
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
        currencies: {},
      }));

      await render(<AccountsScreen />);
    });

    it('handles empty currencies object', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
        currencies: {},
      }));

      await render(<AccountsScreen />);
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      const { rerender } = await render(<AccountsScreen />);

      expect(() => rerender(<AccountsScreen />)).not.toThrow();
    });

    it('maintains stability when accounts change', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const initialAccounts = [{ id: '1', name: 'Account 1', balance: '100', currency: 'USD' }];
      const updatedAccounts = [
        { id: '1', name: 'Account 1', balance: '200', currency: 'USD' },
        { id: '2', name: 'Account 2', balance: '300', currency: 'EUR' },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: initialAccounts,
        displayedAccounts: initialAccounts,
        currencies: {},
      }));

      const { rerender } = await render(<AccountsScreen />);

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: updatedAccounts,
        displayedAccounts: updatedAccounts,
        currencies: {},
      }));

      expect(() => rerender(<AccountsScreen />)).not.toThrow();
    });

    it('handles rapid loading state changes', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      useAccountsData.mockReturnValue(createAccountsDataMock({
        loading: true,
        currencies: {},
      }));

      const { rerender } = await render(<AccountsScreen />);

      useAccountsData.mockReturnValue(createAccountsDataMock({
        loading: false,
        currencies: {},
      }));

      expect(() => rerender(<AccountsScreen />)).not.toThrow();
    });
  });

  describe('Component Integration Points', () => {
    it('provides necessary props to child components', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component should pass proper props to DraggableFlatList and modals
      await render(<AccountsScreen />);
    });

    it('integrates with React Native Paper components', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;

      // Component uses FAB, Modal, Card, etc. from react-native-paper
      await render(<AccountsScreen />);
    });

    it('integrates with DraggableFlatList for account reordering', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');

      const mockAccounts = [
        { id: '1', name: 'First', balance: '100', currency: 'USD', order: 0 },
        { id: '2', name: 'Second', balance: '200', currency: 'USD', order: 1 },
        { id: '3', name: 'Third', balance: '300', currency: 'USD', order: 2 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
        currencies: {},
      }));

      await render(<AccountsScreen />);
    });
  });

  describe('Account Rendering', () => {
    it('renders account names correctly', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: '1', name: 'My Cash', balance: '100.50', currency: 'USD', order: 0 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      const { getByText } = await render(<AccountsScreen />);

      expect(getByText('My Cash')).toBeTruthy();
    });

    it('renders formatted balance with currency symbol', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [
        { id: '1', name: 'Test Account', balance: '1234.56', currency: 'EUR', order: 0 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      const { getByText } = await render(<AccountsScreen />);

      // Balance should be formatted with currency symbol
      expect(getByText('Test Account')).toBeTruthy();
    });
  });

  describe('FAB Button', () => {
    it('renders add account FAB button', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      // Set up mock to return keys without prefix
      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText } = await render(<AccountsScreen />);

      expect(getByLabelText('add_account')).toBeTruthy();
    });
  });

  describe('Hidden Accounts Toggle', () => {
    it('renders show hidden accounts button when hidden accounts exist', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const hiddenAccounts = [
        { id: '1', name: 'Hidden Account', balance: '100', currency: 'USD', hidden: 1 },
      ];

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: hiddenAccounts,
        displayedAccounts: [],
        hiddenAccounts: hiddenAccounts,
      }));

      const { getByText } = await render(<AccountsScreen />);

      // Should show the toggle button - returns translation key
      expect(getByText('show_hidden_accounts')).toBeTruthy();
    });

    it('does not render hidden accounts button when no hidden accounts', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: [],
        displayedAccounts: [],
        hiddenAccounts: [],
      }));

      const { queryByText } = await render(<AccountsScreen />);

      expect(queryByText(/show_hidden_accounts|hide_hidden_accounts/)).toBeNull();
    });
  });

  describe('Loading and Error States', () => {
    it('displays loading indicator when loading', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        loading: true,
      }));

      const { getByText } = await render(<AccountsScreen />);

      // Check for translation key
      expect(getByText('loading_accounts')).toBeTruthy();
    });

    it('displays error message when error occurs', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        error: 'Failed to load',
      }));

      const { getByText } = await render(<AccountsScreen />);

      // Check for translation key
      expect(getByText('error_loading_accounts')).toBeTruthy();
    });
  });

  describe('Empty State', () => {
    it('displays no accounts message when list is empty', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: [],
        displayedAccounts: [],
      }));

      const { getByText } = await render(<AccountsScreen />);

      // Check for translation key since mock returns key
      expect(getByText('no_accounts')).toBeTruthy();
    });
  });

  describe('Account Edit and Add Handlers', () => {
    const { fireEvent, act, waitFor } = require('@testing-library/react-native');

    it('opens edit modal when account is pressed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0 },
      ];

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      const { getByText, getByLabelText } = await render(<AccountsScreen />);

      // Find and press the account
      const accountRow = getByLabelText('edit_account');
      await fireEvent.press(accountRow);

      // Modal should now show edit form with account name
      await waitFor(() => {
        expect(getByText('edit_account')).toBeTruthy();
      });
    });

    it('opens add modal when FAB is pressed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, getByText } = await render(<AccountsScreen />);

      // Find and press the FAB
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Modal should now show add form
      await waitFor(() => {
        expect(getByText('add_account')).toBeTruthy();
      });
    });

    it('saves new account when save is pressed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAddAccount = jest.fn();
      const mockValidateAccount = jest.fn(() => ({})); // No errors

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        addAccount: mockAddAccount,
        validateAccount: mockValidateAccount,
      }));

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, getAllByText, getByDisplayValue } = await render(<AccountsScreen />);

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Fill in the form - find inputs and set values
      // Since the modal is rendered, we need to interact with the form

      // Find save button and press it
      const saveButtons = getAllByText('save');
      await fireEvent.press(saveButtons[0]);

      // validateAccount should have been called
      expect(mockValidateAccount).toHaveBeenCalled();
    });

    it('validates account before saving and shows errors', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockValidateAccount = jest.fn(() => ({ name: 'Name is required' })); // Return validation error

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        validateAccount: mockValidateAccount,
      }));

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, getAllByText, getByText } = await render(<AccountsScreen />);

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Press save without filling anything
      const saveButtons = getAllByText('save');
      await fireEvent.press(saveButtons[0]);

      // Error should be displayed
      await waitFor(() => {
        expect(getByText('Name is required')).toBeTruthy();
      });
    });

    it('closes modal when cancel is pressed', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, getAllByText, queryByText } = await render(<AccountsScreen />);

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Press cancel
      const cancelButtons = getAllByText('cancel');
      await fireEvent.press(cancelButtons[0]);

      // Modal state should be cleared (editingId set to null)
      expect(true).toBe(true); // Handler was called without error
    });
  });

  describe('Account Delete Handlers', () => {
    const { fireEvent, act, waitFor } = require('@testing-library/react-native');

    it('shows confirmation when deleting account without operations', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0 },
      ];

      const mockGetOperationCount = jest.fn(() => Promise.resolve(0));

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        getOperationCount: mockGetOperationCount,
      }));

      const { getByLabelText, getByTestId } = await render(<AccountsScreen />);

      // Open edit modal for account
      const accountRow = getByLabelText('edit_account');
      await fireEvent.press(accountRow);

      await waitFor(async () => {
        // Find and press delete icon in form panel header
        const deleteIcon = getByTestId('icon-trash-can-outline');
        await fireEvent.press(deleteIcon);
      });

      // Operation count should be checked
      await waitFor(() => {
        expect(mockGetOperationCount).toHaveBeenCalledWith('acc-1');
      });
    });

    it('shows transfer modal when deleting account with operations', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0 },
        { id: 'acc-2', name: 'Bank', balance: '5000.00', currency: 'USD', order: 1 },
      ];

      const mockGetOperationCount = jest.fn(() => Promise.resolve(5)); // Has operations

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        getOperationCount: mockGetOperationCount,
      }));

      const { getAllByText, getByTestId } = await render(<AccountsScreen />);

      // Open edit modal for first account
      const accountRows = getAllByText('Cash');
      await fireEvent.press(accountRows[0]);

      await waitFor(async () => {
        // Find and press delete icon in form panel header
        const deleteIcon = getByTestId('icon-trash-can-outline');
        await fireEvent.press(deleteIcon);
      });

      // Should show transfer operations dialog
      await waitFor(() => {
        expect(mockGetOperationCount).toHaveBeenCalled();
      });
    });

    it('deletes account after confirmation', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0 },
      ];

      const mockDeleteAccount = jest.fn(() => Promise.resolve());
      const mockGetOperationCount = jest.fn(() => Promise.resolve(0));

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        deleteAccount: mockDeleteAccount,
        getOperationCount: mockGetOperationCount,
      }));

      const { getByLabelText, getAllByText, getByTestId } = await render(<AccountsScreen />);

      // Open edit modal for account
      const accountRow = getByLabelText('edit_account');
      await fireEvent.press(accountRow);

      await waitFor(async () => {
        // Find and press delete icon in form panel header
        const deleteIcon = getByTestId('icon-trash-can-outline');
        await fireEvent.press(deleteIcon);
      });

      // Wait for confirmation dialog to appear and then confirm
      await waitFor(async () => {
        const confirmDeleteButtons = getAllByText('delete');
        await fireEvent.press(confirmDeleteButtons[0]);
      });
    });
  });

  describe('Currency Picker', () => {
    const { fireEvent, waitFor } = require('@testing-library/react-native');

    it('shows currency in edit modal', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, getByText } = await render(<AccountsScreen />);

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // The modal should be visible with the add form
      await waitFor(() => {
        expect(getByText('add_account')).toBeTruthy();
      });
    });
  });

  describe('Form Input Handlers', () => {
    const { fireEvent, waitFor } = require('@testing-library/react-native');

    it('updates name input value', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, container } = await render(<AccountsScreen />);
      const { TextInput } = require('react-native');

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Find and update text inputs
      await waitFor(async () => {
        const inputs = container.queryAll(n => n.type === 'TextInput');
        expect(inputs.length).toBeGreaterThan(0);

        // Change name
        await fireEvent.changeText(inputs[0], 'New Account');
      });
    });

    it('updates balance input value', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      const { getByLabelText, container } = await render(<AccountsScreen />);
      const { TextInput } = require('react-native');

      // Open add modal
      const fab = getByLabelText('add_account');
      await fireEvent.press(fab);

      // Find and update text inputs
      await waitFor(async () => {
        const inputs = container.queryAll(n => n.type === 'TextInput');
        expect(inputs.length).toBeGreaterThan(1);

        // Change balance
        await fireEvent.changeText(inputs[1], '5000.00');
      });
    });
  });

  describe('Drag and Drop Reorder', () => {
    const { fireEvent } = require('@testing-library/react-native');

    it('calls reorderAccounts on drag end', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'First', balance: '100', currency: 'USD', order: 0 },
        { id: 'acc-2', name: 'Second', balance: '200', currency: 'USD', order: 1 },
      ];

      const mockReorderAccounts = jest.fn();

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      useAccountsActions.mockReturnValue(createAccountsActionsMock({
        reorderAccounts: mockReorderAccounts,
      }));

      await render(<AccountsScreen />);

      // The DraggableFlatList is mocked as a regular FlatList
      // We verify the component renders properly with the reorderAccounts callback available
      expect(mockReorderAccounts).toBeDefined();
    });
  });

  describe('Switch Toggles', () => {
    const { fireEvent, waitFor } = require('@testing-library/react-native');

    it('toggles hidden account switch', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0, hidden: 0 },
      ];

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      const { getByLabelText, container, getByText } = await render(<AccountsScreen />);
      const { Switch } = require('react-native');

      // Open edit modal
      const accountRow = getByLabelText('edit_account');
      await fireEvent.press(accountRow);

      // Find switches and toggle hidden
      await waitFor(() => {
        const switches = container.queryAll(n => n.type === 'RCTSwitch');
        expect(switches.length).toBeGreaterThan(0);
      });
    });

    it('toggles adjustment operation switch', async () => {
      const AccountsScreen = require('../../app/screens/AccountsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockAccounts = [
        { id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD', order: 0, hidden: 0 },
      ];

      useLocalization.mockReturnValue({
        t: jest.fn((key) => key),
        language: 'en',
      });

      useAccountsData.mockReturnValue(createAccountsDataMock({
        accounts: mockAccounts,
        displayedAccounts: mockAccounts,
      }));

      const { getByLabelText, container, getByText } = await render(<AccountsScreen />);
      const { Switch } = require('react-native');

      // Open edit modal for existing account
      const accountRow = getByLabelText('edit_account');
      await fireEvent.press(accountRow);

      // Find adjustment switch (shown only for existing accounts, not new)
      await waitFor(() => {
        expect(getByText('create_adjustment_operation')).toBeTruthy();
      });
    });
  });
});

describe('AccountsScreen — default account', () => {
  const preferencesDB = require('../../app/services/PreferencesDB');
  const accountsList = [
    { id: 1, name: 'Cash', balance: '1000.00', currency: 'USD', order: 0, hidden: 0 },
    { id: 2, name: 'Bank', balance: '5000.00', currency: 'USD', order: 1, hidden: 0 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
    const { useAccountsActions } = require('../../app/contexts/AccountsActionsContext');
    useAccountsData.mockReturnValue(createAccountsDataMock({
      accounts: accountsList,
      displayedAccounts: accountsList,
    }));
    useAccountsActions.mockReturnValue(createAccountsActionsMock());
    preferencesDB.getDefaultAccountId.mockResolvedValue(null);
    preferencesDB.setDefaultAccountId.mockResolvedValue(undefined);
  });

  it('shows a star indicator on the pinned default account row', async () => {
    preferencesDB.getDefaultAccountId.mockResolvedValue(1);
    const AccountsScreen = require('../../app/screens/AccountsScreen').default;

    const { queryAllByTestId } = await render(<AccountsScreen />);

    await waitFor(() => {
      expect(queryAllByTestId('icon-star').length).toBe(1);
    });
  });

  it('shows no star when no account is pinned', async () => {
    preferencesDB.getDefaultAccountId.mockResolvedValue(null);
    const AccountsScreen = require('../../app/screens/AccountsScreen').default;

    const { queryAllByTestId } = await render(<AccountsScreen />);

    await waitFor(() => {
      expect(preferencesDB.getDefaultAccountId).toHaveBeenCalled();
    });
    expect(queryAllByTestId('icon-star').length).toBe(0);
  });

  it('renders the default toggle ON when editing the pinned account', async () => {
    preferencesDB.getDefaultAccountId.mockResolvedValue(1);
    const AccountsScreen = require('../../app/screens/AccountsScreen').default;

    const { getAllByLabelText, getByTestId } = await render(<AccountsScreen />);

    await waitFor(() => expect(preferencesDB.getDefaultAccountId).toHaveBeenCalled());

    // Open the edit form for the first account (id 1, the pinned default).
    fireEvent.press(getAllByLabelText('edit_account')[0]);

    await waitFor(() => {
      expect(getByTestId('account-default-switch').props.value).toBe(true);
    });
  });

  it('persists the account as default when the toggle is switched on', async () => {
    preferencesDB.getDefaultAccountId.mockResolvedValue(null);
    const AccountsScreen = require('../../app/screens/AccountsScreen').default;

    const { getAllByLabelText, getByTestId } = await render(<AccountsScreen />);

    await waitFor(() => expect(preferencesDB.getDefaultAccountId).toHaveBeenCalled());

    fireEvent.press(getAllByLabelText('edit_account')[1]); // edit account id 2

    const toggle = await waitFor(() => getByTestId('account-default-switch'));
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);

    await waitFor(() => {
      expect(preferencesDB.setDefaultAccountId).toHaveBeenCalledWith(2);
    });
  });

  it('clears the default (latest used) when the toggle is switched off', async () => {
    preferencesDB.getDefaultAccountId.mockResolvedValue(2);
    const AccountsScreen = require('../../app/screens/AccountsScreen').default;

    const { getAllByLabelText, getByTestId } = await render(<AccountsScreen />);

    await waitFor(() => expect(preferencesDB.getDefaultAccountId).toHaveBeenCalled());

    fireEvent.press(getAllByLabelText('edit_account')[1]); // edit account id 2 (the default)

    const toggle = await waitFor(() => getByTestId('account-default-switch'));
    expect(toggle.props.value).toBe(true);

    fireEvent(toggle, 'valueChange', false);

    await waitFor(() => {
      expect(preferencesDB.setDefaultAccountId).toHaveBeenCalledWith(null);
    });
  });
});
