import * as SecureStore from 'expo-secure-store';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { createBackup } from './BackupRestore';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export { TOKEN_ENDPOINT };
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
