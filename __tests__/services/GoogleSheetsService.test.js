import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  getValidAccessToken,
  signIn,
  signOut,
  buildSheetsData,
  exportToSheets,
} from '../../app/services/GoogleSheetsService';

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id' },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GoogleSheetsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getValidAccessToken', () => {
    it('returns access token from GoogleSignin when user has previous sign-in', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(true);
      GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'fresh-token', idToken: 'id' });

      const token = await getValidAccessToken();

      expect(token).toBe('fresh-token');
      expect(GoogleSignin.getTokens).toHaveBeenCalled();
    });

    it('throws not_signed_in when no previous sign-in', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(false);

      await expect(getValidAccessToken()).rejects.toThrow('not_signed_in');
      expect(GoogleSignin.getTokens).not.toHaveBeenCalled();
    });

    it('propagates errors from getTokens as refresh_failed', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(true);
      GoogleSignin.getTokens.mockRejectedValue(new Error('network error'));

      await expect(getValidAccessToken()).rejects.toThrow('refresh_failed');
    });
  });

  describe('signIn', () => {
    it('calls hasPlayServices, signIn, getTokens and returns access token', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: { user: { email: 'u@g.com' } } });
      GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'new-token', idToken: 'id' });

      const token = await signIn();

      expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
      expect(GoogleSignin.signIn).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('throws when signIn is cancelled', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      const cancelError = new Error('cancelled');
      cancelError.code = statusCodes.SIGN_IN_CANCELLED;
      GoogleSignin.signIn.mockRejectedValue(cancelError);

      await expect(signIn()).rejects.toThrow('sign_in_cancelled');
    });

    it('throws auth_failed on other sign-in errors', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockRejectedValue(new Error('something went wrong'));

      await expect(signIn()).rejects.toThrow('auth_failed');
    });
  });

  describe('signOut', () => {
    it('calls revokeAccess and signOut', async () => {
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);

      await signOut();

      expect(GoogleSignin.revokeAccess).toHaveBeenCalled();
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('still calls signOut even if revokeAccess throws', async () => {
      GoogleSignin.revokeAccess.mockRejectedValue(new Error('already revoked'));
      GoogleSignin.signOut.mockResolvedValue(undefined);

      await signOut();

      expect(GoogleSignin.signOut).toHaveBeenCalled();
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
      expect(ops.values[1][5]).toBe('Food');
      expect(ops.values[1][6]).toBe('Checking');
      expect(ops.values[1][7]).toBe('');
    });

    it('includes all categories including shadow ones', () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range.startsWith('Categories'));
      expect(cats.values).toHaveLength(3); // header + 2 categories
    });

    it('maps Budgets sheet with category name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range.startsWith('Budgets'));
      expect(budgets.values[1][1]).toBe('Food');
    });

    it('maps Planned Operations with account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range.startsWith('Planned Operations'));
      expect(planned.values[1][1]).toBe('Rent');
      expect(planned.values[1][4]).toBe('Checking');
      expect(planned.values[1][5]).toBe('Food');
    });

    it('maps Balance History with account name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range.startsWith('Balance History'));
      expect(history.values[0]).toEqual(['account', 'date', 'balance']);
      expect(history.values[1][0]).toBe('Checking');
    });
  });

  describe('exportToSheets', () => {
    const { getPreference, setPreference } = require('../../app/services/PreferencesDB');

    const mockBackup = {
      data: {
        accounts: [{ id: 1, name: 'Cash', balance: '100', currency: 'USD' }],
        categories: [{ id: 'c1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'food' }],
        operations: [],
        budgets: [],
        planned_operations: [],
        balance_history: [],
      },
    };

    const mockMetadata = {
      sheets: [
        { properties: { title: 'Accounts', sheetId: 0 } },
        { properties: { title: 'Operations', sheetId: 1 } },
        { properties: { title: 'Categories', sheetId: 2 } },
        { properties: { title: 'Budgets', sheetId: 3 } },
        { properties: { title: 'Planned Operations', sheetId: 4 } },
        { properties: { title: 'Balance History', sheetId: 5 } },
      ],
    };

    it('creates a new spreadsheet and stores its ID on first export', async () => {
      getPreference.mockResolvedValue(null);
      setPreference.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spreadsheetId: 'new-sheet-id' }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockMetadata });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/new-sheet-id');
      expect(setPreference).toHaveBeenCalledWith('google_sheets_spreadsheet_id', 'new-sheet-id');
    });

    it('updates existing spreadsheet without creating a new one on re-export', async () => {
      getPreference.mockResolvedValue('existing-sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockMetadata });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/existing-sheet-id');
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('applies basic filters to all 6 sheets after writing data', async () => {
      getPreference.mockResolvedValue('sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // clearSheets
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // writeSheets
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockMetadata }); // getSheetIds
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // applyFilters

      await exportToSheets('access-token', mockBackup);

      const applyFiltersCall = mockFetch.mock.calls[3];
      const body = JSON.parse(applyFiltersCall[1].body);
      expect(body.requests).toHaveLength(6);
      expect(body.requests[0].setBasicFilter.filter.range.sheetId).toBe(0);
      expect(body.requests[5].setBasicFilter.filter.range.sheetId).toBe(5);
    });

    it('throws refresh_failed and signs out when clearSheets returns 401', async () => {
      getPreference.mockResolvedValue('sheet-id');
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(exportToSheets('expired-token', mockBackup)).rejects.toThrow('refresh_failed');
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('throws refresh_failed and signs out when writeSheets returns 401', async () => {
      getPreference.mockResolvedValue('sheet-id');
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(exportToSheets('expired-token', mockBackup)).rejects.toThrow('refresh_failed');
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('throws quota_exceeded when batchUpdate returns 429', async () => {
      getPreference.mockResolvedValue('sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } }),
      });

      await expect(exportToSheets('access-token', mockBackup)).rejects.toThrow('quota_exceeded');
    });
  });
});
