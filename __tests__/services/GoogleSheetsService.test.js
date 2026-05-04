import * as SecureStore from 'expo-secure-store';
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
  getValidAccessToken,
  buildSheetsData,
  TOKEN_ENDPOINT,
} from '../../app/services/GoogleSheetsService';

process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GoogleSheetsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('exchangeAndStoreTokens', () => {
    it('exchanges auth code for tokens and stores refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
        }),
      });
      SecureStore.setItemAsync.mockResolvedValue(undefined);

      const accessToken = await exchangeAndStoreTokens(
        'auth-code',
        'code-verifier',
        'com.heywood8.monkeep://',
      );

      expect(accessToken).toBe('access-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'google_refresh_token',
        'refresh-456',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when token endpoint returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      });

      await expect(
        exchangeAndStoreTokens('bad-code', 'verifier', 'com.heywood8.monkeep://'),
      ).rejects.toThrow('token_exchange_failed');
    });
  });

  describe('clearStoredAuth', () => {
    it('deletes the refresh token from secure store', async () => {
      SecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await clearStoredAuth();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('google_refresh_token');
    });
  });

  describe('getValidAccessToken', () => {
    it('returns a new access token using the stored refresh token', async () => {
      SecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-access-token' }),
      });

      const token = await getValidAccessToken();

      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        TOKEN_ENDPOINT,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws no_refresh_token when no token is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      await expect(getValidAccessToken()).rejects.toThrow('no_refresh_token');
    });

    it('clears stored token and throws refresh_failed when refresh returns 400', async () => {
      SecureStore.getItemAsync.mockResolvedValue('bad-refresh-token');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      });
      SecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await expect(getValidAccessToken()).rejects.toThrow('refresh_failed');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('google_refresh_token');
    });
  });

  describe('buildSheetsData', () => {
    const mockBackup = {
      data: {
        accounts: [
          { id: 1, name: 'Checking', balance: '1000', currency: 'USD' },
        ],
        categories: [
          { id: 'cat-1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'food', is_shadow: 0 },
          { id: 'shadow-adj', name: 'Balance Adj', type: 'entry', category_type: 'expense', icon: 'cash', is_shadow: 1 },
        ],
        operations: [
          {
            id: 10, type: 'expense', amount: '50', account_id: 1,
            category_id: 'cat-1', to_account_id: null,
            date: '2026-01-01', description: 'Groceries', source_currency: 'USD',
          },
        ],
        budgets: [
          {
            id: 'bud-1', category_id: 'cat-1', amount: '500', currency: 'USD',
            period_type: 'monthly', start_date: '2026-01-01', end_date: null,
            is_recurring: 1, rollover_enabled: 0,
          },
        ],
        planned_operations: [
          {
            id: 'plan-1', name: 'Rent', type: 'expense', amount: '1200',
            account_id: 1, category_id: 'cat-1', to_account_id: null,
            description: 'Monthly rent', is_recurring: 1,
          },
        ],
        balance_history: [
          { account_id: 1, date: '2026-01-01', balance: '1000' },
        ],
      },
    };

    it('returns 6 sheets with correct titles', () => {
      const sheets = buildSheetsData(mockBackup);
      const titles = sheets.map(s => s.range.split('!')[0]);
      expect(titles).toEqual([
        'Accounts', 'Operations', 'Categories', 'Budgets', 'Planned Operations', 'Balance History',
      ]);
    });

    it('maps Accounts sheet with correct headers and data row', () => {
      const sheets = buildSheetsData(mockBackup);
      const accounts = sheets.find(s => s.range.startsWith('Accounts'));
      expect(accounts.values[0]).toEqual(['id', 'name', 'balance', 'currency']);
      expect(accounts.values[1]).toEqual([1, 'Checking', '1000', 'USD']);
    });

    it('maps Operations sheet with human-readable account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const ops = sheets.find(s => s.range.startsWith('Operations'));
      expect(ops.values[0]).toEqual([
        'id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description',
      ]);
      expect(ops.values[1][5]).toBe('Food');    // category name
      expect(ops.values[1][6]).toBe('Checking'); // account name
      expect(ops.values[1][7]).toBe('');          // to_account empty
    });

    it('includes all categories including shadow ones', () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range.startsWith('Categories'));
      expect(cats.values).toHaveLength(3); // header + 2 categories (including shadow)
    });

    it('maps Budgets sheet with category name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range.startsWith('Budgets'));
      expect(budgets.values[1][1]).toBe('Food'); // category name
    });

    it('maps Planned Operations with account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range.startsWith('Planned Operations'));
      expect(planned.values[1][1]).toBe('Rent');
      expect(planned.values[1][4]).toBe('Checking'); // account name
      expect(planned.values[1][5]).toBe('Food');     // category name
    });

    it('maps Balance History with account name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range.startsWith('Balance History'));
      expect(history.values[0]).toEqual(['account', 'date', 'balance']);
      expect(history.values[1][0]).toBe('Checking'); // account name
    });
  });
});
