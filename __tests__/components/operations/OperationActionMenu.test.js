/**
 * Tests for OperationActionMenu — the ACTION LIST an operation row offers on long
 * press (Edit / Repeat / hide-from-charts / Delete).
 *
 * The presentation those actions arrive in — the lifted copy of the row, the
 * blurred backdrop, dismissal, hardware back — belongs to RowActionMenu and is
 * covered in __tests__/components/RowActionMenu.test.js.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

const makeMenu = (operation = {}) => ({
  operation: { id: 'op-1', type: 'expense', amount: '10.00', ...operation },
  layout: { x: 16, y: 200, width: 320, height: 48 },
  row: <Text>Groceries</Text>,
});

const baseProps = () => ({
  colors: { ...colors, mutedText: '#888' },
  t,
  onClose: jest.fn(),
  onEdit: jest.fn(),
  onRepeat: jest.fn(),
  onToggleCharts: jest.fn(),
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

  it('renders the action buttons and the lifted row when open', async () => {
    const { getByTestId, getByText } = await renderMenu({ menu: makeMenu(), ...baseProps() });
    await waitFor(() => expect(getByTestId('operation-action-edit')).toBeTruthy());
    expect(getByTestId('operation-action-repeat')).toBeTruthy();
    expect(getByTestId('operation-action-charts')).toBeTruthy();
    expect(getByTestId('operation-action-delete')).toBeTruthy();
    expect(getByText('Groceries')).toBeTruthy();
  });

  it.each([
    ['operation-action-edit', 'onEdit'],
    ['operation-action-repeat', 'onRepeat'],
    ['operation-action-charts', 'onToggleCharts'],
    ['operation-action-delete', 'onDelete'],
  ])('fires %s callback when pressed', async (testID, handler) => {
    const props = baseProps();
    const { getByTestId } = await renderMenu({ menu: makeMenu(), ...props });
    await waitFor(() => expect(getByTestId(testID)).toBeTruthy());
    fireEvent.press(getByTestId(testID));
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });

  describe('hide-from-charts action', () => {
    it('offers it for a balance adjustment — its modal is read-only, so this is the only entry point', async () => {
      const props = baseProps();
      const { getByTestId } = await renderMenu({
        menu: makeMenu({ categoryId: 'shadow-adjustment-expense' }),
        ...props,
      });
      await waitFor(() => expect(getByTestId('operation-action-charts')).toBeTruthy());
      fireEvent.press(getByTestId('operation-action-charts'));
      expect(props.onToggleCharts).toHaveBeenCalledTimes(1);
    });

    it('is not offered for a transfer, which feeds no chart', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({ type: 'transfer' }),
        ...baseProps(),
      });
      // The other actions stay.
      await waitFor(() => expect(getByTestId('operation-action-edit')).toBeTruthy());
      expect(queryByTestId('operation-action-charts')).toBeNull();
    });

    it('reads "hide" while the operation is shown and "show" once it is hidden', async () => {
      const shown = await renderMenu({ menu: makeMenu(), ...baseProps() });
      await waitFor(() => expect(shown.getByLabelText('exclude_from_charts')).toBeTruthy());
      expect(shown.queryByLabelText('include_in_charts')).toBeNull();

      const hidden = await renderMenu({
        menu: makeMenu({ excludeFromCharts: true }),
        ...baseProps(),
      });
      await waitFor(() => expect(hidden.getByLabelText('include_in_charts')).toBeTruthy());
    });
  });

  // The reason this component's frame left <Modal> behind: a Modal is a separate
  // native window, so a row measured in app coordinates and redrawn inside it drifts
  // by whatever the two origins disagree on. That, and the hardware-back wiring it
  // forced, are RowActionMenu's now — what stays here is that an operation's row
  // reaches the overlay at all.
  it('lifts the pressed row into the overlay layer', async () => {
    const { getByTestId, getByText } = await renderMenu({ menu: makeMenu(), ...baseProps() });
    await waitFor(() => expect(getByTestId('overlay-outlet')).toBeTruthy());

    const clone = getByText('Groceries').parent;
    expect(StyleSheet.flatten(clone.props.style)).toMatchObject({ top: 200, left: 16, width: 320 });
  });
});
