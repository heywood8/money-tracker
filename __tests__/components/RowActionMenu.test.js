/**
 * Tests for RowActionMenu — the long-press context menu shared by every list row
 * that offers whole-row actions (operations, budget lines, budget envelopes).
 *
 * The operation-specific action list is covered in OperationActionMenu.test.js;
 * what is tested here is the generic frame: an arbitrary action list, the lifted
 * copy of the pressed row, and how the bar grows when the actions outnumber one
 * row's worth.
 */
import React from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RowActionMenu from '../../app/components/RowActionMenu';
import {
  OverlayHostProvider,
  OverlayOutlet,
} from '../../app/contexts/OverlayHostContext';

const colors = {
  surface: '#fff',
  border: '#ddd',
  text: '#000',
  primary: '#007AFF',
  mutedText: '#888',
  destructive: '#d32f2f',
};

const makeMenu = () => ({
  layout: { x: 16, y: 200, width: 320, height: 48 },
  row: <Text>Groceries</Text>,
});

const makeActions = (count) => Array.from({ length: count }, (_, i) => ({
  key: `a${i}`,
  icon: 'pencil',
  label: `action ${i}`,
  onPress: jest.fn(),
}));

const harnessStyles = StyleSheet.create({ fill: { flex: 1 } });

// Mirrors App.js: the menu renders inside the (blurred) content view, its overlay
// lands in the outlet next to it — one shared parent, one coordinate space.
const tree = (props) => (
  <OverlayHostProvider>
    <View style={harnessStyles.fill}>
      <View style={harnessStyles.fill}>
        <RowActionMenu {...props} />
      </View>
      <OverlayOutlet />
    </View>
  </OverlayHostProvider>
);

const renderMenu = (props) => render(tree({
  colors, onClose: jest.fn(), testIDPrefix: 'row-action', ...props,
}));

