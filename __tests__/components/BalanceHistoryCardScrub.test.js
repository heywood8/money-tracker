/**
 * Regression tests for the balance header's day counter.
 *
 * The header read the chart's press state unconditionally. Victory's press state
 * starts at x = 0 and Reanimated fires a reaction once on mount, so the card
 * reported "day 0/31" on a month the user had never touched — the mount-time
 * reset could not undo it, because the reaction's runOnJS hop lands after the
 * mount effects have already run.
 *
 * jest.setup.js stubs `useAnimatedReaction` to a no-op and `runOnJS` to a
 * synchronous call, which hides both halves of that race, so this file mocks
 * Reanimated closer to the real thing: the reaction fires on mount, and runOnJS
 * defers to a task.
 */

import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock(
  'react-native-reanimated',
  () => {
    const ReactLib = require('react');
    const shared = (v) => ({ value: v });
    return {
      __esModule: true,
      default: {},
      useSharedValue: shared,
      useDerivedValue: (fn) => shared(typeof fn === 'function' ? fn() : undefined),
      // Fires once after mount (and whenever deps change) with previous = null,
      // mirroring Reanimated's own first run on the UI thread.
      useAnimatedReaction: (prepare, react, deps) => {
        ReactLib.useEffect(() => {
          react(prepare(), null);
        }, deps ?? []);
      },
      // The UI → JS thread hop: never synchronous.
      runOnJS: (fn) => (...fnArgs) => { setTimeout(() => fn(...fnArgs), 0); },
      useAnimatedStyle: (fn) => (typeof fn === 'function' ? fn() : {}),
      withTiming: (v) => v,
      withSpring: (v) => v,
    };
  },
  { virtual: true },
);

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { BALANCE_CHART_COMPARISON: 'balance_chart_comparison' },
  getJsonPreference: jest.fn(() => Promise.resolve(null)),
  setJsonPreference: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../app/components/SimplePicker', () => 'SimplePicker');
jest.mock('../../app/components/graphs/BalanceHistoryCalendarView', () => 'BalanceHistoryCalendarView');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('../../assets/currencies.json', () => ({ USD: { decimal_digits: 2 } }));

const victoryNative = require('victory-native');
const BalanceHistoryCard = require('../../app/components/graphs/BalanceHistoryCard').default;

const mockColors = {
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  altRow: '#f5f5f5',
  border: '#e0e0e0',
  surface: '#fff',
};

const mockT = (key) => key;

const mockAccounts = [{ id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000.00' }];
const mockAccountItems = [{ label: 'Checking', value: 'acc1' }];

// August 2026 — 31 days, matching the month the bug was reported on.
const balanceHistoryData = {
  labels: [1, 10, 21],
  actual: [
    { x: 1, y: 520 },
    { x: 10, y: 450 },
    { x: 21, y: 268 },
  ],
  actualForChart: [520, 450, 268],
  burndown: [],
  prevMonth: [],
};

const renderCard = async () => render(
  <BalanceHistoryCard
    colors={mockColors}
    t={mockT}
    selectedAccount="acc1"
    onAccountChange={jest.fn()}
    accountItems={mockAccountItems}
    loadingBalanceHistory={false}
    balanceHistoryData={balanceHistoryData}
    selectedYear={2026}
    selectedMonth={7}
    accounts={mockAccounts}
    isCurrentMonth
    spendingPrediction={null}
    balanceHistoryTableData={[]}
    editingBalanceValue=""
    onEditingBalanceValueChange={jest.fn()}
    onEditBalance={jest.fn()}
    onCancelEdit={jest.fn()}
    onSaveBalance={jest.fn()}
    onDeleteBalance={jest.fn()}
    onShowCalendar={jest.fn()}
  />,
);

describe('BalanceHistoryCard day counter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 21, 1, 27));
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows today, not day 0, when the chart has never been touched', async () => {
    const { queryByText } = await renderCard();

    // Let the mount-time reaction's runOnJS hop land.
    await act(async () => { jest.runAllTimers(); });

    expect(queryByText('day 0/31')).toBeNull();
    expect(queryByText('day 21/31')).toBeTruthy();
  });

  it('reports the pressed day while a finger is down on the chart', async () => {
    jest.spyOn(victoryNative, 'useChartPressState').mockReturnValue({
      state: {
        isActive: { value: true },
        matchedIndex: { value: 2 },
        x: { value: { value: 12.4 }, position: { value: 0 } },
        y: new Proxy({}, { get: () => ({ value: { value: 0 }, position: { value: 0 } }) }),
      },
      isActive: true,
    });

    const { queryByText } = await renderCard();

    await act(async () => { jest.runAllTimers(); });

    expect(queryByText('day 12/31')).toBeTruthy();
  });
});
