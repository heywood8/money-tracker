import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DescriptionSuggestionRow from '../../../app/components/operations/DescriptionSuggestionRow';

const mockColors = {
  border: '#333',
  primary: '#4C9EFF',
  mutedText: '#888',
  surface: '#1e1e1e',
};

describe('DescriptionSuggestionRow', () => {
  const baseProps = {
    chips: ['Monthly pass', 'Metro card', 'Bus fare'],
    colors: mockColors,
    onApply: jest.fn(),
    onDismiss: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders all chips', () => {
    const { getByText } = render(<DescriptionSuggestionRow {...baseProps} />);
    expect(getByText('Monthly pass')).toBeTruthy();
    expect(getByText('Metro card')).toBeTruthy();
    expect(getByText('Bus fare')).toBeTruthy();
  });

  it('renders hint and skip labels', () => {
    const { getByText } = render(<DescriptionSuggestionRow {...baseProps} />);
    expect(getByText('label this?')).toBeTruthy();
    expect(getByText('skip')).toBeTruthy();
  });

  it('calls onApply with chip text when chip is pressed', () => {
    const onApply = jest.fn();
    const { getByText } = render(
      <DescriptionSuggestionRow {...baseProps} onApply={onApply} />,
    );
    fireEvent.press(getByText('Monthly pass'));
    expect(onApply).toHaveBeenCalledWith('Monthly pass');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when skip is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <DescriptionSuggestionRow {...baseProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByText('skip'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls correct onApply value for each chip independently', () => {
    const onApply = jest.fn();
    const { getByText } = render(
      <DescriptionSuggestionRow {...baseProps} onApply={onApply} />,
    );
    fireEvent.press(getByText('Metro card'));
    expect(onApply).toHaveBeenCalledWith('Metro card');
  });
});
