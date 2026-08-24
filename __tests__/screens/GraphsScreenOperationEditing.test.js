/**
 * The pie-chart drill-down used to be a dead end: you could see an operation in
 * a leaf category but not open it. These cover the wiring GraphsScreen adds for
 * that — the account-name lookup handed to the list, and the OperationModal the
 * screen mounts when a row is pressed.
 *
 * Both pie charts are stubbed with a button that fires their onOperationPress,
 * so the test drives the wiring without walking the whole drill-down.
 */

/* eslint-disable react/prop-types */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff', surface: '#f5f5f5', primary: '#2196f3',
      text: '#000000', mutedText: '#666666', border: '#e0e0e0', card: '#ffffff',
    },
  })),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(() => ({ t: jest.fn((key) => key), language: 'en' })),
}));

// The real context memoises its value; a factory that built a fresh array on
// every call would hand the screen a new `accounts` reference each render and
// spin its account-dependent effects forever.
const mockAccountsValue = { accounts: [{ id: 'acc-1', name: 'Ameria', currency: 'USD' }] };
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: jest.fn(() => mockAccountsValue),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../app/services/OperationsDB', () => ({
  getSpendingByCategoryAndCurrency: jest.fn(() => Promise.resolve([])),
  getIncomeByCategoryAndCurrency: jest.fn(() => Promise.resolve([])),
  getUnconvertibleCurrencies: jest.fn(() => Promise.resolve([])),
  getOperationsByCategoryAndCurrency: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../assets/currencies.json', () => ({
  USD: { name: 'US Dollar', symbol: '$', decimal_digits: 2 },
}), { virtual: true });

const OPERATION = { id: 'op-1', accountId: 'acc-1', amount: '10.00', date: '2024-03-05', type: 'expense' };

// Captures the props each chart is handed, and exposes a button that fires the
// press handler the drill-down list would otherwise fire.
const chartProps = {};
const mockChart = (key) => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return function MockChart(props) {
    chartProps[key] = props;
    return React.createElement(
      TouchableOpacity,
      { testID: `${key}-open-operation`, onPress: () => props.onOperationPress(OPERATION) },
      React.createElement(Text, null, 'open'),
    );
  };
};

// The rest of the screen's cards are irrelevant here and pull in their own data
// hooks — with a real account in the context they would query services this file
// has no reason to mock.
jest.mock('../../app/components/graphs/BalanceHistoryCard', () => () => null);
jest.mock('../../app/components/graphs/TrendsCard', () => () => null);
jest.mock('../../app/components/graphs/OperationsHeatmapCard', () => () => null);

jest.mock('../../app/components/graphs/ExpensePieChart', () => mockChart('expense'));
jest.mock('../../app/components/graphs/IncomePieChart', () => mockChart('income'));

jest.mock('../../app/modals/OperationModal', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return function MockOperationModal({ visible, operation, onClose }) {
    if (!visible) return null;
    return React.createElement(
      View,
      { testID: 'operation-modal', onTouchEnd: onClose },
      React.createElement(Text, null, operation ? operation.id : 'none'),
    );
  };
});

const GraphsScreen = require('../../app/screens/GraphsScreen').default;
const { useAccountsData } = require('../../app/contexts/AccountsDataContext');

describe('GraphsScreen — editing an operation from the drill-down', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks leaves a mockReturnValue in place, so restore the shared
    // accounts rather than letting one test's override reach the next.
    useAccountsData.mockReturnValue(mockAccountsValue);
  });

  it('resolves the account name for the drill-down list', async () => {
    await render(<GraphsScreen />);

    expect(chartProps.expense.getAccountName('acc-1')).toBe('Ameria');
  });

  // Account ids survive a CSV / Sheets round trip as strings; the lookup must
  // not miss an account whose own id came back as a number.
  it('matches an account id across string and number forms', async () => {
    useAccountsData.mockReturnValue({ accounts: [{ id: 7, name: 'Cash', currency: 'USD' }] });

    await render(<GraphsScreen />);

    expect(chartProps.expense.getAccountName('7')).toBe('Cash');
  });

  it('names no account for an id it does not know', async () => {
    await render(<GraphsScreen />);

    expect(chartProps.expense.getAccountName('missing')).toBe('');
  });

  // The modal is mounted on demand rather than kept in the tree, so the Graphs
  // tab does not carry the operation form for the whole session.
  it('does not mount the operation modal until a row is pressed', async () => {
    const { queryByTestId } = await render(<GraphsScreen />);

    expect(queryByTestId('operation-modal')).toBeNull();
  });

  it('opens the pressed operation', async () => {
    const { getByTestId, getByText } = await render(<GraphsScreen />);

    // A collapsed chart panel is hidden from accessibility, and so from the
    // queries too — open the income tab before reaching into its chart.
    await fireEvent.press(getByTestId('income-summary-card'));
    await fireEvent.press(getByTestId('income-open-operation'));

    expect(getByTestId('operation-modal')).toBeTruthy();
    expect(getByText('op-1')).toBeTruthy();
  });
});
