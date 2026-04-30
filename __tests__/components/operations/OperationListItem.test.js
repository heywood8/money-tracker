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
    it('renders without suggestion row when suggestionChips is not provided', () => {
      const { queryByText } = render(<OperationListItem {...baseProps} />);
      expect(queryByText('label this?')).toBeNull();
      expect(queryByText('skip')).toBeNull();
    });

    it('renders without suggestion row when suggestionChips is null', () => {
      const { queryByText } = render(
        <OperationListItem {...baseProps} suggestionChips={null} />,
      );
      expect(queryByText('label this?')).toBeNull();
    });

    it('renders without suggestion row when suggestionChips is empty array', () => {
      const { queryByText } = render(
        <OperationListItem {...baseProps} suggestionChips={[]} />,
      );
      expect(queryByText('label this?')).toBeNull();
    });

    it('renders suggestion row with chips when suggestionChips is provided', () => {
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass', 'Bus fare']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={jest.fn()}
        />,
      );
      expect(getByText('label this?')).toBeTruthy();
      expect(getByText('Monthly pass')).toBeTruthy();
      expect(getByText('Bus fare')).toBeTruthy();
    });
  });

  describe('Suggestion Interactions', () => {
    it('calls onApplySuggestion with chip text when chip is pressed', () => {
      const onApplySuggestion = jest.fn();
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass']}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={jest.fn()}
        />,
      );
      fireEvent.press(getByText('Monthly pass'));
      expect(onApplySuggestion).toHaveBeenCalledWith('Monthly pass');
    });

    it('calls onDismissSuggestion when skip is pressed', () => {
      const onDismissSuggestion = jest.fn();
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={onDismissSuggestion}
        />,
      );
      fireEvent.press(getByText('skip'));
      expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
    });

    it('handles multiple chip presses independently', () => {
      const onApplySuggestion = jest.fn();
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Monthly pass', 'Bus fare', 'Subscription']}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={jest.fn()}
        />,
      );
      fireEvent.press(getByText('Monthly pass'));
      fireEvent.press(getByText('Bus fare'));
      fireEvent.press(getByText('Subscription'));

      expect(onApplySuggestion).toHaveBeenNthCalledWith(1, 'Monthly pass');
      expect(onApplySuggestion).toHaveBeenNthCalledWith(2, 'Bus fare');
      expect(onApplySuggestion).toHaveBeenNthCalledWith(3, 'Subscription');
      expect(onApplySuggestion).toHaveBeenCalledTimes(3);
    });
  });

  describe('List Item Rendering', () => {
    it('renders operation title and subtitle', () => {
      const { getByText } = render(
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

    it('renders amount with correct color for expense', () => {
      const { getByText } = render(
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

    it('renders amount with correct color for income', () => {
      const { getByText } = render(
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
    it('has button accessibility role', () => {
      const { getByRole } = render(<OperationListItem {...baseProps} />);
      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label with type, title, and amount', () => {
      const { getByLabelText } = render(
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

    it('has accessibility hint', () => {
      const { getByA11yHint } = render(
        <OperationListItem {...baseProps} />,
      );
      expect(
        getByA11yHint('edit_operation_hint'),
      ).toBeTruthy();
    });
  });

  describe('PropTypes Defaults', () => {
    it('accepts default onApplySuggestion when not provided', () => {
      // Should accept undefined onApplySuggestion and use default
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Test chip']}
          onApplySuggestion={undefined}
          onDismissSuggestion={jest.fn()}
        />,
      );
      expect(getByText('Test chip')).toBeTruthy();
    });

    it('accepts default onDismissSuggestion when not provided', () => {
      // Should accept undefined onDismissSuggestion and use default
      const { getByText } = render(
        <OperationListItem
          {...baseProps}
          suggestionChips={['Test chip']}
          onApplySuggestion={jest.fn()}
          onDismissSuggestion={undefined}
        />,
      );
      expect(getByText('skip')).toBeTruthy();
    });
  });

  describe('Transfer Operations', () => {
    it('renders transfer icon and type label', () => {
      const { getByText } = render(
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

    it('renders destination amount for multi-currency transfer', () => {
      const { getByText } = render(
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
  });
});
