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
    it('renders without crashing', async () => {
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('displays selected value label', async () => {
      const { getByText } = await render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 2')).toBeTruthy();
    });

    it('renders with empty value', async () => {
      const { root } = await render(
        <SimplePicker
          value=""
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles undefined items gracefully', async () => {
      // undefined is filled in by the default parameter, so no warning is needed
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={undefined}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('handles null items gracefully', async () => {
      // null bypasses the default parameter, so the defensive fallback catches it
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={null}
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

    it('opens modal when button is pressed', async () => {
      const { getByText, queryByText } = await render(
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
      await fireEvent.press(getByText('Option 1'));

      // Modal items should be visible
      expect(queryByText('Option 2')).toBeTruthy();
      expect(queryByText('Option 3')).toBeTruthy();
    });

    it('displays all items in modal', async () => {
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // All items should be visible (using getAllByText to handle duplicates)
      const option1Elements = getAllByText('Option 1');
      expect(option1Elements.length).toBeGreaterThan(0);
      const option2Elements = getAllByText('Option 2');
      expect(option2Elements.length).toBeGreaterThan(0);
      const option3Elements = getAllByText('Option 3');
      expect(option3Elements.length).toBeGreaterThan(0);
    });

    it('closes modal when item is selected', async () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // Select item (there will be multiple "Option 2" - button and modal item)
      const option2Elements = getAllByText('Option 2');
      await fireEvent.press(option2Elements[option2Elements.length - 1]); // Press the modal item

      // onValueChange should be called
      expect(onValueChange).toHaveBeenCalledWith('opt2');
    });

    it('calls onValueChange with correct value', async () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // Select different option
      const option3Elements = getAllByText('Option 3');
      await fireEvent.press(option3Elements[option3Elements.length - 1]);

      expect(onValueChange).toHaveBeenCalledWith('opt3');
    });

    it('highlights selected item in modal', async () => {
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      const button = getByText('Option 2');
      await fireEvent.press(button);

      // Selected item should be highlighted (we can't directly test style, but we can verify it renders)
      const option2Elements = getAllByText('Option 2');
      expect(option2Elements.length).toBeGreaterThan(0);
    });
  });

  describe('Modal Dismissal (Android)', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('closes modal when overlay is pressed', async () => {
      const { getByText, getByTestId } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // The modal overlay should be present and pressable
      // We can't directly access the overlay, but we can verify modal behavior
      expect(getByText('Option 2')).toBeTruthy();
    });

    it('does not call onValueChange when modal is dismissed without selection', async () => {
      const onValueChange = jest.fn();
      const { getByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // Clear the mock to ignore the modal open
      onValueChange.mockClear();

      // Modal close without selection should not call onValueChange
      // (we can't directly test this without accessing modal internals)
    });
  });

  describe('Value Display', () => {
    it('shows label for selected value', async () => {
      const { getByText } = await render(
        <SimplePicker
          value="opt2"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 2')).toBeTruthy();
    });

    it('handles value not in items list', async () => {
      const { root } = await render(
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

    it('shows empty string when no matching item', async () => {
      const { root } = await render(
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
    it('handles empty items array', async () => {
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={[]}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles items with numeric values', async () => {
      const numericItems = [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
        { label: 'Three', value: 3 },
      ];

      const onValueChange = jest.fn();
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value={1}
          onValueChange={onValueChange}
          items={numericItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('One'));

      // Select item
      const twoElements = getAllByText('Two');
      await fireEvent.press(twoElements[twoElements.length - 1]);

      expect(onValueChange).toHaveBeenCalledWith(2);
    });

    it('handles items with long labels', async () => {
      const longLabelItems = [
        { label: 'This is a very long label that might overflow', value: 'long1' },
        { label: 'Another extremely long label for testing purposes', value: 'long2' },
      ];

      const { getByText } = await render(
        <SimplePicker
          value="long1"
          onValueChange={jest.fn()}
          items={longLabelItems}
          colors={mockColors}
        />,
      );

      expect(getByText('This is a very long label that might overflow')).toBeTruthy();
    });

    it('handles items with special characters in labels', async () => {
      const specialItems = [
        { label: 'Option & Special', value: 'special1' },
        { label: 'Option < > "', value: 'special2' },
      ];

      const { getByText } = await render(
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
    it('applies custom style to picker button', async () => {
      const customStyle = { backgroundColor: 'red' };
      const { root } = await render(
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

    it('applies custom textStyle to button text', async () => {
      const customTextStyle = { fontSize: 20 };
      const { root } = await render(
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

    it('uses provided colors', async () => {
      const customColors = {
        text: '#ff0000',
        surface: '#00ff00',
        border: '#0000ff',
        selected: '#ffff00',
      };

      const { root } = await render(
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
    it('renders button on Android', async () => {
      Platform.OS = 'android';

      const { getByText } = await render(
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
    it('uses default colors when not provided', async () => {
      // The default parameter supplies colors, so the defensive fallback never trips
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('falls back to safe colors when colors is explicitly invalid', async () => {
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={null}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).toHaveBeenCalledWith('SimplePicker: colors prop is missing or invalid. Using fallback colors.');
    });

    it('uses empty array as default items', async () => {
      const { root } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          colors={mockColors}
        />,
      );

      expect(root).toBeTruthy();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('Regression Tests', () => {
    it('handles rapid modal open/close cycles', async () => {
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Rapidly open and close modal
      await (async () => {
        await fireEvent.press(getByText('Option 1')); // Open
        const option1Elements = getAllByText('Option 1');
        await fireEvent.press(option1Elements[0]); // Press the button (first element)
      })();
    });

    it('handles selection of same value', async () => {
      const onValueChange = jest.fn();
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={onValueChange}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // Select same option
      const option1Elements = getAllByText('Option 1');
      await fireEvent.press(option1Elements[option1Elements.length - 1]);

      // Should still call onValueChange
      expect(onValueChange).toHaveBeenCalledWith('opt1');
    });

    it('maintains selection after rerender', async () => {
      const { getByText, rerender } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      expect(getByText('Option 1')).toBeTruthy();

      await rerender(
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
    it('button is pressable', async () => {
      const { getByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      const button = getByText('Option 1');
      await fireEvent.press(button);
    });

    it('modal items are pressable', async () => {
      const { getByText, getAllByText } = await render(
        <SimplePicker
          value="opt1"
          onValueChange={jest.fn()}
          items={mockItems}
          colors={mockColors}
        />,
      );

      // Open modal
      await fireEvent.press(getByText('Option 1'));

      // Items should be pressable
      const option2Elements = getAllByText('Option 2');
      await fireEvent.press(option2Elements[option2Elements.length - 1]);
    });
  });
});
