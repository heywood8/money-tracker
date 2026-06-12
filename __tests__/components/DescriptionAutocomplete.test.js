/**
 * Tests for DescriptionAutocomplete component
 * Ensures description input, chip filtering, and chip selection work correctly
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import DescriptionAutocomplete from '../../app/components/DescriptionAutocomplete';

const mockColors = {
  text: '#000',
  mutedText: '#666',
  background: '#fff',
  surface: '#fff',
  primary: '#1976d2',
  border: '#e0e0e0',
  altRow: '#f5f5f5',
  inputBackground: '#fafafa',
  inputBorder: '#ccc',
};

const SUGGESTIONS = ['Coffee', 'Groceries', 'Rent', 'Salary', 'Transport', 'Utilities'];

async function renderComponent(props = {}) {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    suggestions: SUGGESTIONS,
    placeholder: 'Description',
    colors: mockColors,
  };
  return await render(<DescriptionAutocomplete {...defaultProps} {...props} />);
}

describe('DescriptionAutocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders the text input with placeholder', async () => {
      const { getByPlaceholderText } = await renderComponent();
      expect(getByPlaceholderText('Description')).toBeTruthy();
    });

    it('displays current value in the input', async () => {
      const { getByDisplayValue } = await renderComponent({ value: 'Coffee' });
      expect(getByDisplayValue('Coffee')).toBeTruthy();
    });

    it('does not show chips before input is focused', async () => {
      const { queryByTestId } = await renderComponent();
      expect(queryByTestId('chips-scroll')).toBeNull();
    });
  });

  describe('Chip display on focus', () => {
    it('shows chips from suggestions when focused with empty value', async () => {
      const { getByTestId, getByText } = await renderComponent({ value: '' });

      await fireEvent(getByTestId('description-input'), 'focus');

      await waitFor(() => {
        expect(getByTestId('chips-scroll')).toBeTruthy();
      });

      // Should show the first items from suggestions
      expect(getByText('Coffee')).toBeTruthy();
      expect(getByText('Groceries')).toBeTruthy();
    });

    it('shows at most 8 chips', async () => {
      const manySuggestions = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`);
      const { getByTestId, queryAllByText } = await renderComponent({
        value: '',
        suggestions: manySuggestions,
      });

      await fireEvent(getByTestId('description-input'), 'focus');

      await waitFor(() => {
        expect(getByTestId('chips-scroll')).toBeTruthy();
      });

      // Items 1-8 should appear, 9-12 should not
      const chipElements = queryAllByText(/^Item \d+$/);
      expect(chipElements.length).toBeLessThanOrEqual(8);
    });

    it('shows no chips when suggestions array is empty', async () => {
      const { getByTestId, queryByTestId } = await renderComponent({
        value: '',
        suggestions: [],
      });

      await fireEvent(getByTestId('description-input'), 'focus');

      // Chips scroll should not appear with no suggestions
      await act(async () => {
        jest.runAllTimers();
      });
      expect(queryByTestId('chips-scroll')).toBeNull();
    });
  });

  describe('Chip filtering', () => {
    it('filters chips by substring match when value is non-empty', async () => {
      const { getByTestId, queryByText, getByText } = await renderComponent({ value: 'co' });

      await fireEvent(getByTestId('description-input'), 'focus');

      await waitFor(() => {
        expect(getByTestId('chips-scroll')).toBeTruthy();
      });

      // 'Coffee' contains 'co' (case-insensitive)
      expect(getByText('Coffee')).toBeTruthy();
      // 'Rent' does not contain 'co'
      expect(queryByText('Rent')).toBeNull();
    });

    it('hides chips entirely when value is an exact case-insensitive match (no remaining suggestions)', async () => {
      // When 'coffee' matches 'Coffee' exactly and no other suggestions contain 'coffee',
      // the filtered list is empty and chips-scroll is not rendered.
      const { getByTestId, queryByTestId } = await renderComponent({ value: 'coffee' });

      await fireEvent(getByTestId('description-input'), 'focus');

      await act(async () => {
        jest.runAllTimers();
      });

      expect(queryByTestId('chips-scroll')).toBeNull();
    });

    it('shows no chips when no suggestions match the typed value', async () => {
      const { getByTestId, queryByTestId } = await renderComponent({ value: 'xyznotfound' });

      await fireEvent(getByTestId('description-input'), 'focus');

      await act(async () => {
        jest.runAllTimers();
      });

      expect(queryByTestId('chips-scroll')).toBeNull();
    });
  });

  describe('Chip selection', () => {
    it('calls onChangeText with chip value when chip is tapped', async () => {
      const onChangeText = jest.fn();
      const { getByTestId } = await renderComponent({ value: '', onChangeText });

      await fireEvent(getByTestId('description-input'), 'focus');

      await waitFor(() => {
        expect(getByTestId('chips-scroll')).toBeTruthy();
      });

      await fireEvent.press(getByTestId('chip-Coffee'));

      expect(onChangeText).toHaveBeenCalledWith('Coffee');
    });

    it('hides suggestion chips after chip is tapped', async () => {
      const { getByTestId, queryByTestId } = await renderComponent({ value: '' });

      await fireEvent(getByTestId('description-input'), 'focus');

      await waitFor(() => {
        expect(getByTestId('chips-scroll')).toBeTruthy();
      });

      await fireEvent.press(getByTestId('chip-Coffee'));

      await act(async () => {
        jest.runAllTimers();
      });

      expect(queryByTestId('chips-scroll')).toBeNull();
    });
  });

  describe('Editable prop', () => {
    it('passes editable=false to TextInput when disabled', async () => {
      const { getByTestId } = await renderComponent({ editable: false });
      const input = getByTestId('description-input');
      expect(input.props.editable).toBe(false);
    });
  });

  describe('onFocus prop', () => {
    it('calls onFocus callback when the input is focused', async () => {
      const onFocus = jest.fn();
      const { getByTestId } = await renderComponent({ onFocus });

      await fireEvent(getByTestId('description-input'), 'focus');

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onFocus is not provided', async () => {
      const { getByTestId } = await renderComponent(); // no onFocus prop
      await fireEvent(getByTestId('description-input'), 'focus');
    });
  });
});
