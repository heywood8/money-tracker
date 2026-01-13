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
    it('renders when visible is true', () => {
      const { getByText } = render(
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

    it('does not render when visible is false', () => {
      const { queryByText } = render(
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

    it('toggles visibility correctly', () => {
      const { getByText, queryByText, rerender } = render(
        <MaterialDialog
          visible={false}
          title="Test Dialog"
          message="Test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(queryByText('Test Dialog')).toBeNull();

      rerender(
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
    it('displays title', () => {
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title="Important Message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Important Message')).toBeTruthy();
    });

    it('displays message', () => {
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          message="This is a test message"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('This is a test message')).toBeTruthy();
    });

    it('displays both title and message', () => {
      const { getByText } = render(
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

    it('renders without title', () => {
      const { getByText, queryByText } = render(
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

    it('renders without message', () => {
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title="Title only"
          buttons={[]}
        />,
        { wrapper },
      );

      expect(getByText('Title only')).toBeTruthy();
    });

    it('renders with empty strings', () => {
      const { root } = render(
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
    it('renders single button', () => {
      const { getByText } = render(
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

    it('renders multiple buttons', () => {
      const { getByText } = render(
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

    it('calls button onPress handler', () => {
      const onPress = jest.fn();
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title="Confirm"
          buttons={[
            { text: 'OK', onPress },
          ]}
        />,
        { wrapper },
      );

      fireEvent.press(getByText('OK'));

      expect(onPress).toHaveBeenCalled();
    });

    it('calls onDismiss when button is pressed', () => {
      const onDismiss = jest.fn();
      const { getByText } = render(
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

      fireEvent.press(getByText('OK'));

      expect(onDismiss).toHaveBeenCalled();
    });

    it('calls both button onPress and onDismiss', () => {
      const buttonOnPress = jest.fn();
      const onDismiss = jest.fn();

      const { getByText } = render(
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

      fireEvent.press(getByText('OK'));

      expect(buttonOnPress).toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalled();
    });

    it('handles button without onPress', () => {
      const onDismiss = jest.fn();
      const { getByText } = render(
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

      expect(() => fireEvent.press(getByText('OK'))).not.toThrow();
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('Button Styles', () => {
    it('renders default button style', () => {
      const { getByText } = render(
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

    it('renders cancel button style', () => {
      const { getByText } = render(
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

    it('renders destructive button style', () => {
      const { getByText } = render(
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

    it('handles multiple buttons with different styles', () => {
      const { getByText } = render(
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
    it('calls onDismiss when overlay is pressed', () => {
      const onDismiss = jest.fn();
      const { getByTestId, UNSAFE_getAllByType } = render(
        <MaterialDialog
          visible={true}
          title="Test"
          onDismiss={onDismiss}
        />,
        { wrapper },
      );
      // Find the overlay Pressable by testID
      const overlay = getByTestId('material-dialog-overlay');

      fireEvent.press(overlay);

      expect(onDismiss).toHaveBeenCalled();
    });

    it('does not dismiss when dialog content is pressed', () => {
      const onDismiss = jest.fn();
      const { getByTestId } = render(
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

      fireEvent.press(dialogContent);

      // Should not dismiss when clicking inside dialog
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('handles onDismiss not provided', () => {
      const { getByText } = render(
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
      expect(() => fireEvent.press(getByText('OK'))).not.toThrow();
    });
  });

  describe('Empty States', () => {
    it('renders with no buttons', () => {
      const { getByText } = render(
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

    it('renders with undefined buttons', () => {
      const { getByText } = render(
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
    it('uses default visible value', () => {
      // Default visible is false
      expect(MaterialDialog.defaultProps.visible).toBe(false);
    });

    it('uses default buttons array', () => {
      const { getByText } = render(
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
    it('handles rapid button presses', () => {
      const onPress = jest.fn();
      const { getByText } = render(
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
      fireEvent.press(button);
      fireEvent.press(button);
      fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(3);
    });

    it('handles long text in title', () => {
      const longTitle = 'This is a very long title that might wrap to multiple lines';
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title={longTitle}
        />,
        { wrapper },
      );

      expect(getByText(longTitle)).toBeTruthy();
    });

    it('handles long text in message', () => {
      const longMessage = 'This is a very long message that contains a lot of text and might wrap to multiple lines in the dialog';
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          message={longMessage}
        />,
        { wrapper },
      );

      expect(getByText(longMessage)).toBeTruthy();
    });

    it('handles special characters in text', () => {
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title={"Special < > & \" '"}
          message={"Message with special & < > \" ' characters"}
        />,
        { wrapper },
      );

      expect(getByText('Special < > & " \'')).toBeTruthy();
    });

    it('maintains state across rerenders', () => {
      const { getByText, rerender } = render(
        <MaterialDialog
          visible={true}
          title="First Title"
        />,
        { wrapper },
      );

      expect(getByText('First Title')).toBeTruthy();

      rerender(
        <MaterialDialog
          visible={true}
          title="Second Title"
        />,
      );

      expect(getByText('Second Title')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('buttons are pressable', () => {
      const { getByText } = render(
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
      expect(() => fireEvent.press(button)).not.toThrow();
    });

    it('title is visible to screen readers', () => {
      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title="Accessible Title"
        />,
        { wrapper },
      );

      expect(getByText('Accessible Title')).toBeTruthy();
    });

    it('message is visible to screen readers', () => {
      const { getByText } = render(
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
    it('executes button actions in correct order', () => {
      const actions = [];
      const buttonOnPress = () => actions.push('button');
      const onDismiss = () => actions.push('dismiss');

      const { getByText } = render(
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

      fireEvent.press(getByText('OK'));

      // Button onPress should be called before onDismiss
      expect(actions).toEqual(['button', 'dismiss']);
    });

    it('handles async button handlers', async () => {
      const asyncHandler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const { getByText } = render(
        <MaterialDialog
          visible={true}
          title="Test"
          buttons={[
            { text: 'OK', onPress: asyncHandler },
          ]}
        />,
        { wrapper },
      );

      fireEvent.press(getByText('OK'));

      expect(asyncHandler).toHaveBeenCalled();
    });
  });
});
