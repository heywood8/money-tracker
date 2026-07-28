/**
 * Tests for OperationActionMenu — the long-press context menu shown over an
 * operation row (Edit / Repeat / Delete on a lifted, blurred backdrop).
 */
import React from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import OperationActionMenu from '../../../app/components/operations/OperationActionMenu';
import {
  OverlayHostProvider,
  OverlayOutlet,
} from '../../../app/contexts/OverlayHostContext';

const colors = {
  surface: '#fff',
  border: '#ddd',
  text: '#000',
  primary: '#007AFF',
  expense: '#d32f2f',
  delete: '#d32f2f',
};

const t = (key) => key;

const makeMenu = () => ({
  operation: { id: 'op-1', type: 'expense', amount: '10.00' },
  layout: { x: 16, y: 200, width: 320, height: 48 },
  row: <Text>Groceries</Text>,
});

const baseProps = () => ({
  colors,
  t,
  onClose: jest.fn(),
  onEdit: jest.fn(),
  onRepeat: jest.fn(),
  onDelete: jest.fn(),
});

const harnessStyles = StyleSheet.create({ fill: { flex: 1 } });

// Mirrors App.js: the menu renders inside the (blurred) content view, its overlay
// lands in the outlet next to it. Both fill the same parent — that shared origin is
// what keeps the lifted clone on top of the row it copies.
const tree = (props) => (
  <OverlayHostProvider>
    <View style={harnessStyles.fill}>
      <View style={harnessStyles.fill}>
        <OperationActionMenu {...props} />
      </View>
      <OverlayOutlet />
    </View>
  </OverlayHostProvider>
);

const renderMenu = (props) => render(tree(props));

describe('OperationActionMenu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when menu is null', async () => {
    const { queryByTestId } = await renderMenu({ menu: null, ...baseProps() });
    await waitFor(() => expect(queryByTestId('overlay-outlet')).toBeNull());
    expect(queryByTestId('operation-action-edit')).toBeNull();
    expect(queryByTestId('operation-action-menu-backdrop')).toBeNull();
  });

  it('renders the three action buttons and the lifted row when open', async () => {
    const { getByTestId, getByText } = await renderMenu({ menu: makeMenu(), ...baseProps() });
    await waitFor(() => expect(getByTestId('operation-action-edit')).toBeTruthy());
    expect(getByTestId('operation-action-repeat')).toBeTruthy();
    expect(getByTestId('operation-action-delete')).toBeTruthy();
    expect(getByText('Groceries')).toBeTruthy();
  });

  it.each([
    ['operation-action-edit', 'onEdit'],
    ['operation-action-repeat', 'onRepeat'],
    ['operation-action-delete', 'onDelete'],
  ])('fires %s callback when pressed', async (testID, handler) => {
    const props = baseProps();
    const { getByTestId } = await renderMenu({ menu: makeMenu(), ...props });
    await waitFor(() => expect(getByTestId(testID)).toBeTruthy());
    fireEvent.press(getByTestId(testID));
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the backdrop is pressed', async () => {
    const props = baseProps();
    const { getByTestId } = await renderMenu({ menu: makeMenu(), ...props });
    await waitFor(() => expect(getByTestId('operation-action-menu-backdrop')).toBeTruthy());
    fireEvent.press(getByTestId('operation-action-menu-backdrop'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  describe('Overlay placement', () => {
    // The reason this component left <Modal> behind: a Modal is a separate native
    // window, so a row measured in app coordinates and redrawn inside it drifts by
    // whatever the two origins disagree on. The overlay shares a parent with the
    // content, so `layout.y` addresses the same pixel on both sides.
    it('draws the lifted clone at the measured row position', async () => {
      const { getByTestId, getByText } = await renderMenu({ menu: makeMenu(), ...baseProps() });
      await waitFor(() => expect(getByTestId('overlay-outlet')).toBeTruthy());

      const clone = getByText('Groceries').parent;
      expect(StyleSheet.flatten(clone.props.style)).toMatchObject({ top: 200, left: 16, width: 320 });
    });

    it('mounts the overlay into the outlet, not in place', async () => {
      const { getByTestId } = await renderMenu({ menu: makeMenu(), ...baseProps() });
      const outlet = await waitFor(() => getByTestId('overlay-outlet'));
      // Walking up from the backdrop must reach the outlet: that is what proves the
      // content and the menu live under one shared ancestor.
      let node = getByTestId('operation-action-menu-backdrop').parent;
      let found = false;
      while (node) {
        if (node === outlet) { found = true; break; }
        node = node.parent;
      }
      expect(found).toBe(true);
    });

    it('unmounts the overlay when the menu closes', async () => {
      const props = baseProps();
      const { queryByTestId, rerender } = await renderMenu({ menu: makeMenu(), ...props });
      await waitFor(() => expect(queryByTestId('operation-action-menu-backdrop')).toBeTruthy());

      rerender(tree({ menu: null, ...props }));

      await waitFor(() => expect(queryByTestId('operation-action-menu-backdrop')).toBeNull());
    });
  });

  describe('Regression Tests', () => {
    // Without a Modal window there is no onRequestClose, so back has to be wired by
    // hand — otherwise the hardware back button would leave the screen with the menu
    // still up.
    it('closes on hardware back while open', async () => {
      const props = baseProps();
      const spy = jest.spyOn(BackHandler, 'addEventListener');
      await renderMenu({ menu: makeMenu(), ...props });

      await waitFor(() => expect(spy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function)));
      const handler = spy.mock.calls.at(-1)[1];
      expect(handler()).toBe(true);
      expect(props.onClose).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('does not intercept hardware back while closed', async () => {
      const spy = jest.spyOn(BackHandler, 'addEventListener');
      await renderMenu({ menu: null, ...baseProps() });
      await waitFor(() => expect(spy).not.toHaveBeenCalled());
      spy.mockRestore();
    });
  });
});
