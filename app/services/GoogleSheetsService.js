import * as SecureStore from 'expo-secure-store';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { createBackup } from './BackupRestore';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
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
