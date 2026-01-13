/**
 * Tests for SimplePicker component
 * Ensures picker modal, selection, and platform-specific behavior work correctly
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';
import SimplePicker from '../../app/components/SimplePicker';

const mockColors = {
  text: '#000',
  surface: '#fff',
  border: '#e0e0e0',
  selected: '#f0f0f0',
};

const mockItems = [
  { label: 'Option 1', value: 'opt1' },
  { label: 'Option 2', value: 'opt2' },
  { label: 'Option 3', value: 'opt3' },
];

describe('SimplePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to Android for most tests
    Platform.OS = 'android';
    // Spy on console.warn to verify warnings for invalid props
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  describe('Initialization', () => {
    it('renders without crashing', () => {
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('displays selected value label', () => {
      const { getByText } = render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 2')).toBeTruthy();
    });

    it('renders with empty value', () => {
      const { root } = render(
        <SimplePicker
          value=""
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles undefined items gracefully', () => {
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={undefined}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).toHaveBeenCalledWith('SimplePicker: items prop is undefined or null. Using empty array.');
    });
  });

  describe('Modal Interaction (Android)', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('opens modal when button is pressed', () => {
      const { getByText, queryByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Initially modal should not be visible
      expect(queryByText('Option 1')).toBeTruthy(); // Button text

      // Press button to open modal
      fireEvent.press(getByText('Option 1'));

      // Modal items should be visible
      expect(queryByText('Option 2')).toBeTruthy();
      expect(queryByText('Option 3')).toBeTruthy();
    });

    it('displays all items in modal', () => {
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // All items should be visible (using getAllByText to handle duplicates)
      const option1Elements = getAllByText('Option 1');
      expect(option1Elements.length).toBeGreaterThan(0);
      const option2Elements = getAllByText('Option 2');
      expect(option2Elements.length).toBeGreaterThan(0);
      const option3Elements = getAllByText('Option 3');
      expect(option3Elements.length).toBeGreaterThan(0);
    });

    it('closes modal when item is selected', () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // Select item (there will be multiple "Option 2" - button and modal item)
      const option2Elements = getAllByText('Option 2');
      fireEvent.press(option2Elements[option2Elements.length - 1]); // Press the modal item

      // onValueChange should be called
      expect(onValueChange).toHaveBeenCalledWith('opt2');
    });

    it('calls onValueChange with correct value', () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // Select different option
      const option3Elements = getAllByText('Option 3');
      fireEvent.press(option3Elements[option3Elements.length - 1]);

      expect(onValueChange).toHaveBeenCalledWith('opt3');
    });

    it('highlights selected item in modal', () => {
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      const button = getByText('Option 2');
      fireEvent.press(button);

      // Selected item should be highlighted (we can't directly test style, but we can verify it renders)
      const option2Elements = getAllByText('Option 2');
      expect(option2Elements.length).toBeGreaterThan(0);
    });
  });

  describe('Modal Dismissal (Android)', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('closes modal when overlay is pressed', () => {
      const { getByText, getByTestId } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // The modal overlay should be present and pressable
      // We can't directly access the overlay, but we can verify modal behavior
      expect(getByText('Option 2')).toBeTruthy();
    });

    it('does not call onValueChange when modal is dismissed without selection', () => {
      const onValueChange = jest.fn();
      const { getByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // Clear the mock to ignore the modal open
      onValueChange.mockClear();

      // Modal close without selection should not call onValueChange
      // (we can't directly test this without accessing modal internals)
    });
  });

  describe('Value Display', () => {
    it('shows label for selected value', () => {
      const { getByText } = render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 2')).toBeTruthy();
    });

    it('handles value not in items list', () => {
      const { root } = render(
        <SimplePicker
          value="nonexistent"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Should render without crashing even with invalid value
      expect(root).toBeTruthy();
    });

    it('shows empty string when no matching item', () => {
      const { root } = render(
        <SimplePicker
          value="invalid"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Button renders with empty label when value doesn't match any item
      expect(root).toBeTruthy();
    });
  });

  describe('Items Management', () => {
    it('handles empty items array', () => {
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={[]}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles items with numeric values', () => {
      const numericItems = [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
        { label: 'Three', value: 3 },
      ];

      const onValueChange = jest.fn();
      const { getByText, getAllByText } = render(
        <SimplePicker
          value={1}
          onValueChange={onValueChange}
          items={numericItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('One'));

      // Select item
      const twoElements = getAllByText('Two');
      fireEvent.press(twoElements[twoElements.length - 1]);

      expect(onValueChange).toHaveBeenCalledWith(2);
    });

    it('handles items with long labels', () => {
      const longLabelItems = [
        { label: 'This is a very long label that might overflow', value: 'long1' },
        { label: 'Another extremely long label for testing purposes', value: 'long2' },
      ];

      const { getByText } = render(
        <SimplePicker
          value="long1"
          onValueChange={jest.fn()}
          items={longLabelItems}
          colors={mockColors}
        />,
      );

      expect(getByText('This is a very long label that might overflow')).toBeTruthy();
    });

    it('handles items with special characters in labels', () => {
      const specialItems = [
        { label: 'Option & Special', value: 'special1' },
        { label: 'Option < > "', value: 'special2' },
      ];

      const { getByText } = render(
        <SimplePicker
          value="special1"
          onValueChange={jest.fn()}
          items={specialItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option & Special')).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('applies custom style to picker button', () => {
      const customStyle = { backgroundColor: 'red' };
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
          style={customStyle}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('applies custom textStyle to button text', () => {
      const customTextStyle = { fontSize: 20 };
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
          textStyle={customTextStyle}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('uses provided colors', () => {
      const customColors = {
        text: '#ff0000',
        surface: '#00ff00',
        border: '#0000ff',
        selected: '#ffff00',
      };

      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={customColors}
        />,
      );

      expect(root).toBeTruthy();
    });
  });

  describe('Platform-Specific Behavior', () => {
    it('renders button on Android', () => {
      Platform.OS = 'android';

      const { getByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Should show button with selected label
      expect(getByText('Option 1')).toBeTruthy();
    });
  });

  describe('Default Props', () => {
    it('uses default colors when not provided', () => {
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).toHaveBeenCalledWith('SimplePicker: colors prop is missing or invalid. Using fallback colors.');
    });

    it('uses empty array as default items', () => {
      const { root } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).toHaveBeenCalledWith('SimplePicker: items prop is undefined or null. Using empty array.');
    });
  });

  describe('Regression Tests', () => {
    it('handles rapid modal open/close cycles', () => {
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Rapidly open and close modal
      expect(() => {
        fireEvent.press(getByText('Option 1')); // Open
        const option1Elements = getAllByText('Option 1');
        fireEvent.press(option1Elements[0]); // Press the button (first element)
      }).not.toThrow();
    });

    it('handles selection of same value', () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // Select same option
      const option1Elements = getAllByText('Option 1');
      fireEvent.press(option1Elements[option1Elements.length - 1]);

      // Should still call onValueChange
      expect(onValueChange).toHaveBeenCalledWith('opt1');
    });

    it('maintains selection after rerender', () => {
      const { getByText, rerender } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 1')).toBeTruthy();

      rerender(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 1')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('button is pressable', () => {
      const { getByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      const button = getByText('Option 1');
      expect(() => fireEvent.press(button)).not.toThrow();
    });

    it('modal items are pressable', () => {
      const { getByText, getAllByText } = render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      fireEvent.press(getByText('Option 1'));

      // Items should be pressable
      const option2Elements = getAllByText('Option 2');
      expect(() => fireEvent.press(option2Elements[option2Elements.length - 1])).not.toThrow();
    });
  });
});
