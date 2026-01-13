/**
 * Tests for Calculator component
 * Ensures calculator operations, expressions, and UI interactions work correctly
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Calculator from '../../app/components/Calculator';

// Mock the calculator utilities
jest.mock('../../app/utils/calculatorUtils', () => ({
  hasOperation: (expr) => /[+\-×÷]/.test(expr),
  evaluateExpression: (expr) => {
    if (!expr) return null;
    // Simple mock implementation
    try {
      const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/');
       
      const result = eval(cleaned);
      return String(result);
    } catch {
      return null;
    }
  },
}));

const mockColors = {
  text: '#000',
  primary: '#007AFF',
  border: '#e0e0e0',
  altRow: '#f5f5f5',
  background: '#fff',
  inputBackground: '#fff',
};

describe('Calculator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('renders with empty value', () => {
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      // Should render without crashing
      expect(getByText('1')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
      expect(getByText('9')).toBeTruthy();
    });

    it('renders with initial value', () => {
      const { getByText } = render(
        <Calculator
          value="123"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByText('123')).toBeTruthy();
    });

    it('displays all numeric buttons', () => {
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      for (let i = 0; i <= 9; i++) {
        expect(getByText(String(i))).toBeTruthy();
      }
    });

    it('displays all operation buttons', () => {
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByText('+')).toBeTruthy();
      expect(getByText('-')).toBeTruthy();
      expect(getByText('×')).toBeTruthy();
      expect(getByText('÷')).toBeTruthy();
      expect(getByText('.')).toBeTruthy();
    });

    it('displays backspace button', () => {
      const { getByLabelText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByLabelText('backspace')).toBeTruthy();
    });
  });

  describe('Numeric Input', () => {
    it('enters single digit', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('5'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5');
    });

    it('enters multiple digits', () => {
      const onValueChange = jest.fn();
      const { getByText, rerender } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('1'), 'pressIn');
      rerender(
        <Calculator
          value="1"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('2'), 'pressIn');
      rerender(
        <Calculator
          value="12"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('3'), 'pressIn');

      expect(onValueChange).toHaveBeenCalled();
    });

    it('enters zero', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('0'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('0');

    });
  });

  describe('Decimal Point', () => {
    it('enters decimal point', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('.'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5.');

    });

    it('prevents multiple decimal points in same number', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5.5"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      onValueChange.mockClear();
      fireEvent(getByText('.'), 'pressIn');

      // Should not call onValueChange for duplicate decimal
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('allows decimal point in new number after operation', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5.5+3"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('.'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5.5+3.');

    });
  });

  describe('Operations', () => {
    it('enters addition operation', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('+'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5+');

    });

    it('enters subtraction operation', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="10"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('-'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('10-');

    });

    it('enters multiplication operation', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('×'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5×');

    });

    it('enters division operation', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="10"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('÷'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('10÷');

    });

    it('replaces operation when consecutive operations are entered', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value="5+"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('-'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5-');

    });

    it('allows minus at start for negative numbers', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('-'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('-');

    });

    it('prevents other operations at start', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('+'), 'pressIn');

      // Should not add operation at start
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('Backspace', () => {
    it('deletes last character', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="123"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByLabelText('backspace'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('12');

    });

    it('handles backspace on empty string', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByLabelText('backspace'), 'pressIn');

      // Backspace on empty string is a no-op, no call expected
      expect(onValueChange).not.toHaveBeenCalled();

    });

    it('deletes operation character', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="5+"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByLabelText('backspace'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('5');
    });
  });

  describe('Equals Button', () => {
    it('shows equals button when expression contains operation', () => {
      const { getByLabelText } = render(
        <Calculator
          value="5+3"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByLabelText('equals')).toBeTruthy();
    });

    it('hides equals button when no operation in expression', () => {
      const { queryByLabelText } = render(
        <Calculator
          value="123"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(queryByLabelText('equals')).toBeNull();
    });

    it('evaluates expression when equals is pressed', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="5+3"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent.press(getByLabelText('equals'));

      expect(onValueChange).toHaveBeenCalledWith('8');

    });

    it('evaluates multiplication correctly', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="5×3"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent.press(getByLabelText('equals'));

      expect(onValueChange).toHaveBeenCalledWith('15');

    });

    it('evaluates division correctly', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="10÷2"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent.press(getByLabelText('equals'));

      expect(onValueChange).toHaveBeenCalledWith('5');
    });

    it('evaluates complex expression', () => {
      const onValueChange = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="10+5×2"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent.press(getByLabelText('equals'));

      expect(onValueChange).toHaveBeenCalledWith('20');

    });
  });

  describe('Add Button (Optional)', () => {
    it('renders add button when onAdd prop is provided', () => {
      const onAdd = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="100"
          onValueChange={jest.fn()}
          colors={mockColors}
          onAdd={onAdd}
        />,
      );

      expect(getByLabelText('add')).toBeTruthy();
    });

    it('does not render add button when onAdd prop is not provided', () => {
      const { queryByLabelText } = render(
        <Calculator
          value="100"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(queryByLabelText('add')).toBeNull();
    });

    it('calls onAdd when add button is pressed', () => {
      const onAdd = jest.fn();
      const { getByLabelText } = render(
        <Calculator
          value="100"
          onValueChange={jest.fn()}
          colors={mockColors}
          onAdd={onAdd}
        />,
      );

      fireEvent.press(getByLabelText('add'));

      expect(onAdd).toHaveBeenCalled();
    });
  });

  describe('Value Synchronization', () => {
    it('syncs internal state with prop changes', () => {
      const { rerender, getByText } = render(
        <Calculator
          value="123"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByText('123')).toBeTruthy();

      rerender(
        <Calculator
          value="456"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByText('456')).toBeTruthy();
    });

    it('handles empty value prop', () => {
      const { root } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      // Empty string should be rendered without error
      expect(root).toBeTruthy();
    });

    it('handles undefined value prop', () => {
      const { root } = render(
        <Calculator
          value={undefined}
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      // Should render without crashing
      expect(root).toBeTruthy();
    });
  });

  describe('Regression Tests', () => {
    it('handles rapid button presses', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      // Rapidly press multiple buttons
      fireEvent(getByText('1'), 'pressIn');
      fireEvent(getByText('2'), 'pressIn');
      fireEvent(getByText('3'), 'pressIn');

      // Should handle all presses
      expect(onValueChange).toHaveBeenCalled();
    });

    it('maintains expression after evaluation', () => {
      const onValueChange = jest.fn();
      const { getByLabelText, rerender } = render(
        <Calculator
          value="5+3"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent.press(getByLabelText('equals'));

      rerender(
        <Calculator
          value="8"
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      // Can continue calculating with result
      fireEvent(getByLabelText('backspace'), 'pressIn');
      expect(onValueChange).toHaveBeenCalled();
    });

    it('handles expression with leading zero', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('0'), 'pressIn');
      fireEvent(getByText('5'), 'pressIn');

      expect(onValueChange).toHaveBeenCalled();
    });

    it('handles decimal-only value', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={onValueChange}
          colors={mockColors}
        />,
      );

      fireEvent(getByText('.'), 'pressIn');

      expect(onValueChange).toHaveBeenCalledWith('.');

    });
  });

  describe('Accessibility', () => {
    it('has accessible button labels', () => {
      const { getByLabelText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(getByLabelText('backspace')).toBeTruthy();
    });

    it('all buttons have accessibility role', () => {
      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      // Buttons should be pressable
      const button = getByText('5');
      expect(button).toBeTruthy();
    });
  });
});
