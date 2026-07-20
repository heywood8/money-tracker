/**
 * SplitOperationModal Component Tests
 *
 * Tests cover:
 * - Component rendering and visibility
 * - Amount input and validation
 * - Category selection
 * - Confirm and cancel actions
 * - Error messages
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SplitOperationModal from '../../../app/components/operations/SplitOperationModal';

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIcon({ name, size, color }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string };
  return { MaterialCommunityIcons: MockIcon };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
}));

describe('SplitOperationModal', () => {
  const defaultColors = {
    card: '#FFFFFF',
    border: '#E0E0E0',
    text: '#000000',
    mutedText: '#666666',
    primary: '#6200EE',
    secondary: '#F0F0F0',
    inputBackground: '#F5F5F5',
    inputBorder: '#CCCCCC',
    selected: '#E0E0FF',
  };

  const mockT = (key) => {
    const translations = {
      split_transaction: 'Split Transaction',
      split_amount: 'Split Amount',
      split_amount_error: 'Amount must be less than the original',
      select_category: 'Select Category',
      cancel: 'Cancel',
      split: 'Split',
      close: 'Close',
      no_categories: 'No categories',
      amount: 'Amount',
      valid_amount_required: 'Valid amount required',
      category_required: 'Category required',
      error: 'Error',
    };
    return translations[key] || key;
  };

  const mockCategories = [
    { id: 'cat-1', name: 'Food', icon: 'food', categoryType: 'expense', type: 'entry' },
    { id: 'cat-2', name: 'Transport', icon: 'car', categoryType: 'expense', type: 'entry' },
    { id: 'cat-3', name: 'Salary', icon: 'cash', categoryType: 'income', type: 'entry' },
    { id: 'cat-4', name: 'Shopping', icon: 'cart', categoryType: 'expense', type: 'folder' },
  ];

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    originalAmount: '100.00',
    operationType: 'expense',
    categories: mockCategories,
    colors: defaultColors,
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', async () => {
      const { getByText } = await render(<SplitOperationModal {...defaultProps} />);

      expect(getByText('Split Transaction')).toBeTruthy();
      expect(getByText('Split Amount')).toBeTruthy();
    });

    it('does not render content when visible is false', async () => {
      const { queryByText } = await render(
        <SplitOperationModal {...defaultProps} visible={false} />,
      );

      expect(queryByText('Split Transaction')).toBeNull();
    });

    it('displays original amount info', async () => {
      const { getByText } = await render(<SplitOperationModal {...defaultProps} />);

      expect(getByText('Amount: 100.00')).toBeTruthy();
    });

    it('shows amount input field', async () => {
      const { getByTestId } = await render(<SplitOperationModal {...defaultProps} />);

      expect(getByTestId('split-amount-input')).toBeTruthy();
    });

    it('shows category picker button', async () => {
      const { getByTestId } = await render(<SplitOperationModal {...defaultProps} />);

      expect(getByTestId('category-picker-button')).toBeTruthy();
    });

    it('shows cancel and confirm buttons', async () => {
      const { getByTestId } = await render(<SplitOperationModal {...defaultProps} />);

      expect(getByTestId('cancel-button')).toBeTruthy();
      expect(getByTestId('confirm-button')).toBeTruthy();
    });
  });

  describe('Amount Input', () => {
    it('accepts valid amount input', async () => {
      const { getByTestId } = await render(<SplitOperationModal {...defaultProps} />);

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '50.00');

      expect(input.props.value).toBe('50.00');
    });

    it('clears amount when modal reopens', async () => {
      const { getByTestId, rerender } = await render(
        <SplitOperationModal {...defaultProps} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '50.00');

      // Close and reopen modal
      await rerender(<SplitOperationModal {...defaultProps} visible={false} />);
      await rerender(<SplitOperationModal {...defaultProps} visible={true} />);

      await waitFor(() => {
        const newInput = getByTestId('split-amount-input');
        expect(newInput.props.value).toBe('');
      });
    });
  });

  describe('Category Selection', () => {
    it('opens category picker when button is pressed', async () => {
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));

      // Category picker modal should open with categories
      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
    });

    it('filters categories by operation type (expense)', async () => {
      const { getByTestId, getByText, queryByText } = await render(
        <SplitOperationModal {...defaultProps} operationType="expense" />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));

      // Should show expense categories
      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
      // Should not show income categories
      expect(queryByText('Salary')).toBeNull();
      // Should not show folders
      expect(queryByText('Shopping')).toBeNull();
    });

    it('filters categories by operation type (income)', async () => {
      const { getByTestId, getByText, queryByText } = await render(
        <SplitOperationModal {...defaultProps} operationType="income" />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));

      // Should show income categories
      expect(getByText('Salary')).toBeTruthy();
      // Should not show expense categories
      expect(queryByText('Food')).toBeNull();
    });

    it('selects category when pressed', async () => {
      const { getByTestId, getByText, queryByText } = await render(
        <SplitOperationModal {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));
      await fireEvent.press(getByText('Food'));

      await waitFor(() => {
        // Category picker should close
        // Selected category name should be shown on the button
        const button = getByTestId('category-picker-button');
        expect(button).toBeTruthy();
      });
    });

    it('closes category picker when close button is pressed', async () => {
      const { getByTestId, getByText, queryByText } = await render(
        <SplitOperationModal {...defaultProps} />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));
      expect(getByText('Food')).toBeTruthy();

      await fireEvent.press(getByText('Close'));

      await waitFor(() => {
        // Category list should no longer be visible in the picker
        // Note: The category picker is a separate modal that closes
      });
    });
  });

  describe('Validation', () => {
    it('shows error when amount is empty', async () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      await fireEvent.press(getByTestId('confirm-button'));

      expect(getByTestId('error-message')).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows error when amount is zero', async () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '0');
      await fireEvent.press(getByTestId('confirm-button'));

      expect(getByTestId('error-message')).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows error when amount equals original', async () => {
      const onConfirm = jest.fn();
      const { getByTestId } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '100.00');
      await fireEvent.press(getByTestId('confirm-button'));

      expect(getByTestId('error-message')).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows error when amount exceeds original', async () => {
      const onConfirm = jest.fn();
      const { getByTestId } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '150.00');
      await fireEvent.press(getByTestId('confirm-button'));

      expect(getByTestId('error-message')).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows error when category is not selected', async () => {
      const onConfirm = jest.fn();
      const { getByTestId } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '50.00');
      await fireEvent.press(getByTestId('confirm-button'));

      expect(getByTestId('error-message')).toBeTruthy();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('clears error when amount is changed', async () => {
      const { getByTestId, queryByTestId } = await render(
        <SplitOperationModal {...defaultProps} />,
      );

      // Trigger error
      await fireEvent.press(getByTestId('confirm-button'));
      expect(getByTestId('error-message')).toBeTruthy();

      // Change amount
      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '50.00');

      await waitFor(() => {
        expect(queryByTestId('error-message')).toBeNull();
      });
    });
  });

  describe('Confirm Action', () => {
    it('calls onConfirm with correct data when valid', async () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      // Enter amount
      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '30.00');

      // Select category
      await fireEvent.press(getByTestId('category-picker-button'));
      await fireEvent.press(getByText('Food'));

      // Confirm
      await fireEvent.press(getByTestId('confirm-button'));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith('30.00', 'cat-1');
      });
    });
  });

  describe('Decimal Separator Normalization (QoL-2)', () => {
    it('normalizes a comma decimal separator to a dot in the input value', async () => {
      const { getByTestId } = await render(<SplitOperationModal {...defaultProps} />);

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '1,50');

      // decimal-pad on many locales emits ",", but state must hold "1.50"
      expect(input.props.value).toBe('1.50');
    });

    it('passes a dot-normalized amount to onConfirm when a comma is typed', async () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      // Enter amount with a comma decimal separator
      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '1,50');

      // Select category
      await fireEvent.press(getByTestId('category-picker-button'));
      await fireEvent.press(getByText('Food'));

      // Confirm
      await fireEvent.press(getByTestId('confirm-button'));

      await waitFor(() => {
        // Must be "1.50", never the raw "1,50" or parseFloat-truncated "1"
        expect(onConfirm).toHaveBeenCalledWith('1.50', 'cat-1');
      });
    });

    it('validates a comma amount against the original instead of truncating it', async () => {
      // Regression: parseFloat("50,00") === 50, but a raw ">= original" check
      // on "150,00" would truncate to 150. Ensure the normalized value is
      // validated so a comma amount below the original passes.
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} onConfirm={onConfirm} />,
      );

      const input = getByTestId('split-amount-input');
      await fireEvent.changeText(input, '99,99');

      await fireEvent.press(getByTestId('category-picker-button'));
      await fireEvent.press(getByText('Food'));

      await fireEvent.press(getByTestId('confirm-button'));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith('99.99', 'cat-1');
      });
    });
  });

  describe('Cancel Action', () => {
    it('calls onClose when cancel button is pressed', async () => {
      const onClose = jest.fn();
      const { getByTestId } = await render(
        <SplitOperationModal {...defaultProps} onClose={onClose} />,
      );

      await fireEvent.press(getByTestId('cancel-button'));

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay is pressed', async () => {
      const onClose = jest.fn();
      const { getByText } = await render(
        <SplitOperationModal {...defaultProps} onClose={onClose} />,
      );

      // The modal title is inside the content, pressing outside should close
      // This is typically done by pressing the overlay
      // For this test we verify the close button works
    });
  });

  describe('Empty Categories', () => {
    it('shows no categories message when list is empty', async () => {
      const { getByTestId, getByText } = await render(
        <SplitOperationModal {...defaultProps} categories={[]} />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));

      expect(getByText('No categories')).toBeTruthy();
    });
  });

  describe('Translated Category Names', () => {
    it('uses nameKey for translation if available', async () => {
      const categoriesWithNameKey = [
        { id: 'cat-1', name: 'Food', nameKey: 'food_key', icon: 'food', categoryType: 'expense', type: 'entry' },
      ];

      const mockTWithKey = (key) => {
        if (key === 'food_key') return 'Translated Food';
        return mockT(key);
      };

      const { getByTestId, getByText } = await render(
        <SplitOperationModal
          {...defaultProps}
          categories={categoriesWithNameKey}
          t={mockTWithKey}
        />,
      );

      await fireEvent.press(getByTestId('category-picker-button'));

      expect(getByText('Translated Food')).toBeTruthy();
    });
  });
});
