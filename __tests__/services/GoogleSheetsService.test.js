import * as SecureStore from 'expo-secure-store';
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
  getValidAccessToken,
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
});
