import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import ChoiceChipRow from '../../app/components/ChoiceChipRow';

const colors = { text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee' };

const OPTIONS = [
  { value: 1, label: '1' },
  { value: 100, label: '100', accessibilityLabel: 'per hundred' },
];

const setup = async (props = {}) => render(
  <ChoiceChipRow
    options={OPTIONS}
    selected={1}
    onSelect={jest.fn()}
    colors={colors}
    testIDPrefix="amount"
    {...props}
  />,
);

describe('ChoiceChipRow', () => {
  it('renders a chip per option under the host prefix', async () => {
    const { getByTestId } = await setup();
    expect(within(getByTestId('amount-1')).getByText('1')).toBeTruthy();
    expect(within(getByTestId('amount-100')).getByText('100')).toBeTruthy();
  });

  it('marks and checks only the selected chip', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('amount-1').props.accessibilityState.selected).toBe(true);
    expect(within(getByTestId('amount-1')).getByTestId('icon-check')).toBeTruthy();
    expect(getByTestId('amount-100').props.accessibilityState.selected).toBe(false);
    expect(within(getByTestId('amount-100')).queryByTestId('icon-check')).toBeNull();
  });

  it('reports the tapped value with its own type', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await setup({ onSelect });
    await fireEvent.press(getByTestId('amount-100'));
    expect(onSelect).toHaveBeenCalledWith(100);
  });

  it('reads the label to a screen reader unless told otherwise', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('amount-1').props.accessibilityLabel).toBe('1');
    expect(getByTestId('amount-100').props.accessibilityLabel).toBe('per hundred');
  });
});
