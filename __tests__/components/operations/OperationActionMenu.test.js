/**
 * Tests for OperationActionMenu — the long-press context menu shown over an
 * operation row (Edit / Repeat / Delete on a lifted, blurred backdrop).
 */
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import OperationActionMenu from '../../../app/components/operations/OperationActionMenu';

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

describe('OperationActionMenu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when menu is null', async () => {
    const { queryByTestId } = await render(
      <OperationActionMenu menu={null} {...baseProps()} />,
    );
    expect(queryByTestId('operation-action-edit')).toBeNull();
    expect(queryByTestId('operation-action-menu-backdrop')).toBeNull();
  });

  it('renders the three action buttons and the lifted row when open', async () => {
    const props = baseProps();
    const { getByTestId, getByText } = await render(
      <OperationActionMenu menu={makeMenu()} {...props} />,
    );
    expect(getByTestId('operation-action-edit')).toBeTruthy();
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
    const { getByTestId } = await render(
      <OperationActionMenu menu={makeMenu()} {...props} />,
    );
    fireEvent.press(getByTestId(testID));
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the backdrop is pressed', async () => {
    const props = baseProps();
    const { getByTestId } = await render(
      <OperationActionMenu menu={makeMenu()} {...props} />,
    );
    fireEvent.press(getByTestId('operation-action-menu-backdrop'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
