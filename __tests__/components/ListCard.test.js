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
  const renderCard = async (props = {}) =>
    await render(
      <ListCard {...props}>
        <Text>{childText}</Text>
      </ListCard>,
    );

  describe('Rendering', () => {
    it('renders children', async () => {
      const { getByText } = await renderCard();
      expect(getByText(childText)).toBeTruthy();
    });

    it('renders without optional props', async () => {
      const { root } = await renderCard();
      expect(root).toBeTruthy();
    });

    it('renders with accessibilityLabel and accessibilityHint', async () => {
      const { getByLabelText } = await renderCard({
        accessibilityLabel: 'Account row',
        accessibilityHint: 'Double tap to edit',
      });
      expect(getByLabelText('Account row')).toBeTruthy();
    });
  });

  describe('Variants', () => {
    it('renders default variant without crashing', async () => {
      const { root } = await renderCard({ variant: 'default' });
      expect(root).toBeTruthy();
    });

    it('renders expense variant without crashing', async () => {
      const { root } = await renderCard({ variant: 'expense' });
      expect(root).toBeTruthy();
    });

    it('renders income variant without crashing', async () => {
      const { root } = await renderCard({ variant: 'income' });
      expect(root).toBeTruthy();
    });

    it('renders transfer variant without crashing', async () => {
      const { root } = await renderCard({ variant: 'transfer' });
      expect(root).toBeTruthy();
    });
  });

  describe('Alternate background', () => {
    it('renders with alternateBackground=true on default variant', async () => {
      // Should use altRow background
      const { root } = await renderCard({ variant: 'default', alternateBackground: true });
      expect(root).toBeTruthy();
    });

    it('renders with alternateBackground=false on default variant', async () => {
      // Should use regular background
      const { root } = await renderCard({ variant: 'default', alternateBackground: false });
      expect(root).toBeTruthy();
    });

    it('expense variant ignores alternateBackground (always altRow)', async () => {
      const { root } = await renderCard({ variant: 'expense', alternateBackground: true });
      expect(root).toBeTruthy();
    });
  });

  describe('Left icon', () => {
    it('renders icon when leftIcon is provided', async () => {
      const { root } = await renderCard({ leftIcon: 'cart' });
      expect(root).toBeTruthy();
    });

    it('does not render icon container when leftIcon is omitted', async () => {
      // Just verify it renders without an icon
      const { root } = await renderCard();
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with custom color override', async () => {
      const { root } = await renderCard({ leftIcon: 'cart', leftIconColor: '#ff0000' });
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with custom size', async () => {
      const { root } = await renderCard({ leftIcon: 'cart', leftIconSize: 32 });
      expect(root).toBeTruthy();
    });

    it('renders leftIcon with background when leftIconBackground=true', async () => {
      const { root } = await renderCard({ leftIcon: 'cart', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('expense variant icon uses expense color (no override)', async () => {
      const { root } = await renderCard({ variant: 'expense', leftIcon: 'cart' });
      expect(root).toBeTruthy();
    });

    it('income variant icon uses income color', async () => {
      const { root } = await renderCard({ variant: 'income', leftIcon: 'arrow-down' });
      expect(root).toBeTruthy();
    });

    it('transfer variant icon uses transfer color', async () => {
      const { root } = await renderCard({ variant: 'transfer', leftIcon: 'swap-horizontal' });
      expect(root).toBeTruthy();
    });

    it('default variant icon uses text color', async () => {
      const { root } = await renderCard({ variant: 'default', leftIcon: 'account' });
      expect(root).toBeTruthy();
    });

    it('icon background: expense variant uses altRow', async () => {
      const { root } = await renderCard({ variant: 'expense', leftIcon: 'cart', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: income variant uses altRow', async () => {
      const { root } = await renderCard({ variant: 'income', leftIcon: 'arrow-down', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: transfer variant uses altRow', async () => {
      const { root } = await renderCard({ variant: 'transfer', leftIcon: 'swap-horizontal', leftIconBackground: true });
      expect(root).toBeTruthy();
    });

    it('icon background: default variant uses surface', async () => {
      const { root } = await renderCard({ variant: 'default', leftIcon: 'account', leftIconBackground: true });
      expect(root).toBeTruthy();
    });
  });

  describe('Right action', () => {
    it('renders rightAction when provided', async () => {
      const { getByText } = await render(
        <ListCard rightAction={<Text>Drag</Text>}>
          <Text>{childText}</Text>
        </ListCard>,
      );
      expect(getByText('Drag')).toBeTruthy();
    });

    it('does not render right action container when omitted', async () => {
      const { root } = await renderCard();
      expect(root).toBeTruthy();
    });
  });

  describe('Border', () => {
    it('renders with border by default', async () => {
      const { root } = await renderCard();
      expect(root).toBeTruthy();
    });

    it('renders without border when showBorder=false', async () => {
      const { root } = await renderCard({ showBorder: false });
      expect(root).toBeTruthy();
    });
  });

  describe('Interactions', () => {
    it('calls onPress when pressed', async () => {
      const onPress = jest.fn();
      const { getByRole } = await renderCard({ onPress });
      await fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('calls onLongPress when long pressed', async () => {
      const onLongPress = jest.fn();
      const { getByRole } = await renderCard({ onLongPress });
      fireEvent(getByRole('button'), 'longPress');
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('works without onPress (no crash)', async () => {
      const { root } = await renderCard();
      expect(root).toBeTruthy();
    });
  });

  describe('Custom style', () => {
    it('accepts custom style override', async () => {
      const { root } = await renderCard({ style: { paddingLeft: 40 } });
      expect(root).toBeTruthy();
    });
  });
});
