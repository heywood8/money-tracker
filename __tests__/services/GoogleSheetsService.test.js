import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  getValidAccessToken,
  signIn,
  signOut,
  buildSheetsData,
  exportToSheets,
  importFromSheets,
} from '../../app/services/GoogleSheetsService';

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id' },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

jest.mock('../../app/services/db', () => ({
  queryAll: jest.fn(() => Promise.resolve([])),
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

    it('returns 8 sheets with correct titles', async () => {
      const sheets = buildSheetsData(mockBackup);
      const titles = sheets.map(s => s.range.split('!')[0]);
      expect(titles).toEqual([
        'Accounts', 'Operations', 'Categories', 'Budgets', 'Planned Operations', 'Balance History',
        'Budget Plans', 'Budget Plan Lines',
      ]);
    });

    it('maps Accounts sheet with correct headers and data row', async () => {
      const sheets = buildSheetsData(mockBackup);
      const accounts = sheets.find(s => s.range.startsWith('Accounts'));
      expect(accounts.values[0]).toContain('id');
      expect(accounts.values[0]).toContain('name');
      expect(accounts.values[0]).toContain('balance');
      expect(accounts.values[0]).toContain('currency');
      expect(accounts.values[1]).toContain(1);
      expect(accounts.values[1]).toContain('Checking');
      expect(accounts.values[1]).toContain('1000');
      expect(accounts.values[1]).toContain('USD');
    });

    it('maps Operations sheet with human-readable account and category names', async () => {
      const sheets = buildSheetsData(mockBackup);
      const ops = sheets.find(s => s.range.startsWith('Operations'));
      expect(ops.values[0]).toContain('id');
      expect(ops.values[0]).toContain('date');
      expect(ops.values[0]).toContain('type');
      expect(ops.values[0]).toContain('amount');
      expect(ops.values[0]).toContain('currency');
      expect(ops.values[0]).toContain('category');
      expect(ops.values[0]).toContain('account');
      expect(ops.values[0]).toContain('to_account');
      expect(ops.values[0]).toContain('description');
      const idxCategory = ops.values[0].indexOf('category');
      const idxAccount = ops.values[0].indexOf('account');
      const idxToAccount = ops.values[0].indexOf('to_account');
      expect(ops.values[1][idxCategory]).toBe('Food');
      expect(ops.values[1][idxAccount]).toBe('Checking');
      expect(ops.values[1][idxToAccount]).toBe('');
    });

    it('includes all categories including shadow ones', async () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range.startsWith('Categories'));
      expect(cats.values).toHaveLength(3); // header + 2 categories
    });

    it('maps Budgets sheet with category name instead of id', async () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range.startsWith('Budgets'));
      expect(budgets.values[1][1]).toBe('Food');
    });

    it('maps Planned Operations with account and category names', async () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range.startsWith('Planned Operations'));
      expect(planned.values[1][1]).toBe('Rent');
      expect(planned.values[1][4]).toBe('Checking');
      expect(planned.values[1][5]).toBe('Food');
    });

    it('maps Balance History with account name instead of id', async () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range.startsWith('Balance History'));
      expect(history.values[0]).toContain('account');
      expect(history.values[0]).toContain('date');
      expect(history.values[0]).toContain('balance');
      expect(history.values[1][0]).toBe('Checking');
    });
  });

  describe('buildSheetsData — new columns', () => {
    const mockBackup = {
      data: {
        accounts: [
          { id: 1, name: 'Checking', balance: '100', currency: 'USD', display_order: 0, hidden: 0, monthly_target: '500' },
        ],
        categories: [
          { id: 'cat-1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'fast-food', parent_id: 'cat-root', color: '#ff0000', is_shadow: 0 },
        ],
        operations: [
          { id: 5, date: '2024-01-15', type: 'expense', amount: '50', source_currency: 'USD', category_id: 'cat-1', account_id: 1, to_account_id: null, description: 'Lunch', exchange_rate: null, destination_amount: null, destination_currency: null },
        ],
        budgets: [
          { id: 'bud-1', category_id: 'cat-1', amount: '200', currency: 'USD', period_type: 'monthly', start_date: '2024-01-01', end_date: null, is_recurring: 1, rollover_enabled: 0 },
        ],
        planned_operations: [
          { id: 'plan-1', name: 'Rent', type: 'expense', amount: '1000', account_id: 1, category_id: 'cat-1', to_account_id: null, description: 'Monthly rent', is_recurring: 1 },
        ],
        balance_history: [
          { account_id: 1, date: '2024-01-15', balance: '100' },
        ],
      },
    };

    it('Accounts sheet includes display_order, hidden, monthly_target', async () => {
      const sheets = buildSheetsData(mockBackup);
      const accounts = sheets.find(s => s.range === 'Accounts!A1');
      expect(accounts.values[0]).toContain('display_order');
      expect(accounts.values[0]).toContain('hidden');
      expect(accounts.values[0]).toContain('monthly_target');
      expect(accounts.values[1]).toContain(0);   // display_order value
      expect(accounts.values[1]).toContain(0);   // hidden value
      expect(accounts.values[1]).toContain('500'); // monthly_target value
    });

    it('Categories sheet includes parent_id, color, is_shadow', async () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range === 'Categories!A1');
      expect(cats.values[0]).toContain('parent_id');
      expect(cats.values[0]).toContain('color');
      expect(cats.values[0]).toContain('is_shadow');
      expect(cats.values[1]).toContain('cat-root');
      expect(cats.values[1]).toContain('#ff0000');
      expect(cats.values[1]).toContain(0);
    });

    it('Operations sheet includes account_id, category_id, to_account_id, exchange_rate, destination_amount, destination_currency', async () => {
      const sheets = buildSheetsData(mockBackup);
      const ops = sheets.find(s => s.range === 'Operations!A1');
      expect(ops.values[0]).toContain('account_id');
      expect(ops.values[0]).toContain('category_id');
      expect(ops.values[0]).toContain('to_account_id');
      expect(ops.values[0]).toContain('exchange_rate');
      expect(ops.values[0]).toContain('destination_amount');
      expect(ops.values[0]).toContain('destination_currency');
      expect(ops.values[1]).toContain(1);       // account_id value
      expect(ops.values[1]).toContain('cat-1'); // category_id value
    });

    it('Budgets sheet includes category_id', async () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range === 'Budgets!A1');
      expect(budgets.values[0]).toContain('category_id');
      expect(budgets.values[1]).toContain('cat-1');
    });

    it('Planned Operations sheet includes account_id, category_id, to_account_id', async () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range === 'Planned Operations!A1');
      expect(planned.values[0]).toContain('account_id');
      expect(planned.values[0]).toContain('category_id');
      expect(planned.values[0]).toContain('to_account_id');
      expect(planned.values[1]).toContain(1);
      expect(planned.values[1]).toContain('cat-1');
    });

    it('Balance History sheet includes account_id', async () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range === 'Balance History!A1');
      expect(history.values[0]).toContain('account_id');
      expect(history.values[1]).toContain(1);
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

  describe('importFromSheets', () => {
    const { getPreference } = require('../../app/services/PreferencesDB');

    const makeBatchGetResponse = (overrides = {}) => ({
      valueRanges: [
        {
          range: 'Accounts!A1:G3',
          values: [
            ['id', 'name', 'balance', 'currency', 'display_order', 'hidden', 'monthly_target'],
            ['1', 'Checking', '500', 'USD', '0', '0', ''],
            ['2', 'Savings', '1000', 'USD', '1', '0', '200'],
          ],
        },
        {
          range: 'Operations!A1:O3',
          values: [
            ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description', 'account_id', 'category_id', 'to_account_id', 'exchange_rate', 'destination_amount', 'destination_currency'],
            ['10', '2024-01-15', 'expense', '50', 'USD', 'Food', 'Checking', '', 'Lunch', '1', 'cat-1', '', '', '', ''],
            ['11', '2024-01-16', 'transfer', '100', 'USD', '', 'Checking', 'Savings', '', '1', '', '2', '', '', ''],
          ],
        },
        {
          range: 'Categories!A1:I2',
          values: [
            ['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow'],
            ['cat-1', 'Food', 'entry', 'expense', 'fast-food', '', '#ff0000', '0'],
          ],
        },
        {
          range: 'Budgets!A1:J1',
          values: [
            ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'category_id'],
          ],
        },
        {
          range: 'Planned Operations!A1:L1',
          values: [
            ['id', 'name', 'type', 'amount', 'account', 'category', 'to_account', 'description', 'is_recurring', 'account_id', 'category_id', 'to_account_id'],
          ],
        },
        {
          range: 'Balance History!A1:D2',
          values: [
            ['account', 'date', 'balance', 'account_id'],
            ['Checking', '2024-01-15', '500', '1'],
          ],
        },
        ...(overrides.extraRanges || []),
      ],
      ...overrides,
    });

    beforeEach(() => {
      getPreference.mockResolvedValue('sheet-id-123');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => makeBatchGetResponse(),
      });
    });

    it('throws no_spreadsheet_configured when no spreadsheet ID saved', async () => {
      getPreference.mockResolvedValue(null);
      await expect(importFromSheets('token')).rejects.toThrow('no_spreadsheet_configured');
    });

    it('throws spreadsheet_not_found on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Spreadsheet not found.' } }),
      });
      await expect(importFromSheets('token')).rejects.toThrow('spreadsheet_not_found');
    });

    it('signs out and throws refresh_failed on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });
      await expect(importFromSheets('token')).rejects.toThrow('refresh_failed');
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('throws when the DB read for app_metadata fails (#760)', async () => {
      const { queryAll } = require('../../app/services/db');
      queryAll.mockRejectedValueOnce(new Error('database is locked'));
      await expect(importFromSheets('token')).rejects.toThrow('database is locked');
    });

    it('returns a valid backup object on success', async () => {
      const backup = await importFromSheets('token');
      expect(backup.version).toBe(1);
      expect(backup.data.accounts).toHaveLength(2);
      expect(backup.data.categories).toHaveLength(1);
      expect(backup.data.operations).toHaveLength(2);
      expect(backup.data.balance_history).toHaveLength(1);
      expect(backup.data.app_metadata).toEqual([]);
    });

    it('resolves account FK by account_id column (ID-first)', async () => {
      const backup = await importFromSheets('token');
      // Operation row has account_id='1', which maps to account id '1'
      expect(backup.data.operations[0].account_id).toBe('1');
    });

    it('resolves account FK by name when account_id column is absent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          valueRanges: [
            {
              range: 'Accounts!A1:D2',
              values: [
                ['id', 'name', 'balance', 'currency'],
                ['1', 'Checking', '500', 'USD'],
              ],
            },
            {
              range: 'Operations!A1:I2',
              values: [
                ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
                ['10', '2024-01-15', 'expense', '50', 'USD', '', 'Checking', '', ''],
              ],
            },
            { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
            { range: 'Budgets!A1:A1', values: [['id']] },
            { range: 'Planned Operations!A1:A1', values: [['id']] },
            { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance']] },
          ],
        }),
      });
      const backup = await importFromSheets('token');
      expect(backup.data.operations[0].account_id).toBe('1');
    });

    it('sets FK to null when neither ID nor name resolves', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          valueRanges: [
            { range: 'Accounts!A1:D1', values: [['id', 'name', 'balance', 'currency']] },
            {
              range: 'Operations!A1:I2',
              values: [
                ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
                ['10', '2024-01-15', 'expense', '50', 'USD', '', 'UnknownAccount', '', ''],
              ],
            },
            { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
            { range: 'Budgets!A1:A1', values: [['id']] },
            { range: 'Planned Operations!A1:A1', values: [['id']] },
            { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance']] },
          ],
        }),
      });
      const backup = await importFromSheets('token');
      expect(backup.data.operations[0].account_id).toBeNull();
    });

    it('treats missing sheet tab as empty array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          valueRanges: [
            { range: 'Accounts!A1:D2', values: [['id', 'name', 'balance', 'currency'], ['1', 'Checking', '500', 'USD']] },
            // Operations tab entirely missing from response
            { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
            { range: 'Budgets!A1:A1', values: [['id']] },
            { range: 'Planned Operations!A1:A1', values: [['id']] },
            { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance', 'account_id']] },
          ],
        }),
      });
      const backup = await importFromSheets('token');
      expect(backup.data.operations).toEqual([]);
    });

    it('calls onProgress with connect and parse steps', async () => {
      const onProgress = jest.fn();
      await importFromSheets('token', onProgress);
      expect(onProgress).toHaveBeenCalledWith({ step: 'connect', status: 'in_progress' });
      expect(onProgress).toHaveBeenCalledWith({ step: 'connect', status: 'completed' });
      expect(onProgress).toHaveBeenCalledWith({ step: 'parse', status: 'in_progress' });
      expect(onProgress).toHaveBeenCalledWith({ step: 'parse', status: 'completed' });
    });

    it('maps category fields correctly', async () => {
      const backup = await importFromSheets('token');
      const cat = backup.data.categories[0];
      expect(cat.id).toBe('cat-1');
      expect(cat.color).toBe('#ff0000');
      expect(cat.is_shadow).toBe(0);
    });

    it('maps balance_history account_id by ID column', async () => {
      const backup = await importFromSheets('token');
      expect(backup.data.balance_history[0].account_id).toBe('1');
    });
  });

  describe('Budget plans (Budgets v2, issue #1398)', () => {
    const { getPreference } = require('../../app/services/PreferencesDB');
    const NON_ASCII_COMMENT = 'Отложить на 日本 — €100';

    const mockBackup = {
      data: {
        accounts: [{ id: 1, name: 'Savings', balance: '0', currency: 'USD' }],
        categories: [{ id: 'cat-1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'food' }],
        operations: [],
        budgets: [],
        planned_operations: [],
        balance_history: [],
        budget_plans: [
          { id: 'plan-1', month: '2026-07', currency: 'USD', expected_income: '3000.00' },
        ],
        budget_plan_lines: [
          { id: 'line-cat', plan_id: 'plan-1', label: 'Groceries', amount: '400', comment: NON_ASCII_COMMENT, category_id: 'cat-1', to_account_id: null, sort_order: 0 },
          { id: 'line-xfer', plan_id: 'plan-1', label: 'To savings', amount: '500', comment: null, category_id: null, to_account_id: 1, sort_order: 1 },
        ],
      },
    };

    it('builds a Budget Plans sheet with header and rows', () => {
      const sheets = buildSheetsData(mockBackup);
      const plans = sheets.find(s => s.range === 'Budget Plans!A1');
      expect(plans.values[0]).toEqual(['id', 'month', 'currency', 'expected_income']);
      expect(plans.values[1]).toEqual(['plan-1', '2026-07', 'USD', '3000.00']);
    });

    it('builds a Budget Plan Lines sheet resolving category/account names, preserving IDs and comment', () => {
      const sheets = buildSheetsData(mockBackup);
      const lines = sheets.find(s => s.range === 'Budget Plan Lines!A1');
      const header = lines.values[0];
      expect(header).toEqual(['id', 'plan_id', 'label', 'amount', 'comment', 'category', 'account', 'category_id', 'to_account_id', 'sort_order']);

      const catRow = lines.values.find(r => r[0] === 'line-cat');
      expect(catRow[header.indexOf('category')]).toBe('Food');
      expect(catRow[header.indexOf('category_id')]).toBe('cat-1');
      expect(catRow[header.indexOf('comment')]).toBe(NON_ASCII_COMMENT);
      expect(catRow[header.indexOf('account')]).toBe('');

      const xferRow = lines.values.find(r => r[0] === 'line-xfer');
      expect(xferRow[header.indexOf('account')]).toBe('Savings');
      expect(xferRow[header.indexOf('to_account_id')]).toBe(1);
      expect(xferRow[header.indexOf('category')]).toBe('');
    });

    it('tolerates a backup that lacks budget plan data (empty sheets)', () => {
      const legacy = { data: { ...mockBackup.data, budget_plans: undefined, budget_plan_lines: undefined } };
      const sheets = buildSheetsData(legacy);
      const plans = sheets.find(s => s.range === 'Budget Plans!A1');
      const lines = sheets.find(s => s.range === 'Budget Plan Lines!A1');
      expect(plans.values).toHaveLength(1); // header only
      expect(lines.values).toHaveLength(1); // header only
    });

    it('creates spreadsheet with Budget Plans and Budget Plan Lines tabs', async () => {
      const { setPreference } = require('../../app/services/PreferencesDB');
      getPreference.mockResolvedValue(null);
      setPreference.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ spreadsheetId: 'sid' }) }); // create
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ sheets: [] }) });

      await exportToSheets('token', mockBackup);

      const createBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const titles = createBody.sheets.map(s => s.properties.title);
      expect(titles).toContain('Budget Plans');
      expect(titles).toContain('Budget Plan Lines');
    });

    it('imports budget plans and lines from sheets, resolving FKs', async () => {
      getPreference.mockResolvedValue('sheet-id-123');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          valueRanges: [
            { range: 'Accounts!A1:D2', values: [['id', 'name', 'balance', 'currency'], ['1', 'Savings', '0', 'USD']] },
            { range: 'Operations!A1:A1', values: [['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description']] },
            { range: 'Categories!A1:B2', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow'], ['cat-1', 'Food', 'entry', 'expense', 'food', '', '', '0']] },
            { range: 'Budgets!A1:A1', values: [['id']] },
            { range: 'Planned Operations!A1:A1', values: [['id']] },
            { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance', 'account_id']] },
            { range: 'Budget Plans!A1:D2', values: [['id', 'month', 'currency', 'expected_income'], ['plan-1', '2026-07', 'USD', '3000.00']] },
            {
              range: 'Budget Plan Lines!A1:J3',
              values: [
                ['id', 'plan_id', 'label', 'amount', 'comment', 'category', 'account', 'category_id', 'to_account_id', 'sort_order'],
                ['line-cat', 'plan-1', 'Groceries', '400', NON_ASCII_COMMENT, 'Food', '', 'cat-1', '', '0'],
                ['line-xfer', 'plan-1', 'To savings', '500', '', '', 'Savings', '', '1', '1'],
              ],
            },
          ],
        }),
      });

      const backup = await importFromSheets('token');

      expect(backup.data.budget_plans).toHaveLength(1);
      expect(backup.data.budget_plans[0]).toMatchObject({ id: 'plan-1', month: '2026-07', currency: 'USD', expected_income: '3000.00' });

      expect(backup.data.budget_plan_lines).toHaveLength(2);
      const cat = backup.data.budget_plan_lines.find(l => l.id === 'line-cat');
      expect(cat.category_id).toBe('cat-1');
      expect(cat.to_account_id).toBeNull();
      expect(cat.comment).toBe(NON_ASCII_COMMENT);
      expect(cat.sort_order).toBe(0);

      const xfer = backup.data.budget_plan_lines.find(l => l.id === 'line-xfer');
      expect(xfer.to_account_id).toBe('1'); // resolved by ID column
      expect(xfer.category_id).toBeNull();
      expect(xfer.sort_order).toBe(1);
    });

    it('returns empty plan arrays when the sheets are missing (old spreadsheet)', async () => {
      getPreference.mockResolvedValue('sheet-id-123');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          valueRanges: [
            { range: 'Accounts!A1:D2', values: [['id', 'name', 'balance', 'currency'], ['1', 'Savings', '0', 'USD']] },
            { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
            // No Budget Plans / Budget Plan Lines tabs.
          ],
        }),
      });

      const backup = await importFromSheets('token');
      expect(backup.data.budget_plans).toEqual([]);
      expect(backup.data.budget_plan_lines).toEqual([]);
    });
  });
});
