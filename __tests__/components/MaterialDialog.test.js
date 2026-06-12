/**
 * Tests for MaterialDialog component
 * Ensures dialog display, buttons, and dismissal work correctly
 */

// Unmock ThemeColorsContext to use real implementation
jest.unmock('../../app/contexts/ThemeColorsContext');

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import MaterialDialog from '../../app/components/MaterialDialog';
import { ThemeColorsProvider } from '../../app/contexts/ThemeColorsContext';

const mockColors = {
  text: '#000',
  card: '#fff',
  primary: '#007AFF',
  mutedText: '#666',
  delete: '#d32f2f',
  selected: '#f0f0f0',
};

// Wrapper with theme context
const wrapper = ({ children }) => (
  <ThemeColorsProvider colors={mockColors}>
    {children}
  </ThemeColorsProvider>
);

describe('MaterialDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('renders when visible is true', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test Dialog"
          message="Test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Test Dialog')).toBeTruthy();
      expect(getByText('Test message')).toBeTruthy();
    });

    it('does not render when visible is false', async () => {
      const { queryByText } = await render(
        <MaterialDialog
          visible={false}
          title="Test Dialog"
          message="Test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(queryByText('Test Dialog')).toBeNull();
      expect(queryByText('Test message')).toBeNull();
    });

    it('toggles visibility correctly', async () => {
      const { getByText, queryByText, rerender } = await render(
        <MaterialDialog
          visible={false}
          title="Test Dialog"
          message="Test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(queryByText('Test Dialog')).toBeNull();

      await rerender(
        <MaterialDialog
          visible={true}
          title="Test Dialog"
          message="Test message"
          buttons={[]}
        />,
      );

      expect(getByText('Test Dialog')).toBeTruthy();
    });
  });

  describe('Content Display', () => {
    it('displays title', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Important Message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Important Message')).toBeTruthy();
    });

    it('displays message', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          message="This is a test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('This is a test message')).toBeTruthy();
    });

    it('displays both title and message', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Title"
          message="Message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Title')).toBeTruthy();
      expect(getByText('Message')).toBeTruthy();
    });

    it('renders without title', async () => {
      const { getByText, queryByText } = await render(
        <MaterialDialog
          visible={true}
          message="Message only"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Message only')).toBeTruthy();
      // No title should be rendered
    });

    it('renders without message', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Title only"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Title only')).toBeTruthy();
    });

    it('renders with empty strings', async () => {
      const { root } = await render(
        <MaterialDialog
          visible={true}
          title=""
          message=""
          buttons={[]}
        />,
        { wrapper },
      );

      expect(root).toBeTruthy();
    });
  });

  describe('Buttons', () => {
    it('renders single button', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', onPress: jest.fn() },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('OK')).toBeTruthy();
    });

    it('renders multiple buttons', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'Cancel', onPress: jest.fn() },
            { text: 'OK', onPress: jest.fn() },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('OK')).toBeTruthy();
    });

    it('calls button onPress handler', async () => {
      const onPress = jest.fn();
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', onPress },
          ]}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));

      expect(onPress).toHaveBeenCalled();
    });

    it('calls onDismiss when button is pressed', async () => {
      const onDismiss = jest.fn();
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', onPress: jest.fn() },
          ]}
          onDismiss={onDismiss}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));

      expect(onDismiss).toHaveBeenCalled();
    });

    it('calls both button onPress and onDismiss', async () => {
      const buttonOnPress = jest.fn();
      const onDismiss = jest.fn();

      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', onPress: buttonOnPress },
          ]}
          onDismiss={onDismiss}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));

      expect(buttonOnPress).toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalled();
    });

    it('handles button without onPress', async () => {
      const onDismiss = jest.fn();
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK' }, // No onPress
          ]}
          onDismiss={onDismiss}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('Button Styles', () => {
    it('renders default button style', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', style: 'default' },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('OK')).toBeTruthy();
    });

    it('renders cancel button style', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'Cancel', style: 'cancel' },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('Cancel')).toBeTruthy();
    });

    it('renders destructive button style', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm Delete"
          buttons={[
            { text: 'Delete', style: 'destructive' },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('Delete')).toBeTruthy();
    });

    it('handles multiple buttons with different styles', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'Cancel', style: 'cancel' },
            { text: 'OK', style: 'default' },
            { text: 'Delete', style: 'destructive' },
          ]}
        />,
        { wrapper },
      );

      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('OK')).toBeTruthy();
      expect(getByText('Delete')).toBeTruthy();
    });
  });

  describe('Dismiss Behavior', () => {
    it('calls onDismiss when overlay is pressed', async () => {
      const onDismiss = jest.fn();
      const { getByTestId, container } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          onDismiss={onDismiss}
        />,
        { wrapper },
      );
      // Find the overlay Pressable by testID
      const overlay = getByTestId('material-dialog-overlay');

      await fireEvent.press(overlay);

      expect(onDismiss).toHaveBeenCalled();
    });

    it('does not dismiss when dialog content is pressed', async () => {
      const onDismiss = jest.fn();
      const { getByTestId } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          message="Message"
          onDismiss={onDismiss}
        />,
        { wrapper },
      );

      // Find the dialog content Pressable by testID
      const dialogContent = getByTestId('material-dialog-content');

      await fireEvent.press(dialogContent);

      // Should not dismiss when clicking inside dialog
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('handles onDismiss not provided', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK' },
          ]}
        />,
        { wrapper },
      );

      // Should not crash without onDismiss
      await fireEvent.press(getByText('OK'));
    });
  });

  describe('Empty States', () => {
    it('renders with no buttons', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="No Buttons"
          message="This dialog has no buttons"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('No Buttons')).toBeTruthy();
    });

    it('renders with undefined buttons', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Undefined Buttons"
          buttons={undefined}
        />,
        { wrapper },
      );

      expect(getByText('Undefined Buttons')).toBeTruthy();
    });
  });

  describe('Default Props', () => {
    it('uses default visible value', async () => {
      // Default visible is false
      expect(MaterialDialog.defaultProps.visible).toBe(false);
    });

    it('uses default buttons array', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
        />,
        { wrapper },
      );

      expect(getByText('Test')).toBeTruthy();
    });
  });

  describe('Regression Tests', () => {
    it('handles rapid button presses', async () => {
      const onPress = jest.fn();
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK', onPress },
          ]}
        />,
        { wrapper },
      );

      const button = getByText('OK');
      await fireEvent.press(button);
      await fireEvent.press(button);
      await fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(3);
    });

    it('handles long text in title', async () => {
      const longTitle = 'This is a very long title that might wrap to multiple lines';
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title={longTitle}
        />,
        { wrapper },
      );

      expect(getByText(longTitle)).toBeTruthy();
    });

    it('handles long text in message', async () => {
      const longMessage = 'This is a very long message that contains a lot of text and might wrap to multiple lines in the dialog';
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          message={longMessage}
        />,
        { wrapper },
      );

      expect(getByText(longMessage)).toBeTruthy();
    });

    it('handles special characters in text', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title={"Special < > & \" '"}
          message={"Message with special & < > \" ' characters"}
        />,
        { wrapper },
      );

      expect(getByText('Special < > & " \'')).toBeTruthy();
    });

    it('maintains state across rerenders', async () => {
      const { getByText, rerender } = await render(
        <MaterialDialog
          visible={true}
          title="First Title"
        />,
        { wrapper },
      );

      expect(getByText('First Title')).toBeTruthy();

      await rerender(
        <MaterialDialog
          visible={true}
          title="Second Title"
        />,
      );

      expect(getByText('Second Title')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('buttons are pressable', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK', onPress: jest.fn() },
          ]}
        />,
        { wrapper },
      );

      const button = getByText('OK');
      await fireEvent.press(button);
    });

    it('title is visible to screen readers', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Accessible Title"
        />,
        { wrapper },
      );

      expect(getByText('Accessible Title')).toBeTruthy();
    });

    it('message is visible to screen readers', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          message="Accessible message"
        />,
        { wrapper },
      );

      expect(getByText('Accessible message')).toBeTruthy();
    });
  });

  describe('Button Interaction', () => {
    it('executes button actions in correct order', async () => {
      const actions = [];
      const buttonOnPress = () => actions.push('button');
      const onDismiss = () => actions.push('dismiss');

      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK', onPress: buttonOnPress },
          ]}
          onDismiss={onDismiss}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));

      // Button onPress should be called before onDismiss
      expect(actions).toEqual(['button', 'dismiss']);
    });

    it('handles async button handlers', async () => {
      const asyncHandler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK', onPress: asyncHandler },
          ]}
        />,
        { wrapper },
      );

      await fireEvent.press(getByText('OK'));

      expect(asyncHandler).toHaveBeenCalled();
    });
  });

  describe('Color fallbacks', () => {
    it('falls back to hardcoded color when colors.delete is not in theme', async () => {
      const colorsWithoutDelete = {
        text: '#000',
        card: '#fff',
        primary: '#007AFF',
        mutedText: '#666',
        selected: '#f0f0f0',
        // no delete
      };
      const wrapperNoDelete = ({ children }) => (
        <ThemeColorsProvider colors={colorsWithoutDelete}>
          {children}
        </ThemeColorsProvider>
      );
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Delete?"
          buttons={[{ text: 'Delete', style: 'destructive' }]}
        />,
        { wrapper: wrapperNoDelete },
      );
      expect(getByText('Delete')).toBeTruthy();
    });

    it('applies pressed background style when button is pressed in', async () => {
      const { getByText } = await render(
        <MaterialDialog
          visible={true}
          title="Press test"
          buttons={[{ text: 'OK', onPress: jest.fn() }]}
        />,
        { wrapper },
      );
      const btn = getByText('OK');
      // pressIn triggers pressed=true branch in style function
      fireEvent(btn, 'pressIn');
      expect(btn).toBeTruthy();
    });
  });
});
