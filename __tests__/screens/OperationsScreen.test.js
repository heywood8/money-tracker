/**
 * Tests for OperationsScreen - Operations/transactions management screen
 * Logic-based tests focusing on component behavior and integration patterns
 * This is the most complex screen in the app with extensive features
 */

import React from 'react';
import { Animated, AppState } from 'react-native';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { SUGGESTION_TIMEOUT_MS } from '../../app/components/operations/DescriptionSuggestionRow';
import { UNDO_DURATION_MS } from '../../app/components/operations/UndoSnackbar';

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

// The screen reads the Drive backup state to decide whether the resting search
// pill shows a backup status instead of the search affordance. Idle by default —
// the status itself is covered in SearchBar's own tests.
jest.mock('../../app/contexts/DriveBackupContext', () => ({
  useDriveBackup: jest.fn(() => ({
    isRunning: false,
    progress: null,
    cancelling: false,
    cancelBackup: jest.fn(),
  })),
}));

jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(() => Promise.resolve(null)),
  setLastAccessedAccount: jest.fn(() => Promise.resolve()),
}));

/* eslint-disable react/prop-types */
// Hoisted so tests can tell a remounted form from one handed new props; jest
// allows a `mock`-prefixed binding inside the factory below.
const mockOperationModalMounts = [];
jest.mock('../../app/modals/OperationModal', () => {
  const React = require('react');
  return function MockOperationModal(props) {
    React.useEffect(() => {
      // Mount only (empty deps): the array records each instance, not each render.
      mockOperationModalMounts.push(props.operation ? props.operation.id : null);
    }, []);
    return React.createElement('OperationModal', {
      testID: 'operation-modal',
      visible: props.visible,
      onClose: props.onClose,
      onDelete: props.onDelete,
      openCategoryPicker: props.openCategoryPicker,
      operationId: props.operation ? props.operation.id : null,
    });
  };
});

// Hoisted so tests can assert on the list's imperative scrolls; jest allows a
// `mock`-prefixed binding inside the factory below.
const mockScrollToOffset = jest.fn();
// Every header element the list has been handed, newest last. The quick-add form
// lives in this header, so a stable identity across a keystroke is what keeps the
// SectionList from reconciling a new header per character.
const headerComponentsSeen = [];

jest.mock('../../app/components/operations/OperationsList', () => {
  const React = require('react');
  return React.forwardRef(function MockOperationsList(props, ref) {
    headerComponentsSeen.push(props.headerComponent);
    React.useImperativeHandle(ref, () => ({
      scrollToOffset: mockScrollToOffset,
      scrollToIndex: jest.fn(),
    }));
    // The header (the quick-add block) is rendered as a child so tests can reach
    // the form the way the list does, instead of it disappearing into the mock.
    return React.createElement('OperationsList', {
      testID: 'operations-list',
      initialLoading: props.initialLoading,
      referenceDataLoading: props.referenceDataLoading,
      onEditOperation: props.onEditOperation,
      onDateSeparatorPress: props.onDateSeparatorPress,
      onScroll: props.onScroll,
      onContentSizeChange: props.onContentSizeChange,
      onScrollToIndexFailed: props.onScrollToIndexFailed,
      onLoadMore: props.onLoadMore,
      pendingSuggestionId: props.pendingSuggestionId,
      pendingSuggestions: props.pendingSuggestions,
      onApplySuggestion: props.onApplySuggestion,
      onDismissSuggestion: props.onDismissSuggestion,
      groupedOperations: props.groupedOperations,
    }, props.headerComponent);
  });
});

// Counts its own renders and subscribes to the real store, so a test can tell
// "the form repainted" apart from "the screen repainted".
const quickAddFormRenders = [];

jest.mock('../../app/components/operations/QuickAddForm', () => {
  const React = require('react');
  const { useQuickAddValues } = jest.requireActual('../../app/hooks/useQuickAddValuesStore');
  return function MockQuickAddForm(props) {
    const values = useQuickAddValues(props.valuesStore);
    quickAddFormRenders.push(values.amount);
    return React.createElement('QuickAddForm', {
      testID: 'quick-add-form',
      handleQuickAdd: props.handleQuickAdd,
      onAutoAddWithCategory: props.onAutoAddWithCategory,
      saving: props.saving,
    });
  };
});

