/**
 * OperationListItem Component Tests
 *
 * Tests for the OperationListItem component which displays a single
 * financial operation (expense, income, or transfer) in a list with
 * optional suggestion chips for labeling descriptions.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OperationListItem from '../../../app/components/operations/OperationListItem';

const mockColors = {
  text: '#fff',
  mutedText: '#888',
  border: '#333',
  primary: '#4C9EFF',
  surface: '#1e1e1e',
  expense: '#ff6b6b',
  income: '#4caf50',
  transfer: '#aaa',
};

const baseOperation = {
  id: '1',
  type: 'expense',
  amount: '12.00',
  accountId: 'acc1',
  categoryId: 'cat1',
  date: '2026-04-30',
  description: null,
};

const baseProps = {
  operation: baseOperation,
  colors: mockColors,
  t: (key) => key,
  categories: [{ id: 'cat1', name: 'Transport', icon: 'bus', parentId: null }],
  getCategoryInfo: () => ({ name: 'Transport', icon: 'bus' }),
  getAccountName: () => 'Checking',
  formatCurrency: (_, amount) => `$${amount}`,
  isLast: false,
  onPress: jest.fn(),
};

describe('OperationListItem', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Suggestion Row Rendering', () => {
    it('renders without suggestion row when suggestionChips is not provided', async () => {
      const { queryByLabelText } = await render(<OperationListItem {...baseProps} />);
      expect(queryByLabelText('dismiss suggestion')).toBeNull();
    });

    it('renders without suggestion row when suggestionChips is null', async () => {
      const { queryByLabelText } = await render(
        <OperationListItem {...baseProps} suggestionChips={null} />,
      );
      expect(queryByLabelText('dismiss suggestion')).toBeNull();
    });

    it('renders without suggestion row when suggestionChips is empty array', async () => {
      const { queryByLabelText } = await render(
        <OperationListItem {...baseProps} suggestionChips={[]} />,
      );
      expect(queryByLabelText('dismiss suggestion')).toBeNull();
    });

    it('renders suggestion row with chips when suggestionChips is provided', async () => {
      const { getByText, getByLabelText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass', 'Bus fare']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={jest.fn()}
        />,
      );
      expect(getByLabelText('dismiss suggestion')).toBeTruthy();
      expect(getByText('Monthly pass')).toBeTruthy();
      expect(getByText('Bus fare')).toBeTruthy();
    });
  });

  describe('Suggestion Interactions', () => {
    it('calls onApplySuggestion with chip text when chip is pressed', async () => {
      const onApplySuggestion = jest.fn();
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass']}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={jest.fn()}
        />,
      );
      await fireEvent.press(getByText('Monthly pass'));
      expect(onApplySuggestion).toHaveBeenCalledWith('Monthly pass');
    });

    it('calls onDismissSuggestion when ✕ is pressed', async () => {
      const onDismissSuggestion = jest.fn();
      const { getByLabelText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={onDismissSuggestion}
        />,
      );
      await fireEvent.press(getByLabelText('dismiss suggestion'));
      expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
    });

    it('handles multiple chip presses independently', async () => {
      const onApplySuggestion = jest.fn();
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass', 'Bus fare', 'Subscription']}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={jest.fn()}
        />,
      );
      await fireEvent.press(getByText('Monthly pass'));
      await fireEvent.press(getByText('Bus fare'));
      await fireEvent.press(getByText('Subscription'));

      expect(onApplySuggestion).toHaveBeenNthCalledWith(1, 'Monthly pass');
      expect(onApplySuggestion).toHaveBeenNthCalledWith(2, 'Bus fare');
      expect(onApplySuggestion).toHaveBeenNthCalledWith(3, 'Subscription');
      expect(onApplySuggestion).toHaveBeenCalledTimes(3);
    });
  });

  describe('List Item Rendering', () => {
    it('renders operation title and subtitle', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            description: 'Bus ticket',
          }}
        />,
      );
      expect(getByText('Bus ticket')).toBeTruthy();
      expect(getByText(/Transport · Checking/)).toBeTruthy();
    });

    it('renders amount with correct color for expense', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'expense',
          }}
        />,
      );
      const amount = getByText('$12.00');
      expect(amount.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: mockColors.expense }),
        ]),
      );
    });

    it('renders amount with correct color for income', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'income',
          }}
        />,
      );
      const amount = getByText('$12.00');
      expect(amount.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: mockColors.income }),
        ]),
      );
    });
  });

  describe('Accessibility', () => {
    it('has button accessibility role', async () => {
      const { getByRole } = await render(<OperationListItem {...baseProps} />);
      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label with type, title, and amount', async () => {
      const { getByLabelText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            description: 'Coffee',
            type: 'expense',
          }}
        />,
      );
      // Exact format depends on translation keys, but should contain key info
      expect(getByLabelText(/Coffee.*12\.00/)).toBeTruthy();
    });

    it('has accessibility hint', async () => {
      const { getByA11yHint } = await render(
        <OperationListItem {...baseProps} />,
      );
      expect(
        getByA11yHint('edit_operation_hint'),
      ).toBeTruthy();
    });
  });

  describe('PropTypes Defaults', () => {
    it('accepts default onApplySuggestion when not provided', async () => {
      // Should accept undefined onApplySuggestion and use default
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Test chip']}
          onApplySuggestion={undefined}
          onDismissSuggestion={jest.fn()}
        />,
      );
      expect(getByText('Test chip')).toBeTruthy();
    });

    it('accepts default onDismissSuggestion when not provided', async () => {
      // Should accept undefined onDismissSuggestion and use default
      const { getByLabelText } = await render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Test chip']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={undefined}
        />,
      );
      expect(getByLabelText('dismiss suggestion')).toBeTruthy();
    });
  });

  describe('Foreign Currency Operations', () => {
    it('renders foreign currency amount for foreign currency expense', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'expense',
            amount: '54.00',
            sourceCurrency: 'EUR',
            destinationCurrency: 'USD',
            exchangeRate: '1.08',
            destinationAmount: '50.00',
          }}
          formatCurrency={(_, amount) => `$${amount}`}
        />,
      );
      // Should show the foreign amount in parentheses
      expect(getByText(/€50\.00/)).toBeTruthy();
    });

    it('renders foreign currency amount for foreign currency income', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'income',
            amount: '54.00',
            sourceCurrency: 'EUR',
            destinationCurrency: 'USD',
            exchangeRate: '1.08',
            destinationAmount: '50.00',
          }}
          formatCurrency={(_, amount) => `$${amount}`}
        />,
      );
      expect(getByText(/€50\.00/)).toBeTruthy();
    });

    it('does NOT render foreign amount for regular same-currency expense', async () => {
      const { queryByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'expense',
            amount: '50.00',
          }}
          formatCurrency={(_, amount) => `$${amount}`}
        />,
      );
      // No foreign amount line
      expect(queryByText(/€/)).toBeNull();
    });

    it('does NOT render foreign amount for transfer even with exchange metadata', async () => {
      const { queryByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'transfer',
            toAccountId: 'acc2',
            sourceCurrency: 'EUR',
            destinationCurrency: 'USD',
            exchangeRate: '1.08',
            destinationAmount: '50.00',
          }}
          formatCurrency={(id, amount) => (id === 'acc2' ? `$${amount}` : `€${amount}`)}
        />,
      );
      // Transfer shows → destination, not the foreign-currency line
      expect(queryByText(/€50\.00/)).toBeNull();
    });

    it('uses currency code as fallback when symbol not in currencies.json', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'expense',
            amount: '100.00',
            sourceCurrency: 'XYZ',
            destinationCurrency: 'USD',
            exchangeRate: '2.00',
            destinationAmount: '50.00',
          }}
          formatCurrency={(_, amount) => `$${amount}`}
        />,
      );
      expect(getByText(/XYZ50\.00/)).toBeTruthy();
    });
  });

  describe('Transfer Operations', () => {
    it('renders transfer icon and type label', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'transfer',
            toAccountId: 'acc2',
          }}
          getAccountName={(id) => (id === 'acc1' ? 'Checking' : 'Savings')}
        />,
      );
      expect(getByText('transfer')).toBeTruthy();
      expect(getByText(/Checking → Savings/)).toBeTruthy();
    });

    it('renders destination amount for multi-currency transfer', async () => {
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{
            ...baseOperation,
            type: 'transfer',
            toAccountId: 'acc2',
            exchangeRate: 1.1,
            destinationAmount: '13.20',
          }}
          formatCurrency={(id, amount) => {
            if (id === 'acc1') return `$${amount}`;
            return `€${amount}`;
          }}
        />,
      );
      expect(getByText(/→ €13\.20/)).toBeTruthy();
    });

    it('shows parentName · accountName subtitle when no description but category has parent', async () => {
      const categoriesWithParent = [
        { id: 'parent1', name: 'Food', icon: 'food', parentId: null },
        { id: 'cat2', name: 'Groceries', icon: 'cart', parentId: 'parent1' },
      ];
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{ ...baseOperation, categoryId: 'cat2', description: null }}
          categories={categoriesWithParent}
          getCategoryInfo={() => ({ name: 'Groceries', icon: 'cart' })}
        />,
      );
      // subtitle should be "Food · Checking" (parentName · accountName)
      expect(getByText(/Food · Checking/)).toBeTruthy();
    });

    it('shows parentName / categoryName · accountName subtitle when description set and category has parent', async () => {
      const categoriesWithParent = [
        { id: 'parent1', name: 'Food', icon: 'food', parentId: null },
        { id: 'cat2', name: 'Groceries', icon: 'cart', parentId: 'parent1' },
      ];
      const { getByText } = await render(
        <OperationListItem
          {...baseProps}
          operation={{ ...baseOperation, categoryId: 'cat2', description: 'Weekly shop' }}
          categories={categoriesWithParent}
          getCategoryInfo={() => ({ name: 'Groceries', icon: 'cart' })}
        />,
      );
      // title = description, subtitle = "Food / Groceries · Checking"
      expect(getByText(/Food \/ Groceries · Checking/)).toBeTruthy();
    });
  });
});
