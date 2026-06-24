import React from 'react';
import { ScrollView } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { render, fireEvent } from '@testing-library/react-native';
import DescriptionSuggestionRow from '../../../app/components/operations/DescriptionSuggestionRow';
import { SwipeNavigationGestureProvider } from '../../../app/contexts/SwipeNavigationContext';

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

  it('renders all chips', async () => {
    const { getByText } = await render(<DescriptionSuggestionRow {...baseProps} />);
    expect(getByText('Monthly pass')).toBeTruthy();
    expect(getByText('Metro card')).toBeTruthy();
    expect(getByText('Bus fare')).toBeTruthy();
  });

  it('renders dismiss button', async () => {
    const { getByText } = await render(<DescriptionSuggestionRow {...baseProps} />);
    expect(getByText('✕')).toBeTruthy();
  });

  it('calls onApply with chip text when chip is pressed', async () => {
    const onApply = jest.fn();
    const { getByText } = await render(
      <DescriptionSuggestionRow {...baseProps} onApply={onApply} />,
    );
    await fireEvent.press(getByText('Monthly pass'));
    expect(onApply).toHaveBeenCalledWith('Monthly pass');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when ✕ is pressed', async () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = await render(
      <DescriptionSuggestionRow {...baseProps} onDismiss={onDismiss} />,
    );
    await fireEvent.press(getByLabelText('dismiss suggestion'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls correct onApply value for each chip independently', async () => {
    const onApply = jest.fn();
    const { getByText } = await render(
      <DescriptionSuggestionRow {...baseProps} onApply={onApply} />,
    );
    await fireEvent.press(getByText('Metro card'));
    expect(onApply).toHaveBeenCalledWith('Metro card');
  });

  it('renders chips inside a horizontal ScrollView', async () => {
    const { container, getByText } = await render(<DescriptionSuggestionRow {...baseProps} />);
    // ScrollView renders as RCTScrollView in the host tree
    const scrollView = container.queryAll(n => n.type === 'RCTScrollView')[0];
    expect(scrollView.props.horizontal).toBe(true);
    // Each chip text should be in the tree
    for (const chip of baseProps.chips) {
      expect(getByText(chip)).toBeTruthy();
    }
  });

  it('strips the "Note:" prefix from chip text while applying the raw label', async () => {
    const onApply = jest.fn();
    const { getByText, queryByText } = await render(
      <DescriptionSuggestionRow
        {...baseProps}
        chips={['Note: Денису', 'Groceries']}
        onApply={onApply}
      />,
    );

    // The prefix is stripped for display...
    expect(getByText('Денису')).toBeTruthy();
    expect(queryByText('Note: Денису')).toBeNull();
    // ...but plain labels are untouched.
    expect(getByText('Groceries')).toBeTruthy();

    // Pressing the chip still applies the raw underlying label.
    await fireEvent.press(getByText('Денису'));
    expect(onApply).toHaveBeenCalledWith('Note: Денису');
  });

  describe('Swipe priority', () => {
    it('gives the chip scroll priority over the screen-swipe gesture', async () => {
      const swipeGesture = { __id: 'swipe' };
      Gesture.Native.mockClear();

      await render(
        <SwipeNavigationGestureProvider value={swipeGesture}>
          <DescriptionSuggestionRow {...baseProps} />
        </SwipeNavigationGestureProvider>,
      );

      // The chip's native scroll gesture must block the screen-swipe Pan so a
      // horizontal drag scrolls the chips instead of switching screens.
      expect(Gesture.Native).toHaveBeenCalled();
      const nativeInstance = Gesture.Native.mock.results[0].value;
      expect(nativeInstance.blocksExternalGesture).toHaveBeenCalledWith(swipeGesture);
    });

    it('renders without a swipe gesture provider (no blocking relation)', async () => {
      const { getByText } = await render(<DescriptionSuggestionRow {...baseProps} />);
      // Still renders normally when there is no swipe navigation in the tree.
      expect(getByText('Monthly pass')).toBeTruthy();
    });
  });
});
