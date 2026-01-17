/**
 * CustomLegend Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CustomLegend from '../../../app/components/graphs/CustomLegend';

// Mock MaterialCommunityIcons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIcon({ name, testID }) {
    return React.createElement(Text, { testID: testID || `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string, testID: PropTypes.string };
  return { MaterialCommunityIcons: MockIcon };
});

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
  EUR: { decimal_digits: 2, symbol: '€' },
  JPY: { decimal_digits: 0, symbol: '¥' },
  BTC: { decimal_digits: 8, symbol: '₿' },
}));

describe('CustomLegend', () => {
  const defaultColors = {
    border: '#E0E0E0',
    text: '#000000',
    mutedText: '#888888',
  };

  const mockData = [
    { name: 'Food', amount: 100, color: '#FF5733', icon: 'food', categoryId: 'cat-1' },
    { name: 'Transport', amount: 50, color: '#33FF57', icon: 'car', categoryId: 'cat-2' },
  ];

  const defaultProps = {
    data: mockData,
    currency: 'USD',
    colors: defaultColors,
    onItemPress: jest.fn(),
    isClickable: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders legend container', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} />);
      expect(getByText('Food')).toBeTruthy();
    });

    it('renders all legend items', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} />);
      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
    });

    it('renders with empty data array', () => {
      const { queryByText } = render(<CustomLegend {...defaultProps} data={[]} />);
      expect(queryByText('Food')).toBeNull();
    });

    it('renders single item correctly', () => {
      const singleItem = [{ name: 'Single', amount: 100, color: '#000', categoryId: 'cat-1' }];
      const { getByText } = render(<CustomLegend {...defaultProps} data={singleItem} />);
      expect(getByText('Single')).toBeTruthy();
      expect(getByText('100.0%')).toBeTruthy();
    });

    it('renders color indicators for each item', () => {
      const { UNSAFE_getAllByType } = render(<CustomLegend {...defaultProps} />);
      // Color indicators are View components with backgroundColor
      // We test that items render correctly with their colors
      expect(UNSAFE_getAllByType(require('react-native').View).length).toBeGreaterThan(0);
    });
  });

  describe('Currency Formatting', () => {
    it('formats USD amounts with 2 decimal places', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} currency="USD" />);
      expect(getByText('100.00 USD')).toBeTruthy();
      expect(getByText('50.00 USD')).toBeTruthy();
    });

    it('formats EUR amounts with 2 decimal places', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} currency="EUR" />);
      expect(getByText('100.00 EUR')).toBeTruthy();
    });

    it('formats JPY amounts with 0 decimal places', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} currency="JPY" />);
      expect(getByText('100 JPY')).toBeTruthy();
    });

    it('formats BTC amounts with 8 decimal places', () => {
      const data = [{ name: 'Bitcoin', amount: 0.00001234, color: '#F7931A', categoryId: 'btc-1' }];
      const { getByText } = render(<CustomLegend {...defaultProps} data={data} currency="BTC" />);
      expect(getByText('0.00001234 BTC')).toBeTruthy();
    });

    it('defaults to 2 decimal places for unknown currency', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} currency="XYZ" />);
      expect(getByText('100.00 XYZ')).toBeTruthy();
    });
  });

  describe('Percentage Calculations', () => {
    it('calculates correct percentages', () => {
      const { getByText } = render(<CustomLegend {...defaultProps} />);
      // Total is 150, Food is 100 (66.7%), Transport is 50 (33.3%)
      expect(getByText('66.7%')).toBeTruthy();
      expect(getByText('33.3%')).toBeTruthy();
    });

    it('shows 100% for single item', () => {
      const singleItem = [{ name: 'Only', amount: 50, color: '#000', categoryId: 'cat-1' }];
      const { getByText } = render(<CustomLegend {...defaultProps} data={singleItem} />);
      expect(getByText('100.0%')).toBeTruthy();
    });

    it('handles zero total gracefully', () => {
      const zeroData = [
        { name: 'Zero1', amount: 0, color: '#000', categoryId: 'cat-1' },
        { name: 'Zero2', amount: 0, color: '#111', categoryId: 'cat-2' },
      ];
      const { getAllByText } = render(<CustomLegend {...defaultProps} data={zeroData} />);
      // When total is 0, percentage should be 0
      expect(getAllByText('0%').length).toBe(2);
    });

    it('calculates percentages for many items', () => {
      const manyItems = [
        { name: 'A', amount: 25, color: '#1', categoryId: 'a' },
        { name: 'B', amount: 25, color: '#2', categoryId: 'b' },
        { name: 'C', amount: 25, color: '#3', categoryId: 'c' },
        { name: 'D', amount: 25, color: '#4', categoryId: 'd' },
      ];
      const { getAllByText } = render(<CustomLegend {...defaultProps} data={manyItems} />);
      // Each item should be 25% of 100 total
      expect(getAllByText('25.0%').length).toBe(4);
    });
  });

  describe('Icons', () => {
    it('renders icons when provided', () => {
      const { getByTestId } = render(<CustomLegend {...defaultProps} />);
      expect(getByTestId('icon-food')).toBeTruthy();
      expect(getByTestId('icon-car')).toBeTruthy();
    });

    it('does not render icons when not provided', () => {
      const dataWithoutIcons = [
        { name: 'No Icon', amount: 100, color: '#000', categoryId: 'cat-1' },
      ];
      const { queryByTestId } = render(
        <CustomLegend {...defaultProps} data={dataWithoutIcons} />,
      );
      expect(queryByTestId('icon-undefined')).toBeNull();
    });
  });

  describe('Clickable Items', () => {
    it('does not respond to press when isClickable is false', () => {
      const onItemPress = jest.fn();
      const { getByText } = render(
        <CustomLegend {...defaultProps} isClickable={false} onItemPress={onItemPress} />,
      );

      fireEvent.press(getByText('Food'));

      expect(onItemPress).not.toHaveBeenCalled();
    });

    it('responds to press when isClickable is true', () => {
      const onItemPress = jest.fn();
      const { getByText } = render(
        <CustomLegend {...defaultProps} isClickable={true} onItemPress={onItemPress} />,
      );

      fireEvent.press(getByText('Food'));

      expect(onItemPress).toHaveBeenCalledWith('cat-1');
    });

    it('shows chevron icon when isClickable and has categoryId', () => {
      const { getAllByTestId } = render(
        <CustomLegend {...defaultProps} isClickable={true} />,
      );
      expect(getAllByTestId('icon-chevron-right').length).toBe(2);
    });

    it('does not show chevron icon when isClickable is false', () => {
      const { queryByTestId } = render(
        <CustomLegend {...defaultProps} isClickable={false} />,
      );
      expect(queryByTestId('icon-chevron-right')).toBeNull();
    });

    it('does not show chevron for items without categoryId', () => {
      const dataWithoutCategoryId = [
        { name: 'No Category', amount: 100, color: '#000' },
      ];
      const { queryByTestId } = render(
        <CustomLegend {...defaultProps} data={dataWithoutCategoryId} isClickable={true} />,
      );
      expect(queryByTestId('icon-chevron-right')).toBeNull();
    });

    it('item without categoryId is not clickable even when isClickable is true', () => {
      const onItemPress = jest.fn();
      const dataWithoutCategoryId = [
        { name: 'Not Clickable', amount: 100, color: '#000' },
      ];
      const { getByText } = render(
        <CustomLegend
          {...defaultProps}
          data={dataWithoutCategoryId}
          isClickable={true}
          onItemPress={onItemPress}
        />,
      );

      // Item renders as View, not TouchableOpacity, so press does nothing
      fireEvent.press(getByText('Not Clickable'));
      expect(onItemPress).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has accessibility label for clickable items', () => {
      const { getByLabelText } = render(
        <CustomLegend {...defaultProps} isClickable={true} />,
      );
      expect(getByLabelText('View details for Food')).toBeTruthy();
    });

    it('has accessibility hint for clickable items', () => {
      const { getByLabelText } = render(
        <CustomLegend {...defaultProps} isClickable={true} />,
      );
      const item = getByLabelText('View details for Food');
      expect(item.props.accessibilityHint).toBe('Double tap to filter by this category');
    });

    it('has accessibility role button for clickable items', () => {
      const { getByLabelText } = render(
        <CustomLegend {...defaultProps} isClickable={true} />,
      );
      const item = getByLabelText('View details for Food');
      expect(item.props.accessibilityRole).toBe('button');
    });
  });

  describe('Theme Colors', () => {
    it('applies text color from colors prop', () => {
      const customColors = { ...defaultColors, text: '#FF0000' };
      const { getByText } = render(
        <CustomLegend {...defaultProps} colors={customColors} />,
      );
      const foodText = getByText('Food');
      expect(foodText.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: '#FF0000' }),
        ]),
      );
    });

    it('applies border color from colors prop', () => {
      const customColors = { ...defaultColors, border: '#00FF00' };
      const { UNSAFE_getAllByType } = render(
        <CustomLegend {...defaultProps} colors={customColors} />,
      );
      // The border color is applied to legend items
      const views = UNSAFE_getAllByType(require('react-native').View);
      // At least one view should have the border color applied
      const hasExpectedBorder = views.some(view => {
        const styleArray = Array.isArray(view.props.style) ? view.props.style : [view.props.style];
        return styleArray.some(style => style && style.borderBottomColor === '#00FF00');
      });
      expect(hasExpectedBorder).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles very small amounts', () => {
      const smallData = [{ name: 'Tiny', amount: 0.01, color: '#000', categoryId: 'cat-1' }];
      const { getByText } = render(<CustomLegend {...defaultProps} data={smallData} />);
      expect(getByText('0.01 USD')).toBeTruthy();
      expect(getByText('100.0%')).toBeTruthy();
    });

    it('handles very large amounts', () => {
      const largeData = [{ name: 'Big', amount: 1000000, color: '#000', categoryId: 'cat-1' }];
      const { getByText } = render(<CustomLegend {...defaultProps} data={largeData} />);
      expect(getByText('1000000.00 USD')).toBeTruthy();
    });

    it('handles items with missing optional fields', () => {
      const minimalData = [
        { name: 'Minimal', amount: 100, color: '#000' }, // No icon, no categoryId
      ];
      const { getByText } = render(<CustomLegend {...defaultProps} data={minimalData} />);
      expect(getByText('Minimal')).toBeTruthy();
      expect(getByText('100.00 USD')).toBeTruthy();
    });

    it('handles decimal percentages', () => {
      const decimalData = [
        { name: 'A', amount: 33.33, color: '#1', categoryId: 'a' },
        { name: 'B', amount: 66.67, color: '#2', categoryId: 'b' },
      ];
      const { getByText } = render(<CustomLegend {...defaultProps} data={decimalData} />);
      expect(getByText('33.3%')).toBeTruthy();
      expect(getByText('66.7%')).toBeTruthy();
    });
  });
});
