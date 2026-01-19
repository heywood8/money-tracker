/**
 * MultiCurrencyFields Component Tests
 *
 * Tests for the MultiCurrencyFields component which handles
 * multi-currency transfer inputs (exchange rate, destination amount).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MultiCurrencyFields from '../../../app/components/modals/MultiCurrencyFields';

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  RUB: { symbol: '₽', name: 'Russian Ruble' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
}));

// Mock currency service
jest.mock('../../../app/services/currency', () => ({
  getExchangeRatesLastUpdated: jest.fn(() => '2024-01-15 10:30'),
}));

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'Icon',
}));

describe('MultiCurrencyFields', () => {
  // Default test props
  const defaultProps = {
    colors: {
      text: '#000000',
      mutedText: '#888888',
      inputBackground: '#FFFFFF',
      inputBorder: '#CCCCCC',
    },
    t: (key) => key,
    sourceAccount: { currency: 'USD' },
    destinationAccount: { currency: 'EUR' },
    exchangeRate: '1.08',
    destinationAmount: '108.00',
    isShadowOperation: false,
    onExchangeRateChange: jest.fn(),
    onDestinationAmountChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders currency info display', () => {
      const { getByText } = render(<MultiCurrencyFields {...defaultProps} />);

      // Should show currency symbols: $ → €
      expect(getByText('$ → €')).toBeTruthy();
    });

    it('renders exchange rate input with label', () => {
      const { getByText, getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} />,
      );

      expect(getByText('exchange_rate:')).toBeTruthy();
      expect(getByDisplayValue('1.08')).toBeTruthy();
    });

    it('renders destination amount input with label', () => {
      const { getByText, getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} />,
      );

      expect(getByText('destination_amount:')).toBeTruthy();
      expect(getByDisplayValue('108.00')).toBeTruthy();
    });

    it('renders destination currency symbol', () => {
      const { getAllByText } = render(<MultiCurrencyFields {...defaultProps} />);

      // € appears in both currency info and destination amount label
      const euroSymbols = getAllByText('€');
      expect(euroSymbols.length).toBeGreaterThanOrEqual(1);
    });

    it('renders exchange rate info text', () => {
      const { getByText } = render(<MultiCurrencyFields {...defaultProps} />);

      expect(getByText('offline_rate_info (2024-01-15 10:30)')).toBeTruthy();
    });

    it('uses custom translation function', () => {
      const customT = jest.fn((key) => `translated_${key}`);
      const { getByText } = render(
        <MultiCurrencyFields {...defaultProps} t={customT} />,
      );

      expect(customT).toHaveBeenCalledWith('exchange_rate');
      expect(customT).toHaveBeenCalledWith('destination_amount');
      expect(customT).toHaveBeenCalledWith('offline_rate_info');
      expect(getByText('translated_exchange_rate:')).toBeTruthy();
    });
  });

  describe('Currency Symbol Resolution', () => {
    it('displays correct symbols for known currencies', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: 'GBP' },
        destinationAccount: { currency: 'JPY' },
      };
      const { getByText, getAllByText } = render(
        <MultiCurrencyFields {...props} />,
      );

      expect(getByText('£ → ¥')).toBeTruthy();
      // ¥ also appears as destination currency label
      const yenSymbols = getAllByText('¥');
      expect(yenSymbols.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to currency code for unknown currencies', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: 'XYZ' },
        destinationAccount: { currency: 'ABC' },
      };
      const { getByText } = render(<MultiCurrencyFields {...props} />);

      expect(getByText('XYZ → ABC')).toBeTruthy();
    });

    it('handles empty currency code', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: '' },
        destinationAccount: { currency: 'USD' },
      };
      const { getByText } = render(<MultiCurrencyFields {...props} />);

      expect(getByText(' → $')).toBeTruthy();
    });

    it('handles null/undefined currency gracefully', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: null },
        destinationAccount: { currency: undefined },
      };

      // Should not throw
      const { getByText } = render(<MultiCurrencyFields {...props} />);
      expect(getByText(' → ')).toBeTruthy();
    });

    it('displays RUB currency symbol correctly', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: 'RUB' },
        destinationAccount: { currency: 'USD' },
      };
      const { getByText } = render(<MultiCurrencyFields {...props} />);

      expect(getByText('₽ → $')).toBeTruthy();
    });
  });

  describe('Input Interactions', () => {
    it('calls onExchangeRateChange when exchange rate input changes', () => {
      const onExchangeRateChange = jest.fn();
      const { getByDisplayValue } = render(
        <MultiCurrencyFields
          {...defaultProps}
          onExchangeRateChange={onExchangeRateChange}
        />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      fireEvent.changeText(exchangeRateInput, '1.15');

      expect(onExchangeRateChange).toHaveBeenCalledWith('1.15');
    });

    it('calls onDestinationAmountChange when destination amount input changes', () => {
      const onDestinationAmountChange = jest.fn();
      const { getByDisplayValue } = render(
        <MultiCurrencyFields
          {...defaultProps}
          onDestinationAmountChange={onDestinationAmountChange}
        />,
      );

      const destinationInput = getByDisplayValue('108.00');
      fireEvent.changeText(destinationInput, '150.00');

      expect(onDestinationAmountChange).toHaveBeenCalledWith('150.00');
    });

    it('inputs have decimal-pad keyboard type', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      const destinationInput = getByDisplayValue('108.00');

      expect(exchangeRateInput.props.keyboardType).toBe('decimal-pad');
      expect(destinationInput.props.keyboardType).toBe('decimal-pad');
    });

    it('inputs have done return key type', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      const destinationInput = getByDisplayValue('108.00');

      expect(exchangeRateInput.props.returnKeyType).toBe('done');
      expect(destinationInput.props.returnKeyType).toBe('done');
    });

    it('inputs show placeholder when empty', () => {
      const { getAllByPlaceholderText } = render(
        <MultiCurrencyFields
          {...defaultProps}
          exchangeRate=""
          destinationAmount=""
        />,
      );

      const placeholders = getAllByPlaceholderText('0.00');
      expect(placeholders.length).toBe(2);
    });
  });

  describe('Shadow Operation (Disabled State)', () => {
    it('inputs are editable when not shadow operation', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} isShadowOperation={false} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      const destinationInput = getByDisplayValue('108.00');

      expect(exchangeRateInput.props.editable).toBe(true);
      expect(destinationInput.props.editable).toBe(true);
    });

    it('inputs are not editable when shadow operation', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} isShadowOperation={true} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      const destinationInput = getByDisplayValue('108.00');

      expect(exchangeRateInput.props.editable).toBe(false);
      expect(destinationInput.props.editable).toBe(false);
    });

    it('applies disabled style when shadow operation', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} isShadowOperation={true} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      const destinationInput = getByDisplayValue('108.00');

      // Check that the style array includes the disabled style (opacity: 0.5)
      const exchangeRateStyles = exchangeRateInput.props.style;
      const destinationStyles = destinationInput.props.style;

      // Style is an array, check for opacity in flattened style
      const hasDisabledStyle = (styleArray) => {
        if (!Array.isArray(styleArray)) return false;
        return styleArray.some(
          (style) => style && style.opacity === 0.5,
        );
      };

      expect(hasDisabledStyle(exchangeRateStyles)).toBe(true);
      expect(hasDisabledStyle(destinationStyles)).toBe(true);
    });

    it('does not apply disabled style when not shadow operation', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} isShadowOperation={false} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');

      const hasDisabledStyle = (styleArray) => {
        if (!Array.isArray(styleArray)) return false;
        return styleArray.some(
          (style) => style && style.opacity === 0.5,
        );
      };

      expect(hasDisabledStyle(exchangeRateInput.props.style)).toBe(false);
    });

    it('defaults isShadowOperation to false/undefined', () => {
      const propsWithoutShadow = { ...defaultProps };
      delete propsWithoutShadow.isShadowOperation;

      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...propsWithoutShadow} />,
      );

      const exchangeRateInput = getByDisplayValue('1.08');
      expect(exchangeRateInput.props.editable).toBe(true);
    });
  });

  describe('Theming', () => {
    it('applies text color from colors prop', () => {
      const customColors = {
        ...defaultProps.colors,
        text: '#FF0000',
      };
      const { getByText } = render(
        <MultiCurrencyFields {...defaultProps} colors={customColors} />,
      );

      const label = getByText('exchange_rate:');
      expect(label.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#FF0000' })]),
      );
    });

    it('applies mutedText color to currency info', () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#999999',
      };
      const { getByText } = render(
        <MultiCurrencyFields {...defaultProps} colors={customColors} />,
      );

      const currencyInfo = getByText('$ → €');
      expect(currencyInfo.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#999999' })]),
      );
    });

    it('applies input background and border colors', () => {
      const customColors = {
        ...defaultProps.colors,
        inputBackground: '#F0F0F0',
        inputBorder: '#DDDDDD',
      };
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} colors={customColors} />,
      );

      const input = getByDisplayValue('1.08');
      expect(input.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: '#F0F0F0',
            borderColor: '#DDDDDD',
          }),
        ]),
      );
    });

    it('applies mutedText color to placeholder', () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#AAAAAA',
      };
      const { getByDisplayValue } = render(
        <MultiCurrencyFields {...defaultProps} colors={customColors} />,
      );

      const input = getByDisplayValue('1.08');
      expect(input.props.placeholderTextColor).toBe('#AAAAAA');
    });
  });

  describe('Exchange Rate Info', () => {
    it('displays last updated timestamp from currency service', () => {
      const Currency = require('../../../app/services/currency');
      Currency.getExchangeRatesLastUpdated.mockReturnValue('2024-06-20 14:45');

      const { getByText } = render(<MultiCurrencyFields {...defaultProps} />);

      expect(getByText('offline_rate_info (2024-06-20 14:45)')).toBeTruthy();
    });

    it('calls getExchangeRatesLastUpdated on render', () => {
      const Currency = require('../../../app/services/currency');
      Currency.getExchangeRatesLastUpdated.mockClear();

      render(<MultiCurrencyFields {...defaultProps} />);

      expect(Currency.getExchangeRatesLastUpdated).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long exchange rate values', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields
          {...defaultProps}
          exchangeRate="1.234567890123456789"
        />,
      );

      expect(getByDisplayValue('1.234567890123456789')).toBeTruthy();
    });

    it('handles very large destination amounts', () => {
      const { getByDisplayValue } = render(
        <MultiCurrencyFields
          {...defaultProps}
          destinationAmount="9999999999.99"
        />,
      );

      expect(getByDisplayValue('9999999999.99')).toBeTruthy();
    });

    it('handles same source and destination currency', () => {
      const props = {
        ...defaultProps,
        sourceAccount: { currency: 'USD' },
        destinationAccount: { currency: 'USD' },
      };
      const { getByText } = render(<MultiCurrencyFields {...props} />);

      expect(getByText('$ → $')).toBeTruthy();
    });

    it('renders correctly with minimal required props', () => {
      const minimalProps = {
        colors: {
          text: '#000',
          mutedText: '#888',
          inputBackground: '#FFF',
          inputBorder: '#CCC',
        },
        t: (k) => k,
        sourceAccount: { currency: 'USD' },
        destinationAccount: { currency: 'EUR' },
        exchangeRate: '',
        destinationAmount: '',
        onExchangeRateChange: jest.fn(),
        onDestinationAmountChange: jest.fn(),
      };

      const { getByText } = render(<MultiCurrencyFields {...minimalProps} />);
      expect(getByText('$ → €')).toBeTruthy();
    });
  });
});
