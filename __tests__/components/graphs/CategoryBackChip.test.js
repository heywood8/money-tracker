/**
 * CategoryBackChip Component Tests
 *
 * The chip shows which category a summary tab is drilled into and pops back to
 * its parent. It is rendered as an overlay above the tab strip rather than
 * inside a tab, so it must stay tappable without swallowing taps meant for the
 * tab underneath it.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CategoryBackChip from '../../../app/components/graphs/CategoryBackChip';

describe('CategoryBackChip', () => {
  const defaultProps = {
    colors: {
      altRow: '#FAFAFA',
      border: '#CCCCCC',
      mutedText: '#888888',
      text: '#000000',
    },
    label: 'Food',
    backLabel: 'back',
    onPress: jest.fn(),
    side: 'left',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the category name', async () => {
      const { getByText } = await render(<CategoryBackChip {...defaultProps} />);

      expect(getByText('Food')).toBeTruthy();
    });

    it('truncates a long category name to a single line', async () => {
      const { getByText } = await render(
        <CategoryBackChip {...defaultProps} label="A very long category name indeed" />,
      );

      expect(getByText('A very long category name indeed').props.numberOfLines).toBe(1);
    });
  });

  describe('Press Interaction', () => {
    it('calls onPress when the chip is pressed', async () => {
      const onPress = jest.fn();
      const { getByRole } = await render(
        <CategoryBackChip {...defaultProps} onPress={onPress} />,
      );

      await fireEvent.press(getByRole('button'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Overlay behaviour', () => {
    // Without box-none the wrapper would blanket half the tab strip and eat
    // every tap aimed at the tab beneath it.
    it('lets taps that miss the chip fall through to the tab underneath', async () => {
      const { getByTestId } = await render(
        <CategoryBackChip {...defaultProps} testID="chip" />,
      );

      const wrapper = getByTestId('chip').parent;

      expect(wrapper.props.pointerEvents).toBe('box-none');
    });

    it('sits over the half of the strip that owns it', async () => {
      const { getByTestId, rerender } = await render(
        <CategoryBackChip {...defaultProps} side="left" testID="chip" />,
      );

      const styleOf = () => {
        const style = getByTestId('chip').parent.props.style;
        return Object.assign({}, ...[].concat(style));
      };

      expect(styleOf()).toEqual(expect.objectContaining({ left: 0, width: '50%' }));

      await rerender(<CategoryBackChip {...defaultProps} side="right" testID="chip" />);

      expect(styleOf()).toEqual(expect.objectContaining({ right: 0, width: '50%' }));
    });
  });

  describe('Accessibility', () => {
    it('exposes the back action rather than the category name', async () => {
      const { getByLabelText } = await render(<CategoryBackChip {...defaultProps} />);

      expect(getByLabelText('back')).toBeTruthy();
    });
  });
});
