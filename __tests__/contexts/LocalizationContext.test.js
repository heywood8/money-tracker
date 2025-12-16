/**
 * Tests for LocalizationContext - Internationalization (i18n)
 * These tests ensure language switching and translations work correctly
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as PreferencesDB from '../../app/services/PreferencesDB';
import { LocalizationProvider, useLocalization } from '../../app/contexts/LocalizationContext';

// Mock PreferencesDB
jest.mock('../../app/services/PreferencesDB');

describe('LocalizationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no stored preference
    PreferencesDB.getPreference.mockResolvedValue(null);
    PreferencesDB.setPreference.mockResolvedValue(undefined);
    PreferencesDB.deletePreference.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => <LocalizationProvider>{children}</LocalizationProvider>;

  describe('Initialization', () => {
    it('provides localization context with default values', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.language).toBe('en');
      });

      expect(result.current.t).toBeDefined();
      expect(result.current.setLanguage).toBeDefined();
      expect(result.current.availableLanguages).toBeDefined();
    });

    it('loads saved language from PreferencesDB', async () => {
      PreferencesDB.getPreference.mockResolvedValue('ru');

      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current.language).toBe('ru');
      });
    });

    it('uses default language when no preference is saved', async () => {
      PreferencesDB.getPreference.mockResolvedValue(null);

      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.language).toBe('en');
      });
    });

    it('ignores invalid language from PreferencesDB', async () => {
      PreferencesDB.getPreference.mockResolvedValue('invalid-lang');

      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current.language).toBe('en'); // Falls back to default
      });
    });
  });

  describe('Language Switching', () => {
    it('switches to Russian', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.setLanguage('ru');
      });

      expect(result.current.language).toBe('ru');
    });

    it('switches to English', async () => {
      PreferencesDB.getPreference.mockResolvedValue('ru');

      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current.language).toBe('ru');
      });

      await act(async () => {
        await result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');
    });

    it('persists language preference to PreferencesDB', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.setLanguage('ru');
      });

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LANGUAGE,
        'ru',
      );
    });
  });

  describe('Translation Function', () => {
    it('translates keys to English', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current.t('accounts')).toBeDefined();
      expect(result.current.t('operations')).toBeDefined();
      expect(result.current.t('categories')).toBeDefined();
      expect(result.current.t('graphs')).toBeDefined();
    });

    it('translates keys to Russian when language is ru', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.setLanguage('ru');
      });

      expect(result.current.t('accounts')).toBeDefined();
      expect(result.current.t('accounts')).not.toBe('accounts'); // Should be translated
    });

    it('returns key itself when translation is missing', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const missingKey = 'nonexistent_translation_key';
      expect(result.current.t(missingKey)).toBe(missingKey);
    });

    it('handles undefined or null keys gracefully', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(() => result.current.t(undefined)).not.toThrow();
      expect(() => result.current.t(null)).not.toThrow();
    });
  });

  describe('Available Languages', () => {
    it('provides list of available languages', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current.availableLanguages).toContain('en');
      expect(result.current.availableLanguages).toContain('ru');
      expect(Array.isArray(result.current.availableLanguages)).toBe(true);
    });

    it('has at least 2 languages (en and ru)', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current.availableLanguages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Translation Keys Coverage', () => {
    it('has translations for all main screens', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const screenKeys = ['operations', 'accounts', 'categories', 'graphs'];

      screenKeys.forEach((key) => {
        const translated = result.current.t(key);
        expect(translated).toBeDefined();
        expect(translated).not.toBe(''); // Should not be empty
      });
    });

    it('has translations for common UI elements', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const commonKeys = ['save', 'cancel', 'delete', 'edit', 'add'];

      commonKeys.forEach((key) => {
        const translated = result.current.t(key);
        expect(translated).toBeDefined();
      });
    });

    it('provides same keys in both languages', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Get some translations in English
      const enTranslations = {
        accounts: result.current.t('accounts'),
        operations: result.current.t('operations'),
      };

      // Switch to Russian
      await act(async () => {
        await result.current.setLanguage('ru');
      });

      // Same keys should exist in Russian (even if values differ)
      expect(result.current.t('accounts')).toBeDefined();
      expect(result.current.t('operations')).toBeDefined();

      // Verify they're actually different (Russian translations)
      expect(result.current.t('accounts')).not.toBe(enTranslations.accounts);
      expect(result.current.t('operations')).not.toBe(enTranslations.operations);
    });
  });

  // Regression tests
  describe('Regression Tests', () => {
    it('maintains language consistency after multiple changes', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.setLanguage('ru');
      });
      expect(result.current.language).toBe('ru');

      await act(async () => {
        await result.current.setLanguage('en');
      });
      expect(result.current.language).toBe('en');

      expect(PreferencesDB.setPreference).toHaveBeenLastCalledWith(
        PreferencesDB.PREF_KEYS.LANGUAGE,
        'en',
      );
    });

    it('translations update immediately after language change', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const enTranslation = result.current.t('accounts');

      await act(async () => {
        await result.current.setLanguage('ru');
      });

      const ruTranslation = result.current.t('accounts');

      expect(enTranslation).not.toBe(ruTranslation);
    });

    it('handles rapid language switches', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      await act(async () => {
        await result.current.setLanguage('ru');
        await result.current.setLanguage('en');
        await result.current.setLanguage('ru');
      });

      expect(result.current.language).toBe('ru');
    });

    it('gracefully handles PreferencesDB errors', async () => {
      const { result } = renderHook(() => useLocalization(), { wrapper });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Mock PreferencesDB to throw error after component is mounted
      PreferencesDB.setPreference.mockRejectedValue(new Error('Storage error'));

      // Should not throw error
      await act(async () => {
        await result.current.setLanguage('ru');
      });

      expect(result.current.language).toBe('ru'); // Language should still change in memory
    });
  });
});
