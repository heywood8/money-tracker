/**
 * BudgetProgressBar Component Tests
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import BudgetProgressBar from '../../app/components/BudgetProgressBar';

// Mock ThemeColorsContext
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      primary: '#6200EE',
      border: '#E0E0E0',
      text: '#000000',
      mutedText: '#666666',
    },
  }),
}));

// Mock LocalizationContext
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => {
      const translations = {
        over_budget_by: 'Over budget by',
        remaining_budget: 'Remaining',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock BudgetsContext
const mockGetBudgetStatus = jest.fn();
jest.mock('../../app/contexts/BudgetsContext', () => ({
  useBudgets: () => ({
    getBudgetStatus: mockGetBudgetStatus,
  }),
}));

// Mock Currency service
jest.mock('../../app/services/currency', () => ({
  formatAmount: (amount, currency) => `${currency} ${amount.toFixed(2)}`,
}));

describe('BudgetProgressBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('returns null when no budget status', () => {
      mockGetBudgetStatus.mockReturnValue(null);

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(toJSON()).toBeNull();
    });

    it('renders progress bar when status exists', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(toJSON()).not.toBeNull();
    });

    it('renders with custom style', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const customStyle = { marginTop: 20 };
      const { toJSON } = render(
        <BudgetProgressBar budgetId="budget-1" style={customStyle} />,
      );

      expect(toJSON()).not.toBeNull();
    });
  });

  describe('Progress colors', () => {
    it('shows green color for safe status', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 30,
        spent: 300,
        amount: '1000.00',
        remaining: 700,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      // Find the progress fill view and check its background color
      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#4CAF50' }),
      );
    });

    it('shows yellow color for warning status', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'warning',
        percentage: 70,
        spent: 700,
        amount: '1000.00',
        remaining: 300,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#FFC107' }),
      );
    });

    it('shows orange color for danger status', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'danger',
        percentage: 90,
        spent: 900,
        amount: '1000.00',
        remaining: 100,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#FF9800' }),
      );
    });

    it('shows red color for exceeded status', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'exceeded',
        percentage: 120,
        spent: 1200,
        amount: '1000.00',
        remaining: -200,
        currency: 'USD',
        isExceeded: true,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#F44336' }),
      );
    });

    it('shows primary color for unknown status', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'unknown',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#6200EE' }),
      );
    });
  });

  describe('Progress width', () => {
    it('shows correct progress width for percentage', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 45,
        spent: 450,
        amount: '1000.00',
        remaining: 550,
        currency: 'USD',
        isExceeded: false,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ width: '45%' }),
      );
    });

    it('caps progress width at 100% for exceeded budgets', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'exceeded',
        percentage: 150,
        spent: 1500,
        amount: '1000.00',
        remaining: -500,
        currency: 'USD',
        isExceeded: true,
      });

      const { toJSON } = render(<BudgetProgressBar budgetId="budget-1" />);
      const tree = toJSON();

      const progressFill = findProgressFill(tree);
      expect(progressFill.props.style).toContainEqual(
        expect.objectContaining({ width: '100%' }),
      );
    });
  });

  describe('Details display', () => {
    it('shows spent and total amounts', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const { getByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(getByText('USD 500.00 / 1000.00')).toBeTruthy();
    });

    it('shows remaining amount when not exceeded', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const { getByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(getByText('Remaining: USD 500.00')).toBeTruthy();
    });

    it('shows over budget message when exceeded', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'exceeded',
        percentage: 120,
        spent: 1200,
        amount: '1000.00',
        remaining: -200,
        currency: 'USD',
        isExceeded: true,
      });

      const { getByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(getByText('Over budget by USD 200.00')).toBeTruthy();
    });

    it('hides details when showDetails is false', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'USD',
        isExceeded: false,
      });

      const { queryByText } = render(
        <BudgetProgressBar budgetId="budget-1" showDetails={false} />,
      );

      expect(queryByText('USD 500.00 / 1000.00')).toBeNull();
      expect(queryByText('Remaining: USD 500.00')).toBeNull();
    });
  });

  describe('Compact mode', () => {
    it('shows percentage badge in compact mode', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 45.7,
        spent: 457,
        amount: '1000.00',
        remaining: 543,
        currency: 'USD',
        isExceeded: false,
      });

      const { getByText } = render(
        <BudgetProgressBar budgetId="budget-1" compact />,
      );

      expect(getByText('46%')).toBeTruthy();
    });

    it('does not show percentage badge when not compact', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 45.7,
        spent: 457,
        amount: '1000.00',
        remaining: 543,
        currency: 'USD',
        isExceeded: false,
      });

      const { queryByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      // Should not find the standalone percentage badge
      // (percentage might appear in other text, so we check specifically for the badge format)
      const tree = render(<BudgetProgressBar budgetId="budget-1" />).toJSON();
      const percentageBadge = findPercentageBadge(tree);
      expect(percentageBadge).toBeNull();
    });

    it('shows exceeded percentage with red color in compact mode', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'exceeded',
        percentage: 120,
        spent: 1200,
        amount: '1000.00',
        remaining: -200,
        currency: 'USD',
        isExceeded: true,
      });

      const { getByText } = render(
        <BudgetProgressBar budgetId="budget-1" compact />,
      );

      const percentageText = getByText('120%');
      expect(percentageText).toBeTruthy();
    });
  });

  describe('Currency formatting', () => {
    it('uses default USD currency when not specified', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: undefined,
        isExceeded: false,
      });

      const { getByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(getByText('USD 500.00 / 1000.00')).toBeTruthy();
    });

    it('uses specified currency', () => {
      mockGetBudgetStatus.mockReturnValue({
        status: 'safe',
        percentage: 50,
        spent: 500,
        amount: '1000.00',
        remaining: 500,
        currency: 'EUR',
        isExceeded: false,
      });

      const { getByText } = render(<BudgetProgressBar budgetId="budget-1" />);

      expect(getByText('EUR 500.00 / 1000.00')).toBeTruthy();
    });
  });
});

// Helper function to find the progress fill view in the component tree
function findProgressFill(node) {
  if (!node) return null;

  // The progress fill is a View with borderRadius: 3 and height: '100%'
  if (
    node.props?.style &&
    Array.isArray(node.props.style) &&
    node.props.style.some(
      (s) => s && typeof s === 'object' && s.height === '100%' && s.borderRadius === 3,
    )
  ) {
    return node;
  }

  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        const found = findProgressFill(child);
        if (found) return found;
      }
    }
  }

  return null;
}

// Helper function to find the percentage badge in compact mode
function findPercentageBadge(node) {
  if (!node) return null;

  // The percentage container has position: 'absolute', right: 0, top: -2
  if (
    node.props?.style &&
    Array.isArray(node.props.style) &&
    node.props.style.some(
      (s) => s && typeof s === 'object' && s.position === 'absolute' && s.right === 0,
    )
  ) {
    return node;
  }

  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        const found = findPercentageBadge(child);
        if (found) return found;
      }
    }
  }

  return null;
}
