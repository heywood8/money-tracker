/**
 * Tests for SuggestedOperationsStack — the stacked "suggested operation from
 * notification" cards rendered above the quick-add panel on the operations page.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SuggestedOperationsStack, { canAcceptSuggestion } from '../../../app/components/operations/SuggestedOperationsStack';
import { kindRequiresCategory } from '../../../app/services/notifications/parseBankNotification';

jest.mock('../../../app/services/notifications/parseBankNotification', () => ({
  kindRequiresCategory: jest.fn(),
}));

const COLORS = {
  background: '#fff', surface: '#f5f5f5', primary: '#6200ee',
  text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
};

const t = (key) => key;

const ACCOUNTS = [
  { id: 1, name: 'Checking', currency: 'AMD' },
  { id: 2, name: 'Cash', currency: 'AMD' },
];

const CATEGORIES = [
  { id: 'c1', name: 'Food', type: 'entry', categoryType: 'expense', parentId: null },
];

const READY = {
  id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
  merchant: 'SAS SUPERMARKET', date: '2026-06-28',
  accountId: 1, categoryId: 'c1', packageName: 'am.bank',
};

const UNRESOLVED = {
  id: 'p2', kind: 'PURCHASE', type: 'expense', amount: '120.00', currency: 'USD',
  merchant: 'AMAZON', date: '2026-06-27',
  accountId: null, categoryId: null, packageName: 'am.bank',
};

const makeProps = (overrides = {}) => ({
  colors: COLORS,
  t,
  suggestions: [READY],
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  savingIds: {},
  atmTargetAccountId: 2,
  onAccept: jest.fn(),
  onDismiss: jest.fn(),
  onReviewAll: jest.fn(),
  ...overrides,
});

describe('canAcceptSuggestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kindRequiresCategory.mockReturnValue(false);
  });

  it('accepts an expense with an account when no category is required', () => {
    expect(canAcceptSuggestion({ ...READY, categoryId: null }, null)).toBe(true);
  });

  it('rejects an expense without an account', () => {
    expect(canAcceptSuggestion(UNRESOLVED, null)).toBe(false);
  });

  it('requires a category for kinds that demand one', () => {
    kindRequiresCategory.mockReturnValue(true);
    expect(canAcceptSuggestion({ ...READY, categoryId: null }, null)).toBe(false);
    expect(canAcceptSuggestion(READY, null)).toBe(true);
  });

  it('accepts a transfer only with a bound target different from the source', () => {
    const transfer = { ...READY, id: 'p3', type: 'transfer', categoryId: null };
    expect(canAcceptSuggestion(transfer, 2)).toBe(true);
    expect(canAcceptSuggestion(transfer, null)).toBe(false);
    expect(canAcceptSuggestion(transfer, 1)).toBe(false); // same as source
  });
});

describe('SuggestedOperationsStack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kindRequiresCategory.mockReturnValue(false);
  });

  it('renders nothing when there are no suggestions', async () => {
    const { toJSON } = await render(<SuggestedOperationsStack {...makeProps({ suggestions: [] })} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the parsed merchant, amount, and suggested account/category', async () => {
    const { getByText } = await render(<SuggestedOperationsStack {...makeProps()} />);
    expect(getByText('SAS SUPERMARKET')).toBeTruthy();
    expect(getByText('3900.00 AMD')).toBeTruthy();
    // Meta line: date · account · category
    expect(getByText(/Checking · Food/)).toBeTruthy();
    expect(getByText('suggested_from_notification')).toBeTruthy();
  });

  it('one-tap Add calls onAccept with the suggestion', async () => {
    const props = makeProps();
    const { getByText } = await render(<SuggestedOperationsStack {...props} />);
    fireEvent.press(getByText('add'));
    expect(props.onAccept).toHaveBeenCalledWith(READY);
  });

  it('Dismiss calls onDismiss with the suggestion', async () => {
    const props = makeProps();
    const { getByText } = await render(<SuggestedOperationsStack {...props} />);
    fireEvent.press(getByText('dismiss'));
    expect(props.onDismiss).toHaveBeenCalledWith(READY);
  });

  it('shows Review instead of Add when the suggestion cannot be one-tap booked', async () => {
    const props = makeProps({ suggestions: [UNRESOLVED] });
    const { getByText, queryByText } = await render(<SuggestedOperationsStack {...props} />);
    expect(queryByText('add')).toBeNull();
    fireEvent.press(getByText('suggested_review'));
    expect(props.onReviewAll).toHaveBeenCalled();
  });

  it('collapses a saving card into the adding state without action buttons', async () => {
    const props = makeProps({ savingIds: { p1: true } });
    const { getByText, queryByText } = await render(<SuggestedOperationsStack {...props} />);
    expect(getByText('bank_notifications_adding')).toBeTruthy();
    expect(queryByText('add')).toBeNull();
    expect(queryByText('dismiss')).toBeNull();
  });

  it('shows the transfer destination (source → target) so money movement is visible', async () => {
    const transfer = {
      ...READY, id: 'p9', type: 'transfer', categoryId: null,
      merchant: 'ATM YEREVAN', accountId: 1,
    };
    const props = makeProps({ suggestions: [transfer], atmTargetAccountId: 2 });
    const { getByText } = await render(<SuggestedOperationsStack {...props} />);
    // Checking (source, id 1) → Cash (bound target, id 2)
    expect(getByText(/Checking → Cash/)).toBeTruthy();
  });

  it('gives each action a merchant-contextual accessibility label', async () => {
    const props = makeProps();
    const { getByLabelText } = await render(<SuggestedOperationsStack {...props} />);
    // Labels carry the merchant + amount so a screen reader disambiguates cards.
    expect(getByLabelText('add: SAS SUPERMARKET, 3900.00 AMD')).toBeTruthy();
    expect(getByLabelText('dismiss: SAS SUPERMARKET, 3900.00 AMD')).toBeTruthy();
  });

  it('caps visible cards and routes the overflow row to review-all', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...READY,
      id: `p${i}`,
      merchant: `SHOP ${i}`,
    }));
    const props = makeProps({ suggestions: many });
    const { getByText, queryByText } = await render(<SuggestedOperationsStack {...props} />);
    expect(getByText('SHOP 0')).toBeTruthy();
    expect(getByText('SHOP 2')).toBeTruthy();
    expect(queryByText('SHOP 3')).toBeNull();
    fireEvent.press(getByText('suggested_more_to_review'));
    expect(props.onReviewAll).toHaveBeenCalled();
  });
});
