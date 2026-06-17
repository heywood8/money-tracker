import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LabelInput from '../../../app/components/operations/LabelInput';

const mockColors = {
  text: '#fff',
  mutedText: '#888',
  border: '#333',
  primary: '#4C9EFF',
  surface: '#1e1e1e',
  altRow: '#222',
  inputBackground: '#111',
  inputBorder: '#444',
};

async function renderInput(props = {}) {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    suggestions: [],
    placeholder: 'Add a label…',
    colors: mockColors,
    t: (k) => k,
  };
  return render(<LabelInput {...defaultProps} {...props} />);
}

describe('LabelInput', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders existing labels parsed from the description value', async () => {
    const { getByText } = await renderInput({ value: 'work | food' });
    expect(getByText('work')).toBeTruthy();
    expect(getByText('food')).toBeTruthy();
  });

  it('adds a label on submit and serialises with the delimiter', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({ value: 'work', onChangeText });
    const input = getByTestId('label-input-field');
    await fireEvent.changeText(input, 'food');
    await fireEvent(input, 'submitEditing');
    expect(onChangeText).toHaveBeenCalledWith('work | food');
  });

  it('commits a label when a delimiter is typed', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({ value: '', onChangeText });
    const input = getByTestId('label-input-field');
    await fireEvent.changeText(input, 'work|');
    expect(onChangeText).toHaveBeenCalledWith('work');
  });

  it('commits a label when a comma is typed', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({ value: '', onChangeText });
    const input = getByTestId('label-input-field');
    await fireEvent.changeText(input, 'food,');
    expect(onChangeText).toHaveBeenCalledWith('food');
  });

  it('does not add duplicate labels (case-insensitive)', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({ value: 'Work', onChangeText });
    const input = getByTestId('label-input-field');
    await fireEvent.changeText(input, 'work');
    await fireEvent(input, 'submitEditing');
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('removes a label when its × is pressed', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({ value: 'work | food', onChangeText });
    await fireEvent.press(getByTestId('label-remove-work'));
    expect(onChangeText).toHaveBeenCalledWith('food');
  });

  it('shows suggestion chips on focus, excluding already-applied labels', async () => {
    const { getByTestId, queryByTestId } = await renderInput({
      value: 'work',
      suggestions: ['work', 'food', 'lunch'],
    });
    await fireEvent(getByTestId('label-input-field'), 'focus');
    await waitFor(() => expect(getByTestId('label-suggestions-scroll')).toBeTruthy());
    expect(queryByTestId('label-suggestion-food')).toBeTruthy();
    expect(queryByTestId('label-suggestion-lunch')).toBeTruthy();
    // "work" is already applied -> not suggested
    expect(queryByTestId('label-suggestion-work')).toBeNull();
  });

  it('adds a label when a suggestion chip is tapped', async () => {
    const onChangeText = jest.fn();
    const { getByTestId } = await renderInput({
      value: '',
      suggestions: ['food'],
      onChangeText,
    });
    await fireEvent(getByTestId('label-input-field'), 'focus');
    await waitFor(() => expect(getByTestId('label-suggestion-food')).toBeTruthy());
    await fireEvent.press(getByTestId('label-suggestion-food'));
    expect(onChangeText).toHaveBeenCalledWith('food');
  });

  it('hides the input and remove buttons when not editable', async () => {
    const { queryByTestId, getByText } = await renderInput({ value: 'work', editable: false });
    expect(queryByTestId('label-input-field')).toBeNull();
    expect(queryByTestId('label-remove-work')).toBeNull();
    expect(getByText('work')).toBeTruthy();
  });
});