describe('RowActionMenu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when there is no menu', async () => {
    const { queryByTestId } = await renderMenu({ menu: null, actions: makeActions(2) });
    await waitFor(() => expect(queryByTestId('overlay-outlet')).toBeNull());
  });

  it('renders nothing when the row has no actions to offer', async () => {
    const { queryByTestId } = await renderMenu({ menu: makeMenu(), actions: [] });
    await waitFor(() => expect(queryByTestId('row-action-menu-backdrop')).toBeNull());
  });

  it('names each action button after its key, under the host prefix', async () => {
    const actions = makeActions(3);
    const { getByTestId } = await renderMenu({ menu: makeMenu(), actions });
    await waitFor(() => expect(getByTestId('row-action-a0')).toBeTruthy());

    fireEvent.press(getByTestId('row-action-a2'));
    expect(actions[2].onPress).toHaveBeenCalledTimes(1);
  });

  it('lifts a copy of the pressed row to the position it was measured at', async () => {
    const { getByText, getByTestId } = await renderMenu({ menu: makeMenu(), actions: makeActions(2) });
    await waitFor(() => expect(getByTestId('overlay-outlet')).toBeTruthy());

    const clone = getByText('Groceries').parent;
    expect(StyleSheet.flatten(clone.props.style)).toMatchObject({ top: 200, left: 16, width: 320 });
  });

  describe('Action bar layout', () => {
    // Past four across the labels stop being readable at a row's width, so a
    // longer list stacks into a second row and the bar grows to match.
    it('gives the bar the height of the rows it needs', async () => {
      const oneRow = await renderMenu({ menu: makeMenu(), actions: makeActions(4) });
      const twoRows = await renderMenu({ menu: makeMenu(), actions: makeActions(6) });
      await waitFor(() => expect(oneRow.getByTestId('row-action-a0')).toBeTruthy());

      const heightOf = (queries, key) => {
        // The panel is the action button's grandparent (button → row → panel).
        const panel = queries.getByTestId(key).parent.parent;
        return StyleSheet.flatten(panel.props.style).height;
      };
      expect(heightOf(twoRows, 'row-action-a0')).toBe(2 * heightOf(oneRow, 'row-action-a0'));
    });
  });

  describe('Tone', () => {
    it('draws a destructive action in the destructive colour, label included', async () => {
      const actions = [
        { key: 'edit', icon: 'pencil', label: 'edit', onPress: jest.fn() },
        { key: 'delete', icon: 'trash-can-outline', label: 'delete', tone: 'destructive', onPress: jest.fn() },
      ];
      const { getByTestId, getByText } = await renderMenu({ menu: makeMenu(), actions });
      await waitFor(() => expect(getByTestId('row-action-delete')).toBeTruthy());

      expect(StyleSheet.flatten(getByText('delete').props.style).color).toBe(colors.destructive);
      expect(StyleSheet.flatten(getByText('edit').props.style).color).toBe(colors.text);
    });
  });

  it('prefers the full phrase for a screen reader when the label was shortened', async () => {
    const actions = [{
      key: 'delete', icon: 'trash-can-outline', label: 'delete', a11yLabel: 'delete_group', onPress: jest.fn(),
    }];
    const { getByLabelText } = await renderMenu({ menu: makeMenu(), actions });
    await waitFor(() => expect(getByLabelText('delete_group')).toBeTruthy());
  });

  describe('Dismissal', () => {
    it('dismisses when the backdrop is pressed', async () => {
      const onClose = jest.fn();
      const { getByTestId } = await renderMenu({ menu: makeMenu(), actions: makeActions(2), onClose });
      await waitFor(() => expect(getByTestId('row-action-menu-backdrop')).toBeTruthy());

      fireEvent.press(getByTestId('row-action-menu-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Dismissing belongs to the menu, not to each host's handlers: every action
    // either opens something or asks for a confirmation, and a bar left covering
    // the screen over a dialog was the failure mode this closes off.
    it('dismisses itself before running the chosen action', async () => {
      const order = [];
      const onClose = jest.fn(() => order.push('close'));
      const actions = [{
        key: 'edit', icon: 'pencil', label: 'edit', onPress: () => order.push('action'),
      }];
      const { getByTestId } = await renderMenu({ menu: makeMenu(), actions, onClose });
      await waitFor(() => expect(getByTestId('row-action-edit')).toBeTruthy());

      fireEvent.press(getByTestId('row-action-edit'));
      expect(order).toEqual(['close', 'action']);
    });

    it('unmounts the overlay when the menu closes', async () => {
      const props = { menu: makeMenu(), actions: makeActions(2), colors, onClose: jest.fn(), testIDPrefix: 'row-action' };
      const { queryByTestId, rerender } = await renderMenu(props);
      await waitFor(() => expect(queryByTestId('row-action-menu-backdrop')).toBeTruthy());

      rerender(tree({ ...props, menu: null }));

      await waitFor(() => expect(queryByTestId('row-action-menu-backdrop')).toBeNull());
    });
  });

  describe('Overlay placement', () => {
    it('mounts the overlay into the outlet, not in place', async () => {
      const { getByTestId } = await renderMenu({ menu: makeMenu(), actions: makeActions(2) });
      const outlet = await waitFor(() => getByTestId('overlay-outlet'));
      // Walking up from the backdrop must reach the outlet: that is what proves the
      // content and the menu live under one shared ancestor.
      let node = getByTestId('row-action-menu-backdrop').parent;
      let found = false;
      while (node) {
        if (node === outlet) { found = true; break; }
        node = node.parent;
      }
      expect(found).toBe(true);
    });
  });

  describe('Regression Tests', () => {
    // Without a Modal window there is no onRequestClose, so back has to be wired by
    // hand — otherwise the hardware back button would leave the screen with the menu
    // still up.
    it('closes on hardware back while open', async () => {
      const onClose = jest.fn();
      const spy = jest.spyOn(BackHandler, 'addEventListener');
      await renderMenu({ menu: makeMenu(), actions: makeActions(2), onClose });

      await waitFor(() => expect(spy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function)));
      const handler = spy.mock.calls.at(-1)[1];
      expect(handler()).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('does not intercept hardware back while closed', async () => {
      const spy = jest.spyOn(BackHandler, 'addEventListener');
      await renderMenu({ menu: null, actions: makeActions(2) });
      await waitFor(() => expect(spy).not.toHaveBeenCalled());
      spy.mockRestore();
    });
  });
});
