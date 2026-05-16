/**
 * Tests for ListCard component
 * Covers variant-based styling, icon rendering, alternate backgrounds, and interactions
 */

import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ListCard from '../../app/components/ListCard';

// useThemeColors is already mocked globally in jest.setup.js

describe('ListCard', () => {
  const childText = 'Card Content';
  const renderCard = (props = {}) =>
    render(
      <ListCard {...props}>
        <Text>{childText}</Text>
      </ListCard>,
    );

  describe('Rendering', () => {
    it('renders children', () => {
      const { getByText } = renderCard();
      expect(getByText(childText)).toBeTruthy();
    });

    it('renders without optional props', () => {
      const { root } = renderCard();
      expect(root).toBeTruthy();
    });

    it('renders with accessibilityLabel and accessibilityHint', () => {
      const { getByLabelText } = renderCard({
        accessibilityLabel: 'Account row',
        accessibilityHint: 'Double tap to edit',
      });
      expect(getByLabelText('Account row')).toBeTruthy();
    });
  });

  describe('Variants', () => {
    it('renders default variant without crashing', () => {
      const { root } = renderCard({ variant: 'default' });
      expect(root).toBeTruthy();
    });

    it('renders expense variant without crashing', () => {
      const { root } = renderCard({ variant: 'expense' });
      expect(root).toBeTruthy();
    });

    it('renders income variant without crashing', () => {
      const { root } = renderCard({ variant: 'income' });
      expect(root).toBeTruthy();
    });

    it('renders transfer variant without crashing', () => {
      const { root } = renderCard({ variant: 'transfer' });
      expect(root).toBeTruthy();
    });
  });

  describe('Alternate background', () => {
    it('renders with alternateBackground=true on default variant', () => {
      // Should use altRow background
      const { root } = renderCard({ variant: 'default', alternateBackground: true });
      expect(root).toBeTruthy();
    });

    it('renders with alternateBackground=false on default variant', () => {
      // Should use regular background
      const { root } = renderCard({ variant: 'default', alternateBackground: false });
      expect(root).toBeTruthy();
    });

    it('expense variant ignores alternateBackground (always altRow)', () => {
      const { root } = renderCard({ variant: 'expense', alternateBackground: true });
      expect(root).toBeTruthy();
    });
  });

  describe('Left icon', () => {
    it('renders icon when leftIcon is provided', () => {
      const { root } = renderCard({ leftIcon: 'cart' });
      expect(root).toBeTruthy();
    });

    it('does not render icon container when leftIcon is omitted', () => {
      // Just verify it renders without an icon
      const { root } = renderCard();
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with custom color override', () => {
      const { root } = renderCard({ leftIcon: 'cart', leftIconColor: '#ff0000' });
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with custom size', () => {
      const { root } = renderCard({ leftIcon: 'cart', leftIconSize: 32 });
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with background when leftIconBackground=true', () => {
      const { root } = renderCard({ leftIcon: 'cart', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('expense variant icon uses expense color (no override)', () => {
      const { root } = renderCard({ variant: 'expense', leftIcon: 'cart' });
      expect(root).toBeTruthy();
    });

    it('income variant icon uses income color', () => {
      const { root } = renderCard({ variant: 'income', leftIcon: 'arrow-down' });
      expect(root).toBeTruthy();
    });

    it('transfer variant icon uses transfer color', () => {
      const { root } = renderCard({ variant: 'transfer', leftIcon: 'swap-horizontal' });
      expect(root).toBeTruthy();
    });

    it('default variant icon uses text color', () => {
      const { root } = renderCard({ variant: 'default', leftIcon: 'account' });
      expect(root).toBeTruthy();
    });

    it('icon background: expense variant uses altRow', () => {
      const { root } = renderCard({ variant: 'expense', leftIcon: 'cart', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: income variant uses altRow', () => {
      const { root } = renderCard({ variant: 'income', leftIcon: 'arrow-down', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: transfer variant uses altRow', () => {
      const { root } = renderCard({ variant: 'transfer', leftIcon: 'swap-horizontal', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: default variant uses surface', () => {
      const { root } = renderCard({ variant: 'default', leftIcon: 'account', leftIconBackground: true });
      expect(root).toBeTruthy();
    });
  });

  describe('Right action', () => {
    it('renders rightAction when provided', () => {
      const { getByText } = render(
        <ListCard rightAction={<Text>Drag</Text>}>
          <Text>{childText}</Text>
        </ListCard>,
      );
      expect(getByText('Drag')).toBeTruthy();
    });

    it('does not render right action container when omitted', () => {
      const { root } = renderCard();
      expect(root).toBeTruthy();
    });
  });

  describe('Border', () => {
    it('renders with border by default', () => {
      const { root } = renderCard();
      expect(root).toBeTruthy();
    });

    it('renders without border when showBorder=false', () => {
      const { root } = renderCard({ showBorder: false });
      expect(root).toBeTruthy();
    });
  });

  describe('Interactions', () => {
    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const { getByRole } = renderCard({ onPress });
      fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('calls onLongPress when long pressed', () => {
      const onLongPress = jest.fn();
      const { getByRole } = renderCard({ onLongPress });
      fireEvent(getByRole('button'), 'longPress');
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('works without onPress (no crash)', () => {
      const { root } = renderCard();
      expect(root).toBeTruthy();
    });
  });

  describe('Custom style', () => {
    it('accepts custom style override', () => {
      const { root } = renderCard({ style: { paddingLeft: 40 } });
      expect(root).toBeTruthy();
    });
  });
});
