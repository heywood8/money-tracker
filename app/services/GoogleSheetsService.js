import * as SecureStore from 'expo-secure-store';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SECURE_STORE_KEY = 'google_refresh_token';

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 * Stores the refresh token in SecureStore.
 * @param {string} code - Auth code from OAuth redirect
 * @param {string} codeVerifier - PKCE code verifier from the auth request
 * @param {string} redirectUri - Redirect URI used in the auth request
 * @returns {Promise<string>} Access token
 */
export const exchangeAndStoreTokens = async (code, codeVerifier, redirectUri) => {
  const body = new URLSearchParams({
    code,
    client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  }).toString();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('token_exchange_failed');
  }

  await SecureStore.setItemAsync(SECURE_STORE_KEY, data.refresh_token);
  return data.access_token;
};

/**
 * Delete the stored refresh token (e.g. after revocation).
 */
export const clearStoredAuth = async () => {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
};

/**
 * Get a valid access token using the stored refresh token.
 * Throws 'no_refresh_token' if no refresh token is stored.
 * Throws 'refresh_failed' if the refresh request fails (clears stored token).
 * @returns {Promise<string>} Access token
 */
export const getValidAccessToken = async () => {
  const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!refreshToken) {
    throw new Error('no_refresh_token');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    grant_type: 'refresh_token',
  }).toString();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
    throw new Error('refresh_failed');
  }

  return data.access_token;
};

/**
 * Build the 6-sheet data structure from a backup object.
 * Uses human-readable account/category names in place of IDs.
 * All categories included (including shadow). All balances shown as-is.
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Array<{range: string, values: Array<Array>}>}
 */
export const buildSheetsData = (backup) => {
  const { accounts, categories, operations, budgets, planned_operations, balance_history } = backup.data;

  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  return [
    {
      range: 'Accounts!A1',
      values: [
        ['id', 'name', 'balance', 'currency'],
        ...accounts.map(a => [a.id, a.name, a.balance, a.currency]),
      ],
    },
    {
      range: 'Operations!A1',
      values: [
        ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
        ...operations.map(o => [
          o.id,
          o.date,
          o.type,
          o.amount,
          o.source_currency || '',
          categoryNames.get(o.category_id) || '',
          accountNames.get(o.account_id) || '',
          o.to_account_id ? (accountNames.get(o.to_account_id) || '') : '',
          o.description || '',
        ]),
      ],
    },
    {
      range: 'Categories!A1',
      values: [
        ['id', 'name', 'type', 'category_type', 'icon'],
        ...categories.map(c => [c.id, c.name, c.type, c.category_type, c.icon || '']),
      ],
    },
    {
      range: 'Budgets!A1',
      values: [
        ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled'],
        ...(budgets || []).map(b => [
          b.id,
          categoryNames.get(b.category_id) || '',
          b.amount,
          b.currency,
          b.period_type,
          b.start_date,
          b.end_date || '',
          b.is_recurring,
          b.rollover_enabled,
        ]),
      ],
    },
    {
      range: 'Planned Operations!A1',
      values: [
        ['id', 'name', 'type', 'amount', 'account', 'category', 'to_account', 'description', 'is_recurring'],
        ...(planned_operations || []).map(p => [
          p.id,
          p.name,
          p.type,
          p.amount,
          accountNames.get(p.account_id) || '',
          categoryNames.get(p.category_id) || '',
          p.to_account_id ? (accountNames.get(p.to_account_id) || '') : '',
          p.description || '',
          p.is_recurring,
        ]),
      ],
    },
    {
      range: 'Balance History!A1',
      values: [
        ['account', 'date', 'balance'],
        ...(balance_history || []).map(h => [
          accountNames.get(h.account_id) || '',
          h.date,
          h.balance,
        ]),
      ],
    },
  ];
};

const createSpreadsheet = async (accessToken) => {
  const response = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'Penny – export' },
      sheets: [
        { properties: { title: 'Accounts' } },
        { properties: { title: 'Operations' } },
        { properties: { title: 'Categories' } },
        { properties: { title: 'Budgets' } },
        { properties: { title: 'Planned Operations' } },
        { properties: { title: 'Balance History' } },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'create_spreadsheet_failed');
  }
  return data.spreadsheetId;
};

const clearSheets = async (accessToken, spreadsheetId, ranges) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) throw new Error('refresh_failed');
    throw new Error(data.error?.message || 'clear_sheets_failed');
  }
  await response.json().catch(() => {});
};

const writeSheets = async (accessToken, spreadsheetId, sheets) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: sheets.map(s => ({ range: s.range, values: s.values })),
    }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) throw new Error('refresh_failed');
    if (response.status === 429) throw new Error('quota_exceeded');
    throw new Error(data.error?.message || 'write_sheets_failed');
  }
  await response.json().catch(() => {});
};

/**
 * Export all app data to Google Sheets.
 * Creates the spreadsheet on first call; updates it on subsequent calls.
 * @param {string} accessToken - Valid Google OAuth access token
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Promise<string>} URL of the spreadsheet
 */
export const exportToSheets = async (accessToken, backup) => {
  let spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);

  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken);
    await setPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID, spreadsheetId);
  }

  const sheets = buildSheetsData(backup);
  await clearSheets(accessToken, spreadsheetId, sheets.map(s => s.range.split('!')[0]));
  await writeSheets(accessToken, spreadsheetId, sheets);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};