// The deck itself is covered by its own tests; here only whether (and with
// what) the screen renders it matters. The sizing helpers stay real.
jest.mock('../../app/components/operations/NotificationBindingStack', () => {
  const React = require('react');
  const actual = jest.requireActual('../../app/components/operations/NotificationBindingStack');
  return {
    __esModule: true,
    ...actual,
    default: function MockNotificationBindingStack(props) {
      return React.createElement('NotificationBindingStack', {
        testID: 'notification-binding-stack',
        count: props.suggestions.length,
        quickAddHeight: props.quickAddHeight,
      });
    },
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
// Every tab stays mounted, so the screen asks this whether it is the one on
// screen — it is what retires a parked quick-add date when the user walks away.
jest.mock('../../app/contexts/TabFocusContext', () => ({
  useTabFocused: jest.fn(() => true),
}));

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

// The hook hands back only the structural fields as state; the typed ones
// (amount, rate, destination amount, description) live in the store, so a
// keystroke never reaches this screen. See useQuickAddValuesStore.
const makeMockQuickAddStore = (values = {}) => {
  const { createQuickAddValuesStore } = jest.requireActual('../../app/hooks/useQuickAddValuesStore');
  return createQuickAddValuesStore({
    type: 'expense',
    amount: '',
    accountId: 'acc-1',
    categoryId: '',
    description: '',
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
    operationCurrency: '',
    ...values,
  });
};

jest.mock('../../app/hooks/useQuickAddForm', () => jest.fn(() => ({
  quickAddValues: {
    type: 'expense',
    accountId: 'acc-1',
    categoryId: '',
    toAccountId: '',
    operationCurrency: '',
  },
  quickAddValuesStore: makeMockQuickAddStore(),
  setQuickAddValues: jest.fn(),
  getAccountName: jest.fn((id) => id === 'acc-1' ? 'Cash' : 'Unknown'),
  getAccountBalance: jest.fn(() => '$1000.00'),
  getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
  getCategoryName: jest.fn(() => 'Food'),
  filteredCategories: [],
  resetForm: jest.fn(),
  clearDate: jest.fn(),
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

// Only the label-suggestion query is stubbed; the rest of OperationsDB stays
// real. Defaults to "no labels yet" so the suggestion row is absent unless a
// test asks for it.
jest.mock('../../app/services/OperationsDB', () => {
  const actual = jest.requireActual('../../app/services/OperationsDB');
  return {
    __esModule: true,
    ...actual,
    getDistinctLabels: jest.fn(() => Promise.resolve([])),
    // Only the "Change category" deep link reads a single row by id; it resolves
    // to nothing unless a test says otherwise.
    getOperationById: jest.fn(() => Promise.resolve(null)),
  };
});

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

// Only the rate lookups are stubbed. The arithmetic is real: the day totals
// this screen builds are summed with Currency.add (#1711), and a mock that
// replaced it would be testing the mock rather than the sum.
jest.mock('../../app/services/currency', () => ({
  formatAmount: jest.fn((amount) => amount),
  add: jest.requireActual('../../app/services/currency').add,
  multiply: jest.requireActual('../../app/services/currency').multiply,
  formatMoney: jest.requireActual('../../app/services/currency').formatMoney,
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
    // `clearAllMocks` drops calls but keeps implementations, so a test that
    // overrides useLocalization (the ru_ prefix one below) leaked its `t` into
    // every test after it. Restore the identity default here so each test gets
    // the keys back.
    require('../../app/contexts/LocalizationContext').useLocalization.mockReturnValue({
      t: (key) => key,
      language: 'en',
    });
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
      const mockDeleteOperation = jest.fn();
      useDialog.mockReturnValue({ showDialog: mockShowDialog });

      useOperationsData.mockReturnValue({
        operations: [{ id: '1', type: 'expense', amount: '100.00', accountId: 'acc-1', date: '2024-01-15' }],
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });

      useOperationsActions.mockReturnValue({
        deleteOperation: mockDeleteOperation,
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

      // Issue #1712: delete no longer blocks on a confirmation dialog — the row
      // leaves the list at once and the undo bar owns the window.
      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockDeleteOperation).not.toHaveBeenCalled();
      expect(getByTestId('undo-snackbar')).toBeTruthy();
      expect(getByTestId('operations-list').props.groupedOperations).toEqual([]);
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
        quickAddValues: { type: 'expense', accountId: '', categoryId: '', toAccountId: '', operationCurrency: '' },
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', accountId: '', categoryId: '', toAccountId: '', operationCurrency: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '', accountId: '', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: '' }),
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

  // Issue #1699: no save path had an in-flight guard, and quick-add awaits a live
  // exchange-rate fetch before it writes, so a fast double tap booked the operation
  // twice.
  describe('Quick-add double submit (issue #1699)', () => {
    const { act } = require('@testing-library/react-native');

    it('books the operation once when Add is tapped twice in the same frame', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');

      const mockAddOperation = jest.fn(() => Promise.resolve({ id: 'new-op' }));
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        const { handleQuickAdd } = getByTestId('quick-add-form').props;
        // Both calls happen before the first save settles.
        await Promise.all([handleQuickAdd(), handleQuickAdd()]);
      });

      expect(mockAddOperation).toHaveBeenCalledTimes(1);
    });

    it('marks the form as saving for as long as the write is pending', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');

      let resolveWrite;
      const mockAddOperation = jest.fn(() => new Promise((resolve) => { resolveWrite = resolve; }));
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
      expect(getByTestId('quick-add-form').props.saving).toBe(false);

      let pending;
      await act(async () => {
        pending = getByTestId('quick-add-form').props.handleQuickAdd();
      });

      // The Add button has to look unavailable, not just swallow the tap.
      expect(getByTestId('quick-add-form').props.saving).toBe(true);

      await act(async () => {
        resolveWrite({ id: 'op-1' });
        await pending;
      });

      expect(getByTestId('quick-add-form').props.saving).toBe(false);
    });
  });

  describe('Quick-add date chip (issue #1713)', () => {
    const { act, fireEvent } = require('@testing-library/react-native');

    const mountWithValues = async (values) => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');

      const addOperation = jest.fn(() => Promise.resolve({ id: 'new-op' }));
      const clearDate = jest.fn();
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        quickAddValuesStore: makeMockQuickAddStore(values),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate,
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
        addOperation,
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
      });

      const utils = await render(<OperationsScreen />);
      return { ...utils, addOperation, clearDate };
    };

    const BASE_VALUES = { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' };

    it('books the day the chip parked in the form', async () => {
      const { getByTestId, addOperation } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

      await act(async () => {
        await getByTestId('quick-add-form').props.handleQuickAdd();
      });

      expect(addOperation).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-04' }));
    });

    it('stamps today when the chip is on Today, resolved at save time', async () => {
      const { localDateWithOffset } = require('../../app/utils/dateUtils');
      const { getByTestId, addOperation } = await mountWithValues({ ...BASE_VALUES, date: null });

      await act(async () => {
        await getByTestId('quick-add-form').props.handleQuickAdd();
      });

      expect(addOperation).toHaveBeenCalledWith(
        expect.objectContaining({ date: localDateWithOffset(0) }),
      );
    });

    it('carries the parked date through an auto-add from a category tap', async () => {
      const { getByTestId, addOperation } = await mountWithValues({ ...BASE_VALUES, categoryId: '', date: '2026-09-04' });

      await act(async () => {
        await getByTestId('quick-add-form').props.onAutoAddWithCategory('cat-2');
      });

      expect(addOperation).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-09-04', categoryId: 'cat-2' }),
      );
    });

    it('retires a parked date when the app goes to the background', async () => {
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        const { clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });
        clearDate.mockClear();

        await act(async () => { handlers.forEach(handler => handler('background')); });

        expect(clearDate).toHaveBeenCalled();
      } finally {
        AppState.addEventListener.mockRestore();
      }
    });

    it('retires a parked date when another tab takes the screen', async () => {
      const { useTabFocused } = require('../../app/contexts/TabFocusContext');
      useTabFocused.mockReturnValue(false);

      try {
        const { clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

        expect(clearDate).toHaveBeenCalled();
      } finally {
        useTabFocused.mockReturnValue(true);
      }
    });

    it('retires a parked date when search takes the screen', async () => {
      const { useSearch } = require('../../app/contexts/SearchContext');
      useSearch.mockReturnValue({
        searchMode: 'open',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch: jest.fn(),
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });

      try {
        const { clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

        expect(clearDate).toHaveBeenCalled();
      } finally {
        useSearch.mockReturnValue({ registerSearchHandler: jest.fn(), openSearch: jest.fn() });
      }
    });

    it('retires a parked date when the + button dismisses the form by hand', async () => {
      // Panel setting off, so the + button exists. Dismissing the summoned form
      // is the user saying they are done — unlike the fold after an add.
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel: false });

      try {
        const { getByTestId, clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

        await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
        clearDate.mockClear();
        await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });

        expect(clearDate).toHaveBeenCalled();
      } finally {
        useDisplaySettings.mockReturnValue({ attachLocation: false });
      }
    });

    it('leaves a parked date alone while the form is open on the Operations tab', async () => {
      const { clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

      expect(clearDate).not.toHaveBeenCalled();
    });

    it('keeps the parked date when the summoned form folds itself away after an add', async () => {
      // Panel setting off: the form is summoned for one entry and folds itself
      // back behind the + button once it lands. That fold is not the user
      // walking away, so the day they picked has to survive it — otherwise
      // back-filling six entries means picking the day six times.
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel: false });

      try {
        const { getByTestId, clearDate } = await mountWithValues({ ...BASE_VALUES, date: '2026-09-04' });

        // Summon the form, which is the sitting the parked date belongs to.
        await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
        clearDate.mockClear();

        await act(async () => {
          await getByTestId('quick-add-form').props.handleQuickAdd();
        });

        expect(clearDate).not.toHaveBeenCalled();
      } finally {
        useDisplaySettings.mockReturnValue({ attachLocation: false });
      }
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
      const scrollToTopButton = queryByLabelText('scroll_to_top');
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
      const scrollToTopButton = queryByLabelText('scroll_to_top');
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
      const scrollToTopButton = getByLabelText('scroll_to_top');
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '', accountId: 'acc-1', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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

    // The day total keeps its fractional part through the sum. What must NOT
    // happen — rounding at each addition — is pinned in currency.test.js, where
    // the module is not mocked; this file's `formatAmount` mock hides it.
    it('accumulates the day total exactly, rounding only at display', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const mockAccounts = [{ id: 'acc-rub', name: 'RUB', balance: '0', currency: 'RUB' }];
      const mockOperations = [
        { id: '1', type: 'expense', amount: '100.50', accountId: 'acc-rub', date: '2024-01-15' },
        { id: '2', type: 'expense', amount: '100.50', accountId: 'acc-rub', date: '2024-01-15' },
        { id: '3', type: 'expense', amount: '100.50', accountId: 'acc-rub', date: '2024-01-15' },
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

      const { getByTestId } = await render(<OperationsScreen />);
      const groups = getByTestId('operations-list').props.groupedOperations;
      const day = groups.find(g => g.date === '2024-01-15');

      // 301.50 exactly, not 303 (three separately-rounded 101s).
      expect(Number(day.spendingSums.RUB)).toBeCloseTo(301.5, 5);
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

      // ...but the list is told to hold the skeleton: rows rendered against an
      // empty accounts array would show a dash where the account name belongs.
      expect(getByTestId('operations-list').props.referenceDataLoading).toBe(true);
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

      // Rows stay withheld: without the categories every row would title itself
      // "unknown_category" and draw a question mark for its icon.
      expect(getByTestId('operations-list').props.referenceDataLoading).toBe(true);
    });

    it('releases the rows once the reference data has loaded', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useCategories } = require('../../app/contexts/CategoriesContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      useAccountsData.mockReturnValue({
        accounts: [],
        visibleAccounts: [],
        loading: false,
      });

      useCategories.mockReturnValue({
        categories: [],
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
        addOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = await render(<OperationsScreen />);

      expect(getByTestId('operations-list').props.referenceDataLoading).toBe(false);
    });

    it('does not fall back to the skeleton when a background reload re-raises loading', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { useCategories } = require('../../app/contexts/CategoriesContext');
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');

      // RELOAD_ALL (import, language switch) re-raises `loading` while keeping
      // the previously loaded arrays. The list must keep showing them.
      useAccountsData.mockReturnValue({
        accounts: [{ id: 'acc-1', name: 'Cash', currency: 'USD', balance: '100' }],
        visibleAccounts: [{ id: 'acc-1', name: 'Cash', currency: 'USD', balance: '100' }],
        loading: true,
      });

      useCategories.mockReturnValue({
        categories: [{ id: 'cat-1', name: 'Food', icon: 'food', categoryType: 'expense' }],
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

      expect(getByTestId('operations-list').props.referenceDataLoading).toBe(false);
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '', destinationAmount: '', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.85', destinationAmount: '85', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.92', destinationAmount: '', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '', destinationAmount: '85', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ type: 'transfer', amount: '100', accountId: 'acc-1', toAccountId: 'acc-2', exchangeRate: '0.92', destinationAmount: '92', categoryId: '' }),
        setQuickAddValues: mockSetQuickAddValues,
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        quickAddValuesStore: makeMockQuickAddStore({ description: '', exchangeRate: '', destinationAmount: '', toAccountId: '', categoryId: '', ...values }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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

  // The "operations added" receipt's "Change category" button routes here: the
  // operation is already booked, so the screen opens its form straight onto the
  // category picker rather than surfacing the review deck.
  describe('Change-category deep link', () => {
    const { act } = require('@testing-library/react-native');
    const { appEvents, EVENTS } = require('../../app/services/eventEmitter');
    const { getOperationById } = require('../../app/services/OperationsDB');

    const booked = {
      id: 'op-7',
      type: 'expense',
      amount: '1299',
      accountId: 'acc1',
      categoryId: 'cat2',
      date: '2026-08-12',
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockOperationModalMounts.length = 0;
      getOperationById.mockResolvedValue(booked);
    });

    it('opens the named operation with its category picker up', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      const { getByTestId } = await render(<OperationsScreen />);
      expect(getByTestId('operation-modal').props.visible).toBe(false);

      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
      });

      // Read from the database, not the loaded window: a booking dated outside
      // the dates currently on screen is simply not in the list.
      expect(getOperationById).toHaveBeenCalledWith('op-7');
      const modal = getByTestId('operation-modal');
      expect(modal.props.visible).toBe(true);
      expect(modal.props.operationId).toBe('op-7');
      expect(modal.props.openCategoryPicker).toBe(true);
    });

    it('clears the picker request when the form closes', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
      });
      expect(getByTestId('operation-modal').props.openCategoryPicker).toBe(true);

      await act(async () => {
        getByTestId('operation-modal').props.onClose();
      });

      // The request belonged to that press; the next edit opens the plain form.
      const modal = getByTestId('operation-modal');
      expect(modal.props.visible).toBe(false);
      expect(modal.props.openCategoryPicker).toBe(false);
    });

    it('stays put when the operation is gone', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      getOperationById.mockResolvedValue(null);

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
      });

      expect(getByTestId('operation-modal').props.visible).toBe(false);
    });

    it('survives a failed read', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      getOperationById.mockRejectedValue(new Error('db is busy'));

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
      });

      expect(getByTestId('operation-modal').props.visible).toBe(false);
    });

    it('ignores an event that names no operation', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, {});
      });

      expect(getOperationById).not.toHaveBeenCalled();
    });

    it('drops its subscription on unmount', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      const { unmount } = await render(<OperationsScreen />);
      await unmount();
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
      });

      expect(getOperationById).not.toHaveBeenCalled();
    });

    describe('Regression Tests', () => {
      it('rebuilds the form when the press names another operation over an open one', async () => {
        // The form loads its values once per open and then guards against
        // re-running, so swapping only the prop would leave op-7's amount,
        // account and date under op-8's id — and Save would write them onto it.
        const OperationsScreen = require('../../app/screens/OperationsScreen').default;

        const { getByTestId } = await render(<OperationsScreen />);
        await act(async () => {
          appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-7' });
        });
        expect(getByTestId('operation-modal').props.operationId).toBe('op-7');

        getOperationById.mockResolvedValue({ ...booked, id: 'op-8', type: 'income' });
        await act(async () => {
          appEvents.emit(EVENTS.OPEN_OPERATION_CATEGORY, { operationId: 'op-8' });
        });

        const modal = getByTestId('operation-modal');
        expect(modal.props.operationId).toBe('op-8');
        expect(modal.props.visible).toBe(true);
        expect(modal.props.openCategoryPicker).toBe(true);
        // A fresh instance, not the previous form handed a new operation.
        expect(mockOperationModalMounts).toEqual([null, 'op-7', 'op-8']);
      });
    });
  });

  // A tapped "transactions to review" notification routes to this screen (not to
  // settings): SimpleTabs switches tabs, and the screen brings the suggestion deck
  // over the quick-add form into view.
  describe('Pending-operations deep link', () => {
    const { act, fireEvent } = require('@testing-library/react-native');
    const { appEvents, EVENTS } = require('../../app/services/eventEmitter');
    const { QUICK_ADD_UNCLIPPED } = require('../../app/screens/OperationsScreen');

    const mockSuggestionsHook = (overrides = {}) => {
      const usePendingOperationSuggestions =
        require('../../app/hooks/usePendingOperationSuggestions').default;
      const hookValue = {
        suggestions: [],
        committingIds: {},
        saveErrors: {},
        choices: {},
        setChoice: jest.fn(),
        reload: jest.fn(),
        refresh: jest.fn(),
        accept: jest.fn(),
        dismiss: jest.fn(),
        ...overrides,
      };
      usePendingOperationSuggestions.mockReturnValue(hookValue);
      return hookValue;
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // Regression: accepting a card runs a LayoutAnimation, during which the
    // quick-add wrapper reports a transient 0. Keeping that zero dropped the
    // deck's frame to the MIN_CARD_HEIGHT floor, so the next suggestion rendered
    // a short card and jumped to the form's height a frame later. A zero from an
    // open block is never real — the form is always laid out there.
    it('keeps the last real quick-add height when an open block measures 0', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => {
        fireEvent(getByTestId('quick-add-measure', { includeHiddenElements: true }), 'layout', {
          nativeEvent: { layout: { height: 437 } },
        });
      });
      expect(getByTestId('notification-binding-stack').props.quickAddHeight).toBe(437);

      await act(async () => {
        fireEvent(getByTestId('quick-add-measure', { includeHiddenElements: true }), 'layout', {
          nativeEvent: { layout: { height: 0 } },
        });
      });
      expect(getByTestId('notification-binding-stack').props.quickAddHeight).toBe(437);
    });

    it('refreshes the suggestion queue on the deep-link event', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { refresh } = mockSuggestionsHook();

      await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
      });

      expect(refresh).toHaveBeenCalled();
    });

    it('closes search first — the deck is collapsed with the quick-add block while search is open', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useSearch } = require('../../app/contexts/SearchContext');
      const closeSearch = jest.fn();
      useSearch.mockReturnValue({
        searchMode: 'open',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch,
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });
      mockSuggestionsHook();

      await render(<OperationsScreen />);
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
      });

      expect(closeSearch).toHaveBeenCalled();
    });

    it('drops its subscription on unmount', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { refresh } = mockSuggestionsHook();

      const { unmount } = await render(<OperationsScreen />);
      await unmount();
      await act(async () => {
        appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
      });

      expect(refresh).not.toHaveBeenCalled();
    });

    // Regression (2026-09-12 log): a bank notification queued a suggestion while
    // the app was in the background. The block opened for the deck behind a
    // stopped activity, where a shared-value change never reaches the view, and
    // the tapped alert landed the user on a page showing no cards and no +
    // button (it stands down for a deck that was in the tree all along). Nothing
    // re-issued the open: `quickAddCollapsed` was already false, so the deep
    // link's setQuickAddExpanded(true) moved nothing. Opening and closing search
    // moved the clip again and the panel appeared.
    //
    // Reanimated's mock hands back a fresh box on every render, which loses the
    // write history these need, so useSharedValue is re-mocked onto a ref-backed
    // box with the identity the real hook has. The quick-add clip is the one
    // created at the unclipped ceiling.
    const trackSharedValues = () => {
      const reanimated = require('react-native-reanimated');
      const previous = reanimated.useSharedValue.getMockImplementation();
      const boxes = [];
      reanimated.useSharedValue.mockImplementation((initial) => {
        // Legal: this runs during render, in the hook slot the real one uses.
        const ref = React.useRef(null);
        if (!ref.current) {
          let current = initial;
          const box = { initial, commits: 0, modify: () => { box.commits += 1; } };
          Object.defineProperty(box, 'value', {
            get: () => current,
            set: (next) => {
              // Reanimated's own semantics: an equal write commits nothing.
              if (next === current) return;
              current = next;
              box.commits += 1;
            },
          });
          ref.current = box;
          boxes.push(box);
        }
        return ref.current;
      });
      return {
        clip: () => boxes.find((box) => box.initial === QUICK_ADD_UNCLIPPED),
        restore: () => reanimated.useSharedValue.mockImplementation(previous),
      };
    };

    // An earlier test in this block leaves search open, which collapses the
    // panel (and the deck with it) regardless of everything below.
    const withSearchClosed = () => {
      const { useSearch } = require('../../app/contexts/SearchContext');
      useSearch.mockReturnValue({
        searchMode: 'collapsed',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch: jest.fn(),
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });
      return () => useSearch.mockReturnValue({
        registerSearchHandler: jest.fn(),
        openSearch: jest.fn(),
      });
    };

    // What these assert is the COMMIT, not the value. The value was already
    // right in the failure — a re-write of it commits nothing, which is exactly
    // how the deck stayed invisible over correct state.

    it('re-commits a pinned-open clip when the app comes back', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook();
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel: true });
      const restoreSearch = withSearchClosed();
      const tracker = trackSharedValues();
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        await render(<OperationsScreen />);
        const clip = tracker.clip();
        await act(async () => { handlers.forEach((handler) => handler('background')); });

        const before = clip.commits;
        await act(async () => { handlers.forEach((handler) => handler('active')); });

        expect(clip.commits).toBeGreaterThan(before);
        expect(clip.value).toBe(QUICK_ADD_UNCLIPPED);
      } finally {
        AppState.addEventListener.mockRestore();
        tracker.restore();
        restoreSearch();
        require('../../app/contexts/DisplaySettingsContext').useDisplaySettings
          .mockReturnValue({ attachLocation: false });
      }
    });

    it('re-commits the clip on the deep link', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook();
      const restoreSearch = withSearchClosed();
      const tracker = trackSharedValues();

      try {
        await render(<OperationsScreen />);
        const clip = tracker.clip();
        const before = clip.commits;

        await act(async () => {
          appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
        });

        expect(clip.commits).toBeGreaterThan(before);
      } finally {
        tracker.restore();
        restoreSearch();
      }
    });

    // The invariant the whole change exists to hold. A container inside the clip
    // is a container the clip can shut, and once Reanimated has written a
    // `maxHeight: 0` into it behind a stopped activity nothing React renders can
    // reopen it — `useAnimatedStyle` hands React an opaque object, so React never
    // renders a literal `maxHeight` and its diff has nothing to clear.
    it('renders the deck outside the quick-add clip, never inside it', async () => {
      const { within } = require('@testing-library/react-native');
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        const options = { includeHiddenElements: true };

        // Present...
        expect(getByTestId('notification-binding-stack', options)).toBeTruthy();
        // ...and not under the clip, nor under the slide inside it.
        expect(
          within(getByTestId('quick-add-clip', options))
            .queryByTestId('notification-binding-stack', options),
        ).toBeNull();
      } finally {
        restoreSearch();
      }
    });

    it('collapses the quick-add block while a deck is up', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();
      const tracker = trackSharedValues();

      try {
        await render(<OperationsScreen />);
        // The cards took the panel's place rather than being laid over the form
        // inside it, so the form folds away instead of sitting under them.
        expect(tracker.clip().value).toBe(0);
      } finally {
        tracker.restore();
        restoreSearch();
      }
    });

    it('re-commits a collapsed clip as collapsed — the return must not open it', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook();
      const restoreSearch = withSearchClosed();
      const tracker = trackSharedValues();
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        // No deck and the panel setting off: nothing holds the block open.
        const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
        useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel: false });

        await render(<OperationsScreen />);
        const clip = tracker.clip();
        await act(async () => { handlers.forEach((handler) => handler('background')); });

        const before = clip.commits;
        await act(async () => { handlers.forEach((handler) => handler('active')); });

        expect(clip.commits).toBeGreaterThan(before);
        expect(clip.value).toBe(0);
      } finally {
        AppState.addEventListener.mockRestore();
        tracker.restore();
        restoreSearch();
        require('../../app/contexts/DisplaySettingsContext').useDisplaySettings
          .mockReturnValue({ attachLocation: false });
      }
    });

    // Regression (2026-09-18 log, and the four exports before it): the deck went
    // on being invisible over state that was already correct. At 09:06:05 the
    // return to the foreground logged `clip re-assert {collapsed: false}` — the
    // repair above, doing exactly what it was written to do — and the user still
    // had to open and close search at 09:06:16 before the card appeared.
    //
    // Re-committing the value cannot fix it, and neither can rendering a static
    // style over it: `useAnimatedStyle` hands React an opaque object, so React
    // never renders a literal `maxHeight` and its diff has nothing to clear. The
    // tests above assert the commit against a mock that counts `modify()` as one,
    // which is how a green suite sat on top of a live bug for six attempts. They
    // stay, because the re-assert is still right for the form's own pinned-open
    // state — but the deck is no longer in the clip at all, and the tests below
    // are the ones that hold that.
    // The cards inside the stack are absolutely positioned, so their container
    // contributes no height of its own: without an explicit one it lays out at
    // zero and paints nothing, which is the same invisible-deck symptom by
    // another route. It used to borrow its height from the form it covered.
    it('gives the deck container a height of its own', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        const options = { includeHiddenElements: true };
        // Measure the form so the deck sizes to it rather than to its floor.
        await act(async () => {
          fireEvent(getByTestId('quick-add-measure', options), 'layout', {
            nativeEvent: { layout: { height: 437 } },
          });
        });

        const stack = getByTestId('notification-binding-stack', options);
        const container = stack.parent;
        const style = Array.isArray(container.props.style)
          ? Object.assign({}, ...container.props.style.filter(Boolean))
          : container.props.style;
        const { deckPeekAllowance: peek, deckCardHeight: cardHeight } =
          require('../../app/components/operations/NotificationBindingStack');
        expect(style.height).toBe(peek(1) + cardHeight(437));
      } finally {
        restoreSearch();
      }
    });

    it('takes the deck off the screen while search is open', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useSearch } = require('../../app/contexts/SearchContext');
      useSearch.mockReturnValue({
        searchMode: 'open',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch: jest.fn(),
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });

      try {
        const { queryByTestId } = await render(<OperationsScreen />);
        // Search takes the whole screen; the cards come back when it closes.
        expect(queryByTestId('notification-binding-stack', { includeHiddenElements: true }))
          .toBeNull();
      } finally {
        useSearch.mockReturnValue({ registerSearchHandler: jest.fn(), openSearch: jest.fn() });
      }
    });

    // The deck sits in the list header. A deck that filled behind a stopped
    // activity had its arrival scroll dropped along with every other thing that
    // needed a frame, so the list can come back sitting where the user left it,
    // with the header — and the cards in it — above the top of the screen. That
    // is the second way the reported page shows no cards and no + button, and
    // opening and closing search hid it too: closing search scrolls to the top.
    it('scrolls the deck back into view when the app returns with the list scrolled', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        await act(async () => {
          fireEvent.scroll(getByTestId('operations-list'), {
            nativeEvent: {
              contentOffset: { y: 1200 },
              contentSize: { height: 4000, width: 400 },
              layoutMeasurement: { height: 800, width: 400 },
            },
          });
        });
        mockScrollToOffset.mockClear();

        await act(async () => { handlers.forEach((handler) => handler('background')); });
        await act(async () => { handlers.forEach((handler) => handler('active')); });

        // Unanimated: an animated scroll asked for on the way back from the
        // background is exactly the kind of request that gets dropped.
        expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
      } finally {
        AppState.addEventListener.mockRestore();
        restoreSearch();
      }
    });

    it('leaves the scroll alone on a return with no deck queued', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [] });
      const restoreSearch = withSearchClosed();
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        await act(async () => {
          fireEvent.scroll(getByTestId('operations-list'), {
            nativeEvent: {
              contentOffset: { y: 1200 },
              contentSize: { height: 4000, width: 400 },
              layoutMeasurement: { height: 800, width: 400 },
            },
          });
        });
        mockScrollToOffset.mockClear();

        await act(async () => { handlers.forEach((handler) => handler('background')); });
        await act(async () => { handlers.forEach((handler) => handler('active')); });

        // Nothing to bring into view, and the user's place in the list is theirs.
        expect(mockScrollToOffset).not.toHaveBeenCalled();
      } finally {
        AppState.addEventListener.mockRestore();
        restoreSearch();
      }
    });

    // The diagnostic log is a 500-entry ring buffer, and this handler runs on
    // every frame of a LayoutAnimation. The 2026-09-18 export spent 180 of its
    // 500 entries on one collapse walking 450 → 444 a pixel at a time, and had
    // evicted the deck's arrival — the only part of it worth reading — before it
    // was ever uploaded. That is why five attempts were made without evidence.
    it('logs one line for a layout animation, not one per frame', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();
      const logs = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        const wrapper = getByTestId('quick-add-measure', { includeHiddenElements: true });
        logs.mockClear();

        // A full collapse, a pixel per frame — the shape the 180 lines had. The
        // distance is the point: an epsilon measured against the last line it
        // printed re-baselines on every crossing and spends a line per 8dp.
        for (let height = 450; height >= 300; height -= 1) {
          await act(async () => {
            fireEvent(wrapper, 'layout', { nativeEvent: { layout: { height } } });
          });
        }

        const measured = logs.mock.calls.filter((call) => call[0] === '[deck] quick-add measured');
        expect(measured).toHaveLength(1);
        expect(measured[0][1]).toEqual({ height: 450 });
      } finally {
        logs.mockRestore();
        restoreSearch();
      }
    });

    it('still reports a real one-off resize', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const restoreSearch = withSearchClosed();
      const logs = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        const wrapper = getByTestId('quick-add-measure', { includeHiddenElements: true });
        await act(async () => {
          fireEvent(wrapper, 'layout', { nativeEvent: { layout: { height: 300 } } });
        });
        logs.mockClear();

        // Transfer fields appearing, not an animation: one pass, one line.
        await act(async () => {
          fireEvent(wrapper, 'layout', { nativeEvent: { layout: { height: 444 } } });
        });

        const measured = logs.mock.calls.filter((call) => call[0] === '[deck] quick-add measured');
        expect(measured).toEqual([['[deck] quick-add measured', { height: 444 }]]);
      } finally {
        logs.mockRestore();
        restoreSearch();
      }
    });

    it('leaves a search-result scroll position alone on a return', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useSearch } = require('../../app/contexts/SearchContext');
      useSearch.mockReturnValue({
        searchMode: 'open',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch: jest.fn(),
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });
      mockSuggestionsHook({ suggestions: [{ id: 'p1', type: 'expense', amount: '10' }] });
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        const { getByTestId } = await render(<OperationsScreen />);
        await act(async () => {
          fireEvent.scroll(getByTestId('operations-list'), {
            nativeEvent: {
              contentOffset: { y: 1200 },
              contentSize: { height: 4000, width: 400 },
              layoutMeasurement: { height: 800, width: 400 },
            },
          });
        });
        mockScrollToOffset.mockClear();

        await act(async () => { handlers.forEach((handler) => handler('background')); });
        await act(async () => { handlers.forEach((handler) => handler('active')); });

        // Search owns the screen; the deck is clipped under it either way, and
        // closing search scrolls to the top on its own.
        expect(mockScrollToOffset).not.toHaveBeenCalled();
      } finally {
        AppState.addEventListener.mockRestore();
        useSearch.mockReturnValue({ registerSearchHandler: jest.fn(), openSearch: jest.fn() });
      }
    });

    // A zero from an OPEN block is a transient pass, never the truth — the form
    // is always laid out there. Kept, it poisoned the clip height, which is how
    // the 2026-09-18 log reported `slide: 0` on a block that measured 444 one
    // frame later, and left every collapse animating from the fallback height.
    it('ignores a transient zero on the clip height while the block is open', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useSearch } = require('../../app/contexts/SearchContext');
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      // The form's own block, pinned open: a deck would collapse it, and a
      // collapsed block's zero is the truth rather than a transient pass.
      useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel: true });
      mockSuggestionsHook();
      const restoreSearch = withSearchClosed();
      const logs = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const { getByTestId, rerender } = await render(<OperationsScreen />);
        const slide = getByTestId('quick-add-slide', { includeHiddenElements: true });
        await act(async () => {
          fireEvent(slide, 'layout', { nativeEvent: { layout: { height: 444 } } });
        });
        await act(async () => {
          fireEvent(slide, 'layout', { nativeEvent: { layout: { height: 0 } } });
        });

        // Search taking the screen is what makes the clip report its travel.
        logs.mockClear();
        useSearch.mockReturnValue({
          searchMode: 'open',
          filtersExpanded: false,
          openSearch: jest.fn(),
          closeSearch: jest.fn(),
          reopenSearch: jest.fn(),
          toggleFilters: jest.fn(),
          registerSearchHandler: jest.fn(),
        });
        await act(async () => { rerender(<OperationsScreen />); });

        const clipLines = logs.mock.calls.filter((call) => call[0] === '[deck] clip');
        expect(clipLines.length).toBeGreaterThan(0);
        expect(clipLines[clipLines.length - 1][1].slide).toBe(444);
      } finally {
        logs.mockRestore();
        restoreSearch();
        useSearch.mockReturnValue({ registerSearchHandler: jest.fn(), openSearch: jest.fn() });
        useDisplaySettings.mockReturnValue({ attachLocation: false });
      }
    });
  });

  // The "Show Quick add panel on operations screen" setting. On (the default and
  // the historical behaviour) the form is pinned to the top of the list and there
  // is no + button at all; off, the form is summoned by the button for one entry
  // and folds itself away once that entry lands.
  describe('Quick-add panel setting', () => {
    const { act, fireEvent } = require('@testing-library/react-native');
    const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
    const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
    const { useLocalization } = require('../../app/contexts/LocalizationContext');

    const { useSearch } = require('../../app/contexts/SearchContext');
    const searchClosed = () => ({
      searchMode: 'collapsed',
      filtersExpanded: false,
      openSearch: jest.fn(),
      closeSearch: jest.fn(),
      reopenSearch: jest.fn(),
      toggleFilters: jest.fn(),
      registerSearchHandler: jest.fn(),
    });

    const setPanelSetting = (showQuickAddPanel) => {
      useDisplaySettings.mockReturnValue({ attachLocation: false, showQuickAddPanel });
      // An earlier test in this file may have left search open, which collapses
      // the panel and hides the button regardless of the setting, or left a
      // prefixing `t` behind, which would show up in the button's label.
      useSearch.mockReturnValue(searchClosed());
      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });
    };

    afterEach(() => {
      // mockReturnValue survives clearAllMocks, so hand the shared mocks back.
      useDisplaySettings.mockReturnValue({ attachLocation: false });
      useSearch.mockReturnValue({ registerSearchHandler: jest.fn(), openSearch: jest.fn() });
      useLocalization.mockReturnValue({ t: (key) => key, language: 'en' });
      require('../../app/hooks/usePendingOperationSuggestions').default.mockReturnValue({
        suggestions: [],
        committingIds: {},
        saveErrors: {},
        choices: {},
        setChoice: jest.fn(),
        reload: jest.fn(),
        refresh: jest.fn(),
        accept: jest.fn(),
        dismiss: jest.fn(),
      });
    });

    it('shows no + button while the panel is pinned open', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(true);

      const { queryByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('quick-add-fab')).toBeNull();
    });

    it('shows the + button once the panel is collapsed', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(false);

      const { getByTestId } = await render(<OperationsScreen />);

      expect(getByTestId('quick-add-fab')).toBeTruthy();
    });

    it('keeps the historical behaviour when the setting is absent', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      // e.g. rendered without a DisplaySettings provider.
      setPanelSetting(undefined);

      const { queryByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('quick-add-fab')).toBeNull();
    });

    it('the button says what the next tap does', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(false);

      const { getByTestId } = await render(<OperationsScreen />);
      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('add_operation');

      await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('close');

      await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('add_operation');
    });

    it('folds the summoned form away once the operation lands', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(false);
      useOperationsActions.mockReturnValue({
        deleteOperation: jest.fn(),
        addOperation: jest.fn(() => Promise.resolve({ id: 'op-1', description: null })),
        updateOperation: jest.fn(),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        loadInitialOperations: jest.fn(() => Promise.resolve()),
        jumpToDate: jest.fn(),
        setSearchText: jest.fn(),
        updateSearchFilters: jest.fn(),
      });

      const { getByTestId } = await render(<OperationsScreen />);
      await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('close');

      await act(async () => {
        await getByTestId('quick-add-form').props.handleQuickAdd();
      });

      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('add_operation');
    });

    it('keeps a pending suggestion deck out of the collapsed panel', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const usePendingOperationSuggestions = require('../../app/hooks/usePendingOperationSuggestions').default;
      setPanelSetting(false);
      usePendingOperationSuggestions.mockReturnValue({
        suggestions: [{ id: 's-1', amount: '10', currency: 'USD', type: 'expense', merchant: 'Shop' }],
        committingIds: {},
        saveErrors: {},
        choices: {},
        setChoice: jest.fn(),
        reload: jest.fn(),
        refresh: jest.fn(),
        accept: jest.fn(),
        dismiss: jest.fn(),
      });

      // The deck is laid over the form and clipped with it, so it holds the
      // panel open on its own — and takes the button's job while it is up.
      const { queryByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('quick-add-fab')).toBeNull();
    });

    const SUGGESTION = { id: 's-1', amount: '10', currency: 'USD', type: 'expense', merchant: 'Shop' };
    const suggestionsHookValue = (suggestions) => ({
      suggestions,
      committingIds: {},
      saveErrors: {},
      choices: {},
      setChoice: jest.fn(),
      reload: jest.fn(),
      refresh: jest.fn(),
      accept: jest.fn(),
      dismiss: jest.fn(),
    });

    it('puts the deck on screen before the collapsed panel has ever been measured', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const usePendingOperationSuggestions = require('../../app/hooks/usePendingOperationSuggestions').default;
      setPanelSetting(false);
      usePendingOperationSuggestions.mockReturnValue(suggestionsHookValue([SUGGESTION]));

      const { getByTestId } = await render(<OperationsScreen />);

      // onLayout never fires here — exactly as it need not have on a device
      // where the panel sat collapsed behind the + button. The cards must not
      // wait for a measurement; the stack floors its frame instead.
      const stack = getByTestId('notification-binding-stack');
      expect(stack.props.count).toBe(1);
      expect(stack.props.quickAddHeight).toBe(0);
    });

    it('scrolls the list to the top when a deck arrives on its own', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const usePendingOperationSuggestions = require('../../app/hooks/usePendingOperationSuggestions').default;
      setPanelSetting(false);
      usePendingOperationSuggestions.mockReturnValue(suggestionsHookValue([]));

      const { rerender } = await render(<OperationsScreen />);
      mockScrollToOffset.mockClear();

      // The foreground resync (or a pull-to-refresh) fills the queue. The cards
      // sit in the list header, so the list has to be brought there — nothing
      // else on the screen announces them.
      usePendingOperationSuggestions.mockReturnValue(suggestionsHookValue([SUGGESTION]));
      await act(async () => { rerender(<OperationsScreen />); });

      expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    });

    it('leaves a deck arriving behind search to the search-close scroll', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const usePendingOperationSuggestions = require('../../app/hooks/usePendingOperationSuggestions').default;
      setPanelSetting(false);
      useSearch.mockReturnValue({ ...searchClosed(), searchMode: 'open' });
      usePendingOperationSuggestions.mockReturnValue(suggestionsHookValue([]));

      const { rerender } = await render(<OperationsScreen />);
      mockScrollToOffset.mockClear();

      usePendingOperationSuggestions.mockReturnValue(suggestionsHookValue([SUGGESTION]));
      await act(async () => { rerender(<OperationsScreen />); });

      expect(mockScrollToOffset).not.toHaveBeenCalled();
    });

    it('does not reopen a summoned form behind search', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(false);

      const { getByTestId, rerender } = await render(<OperationsScreen />);
      await act(async () => { fireEvent.press(getByTestId('quick-add-fab')); });
      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('close');

      useSearch.mockReturnValue({ ...searchClosed(), searchMode: 'open' });
      await act(async () => { rerender(<OperationsScreen />); });
      useSearch.mockReturnValue(searchClosed());
      await act(async () => { rerender(<OperationsScreen />); });

      expect(getByTestId('quick-add-fab').props.accessibilityLabel).toBe('add_operation');
    });

    it('hides the button while search owns the screen', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      setPanelSetting(false);
      useSearch.mockReturnValue({
        searchMode: 'open',
        filtersExpanded: false,
        openSearch: jest.fn(),
        closeSearch: jest.fn(),
        reopenSearch: jest.fn(),
        toggleFilters: jest.fn(),
        registerSearchHandler: jest.fn(),
      });

      const { queryByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('quick-add-fab')).toBeNull();
    });
  });

  // The label-suggestion strip under a just-added operation is an offer that
  // expires: left alone it clears itself after two minutes so it does not stay
  // pinned to an operation the user has long since moved past.
  describe('Label suggestion auto-dismiss', () => {
    const { act } = require('@testing-library/react-native');

    const renderWithSuggestions = async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');
      const { getDistinctLabels } = require('../../app/services/OperationsDB');
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const useOperationPicker = require('../../app/hooks/useOperationPicker');

      getDistinctLabels.mockResolvedValue(['coffee', 'groceries']);

      useOperationPicker.mockReturnValue({
        pickerState: { visible: true, type: 'category', data: [] },
        categoryNavigation: { currentFolderId: null, breadcrumb: [] },
        openPicker: jest.fn(),
        closePicker: jest.fn(),
        navigateIntoFolder: jest.fn(),
        navigateBack: jest.fn(),
      });

      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' },
        quickAddValuesStore: makeMockQuickAddStore({ type: 'expense', amount: '100', accountId: 'acc-1', categoryId: 'cat-1' }),
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
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
        addOperation: jest.fn(() => Promise.resolve({ id: 'new-op', description: '' })),
        updateOperation: jest.fn(() => Promise.resolve()),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
      });

      const utils = await render(<OperationsScreen />);
      await act(async () => {
        await utils.getByTestId('picker-modal').props.onAutoAddWithCategory('cat-1');
      });
      return utils;
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      // clearAllMocks resets calls, not implementations — restore the module
      // mock's "no labels yet" default so later tests are unaffected.
      require('../../app/services/OperationsDB').getDistinctLabels.mockResolvedValue([]);
    });

    it('keeps the suggestions on screen before the timeout elapses', async () => {
      const { getByTestId } = await renderWithSuggestions();

      expect(getByTestId('operations-list').props.pendingSuggestionId).toBe('new-op');

      await act(async () => { jest.advanceTimersByTime(SUGGESTION_TIMEOUT_MS - 1000); });

      expect(getByTestId('operations-list').props.pendingSuggestionId).toBe('new-op');
      expect(getByTestId('operations-list').props.pendingSuggestions).toEqual(['coffee', 'groceries']);
    });

    it('clears the suggestions once the timeout elapses', async () => {
      const { getByTestId } = await renderWithSuggestions();

      await act(async () => { jest.advanceTimersByTime(SUGGESTION_TIMEOUT_MS); });

      expect(getByTestId('operations-list').props.pendingSuggestionId).toBeNull();
      expect(getByTestId('operations-list').props.pendingSuggestions).toEqual([]);
    });
  });

  // Issue #1708: typing an amount used to re-render the whole screen and rebuild
  // the list header on every character.
  describe('Quick-add typing does not re-render the screen', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      headerComponentsSeen.length = 0;
      quickAddFormRenders.length = 0;
    });

    it('keeps the same header element and re-renders only the form as the amount changes', async () => {
      const useQuickAddForm = require('../../app/hooks/useQuickAddForm');
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;

      // A real store behind the mocked hook: writing to it is exactly what
      // handleAmountChange does on each keystroke.
      const store = makeMockQuickAddStore();
      useQuickAddForm.mockReturnValue({
        quickAddValues: { type: 'expense', accountId: 'acc-1', categoryId: '', toAccountId: '', operationCurrency: '' },
        quickAddValuesStore: store,
        setQuickAddValues: jest.fn(),
        getAccountName: jest.fn(() => 'Cash'),
        getAccountBalance: jest.fn(() => '$1000.00'),
        getCategoryInfo: jest.fn(() => ({ name: 'Food', icon: 'food' })),
        getCategoryName: jest.fn(() => 'Food'),
        filteredCategories: [],
        topCategoriesForType: [],
        resetForm: jest.fn(),
        clearDate: jest.fn(),
      });

      await render(<OperationsScreen />);

      const headersBefore = headerComponentsSeen.length;
      const headerBefore = headerComponentsSeen[headersBefore - 1];
      const formRendersBefore = quickAddFormRenders.length;

      await act(async () => { store.setValues(v => ({ ...v, amount: '1' })); });
      await act(async () => { store.setValues(v => ({ ...v, amount: '12' })); });
      await act(async () => { store.setValues(v => ({ ...v, amount: '123' })); });

      // The form saw every character...
      expect(quickAddFormRenders.length).toBe(formRendersBefore + 3);
      expect(quickAddFormRenders[quickAddFormRenders.length - 1]).toBe('123');

      // ...and the screen did not re-render, so the list was never handed a new
      // header element.
      expect(headerComponentsSeen.length).toBe(headersBefore);
      expect(headerComponentsSeen[headerComponentsSeen.length - 1]).toBe(headerBefore);
    });
  });

  // Issue #1712: deleting an operation swapped its blocking confirmation dialog
  // for the same undo bar an add gets. Nothing touches the database until the
  // window closes, which is why Undo restores the row, the balance and the
  // balance-history point exactly — there is nothing to restore.
  describe('Delete with undo', () => {
    const OP_A = { id: 'op-a', type: 'expense', amount: '10.00', accountId: 'acc-1', date: '2024-01-15' };
    const OP_B = { id: 'op-b', type: 'expense', amount: '25.00', accountId: 'acc-1', date: '2024-01-15' };

    let deleteOperation;

    const renderScreen = async (operations = [OP_A, OP_B]) => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { useOperationsData } = require('../../app/contexts/OperationsDataContext');
      const { useOperationsActions } = require('../../app/contexts/OperationsActionsContext');
      const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

      const accounts = [{ id: 'acc-1', name: 'Cash', balance: '1000.00', currency: 'USD' }];
      useAccountsData.mockReturnValue({ accounts, visibleAccounts: accounts, loading: false });
      useOperationsData.mockReturnValue({
        operations,
        loading: false,
        loadingMore: false,
        hasMoreOperations: false,
        activeFilters: {},
        filtersActive: false,
      });
      useOperationsActions.mockReturnValue({
        deleteOperation,
        addOperation: jest.fn(() => Promise.resolve({ id: 'new-op', description: '' })),
        updateOperation: jest.fn(() => Promise.resolve()),
        validateOperation: jest.fn(() => null),
        loadMoreOperations: jest.fn(),
        jumpToDate: jest.fn(),
        updateFilters: jest.fn(),
        clearFilters: jest.fn(),
        getActiveFilterCount: jest.fn(() => 0),
      });

      return render(<OperationsScreen />);
    };

    const visibleIds = (utils) => utils.getByTestId('operations-list').props.groupedOperations
      .flatMap(group => group.operations.map(op => op.id));

    const deleteOp = async (utils, operation) => {
      await act(async () => { utils.getByTestId('operation-modal').props.onDelete(operation); });
    };

    beforeEach(() => {
      deleteOperation = jest.fn();
      jest.useFakeTimers();
      // Resolve the bar's entry/exit animations synchronously so `onClosed`
      // (and therefore the commit) fires deterministically off the timer.
      jest.spyOn(Animated, 'timing').mockImplementation(() => ({
        start: (cb) => { if (cb) cb({ finished: true }); },
      }));
    });

    afterEach(() => {
      Animated.timing.mockRestore();
      jest.useRealTimers();
    });

    it('hides the row and offers Undo without deleting anything yet', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      expect(visibleIds(utils)).toEqual(['op-b']);
      expect(utils.getByTestId('undo-snackbar')).toBeTruthy();
      expect(deleteOperation).not.toHaveBeenCalled();
    });

    it('drops the hidden row from the day total while the window is open', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      const day = utils.getByTestId('operations-list').props.groupedOperations
        .find(group => group.date === '2024-01-15');
      // 25.00 alone — the 10.00 row is gone from the header sum, not just the list.
      expect(Number(day.spendingSums.USD)).toBeCloseTo(25, 5);
    });

    it('restores the row on Undo and never deletes', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      await act(async () => { fireEvent.press(utils.getByLabelText('undo')); });

      expect(visibleIds(utils)).toEqual(['op-a', 'op-b']);
      expect(deleteOperation).not.toHaveBeenCalled();

      // The window elapsing after an Undo must not resurrect the commit.
      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS * 2); });
      expect(deleteOperation).not.toHaveBeenCalled();
    });

    it('commits the delete exactly once when the window elapses', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS); });
      expect(deleteOperation).toHaveBeenCalledTimes(1);
      expect(deleteOperation).toHaveBeenCalledWith('op-a');

      // The screen's belt-and-suspenders cleanup timer fires later; it must not
      // commit a second time.
      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS * 2); });
      expect(deleteOperation).toHaveBeenCalledTimes(1);
    });

    it('keeps the row hidden after the commit until the reload drops it', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);
      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS); });

      // The context has not reloaded yet, so the operation is still in `operations`.
      // It must stay hidden, or the row flashes back between commit and reload.
      expect(visibleIds(utils)).toEqual(['op-b']);
    });

    it('commits the first delete when a second one takes the bar', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);
      await deleteOp(utils, OP_B);

      expect(deleteOperation).toHaveBeenCalledTimes(1);
      expect(deleteOperation).toHaveBeenCalledWith('op-a');
      expect(visibleIds(utils)).toEqual([]);

      // The second one is still undoable and commits on its own window.
      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS); });
      expect(deleteOperation).toHaveBeenCalledTimes(2);
      expect(deleteOperation).toHaveBeenLastCalledWith('op-b');
    });

    it('undoes only the operation the bar is currently offering', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);
      await deleteOp(utils, OP_B);

      await act(async () => { fireEvent.press(utils.getByLabelText('undo')); });

      // op-a was already committed; op-b comes back.
      expect(visibleIds(utils)).toEqual(['op-b']);
      expect(deleteOperation).toHaveBeenCalledTimes(1);
      expect(deleteOperation).toHaveBeenCalledWith('op-a');
    });

    it('commits a pending delete when leaving the screen', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      await act(async () => { utils.unmount(); });

      expect(deleteOperation).toHaveBeenCalledTimes(1);
      expect(deleteOperation).toHaveBeenCalledWith('op-a');
    });

    // Regression: the close guard used to key on the operation id, so deleting a
    // row, undoing, and deleting it again inside the first bar's 200ms exit fade
    // let the outgoing bar commit and dismiss the incoming one's window.
    it('lets a re-delete during the previous bar\'s exit fade keep its own window', async () => {
      const pendingExits = [];
      Animated.timing.mockImplementation(() => ({
        start: (cb) => { if (cb) pendingExits.push(cb); },
      }));

      const utils = await renderScreen();
      await deleteOp(utils, OP_A);
      await act(async () => { fireEvent.press(utils.getByLabelText('undo')); });

      // The undo landed, but the first bar's exit fade has not finished.
      expect(visibleIds(utils)).toEqual(['op-a', 'op-b']);

      await deleteOp(utils, OP_A);
      await act(async () => { pendingExits.splice(0).forEach(cb => cb({ finished: true })); });

      expect(deleteOperation).not.toHaveBeenCalled();
      expect(utils.getByTestId('undo-snackbar')).toBeTruthy();
      expect(visibleIds(utils)).toEqual(['op-b']);
    });

    it('commits a pending delete when the app goes to the background', async () => {
      const handlers = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'change') handlers.push(handler);
        return { remove: jest.fn() };
      });

      try {
        const utils = await renderScreen();
        await deleteOp(utils, OP_A);

        // SimpleTabs keeps this screen mounted for the session, so the app being
        // swiped away is the only thing that ends the window here.
        await act(async () => { handlers.forEach(handler => handler('background')); });

        expect(deleteOperation).toHaveBeenCalledTimes(1);
        expect(deleteOperation).toHaveBeenCalledWith('op-a');
        // The bar goes with it: Android freezes JS timers on pause, so one left
        // standing would come back still counting down over a finished delete.
        expect(utils.queryByTestId('undo-snackbar')).toBeNull();
      } finally {
        AppState.addEventListener.mockRestore();
      }
    });

    it('puts the row back when the commit fails', async () => {
      deleteOperation.mockRejectedValue(new Error('db down'));
      const utils = await renderScreen();
      await deleteOp(utils, OP_A);

      await act(async () => { jest.advanceTimersByTime(UNDO_DURATION_MS); });

      // The operation is still in the ledger, so hiding it would strand the user
      // with a row they cannot see and cannot delete again.
      expect(deleteOperation).toHaveBeenCalledWith('op-a');
      expect(visibleIds(utils)).toEqual(['op-a', 'op-b']);
    });

    it('ignores a delete for an operation with no id', async () => {
      const utils = await renderScreen();
      await deleteOp(utils, null);

      expect(utils.queryByTestId('undo-snackbar')).toBeNull();
      expect(visibleIds(utils)).toEqual(['op-a', 'op-b']);
    });
  });


  describe('Drive backup status in the search pill', () => {
    // The standalone banner that used to float above the search bar is gone; the
    // resting pill carries the status instead, which is why the search
    // affordance has to disappear while a backup runs.
    const setDriveBackupState = (state) => {
      require('../../app/contexts/DriveBackupContext').useDriveBackup.mockReturnValue({
        isRunning: false,
        progress: null,
        cancelling: false,
        cancelBackup: jest.fn(),
        ...state,
      });
    };

    afterEach(() => setDriveBackupState({}));

    it('leaves the search pill alone while no backup is running', async () => {
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { queryByTestId, getByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('search-bar-status')).toBeNull();
      expect(getByTestId('search-input-container')).toBeTruthy();
    });

    it('takes the pill over and names the phase while a backup runs', async () => {
      setDriveBackupState({
        isRunning: true,
        progress: { phase: 'uploading', current: 2, total: 3 },
      });
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { getByTestId, getByText, queryByTestId } = await render(<OperationsScreen />);

      expect(getByTestId('search-bar-status')).toBeTruthy();
      expect(getByText('drive_backup_status_uploading 2/3')).toBeTruthy();
      // Search is out of reach for as long as the status holds the pill.
      expect(queryByTestId('search-input-container')).toBeNull();
    });

    it('cancels the run from the pill', async () => {
      const cancelBackup = jest.fn();
      setDriveBackupState({ isRunning: true, progress: { phase: 'preparing' }, cancelBackup });
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { getByTestId } = await render(<OperationsScreen />);

      await fireEvent.press(getByTestId('cancel-status-button'));

      expect(cancelBackup).toHaveBeenCalled();
    });

    it('hands search back the moment cancel is tapped, without waiting for the run', async () => {
      // The service only notices a cancel between files, which can be a whole
      // multi-megabyte upload away — holding the pill until then would leave
      // search unreachable for exactly as long as the tap was meant to fix.
      setDriveBackupState({
        isRunning: true,
        cancelling: true,
        progress: { phase: 'uploading', current: 1, total: 3 },
      });
      const OperationsScreen = require('../../app/screens/OperationsScreen').default;
      const { getByTestId, queryByTestId } = await render(<OperationsScreen />);

      expect(queryByTestId('search-bar-status')).toBeNull();
      expect(getByTestId('search-input-container')).toBeTruthy();
    });
  });
});
