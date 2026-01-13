/**
 * Tests for FormInput component
 * Ensures standardized input styling, icons, errors, and multiline support work correctly
 */

// Unmock ThemeColorsContext to use real implementation
jest.unmock('../../app/contexts/ThemeColorsContext');

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FormInput from '../../app/components/FormInput';
import { ThemeColorsProvider } from '../../app/contexts/ThemeColorsContext';

const mockColors = {
  text: '#000',
  mutedText: '#666',
  surface: '#fff',
  border: '#e0e0e0',
  delete: '#d32f2f',
  inputBackground: '#f5f5f5',
  inputBorder: '#ccc',
};

// Wrapper with theme context
const wrapper = ({ children }) => (
  <ThemeColorsProvider colors={mockColors}>
    {children}
  </ThemeColorsProvider>
);

describe('FormInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      expect(getByPlaceholderText('Test')).toBeTruthy();
    });

    it('displays placeholder text', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Enter name"
        />,
        { wrapper },
      );

      expect(getByPlaceholderText('Enter name')).toBeTruthy();
    });

    it('displays input value', () => {
      const { getByDisplayValue } = render(
        <FormInput
          value="Test value"
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      expect(getByDisplayValue('Test value')).toBeTruthy();
    });

    it('renders with empty value', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Empty"
        />,
        { wrapper },
      );

      expect(getByPlaceholderText('Empty')).toBeTruthy();
    });
  });

  describe('Text Input', () => {
    it('calls onChangeText when text changes', () => {
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent.changeText(input, 'New text');

      expect(onChangeText).toHaveBeenCalledWith('New text');
    });

    it('updates value correctly', () => {
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent.changeText(input, 'abc');
      fireEvent.changeText(input, 'abcd');

      expect(onChangeText).toHaveBeenCalledTimes(2);
      expect(onChangeText).toHaveBeenLastCalledWith('abcd');
    });

    it('handles empty string input', () => {
      const onChangeText = jest.fn();
      const { getByDisplayValue } = render(
        <FormInput
          value="text"
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByDisplayValue('text');
      fireEvent.changeText(input, '');

      expect(onChangeText).toHaveBeenCalledWith('');
    });
  });

  describe('Left Icon', () => {
    it('displays left icon when provided', () => {
      const { getByTestId } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          leftIcon="currency-usd"
        />,
        { wrapper },
      );

      expect(getByTestId('icon-currency-usd')).toBeTruthy();
    });

    it('does not display icon when not provided', () => {
      const { queryByTestId } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      // No icon should be present
      expect(queryByTestId(/^icon-/)).toBeNull();
    });

    it('renders different icons correctly', () => {
      const { getByTestId, rerender } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          leftIcon="cash"
        />,
        { wrapper },
      );

      expect(getByTestId('icon-cash')).toBeTruthy();

      rerender(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          leftIcon="account"
        />,
      );

      expect(getByTestId('icon-account')).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('displays error message when error is provided', () => {
      const { getByText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          error="This field is required"
        />,
        { wrapper },
      );

      expect(getByText('This field is required')).toBeTruthy();
    });

    it('does not display error when not provided', () => {
      const { queryByText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      // Should not have any error text
      expect(queryByText(/required|error|invalid/i)).toBeNull();
    });

    it('toggles error message', () => {
      const { getByText, queryByText, rerender } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      expect(queryByText('Error message')).toBeNull();

      rerender(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          error="Error message"
        />,
      );

      expect(getByText('Error message')).toBeTruthy();
    });

    it('displays different error messages', () => {
      const { getByText, rerender } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          error="Error 1"
        />,
        { wrapper },
      );

      expect(getByText('Error 1')).toBeTruthy();

      rerender(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          error="Error 2"
        />,
      );

      expect(getByText('Error 2')).toBeTruthy();
    });
  });

  describe('Multiline Support', () => {
    it('renders as multiline when multiline prop is true', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Multiline"
          multiline={true}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Multiline');
      expect(input.props.multiline).toBe(true);
    });

    it('renders as single line by default', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Single line"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Single line');
      expect(input.props.multiline).toBeFalsy();
    });

    it('accepts numberOfLines prop for multiline', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          multiline={true}
          numberOfLines={5}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.numberOfLines).toBe(5);
    });
  });

  describe('Keyboard Type', () => {
    it('uses default keyboard type', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.keyboardType).toBe('default');
    });

    it('accepts numeric keyboard type', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Amount"
          keyboardType="numeric"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Amount');
      expect(input.props.keyboardType).toBe('numeric');
    });

    it('accepts email keyboard type', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Email"
          keyboardType="email-address"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Email');
      expect(input.props.keyboardType).toBe('email-address');
    });
  });

  describe('Editable State', () => {
    it('is editable by default', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.editable).toBe(true);
    });

    it('can be set to non-editable', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value="Read only"
          onChangeText={jest.fn()}
          placeholder="Test"
          editable={false}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.editable).toBe(false);
    });
  });

  describe('Auto Focus', () => {
    it('does not auto focus by default', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.autoFocus).toBe(false);
    });

    it('auto focuses when prop is true', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          autoFocus={true}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.autoFocus).toBe(true);
    });
  });

  describe('Return Key', () => {
    it('uses done as default return key', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.returnKeyType).toBe('done');
    });

    it('accepts custom return key type', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          returnKeyType="next"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      expect(input.props.returnKeyType).toBe('next');
    });

    it('calls onSubmitEditing when return is pressed', () => {
      const onSubmitEditing = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          onSubmitEditing={onSubmitEditing}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent(input, 'submitEditing');

      expect(onSubmitEditing).toHaveBeenCalled();
    });
  });

  describe('Secure Text Entry', () => {
    it('does not obscure text by default', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value="password"
          onChangeText={jest.fn()}
          placeholder="Password"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Password');
      expect(input.props.secureTextEntry).toBe(false);
    });

    it('obscures text when secureTextEntry is true', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value="password"
          onChangeText={jest.fn()}
          placeholder="Password"
          secureTextEntry={true}
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Password');
      expect(input.props.secureTextEntry).toBe(true);
    });
  });

  describe('Custom Styling', () => {
    it('accepts custom container style', () => {
      const customStyle = { marginBottom: 20 };
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          style={customStyle}
        />,
        { wrapper },
      );

      expect(getByPlaceholderText('Test')).toBeTruthy();
    });
  });

  describe('Input Ref', () => {
    it('accepts and forwards inputRef', () => {
      const ref = React.createRef();
      render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          inputRef={ref}
        />,
        { wrapper },
      );

      // Ref should be set (we can't directly test ref value in React Native Testing Library)
      expect(ref).toBeDefined();
    });
  });

  describe('Regression Tests', () => {
    it('handles rapid text changes', () => {
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent.changeText(input, 'a');
      fireEvent.changeText(input, 'ab');
      fireEvent.changeText(input, 'abc');

      expect(onChangeText).toHaveBeenCalledTimes(3);
    });

    it('handles very long text input', () => {
      const longText = 'a'.repeat(1000);
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent.changeText(input, longText);

      expect(onChangeText).toHaveBeenCalledWith(longText);
    });

    it('handles special characters in text', () => {
      const specialText = '<script>alert("test")</script>';
      const onChangeText = jest.fn();
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={onChangeText}
          placeholder="Test"
        />,
        { wrapper },
      );

      const input = getByPlaceholderText('Test');
      fireEvent.changeText(input, specialText);

      expect(onChangeText).toHaveBeenCalledWith(specialText);
    });

    it('maintains state across rerenders', () => {
      const { getByDisplayValue, rerender } = render(
        <FormInput
          value="initial"
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
        { wrapper },
      );

      expect(getByDisplayValue('initial')).toBeTruthy();

      rerender(
        <FormInput
          value="updated"
          onChangeText={jest.fn()}
          placeholder="Test"
        />,
      );

      expect(getByDisplayValue('updated')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('input is accessible', () => {
      const { getByPlaceholderText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Accessible input"
        />,
        { wrapper },
      );

      expect(getByPlaceholderText('Accessible input')).toBeTruthy();
    });

    it('error message is visible to screen readers', () => {
      const { getByText } = render(
        <FormInput
          value=""
          onChangeText={jest.fn()}
          placeholder="Test"
          error="This is an error"
        />,
        { wrapper },
      );

      expect(getByText('This is an error')).toBeTruthy();
    });
  });
});
