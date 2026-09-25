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
});
