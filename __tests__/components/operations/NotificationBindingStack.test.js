/**
 * Tests for the notification binding deck — full inline review cards stacked
 * over the quick-add panel on the main operations page. The front (oldest)
 * card carries the whole binding form; cards behind it are inert peeking
 * edges; overflow beyond MAX_DECK is summed in a "+N" badge.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import NotificationBindingStack, {
  MAX_DECK,
  PEEK_OFFSET,
  deckPeekAllowance,
} from '../../../app/components/operations/NotificationBindingStack';
import { kindRequiresCategory } from '../../../app/services/notifications/parseBankNotification';

jest.mock('../../../app/services/notifications/parseBankNotification', () => ({
  kindRequiresCategory: jest.fn(),
}));
jest.mock('../../../app/services/currency', () => ({
  convertAmount: jest.fn(() => '10.00'),
}));

const COLORS = {
  background: '#fff', surface: '#f5f5f5', primary: '#6200ee',
  text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
  inputBackground: '#fafafa',
};

const t = (key) => key;

const ACCOUNTS = [
  { id: 1, name: 'Checking', currency: 'AMD' },
  { id: 2, name: 'Cash', currency: 'AMD' },
  { id: 3, name: 'Dollars', currency: 'USD' },
];

const CATEGORIES = [
  { id: 'c1', name: 'Food', type: 'entry', categoryType: 'expense', parentId: null, isShadow: false },
  { id: 'c2', name: 'Salary', type: 'entry', categoryType: 'income', parentId: null, isShadow: false },
];

const EXPENSE = {
  id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'SAS SUPERMARKET', date: '2026-06-28',
  accountId: 1, categoryId: 'c1', packageName: 'am.bank',
};

const TRANSFER = {
  id: 'p2', kind: 'ATM CASH', type: 'transfer', amount: '50000.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'ATM YEREVAN', date: '2026-06-28',
  accountId: 1, categoryId: null, packageName: 'am.bank',
};

const makeSuggestions = (count) =>
  Array.from({ length: count }, (_, i) => ({ ...EXPENSE, id: `p${i + 1}`, merchant: `SHOP ${i + 1}` }));

const defaultProps = {
  suggestions: [EXPENSE],
  choices: { p1: { accountId: 1, categoryId: 'c1', toAccountId: null, labelOverride: '' } },
  savingIds: {},
  quickAddHeight: 320,
  colors: COLORS,
  t,
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  onChoiceChange: jest.fn(),
  onSave: jest.fn(),
  onDismiss: jest.fn(),
};

const renderStack = (overrides = {}) =>
  render(<NotificationBindingStack {...defaultProps} {...overrides} />);

describe('deckPeekAllowance', () => {
  it('needs no headroom for zero or one card', async () => {
    expect(deckPeekAllowance(0)).toBe(0);
    expect(deckPeekAllowance(1)).toBe(0);
  });

  it('adds one peek per extra visible card, capped at the deck size', async () => {
    expect(deckPeekAllowance(2)).toBe(PEEK_OFFSET);
    expect(deckPeekAllowance(MAX_DECK)).toBe((MAX_DECK - 1) * PEEK_OFFSET);
    expect(deckPeekAllowance(20)).toBe((MAX_DECK - 1) * PEEK_OFFSET);
  });
});

describe('NotificationBindingStack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kindRequiresCategory.mockReturnValue(false);
  });

  it('renders nothing when there are no suggestions', async () => {
    const { toJSON } = await renderStack({ suggestions: [] });
    expect(toJSON()).toBeNull();
  });

  it('renders nothing until the quick-add panel has been measured', async () => {
    const { toJSON } = await renderStack({ quickAddHeight: 0 });
    expect(toJSON()).toBeNull();
  });

  it('shows the oldest suggestion as the only interactive card (FIFO)', async () => {
    const suggestions = makeSuggestions(3);
    const { getAllByTestId, getByText, queryByText } = await renderStack({
      suggestions,
      choices: { p1: { accountId: 1, categoryId: 'c1' } },
    });
    // One full card, the rest are inert peek edges.
    expect(getAllByTestId('notification-binding-card')).toHaveLength(1);
    expect(getAllByTestId('notification-binding-peek', { includeHiddenElements: true })).toHaveLength(2);
    expect(getByText('SHOP 1')).toBeTruthy();
    expect(queryByText('SHOP 2')).toBeNull();
    // Only the front card carries actions.
    expect(getByText('save')).toBeTruthy();
    expect(getByText('dismiss')).toBeTruthy();
  });

  it('pins the card frame to the measured quick-add height', async () => {
    const { getByTestId } = await renderStack({ quickAddHeight: 411 });
    const card = getByTestId('notification-binding-card');
    expect(card.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 411 })]),
    );
  });

  it('renders the full expense binding form: label input, account picker, category grid', async () => {
    const { getByText, getByPlaceholderText, getByTestId, queryByText } = await renderStack();
    expect(getByText('BANK_NOTIFICATIONS_CUSTOM_LABEL')).toBeTruthy();
    expect(getByPlaceholderText('SAS SUPERMARKET')).toBeTruthy();
    expect(getByText('ACCOUNT')).toBeTruthy();
    expect(getByTestId('category-grid-c1')).toBeTruthy();
    expect(queryByText('BANK_NOTIFICATIONS_TRANSFER_TO *')).toBeNull();
  });

  it('renders a transfer as from/to account pickers without a category grid', async () => {
    const { getByText, queryByTestId } = await renderStack({
      suggestions: [TRANSFER],
      choices: { p2: { accountId: 1, categoryId: null, toAccountId: 2, labelOverride: '' } },
    });
    expect(getByText('BANK_NOTIFICATIONS_TRANSFER_FROM')).toBeTruthy();
    expect(getByText('BANK_NOTIFICATIONS_TRANSFER_TO *')).toBeTruthy();
    expect(queryByTestId('category-grid-c1')).toBeNull();
  });

  it('shows a converted-amount preview when the chosen account currency differs', async () => {
    const { getByText } = await renderStack({
      choices: { p1: { accountId: 3, categoryId: 'c1', toAccountId: null, labelOverride: '' } },
    });
    expect(getByText('≈ 10.00 USD')).toBeTruthy();
  });

  it('propagates label edits as a choice patch for the item', async () => {
    const onChoiceChange = jest.fn();
    const { getByPlaceholderText } = await renderStack({ onChoiceChange });
    fireEvent.changeText(getByPlaceholderText('SAS SUPERMARKET'), 'My grocery');
    expect(onChoiceChange).toHaveBeenCalledWith('p1', { labelOverride: 'My grocery' });
  });

  it('propagates a category pick as a choice patch', async () => {
    const onChoiceChange = jest.fn();
    const { getByTestId } = await renderStack({ onChoiceChange });
    fireEvent.press(getByTestId('category-grid-c1'));
    expect(onChoiceChange).toHaveBeenCalledWith('p1', { categoryId: 'c1' });
  });

  it('fires onSave with the item when the choice is valid', async () => {
    const onSave = jest.fn();
    const { getByText } = await renderStack({ onSave });
    fireEvent.press(getByText('save'));
    expect(onSave).toHaveBeenCalledWith(EXPENSE);
  });

  it('keeps Save disabled while the choice is invalid (required category missing)', async () => {
    kindRequiresCategory.mockReturnValue(true);
    const onSave = jest.fn();
    const { getByText } = await renderStack({
      choices: { p1: { accountId: 1, categoryId: null, toAccountId: null, labelOverride: '' } },
      onSave,
    });
    fireEvent.press(getByText('save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps Save disabled for a transfer whose target equals the source', async () => {
    const onSave = jest.fn();
    const { getByText } = await renderStack({
      suggestions: [TRANSFER],
      choices: { p2: { accountId: 1, categoryId: null, toAccountId: 1, labelOverride: '' } },
      onSave,
    });
    fireEvent.press(getByText('save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fires onDismiss with the item', async () => {
    const onDismiss = jest.fn();
    const { getByText } = await renderStack({ onDismiss });
    fireEvent.press(getByText('dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(EXPENSE);
  });

  it('collapses a saving card into the progress row without action buttons', async () => {
    const { getByTestId, queryByText } = await renderStack({ savingIds: { p1: true } });
    expect(getByTestId('notification-binding-card-saving')).toBeTruthy();
    expect(queryByText('save')).toBeNull();
    expect(queryByText('dismiss')).toBeNull();
  });

  it('shows an inline error when the front card has a save error', async () => {
    const { getByText } = await renderStack({ saveErrors: { p1: true } });
    expect(getByText('bank_notifications_save_error')).toBeTruthy();
  });

  it('localizes the notification date instead of rendering the raw ISO string', async () => {
    const { getByTestId } = await renderStack();
    const meta = String(getByTestId('binding-card-meta').props.children);
    // The raw machine date must not reach the UI; the localized form + card mask do.
    expect(meta).not.toContain('2026-06-28');
    expect(meta).toContain('4083***7027');
  });

  it('caps the deck at MAX_DECK layers and sums the overflow in a "+N" badge', async () => {
    const { getAllByTestId, getByText } = await renderStack({
      suggestions: makeSuggestions(6),
      choices: { p1: { accountId: 1, categoryId: 'c1' } },
    });
    expect(getAllByTestId('notification-binding-card')).toHaveLength(1);
    expect(getAllByTestId('notification-binding-peek', { includeHiddenElements: true })).toHaveLength(MAX_DECK - 1);
    expect(getByText('+2')).toBeTruthy();
  });

  it('shows no badge when everything fits in the deck', async () => {
    const { queryByText } = await renderStack({
      suggestions: makeSuggestions(MAX_DECK),
      choices: { p1: { accountId: 1, categoryId: 'c1' } },
    });
    expect(queryByText(/^\+\d+$/)).toBeNull();
  });
});
