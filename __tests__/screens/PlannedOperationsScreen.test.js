// __tests__/screens/PlannedOperationsScreen.test.js
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PlannedOperationsScreen from '../../app/screens/PlannedOperationsScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#111318',
      surface: '#1a1d24',
      card: '#1a1d24',
      text: '#e8eaf0',
      mutedText: '#7a7f8e',
      border: '#252830',
      primary: '#4A90D9',
      expense: '#e57373',
      income: '#66bb6a',
      transfer: '#64b5f6',
      altRow: '#16191f',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn() }),
}));

const mockExecute = jest.fn();
const mockDelete = jest.fn();
const mockIsExecuted = jest.fn();

jest.mock('../../app/contexts/PlannedOperationsContext', () => ({
  usePlannedOperations: () => ({
    plannedOperations: [
      { id: 'r1', name: 'Rent', type: 'expense', amount: '300000', accountId: 1, categoryId: 'cat1', isRecurring: 1 },
      { id: 'r2', name: 'Salary', type: 'income', amount: '1379600', accountId: 1, categoryId: 'cat2', isRecurring: 1 },
      { id: 'o1', name: 'Italy savings', type: 'expense', amount: '100000', accountId: 1, categoryId: null, isRecurring: 0 },
    ],
    loading: false,
    executePlannedOperation: mockExecute,
    deletePlannedOperation: mockDelete,
    isExecutedThisMonth: mockIsExecuted,
  }),
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    visibleAccounts: [{ id: 1, name: 'Ameria', currency: 'AMD' }],
  }),
}));

jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: 'cat1', name: 'Housing', icon: 'home' },
      { id: 'cat2', name: 'Income', icon: 'briefcase' },
    ],
  }),
}));

jest.mock('../../app/modals/PlannedOperationModal', () => () => null);
jest.mock('../../app/components/AddFAB', () => () => null);
jest.mock('../../app/components/LoadingView', () => () => null);
jest.mock('../../app/components/EmptyState', () => () => null);

// ── Helpers ────────────────────────────────────────────────────────────────
function renderScreen() {
  return render(<PlannedOperationsScreen />);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('PlannedOperationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsExecuted.mockReturnValue(false);
  });

  describe('Section structure', () => {
    it('does not render a Recurring tab button', () => {
      const { queryByText } = renderScreen();
      expect(queryByText('recurring')).toBeNull();
    });

    it('renders Recurring section header', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('section-header-recurring')).toBeTruthy();
    });

    it('renders One-time section header', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('section-header-one_time')).toBeTruthy();
    });

    it('renders recurring items under Recurring section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Rent')).toBeTruthy();
      expect(getByText('Salary')).toBeTruthy();
    });

    it('renders one-time items under One-time section', () => {
      const { getByText } = renderScreen();
      expect(getByText('Italy savings')).toBeTruthy();
    });
  });

  describe('Summary strip', () => {
    it('shows pending out amount for un-executed expenses', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('summary-pending-out')).toBeTruthy();
    });

    it('shows done count as X / Y', () => {
      mockIsExecuted.mockImplementation((op) => op.id === 'r2');
      const { getByTestId } = renderScreen();
      const counter = getByTestId('summary-done-count');
      expect(counter.props.children).toContain('1');
    });

    it('shows pending in amount for un-executed income', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('summary-pending-in')).toBeTruthy();
    });

    it('renders progress bar', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId('summary-progress-bar')).toBeTruthy();
    });
  });

  describe('Executed item state', () => {
    it('renders checkmark badge on executed item icon', () => {
      mockIsExecuted.mockImplementation((op) => op.id === 'r2');
      const { getByTestId } = renderScreen();
      expect(getByTestId('check-badge-r2')).toBeTruthy();
    });

    it('does not render checkmark badge on un-executed item', () => {
      mockIsExecuted.mockReturnValue(false);
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('check-badge-r1')).toBeNull();
    });

    it('wraps executed item in low-opacity view', () => {
      mockIsExecuted.mockImplementation((op) => op.id === 'r1');
      const { getByTestId } = renderScreen();
      const wrapper = getByTestId('item-opacity-r1');
      expect(wrapper.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ opacity: 0.4 })]),
      );
    });
  });

  describe('Execute action', () => {
    it('calls executePlannedOperation when execute swipe action is pressed', async () => {
      mockIsExecuted.mockReturnValue(false);
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('execute-action-r1'));
      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'r1' }),
        );
      });
    });

    it('does not render execute action for executed items', () => {
      mockIsExecuted.mockReturnValue(true);
      const { queryByTestId } = renderScreen();
      expect(queryByTestId('execute-action-r1')).toBeNull();
    });
  });
});
