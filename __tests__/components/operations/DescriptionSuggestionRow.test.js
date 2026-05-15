import React from 'react';
import { ScrollView } from 'react-native';
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

  it('renders dismiss button', () => {
    const { getByText } = render(<DescriptionSuggestionRow {...baseProps} />);
    expect(getByText('✕')).toBeTruthy();
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

  it('calls onDismiss when ✕ is pressed', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <DescriptionSuggestionRow {...baseProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByLabelText('dismiss suggestion'));
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

  it('renders chips inside a horizontal ScrollView', () => {
    const { UNSAFE_getByType } = render(<DescriptionSuggestionRow {...baseProps} />);
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView.props.horizontal).toBe(true);
    const chipButtons = scrollView.findAll(
      (node) => node.props?.accessibilityRole === 'button' && node.props?.accessibilityLabel?.startsWith('label:'),
    );
    expect(chipButtons).toHaveLength(baseProps.chips.length);
  });
});
