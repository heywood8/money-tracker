/**
 * Saving an existing multi-currency operation with the real currency math:
 * what the form writes back must be what the user sees, not a re-derivation
 * that drifts or leaves stale columns behind.
 *
 * useOperationForm.test.js stubs the currency service; this file keeps it real
 * (only the network rate lookup is stubbed), because the bugs here live in the
 * rounding and the stored columns.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import useOperationForm from '../../app/hooks/useOperationForm';
import * as Currency from '../../app/services/currency';

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`),
}));
jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(() => Promise.resolve(null)),
  setLastAccessedAccount: jest.fn(),
}));
jest.mock('../../app/services/currency', () => ({
  ...jest.requireActual('../../app/services/currency'),
  fetchLiveExchangeRate: jest.fn().mockResolvedValue({ rate: null, source: 'none' }),
}));

const usd = { id: 'acc-usd', name: 'Checking', currency: 'USD', balance: '1000' };
const amd = { id: 'acc-amd', name: 'Card', currency: 'AMD', balance: '1000000' };
const categories = [{ id: 'cat-1', name: 'Food', categoryType: 'expense', isShadow: false }];

const makeProps = (overrides = {}) => ({
  visible: true,
  operation: null,
  isNew: true,
  accounts: [usd, amd],
  categories,
  t: (key) => key,
  addOperation: jest.fn(() => Promise.resolve({ id: 'new' })),
  splitOperation: jest.fn(() => Promise.resolve()),
  updateOperation: jest.fn(() => Promise.resolve()),
  validateOperation: jest.fn(() => null),
  showDialog: jest.fn(),
  onClose: jest.fn(),
  onDelete: jest.fn(),
  ...overrides,
});

describe('useOperationForm — saving multi-currency operations', () => {
  // Switching a foreign-currency expense back to the account currency cleared
  // its rate and destination amount but left source/destination currency on the
  // row, which the next open read as a foreign operation with an empty amount.
  describe('foreign-currency expense switched back to the account currency', () => {
    const foreignExpense = {
      id: 'op-fx', type: 'expense', amount: '244.00', destinationAmount: '263.52', exchangeRate: '1.08',
      sourceCurrency: 'EUR', destinationCurrency: 'USD', accountId: 'acc-usd', categoryId: 'cat-1',
      date: '2024-01-15', description: '',
    };

    it('clears the currency pair along with the rate', async () => {
      const props = makeProps({ operation: foreignExpense, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.operationCurrency).toBe('EUR'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, operationCurrency: 'USD', amount: '250' }));
      });
      await waitFor(() => expect(result.current.isForeignCurrencyOp).toBe(false));
      await waitFor(() => expect(result.current.values.exchangeRate).toBe(''));
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.amount).toBe('250.00');
      expect(payload.sourceCurrency).toBeNull();
      expect(payload.destinationCurrency).toBeNull();
    });
  });

  // The rate is stored rounded to 6 decimals, so re-deriving the destination
  // from it on a save that changed no money moved the destination balance.
  describe('cross-currency transfer', () => {
    const transfer = {
      id: 'op-t', type: 'transfer', amount: '1000000', accountId: 'acc-amd', toAccountId: 'acc-usd',
      exchangeRate: '0.002564', destinationAmount: '2564.10', sourceCurrency: 'AMD', destinationCurrency: 'USD',
      date: '2024-01-15', description: '',
    };

    it('keeps the stored destination amount when only the label changes', async () => {
      const props = makeProps({ operation: transfer, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.amount).toBe('1000000'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, description: 'Savings' }));
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.destinationAmount).toBe('2564.10');
      expect(payload.description).toBe('Savings');
    });

    it('still re-derives the destination amount when the amount changes', async () => {
      const props = makeProps({ operation: transfer, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.amount).toBe('1000000'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, amount: '500000' }));
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.destinationAmount).toBe('1282.00');
    });
  });

  // The foreign-currency expense path never got the transfer's guard: a
  // label-only save rebuilt the account deduction from the rounded rate.
  describe('foreign-currency expense', () => {
    // 1,000,000 AMD spent, 2,564.10 USD deducted (typed by hand). The form
    // derived the rate as 0.002564 (6 decimals) and stored it inverted.
    const foreignExpense = {
      id: 'op-fx', type: 'expense', amount: '2564.10', destinationAmount: '1000000', exchangeRate: '390.015601',
      sourceCurrency: 'AMD', destinationCurrency: 'USD', accountId: 'acc-usd', categoryId: 'cat-1',
      date: '2024-01-15', description: '',
    };

    it('keeps the stored deduction when only the label changes', async () => {
      const props = makeProps({ operation: foreignExpense, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.amount).toBe('1000000'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, description: 'Groceries' }));
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.amount).toBe('2564.10');
      expect(payload.destinationAmount).toBe('1000000');
      expect(payload.description).toBe('Groceries');
    });
  });

  // A transfer booked while both accounts shared a currency stores neither a
  // destination amount nor a rate: it credited its own amount. After one
  // account's currency changed, opening it fetched today's rate and a
  // label-only save re-priced the credit.
  describe('transfer booked before an account currency change', () => {
    const sameCurrencyAtBooking = {
      id: 'op-t2', type: 'transfer', amount: '50000', accountId: 'acc-amd', toAccountId: 'acc-usd',
      exchangeRate: null, destinationAmount: null, sourceCurrency: null, destinationCurrency: null,
      date: '2024-01-15', description: '',
    };

    beforeEach(() => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.0026', source: 'live' });
    });
    afterEach(() => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });
    });

    it('keeps crediting what it credited when only the label changes', async () => {
      const props = makeProps({ operation: sameCurrencyAtBooking, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      // The form prices the pair at today's rate for display.
      await waitFor(() => expect(result.current.values.destinationAmount).toBe('130.00'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, description: 'Moved' }));
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.amount).toBe('50000');
      expect(payload.destinationAmount).toBe('50000.00');
    });

    it('re-prices it when the user types a rate', async () => {
      const props = makeProps({ operation: sameCurrencyAtBooking, isNew: false });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.destinationAmount).toBe('130.00'));

      await act(async () => {
        result.current.setValues(v => ({ ...v, exchangeRate: '0.0025' }));
        result.current.setLastEditedField('exchangeRate');
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.destinationAmount).toBe('125.00');
    });
  });

  // The reverse: booked across currencies, and the accounts now share one. The
  // form clears the conversion, so the target was credited the plain amount
  // while the reversal took back the stored destination amount.
  describe('cross-currency transfer whose accounts now share a currency', () => {
    const usd2 = { id: 'acc-usd2', name: 'Savings', currency: 'USD', balance: '0' };
    const bookedAcross = {
      id: 'op-t3', type: 'transfer', amount: '100.00', accountId: 'acc-usd', toAccountId: 'acc-usd2',
      exchangeRate: '0.92', destinationAmount: '92.00', sourceCurrency: 'USD', destinationCurrency: 'EUR',
      date: '2024-01-15', description: '',
    };

    it('keeps the stored destination amount when only the label changes', async () => {
      const props = makeProps({ operation: bookedAcross, isNew: false, accounts: [usd, usd2, amd] });
      const { result } = await renderHook(() => useOperationForm(props));
      await waitFor(() => expect(result.current.values.amount).toBe('100.00'));
      await waitFor(() => expect(result.current.values.destinationAmount).toBe(''));

      await act(async () => {
        result.current.setValues(v => ({ ...v, description: 'Moved' }));
      });
      await act(async () => {
        await result.current.handleSave();
      });

      const payload = props.updateOperation.mock.calls[0][1];
      expect(payload.destinationAmount).toBe('92.00');
    });
  });
});
