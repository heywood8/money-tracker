import { renderHook, act } from '@testing-library/react-native';
import useMultiCurrencyTransfer from '../../app/hooks/useMultiCurrencyTransfer';
import * as Currency from '../../app/services/currency';

// Mock the currency service
jest.mock('../../app/services/currency', () => ({
  getExchangeRate: jest.fn(),
  convertAmount: jest.fn(),
  fetchLiveExchangeRate: jest.fn(),
}));

describe('useMultiCurrencyTransfer', () => {
  const mockAccounts = [
    { id: 'acc-1', name: 'USD Account', currency: 'USD', balance: '1000' },
    { id: 'acc-2', name: 'EUR Account', currency: 'EUR', balance: '500' },
    { id: 'acc-3', name: 'USD Account 2', currency: 'USD', balance: '2000' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const quickAddValues = {
        type: 'expense',
        amount: '',
        accountId: 'acc-1',
        toAccountId: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.lastEditedField).toBeNull();
      expect(result.current.isMultiCurrencyTransfer).toBe(false);
    });
  });

  describe('isMultiCurrencyTransfer', () => {
    it('should return false for non-transfer operations', () => {
      const quickAddValues = {
        type: 'expense',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(false);
    });

    it('should return false for same-currency transfers', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-3',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(false);
    });

    it('should return true for multi-currency transfers', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(true);
      expect(result.current.sourceAccount.currency).toBe('USD');
      expect(result.current.destinationAccount.currency).toBe('EUR');
    });

    it('should return false if source account not found', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'non-existent',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(false);
      expect(result.current.sourceAccount).toBeUndefined();
    });

    it('should return false if destination account not found', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'non-existent',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(false);
      expect(result.current.destinationAccount).toBeUndefined();
    });
  });

  describe('calculateMultiCurrency', () => {
    it('should clear exchange rate fields for same-currency transfers', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-3',
        exchangeRate: '1.2',
        destinationAmount: '120',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, null);

      expect(calculated.exchangeRate).toBe('');
      expect(calculated.destinationAmount).toBe('');
    });

    it('should not modify values if not multi-currency and no exchange rate fields set', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-3',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, null);

      expect(calculated).toEqual(quickAddValues);
    });

    it('should calculate exchange rate when destination amount is edited', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '',
        destinationAmount: '85',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'destinationAmount');

      expect(calculated.exchangeRate).toBe('0.850000');
    });

    it('should calculate destination amount when amount is edited', () => {
      Currency.convertAmount.mockReturnValue('85.50');

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '0.855',
        destinationAmount: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'amount');

      expect(Currency.convertAmount).toHaveBeenCalledWith('100', 'USD', 'EUR', '0.855');
      expect(calculated.destinationAmount).toBe('85.50');
    });

    it('should calculate destination amount when exchange rate is edited', () => {
      Currency.convertAmount.mockReturnValue('85.50');

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '0.855',
        destinationAmount: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'exchangeRate');

      expect(Currency.convertAmount).toHaveBeenCalledWith('100', 'USD', 'EUR', '0.855');
      expect(calculated.destinationAmount).toBe('85.50');
    });

    it('should not recalculate if converted amount is same', () => {
      Currency.convertAmount.mockReturnValue('85.50');

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '0.855',
        destinationAmount: '85.50',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'amount');

      // Should not update if already same
      expect(calculated.destinationAmount).toBe('85.50');
    });

    it('should handle invalid source amount gracefully', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: 'invalid',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '',
        destinationAmount: '85',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'destinationAmount');

      // Should not calculate rate with invalid amount
      expect(calculated.exchangeRate).toBe('');
    });

    it('should handle zero source amount gracefully', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '0',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '',
        destinationAmount: '85',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'destinationAmount');

      // Should not calculate rate with zero amount
      expect(calculated.exchangeRate).toBe('');
    });

    it('should only update rate if difference is significant', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '0.850000',
        destinationAmount: '85.0000001',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'destinationAmount');

      // Should not update rate for tiny differences
      expect(calculated.exchangeRate).toBe('0.850000');
    });
  });

  describe('getInitialExchangeRate', () => {
    it('should return exchange rate for multi-currency transfer', async () => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: '0.85', source: 'live' });

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      let rate;
      await act(async () => {
        rate = await result.current.getInitialExchangeRate();
      });

      expect(Currency.fetchLiveExchangeRate).toHaveBeenCalledWith('USD', 'EUR');
      expect(rate).toBe('0.85');
    });

    it('should return empty string for same-currency transfer', async () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-3',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      let rate;
      await act(async () => {
        rate = await result.current.getInitialExchangeRate();
      });

      expect(rate).toBe('');
    });

    it('should return empty string if no exchange rate available', async () => {
      Currency.fetchLiveExchangeRate.mockResolvedValue({ rate: null, source: 'none' });

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      let rate;
      await act(async () => {
        rate = await result.current.getInitialExchangeRate();
      });

      expect(rate).toBe('');
    });

    it('should fallback to offline rate on fetch error', async () => {
      Currency.fetchLiveExchangeRate.mockRejectedValue(new Error('Network error'));
      Currency.getExchangeRate.mockReturnValue('0.84');

      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      let rate;
      await act(async () => {
        rate = await result.current.getInitialExchangeRate();
      });

      expect(rate).toBe('0.84');
    });
  });

  describe('setLastEditedField', () => {
    it('should update last edited field', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.lastEditedField).toBeNull();

      act(() => {
        result.current.setLastEditedField('amount');
      });

      expect(result.current.lastEditedField).toBe('amount');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing accounts array gracefully', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, []),
      );

      expect(result.current.sourceAccount).toBeUndefined();
      expect(result.current.destinationAccount).toBeUndefined();
      expect(result.current.isMultiCurrencyTransfer).toBe(false);
    });

    it('should handle empty quickAddValues gracefully', () => {
      const quickAddValues = {
        type: '',
        amount: '',
        accountId: '',
        toAccountId: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      expect(result.current.isMultiCurrencyTransfer).toBe(false);
    });
  });

  describe('Regression Tests', () => {
    it('should handle precision in exchange rate calculation', () => {
      const quickAddValues = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '',
        destinationAmount: '85.123456',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'destinationAmount');

      // Should preserve 6 decimal places
      expect(calculated.exchangeRate).toBe('0.851235');
    });

    it('should handle large amounts correctly', () => {
      Currency.convertAmount.mockReturnValue('8550000.00');

      const quickAddValues = {
        type: 'transfer',
        amount: '10000000',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        exchangeRate: '0.855',
        destinationAmount: '',
      };

      const { result } = renderHook(() =>
        useMultiCurrencyTransfer(quickAddValues, mockAccounts),
      );

      const calculated = result.current.calculateMultiCurrency(quickAddValues, 'amount');

      expect(calculated.destinationAmount).toBe('8550000.00');
    });
  });
});
