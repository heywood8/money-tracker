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

  // "Find by": the operation's category and labels as chips under the actions.
  describe('Find by chips', () => {
    const categories = [
      { id: 'cat-food', name: 'Food', icon: 'food', categoryType: 'expense' },
      { id: 'cat-cafe', name: 'Cafe', icon: 'coffee', parentId: 'cat-food', categoryType: 'expense' },
    ];
    const findProps = () => ({
      ...baseProps(),
      categories,
      onFindByCategory: jest.fn(),
      onFindByLabel: jest.fn(),
    });

    it('offers the category first, then each label in the row\'s order', async () => {
      const { getByTestId, getByText } = await renderMenu({
        menu: makeMenu({ categoryId: 'cat-cafe', description: 'coffee | starbucks' }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-chips')).toBeTruthy());
      expect(getByText('find_by')).toBeTruthy();

      const keys = ['operation-action-chip-category', 'operation-action-chip-label-coffee', 'operation-action-chip-label-starbucks'];
      keys.forEach((key) => expect(getByTestId(key)).toBeTruthy());
      expect(getByTestId('operation-action-chip-category')).toHaveTextContent(/Cafe$/);
    });

    it('searches by the category it names', async () => {
      const props = findProps();
      const { getByTestId } = await renderMenu({ menu: makeMenu({ categoryId: 'cat-cafe' }), ...props });
      await waitFor(() => expect(getByTestId('operation-action-chip-category')).toBeTruthy());

      fireEvent.press(getByTestId('operation-action-chip-category'));
      expect(props.onClose).toHaveBeenCalled();
      expect(props.onFindByCategory).toHaveBeenCalledWith('cat-cafe');
    });

    it('searches by the label as stored', async () => {
      const props = findProps();
      const { getByTestId } = await renderMenu({
        menu: makeMenu({ categoryId: 'cat-cafe', description: 'coffee | starbucks' }),
        ...props,
      });
      await waitFor(() => expect(getByTestId('operation-action-chip-label-starbucks')).toBeTruthy());

      fireEvent.press(getByTestId('operation-action-chip-label-starbucks'));
      expect(props.onFindByLabel).toHaveBeenCalledWith('starbucks');
    });

    it('offers every label, beyond the six the row has room for', async () => {
      const labels = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
      const { getByTestId } = await renderMenu({
        menu: makeMenu({ categoryId: 'cat-cafe', description: labels.join(' | ') }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-chips')).toBeTruthy());
      labels.forEach((label) => expect(getByTestId(`operation-action-chip-label-${label}`)).toBeTruthy());
    });

    it('leaves out imported metadata and the balance-adjustment chain', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({
          categoryId: 'cat-cafe',
          description: 'coffee | Account: Card | Balance adjusted from 10 → 20',
        }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-chip-label-coffee')).toBeTruthy());
      expect(queryByTestId('operation-action-chip-label-Account: Card')).toBeNull();
      expect(queryByTestId('operation-action-chip-label-Balance adjusted from 10 → 20')).toBeNull();
    });

    it('offers no category for a transfer', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({ type: 'transfer', categoryId: 'cat-cafe', description: 'rent' }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-chip-label-rent')).toBeTruthy());
      expect(queryByTestId('operation-action-chip-category')).toBeNull();
    });

    it('offers no category that no longer resolves', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({ categoryId: 'deleted', description: 'coffee' }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-chip-label-coffee')).toBeTruthy());
      expect(queryByTestId('operation-action-chip-category')).toBeNull();
    });

    it('draws no chip row when there is nothing to find by', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({ type: 'transfer', description: null }),
        ...findProps(),
      });
      await waitFor(() => expect(getByTestId('operation-action-edit')).toBeTruthy());
      expect(queryByTestId('operation-action-chips')).toBeNull();
    });

    it('draws no chip row for a host that does not search', async () => {
      const { getByTestId, queryByTestId } = await renderMenu({
        menu: makeMenu({ categoryId: 'cat-cafe', description: 'coffee' }),
        ...baseProps(),
        categories,
      });
      await waitFor(() => expect(getByTestId('operation-action-edit')).toBeTruthy());
      expect(queryByTestId('operation-action-chips')).toBeNull();
    });

    it('names each chip to a screen reader by what it finds', async () => {
      const { getByLabelText } = await renderMenu({
        menu: makeMenu({ categoryId: 'cat-cafe', description: 'coffee' }),
        ...findProps(),
        t: (key) => ({
          find_by_category_a11y: 'Show every operation in {name}',
          find_by_label_a11y: 'Show every operation labelled {name}',
        }[key] || key),
      });
      await waitFor(() => expect(getByLabelText('Show every operation in Cafe')).toBeTruthy());
      expect(getByLabelText('Show every operation labelled coffee')).toBeTruthy();
    });
  });
});
