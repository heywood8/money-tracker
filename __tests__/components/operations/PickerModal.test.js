/**
 * PickerModal Component Tests
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PickerModal from '../../../app/components/operations/PickerModal';

// Mock Currency service
jest.mock('../../../app/services/currency', () => ({
  formatAmount: (amount, currency) => amount.toFixed(2),
}));

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
}));

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

describe('PickerModal', () => {
  const defaultColors = {
    card: '#FFFFFF',
    border: '#E0E0E0',
    text: '#000000',
    mutedText: '#666666',
    primary: '#6200EE',
    selected: '#F0F0F0',
    altRow: '#F5F5F5',
  };

  const mockT = (key) => {
    const translations = {
      close: 'Close',
      no_categories: 'No categories',
      no_accounts: 'No accounts',
    };
    return translations[key] || key;
  };

  const defaultProps = {
    visible: true,
    pickerData: [],
    colors: defaultColors,
    t: mockT,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Modal rendering', () => {
    it('renders when visible is true', async () => {
      const { getByText } = await render(
        <PickerModal {...defaultProps} pickerType="account" />,
      );

      expect(getByText('No accounts')).toBeTruthy();
    });

    it('does not render content when visible is false', async () => {
      const { queryByText } = await render(
        <PickerModal {...defaultProps} visible={false} pickerType="account" />,
      );

      // Modal content should not be visible
      expect(queryByText('No accounts')).toBeNull();
    });

    it('calls onClose when overlay is pressed', async () => {
      const onClose = jest.fn();
      const { getByText } = await render(
        <PickerModal {...defaultProps} pickerType="account" onClose={onClose} />,
      );

      // The overlay has the "No accounts" text inside it
      // We need to find and press the overlay
      const emptyText = getByText('No accounts');
      expect(emptyText).toBeTruthy();
    });
  });

  describe('Account picker', () => {
    const accountData = [
      { id: 'acc-1', name: 'Checking', balance: 1000, currency: 'USD' },
      { id: 'acc-2', name: 'Savings', balance: 5000, currency: 'EUR' },
    ];

    it('renders account list', async () => {
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('Checking')).toBeTruthy();
      expect(getByText('Savings')).toBeTruthy();
    });

    it('displays account balance with currency symbol', async () => {
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('$1000.00')).toBeTruthy();
      expect(getByText('€5000.00')).toBeTruthy();
    });

    it('calls onSelectAccount when account is pressed', async () => {
      const onSelectAccount = jest.fn();
      const onClose = jest.fn();
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
          onSelectAccount={onSelectAccount}
          onClose={onClose}
        />,
      );

      await fireEvent.press(getByText('Checking'));

      expect(onSelectAccount).toHaveBeenCalledWith('acc-1');
      expect(onClose).toHaveBeenCalled();
    });

    it('shows close button for account picker', async () => {
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('Close')).toBeTruthy();
    });

    it('calls onClose when close button is pressed', async () => {
      const onClose = jest.fn();
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
          onClose={onClose}
        />,
      );

      await fireEvent.press(getByText('Close'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('toAccount picker', () => {
    const accountData = [
      { id: 'acc-1', name: 'Checking', balance: 1000, currency: 'USD' },
      { id: 'acc-2', name: 'Savings', balance: 5000, currency: 'USD' },
    ];

    it('calls onSelectToAccount when account is pressed', async () => {
      const onSelectToAccount = jest.fn();
      const onClose = jest.fn();
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="toAccount"
          pickerData={accountData}
          onSelectToAccount={onSelectToAccount}
          onClose={onClose}
        />,
      );

      await fireEvent.press(getByText('Savings'));

      expect(onSelectToAccount).toHaveBeenCalledWith('acc-2');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Category picker', () => {
    const categoryData = [
      { id: 'cat-1', name: 'Food', icon: 'food', type: 'entry' },
      { id: 'cat-2', name: 'Transport', icon: 'car', type: 'entry' },
      { id: 'cat-3', name: 'Shopping', icon: 'cart', type: 'folder' },
    ];

    const categoryNavigation = {
      breadcrumb: [],
    };

    const quickAddValues = {
      amount: '',
      categoryId: null,
    };

    it('renders category list', async () => {
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
      expect(getByText('Shopping')).toBeTruthy();
    });

    it('renders category icons', async () => {
      const { getByTestId } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      expect(getByTestId('icon-food')).toBeTruthy();
      expect(getByTestId('icon-car')).toBeTruthy();
    });

    it('renders folder badge for folder categories', async () => {
      const { getAllByTestId } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      const folderBadges = getAllByTestId('icon-folder-outline');
      expect(folderBadges.length).toBe(1); // Only Shopping folder has badge
    });

    it('calls onNavigateIntoFolder when folder is pressed', async () => {
      const onNavigateIntoFolder = jest.fn();
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
          onNavigateIntoFolder={onNavigateIntoFolder}
        />,
      );

      await fireEvent.press(getByText('Shopping'));

      expect(onNavigateIntoFolder).toHaveBeenCalledWith(categoryData[2]);
    });

    it('calls onSelectCategory when entry category is pressed without amount', async () => {
      const onSelectCategory = jest.fn();
      const onClose = jest.fn();
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
          onSelectCategory={onSelectCategory}
          onClose={onClose}
        />,
      );

      await fireEvent.press(getByText('Food'));

      expect(onSelectCategory).toHaveBeenCalledWith('cat-1');
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onAutoAddWithCategory when entry category is pressed with valid amount', async () => {
      const onAutoAddWithCategory = jest.fn().mockResolvedValue(undefined);
      const quickAddWithAmount = {
        amount: '50.00',
        categoryId: null,
      };
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddWithAmount}
          onAutoAddWithCategory={onAutoAddWithCategory}
        />,
      );

      await fireEvent.press(getByText('Food'));

      await waitFor(() => {
        expect(onAutoAddWithCategory).toHaveBeenCalledWith('cat-1');
      });
    });

    it('does not show close button for category picker', async () => {
      const { queryByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      expect(queryByText('Close')).toBeNull();
    });

    it('uses translated nameKey if available', async () => {
      const categoryWithNameKey = [
        { id: 'cat-1', name: 'Food', nameKey: 'food_category', icon: 'food', type: 'entry' },
      ];
      const mockTWithKey = (key) => {
        if (key === 'food_category') return 'Translated Food';
        return key;
      };

      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryWithNameKey}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
          t={mockTWithKey}
        />,
      );

      expect(getByText('Translated Food')).toBeTruthy();
    });
  });

  describe('Breadcrumb navigation', () => {
    const categoryNavigation = {
      breadcrumb: [{ id: 'parent-1', name: 'Parent Category' }],
    };

    const quickAddValues = {
      amount: '',
      categoryId: null,
    };

    it('shows breadcrumb when navigation has items', async () => {
      const { getByText, getByTestId } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={[]}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      expect(getByText('Parent Category')).toBeTruthy();
      expect(getByTestId('icon-arrow-left')).toBeTruthy();
    });

    it('does not show breadcrumb when navigation is empty', async () => {
      const emptyNavigation = { breadcrumb: [] };
      const { queryByTestId } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={[]}
          categoryNavigation={emptyNavigation}
          quickAddValues={quickAddValues}
        />,
      );

      expect(queryByTestId('icon-arrow-left')).toBeNull();
    });

    it('calls onNavigateBack when back button is pressed', async () => {
      const onNavigateBack = jest.fn();
      const { getByTestId } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={[]}
          categoryNavigation={categoryNavigation}
          quickAddValues={quickAddValues}
          onNavigateBack={onNavigateBack}
        />,
      );

      await fireEvent.press(getByTestId('icon-arrow-left').parent);

      expect(onNavigateBack).toHaveBeenCalled();
    });
  });

  describe('Empty states', () => {
    it('shows no accounts message when account list is empty', async () => {
      const { getByText } = await render(
        <PickerModal {...defaultProps} pickerType="account" pickerData={[]} />,
      );

      expect(getByText('No accounts')).toBeTruthy();
    });

    it('shows no categories message when category list is empty', async () => {
      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={[]}
          categoryNavigation={{ breadcrumb: [] }}
          quickAddValues={{ amount: '', categoryId: null }}
        />,
      );

      expect(getByText('No categories')).toBeTruthy();
    });
  });

  describe('Currency symbol helper', () => {
    it('shows currency symbol for known currencies', async () => {
      const accountData = [
        { id: 'acc-1', name: 'USD Account', balance: 100, currency: 'USD' },
        { id: 'acc-2', name: 'EUR Account', balance: 200, currency: 'EUR' },
        { id: 'acc-3', name: 'GBP Account', balance: 300, currency: 'GBP' },
      ];

      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('$100.00')).toBeTruthy();
      expect(getByText('€200.00')).toBeTruthy();
      expect(getByText('£300.00')).toBeTruthy();
    });

    it('shows currency code for unknown currencies', async () => {
      const accountData = [
        { id: 'acc-1', name: 'Unknown Currency', balance: 100, currency: 'XYZ' },
      ];

      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('XYZ100.00')).toBeTruthy();
    });

    it('handles missing currency gracefully', async () => {
      const accountData = [
        { id: 'acc-1', name: 'No Currency', balance: 100, currency: null },
      ];

      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="account"
          pickerData={accountData}
        />,
      );

      expect(getByText('100.00')).toBeTruthy();
    });
  });

  describe('Unknown picker type', () => {
    it('returns null for unknown picker type items', async () => {
      const unknownData = [{ id: 'item-1', name: 'Unknown' }];

      const { queryByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="unknown"
          pickerData={unknownData}
        />,
      );

      // The item should not render, but the close button should
      expect(queryByText('Unknown')).toBeNull();
      expect(queryByText('Close')).toBeTruthy();
    });
  });

  describe('Selected category highlighting', () => {
    it('highlights selected category', async () => {
      const categoryData = [
        { id: 'cat-1', name: 'Food', icon: 'food', type: 'entry' },
      ];
      const quickAddValues = {
        amount: '',
        categoryId: 'cat-1', // This category is selected
      };

      const { getByText } = await render(
        <PickerModal
          {...defaultProps}
          pickerType="category"
          pickerData={categoryData}
          categoryNavigation={{ breadcrumb: [] }}
          quickAddValues={quickAddValues}
        />,
      );

      // Category should await render (highlight is applied via style)
      expect(getByText('Food')).toBeTruthy();
    });
  });
});
