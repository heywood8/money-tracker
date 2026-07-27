/**
 * CategoryBackChip Component Tests
 *
 * The chip shows which category a summary tab is drilled into and pops back to
 * its parent. It renders inside the open chart (under the donut) rather than
 * over the tab strip, where it used to cover the tab's own title — placement is
 * the chart's job, so this component is just a self-sizing button.
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

  describe('Sizing', () => {
    // Under the donut the chip's slot is only as wide as the donut, so it has to
    // cap itself there and ellipsise rather than stretch the row.
    it('never grows past the slot it is placed in', async () => {
      const { getByTestId } = await render(
        <CategoryBackChip {...defaultProps} testID="chip" />,
      );

      const style = Object.assign({}, ...[].concat(getByTestId('chip').props.style));

      expect(style.maxWidth).toBe('100%');
    });
  });

  describe('Accessibility', () => {
    it('exposes the back action rather than the category name', async () => {
      const { getByLabelText } = await render(<CategoryBackChip {...defaultProps} />);

      expect(getByLabelText('back')).toBeTruthy();
    });
  });
});
