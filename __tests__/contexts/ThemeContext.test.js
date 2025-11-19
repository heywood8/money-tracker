/**
 * Tests for ThemeContext - Theme management (light/dark/system)
 * These tests ensure theme switching works correctly and persists preferences
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../../app/ThemeContext';

describe('ThemeContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;

  describe('Initialization', () => {
    it('provides theme context with default values', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');
      expect(result.current.colorScheme).toBeDefined();
      expect(result.current.colors).toBeDefined();
      expect(result.current.setTheme).toBeDefined();
    });

    it('uses OS color scheme as default', () => {
      Appearance.getColorScheme.mockReturnValue('dark');

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.colorScheme).toBe('dark');
    });

    it('loads saved theme preference from AsyncStorage', async () => {
      await AsyncStorage.setItem('theme_preference', 'dark');

      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.theme).toBe('dark');
      });
    });

    it('falls back to system when no preference is saved', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe('system');
    });
  });

  describe('Theme Switching', () => {
    it('switches to light theme', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.colorScheme).toBe('light');
      expect(result.current.colors.background).toBe('#ffffff'); // Light background
    });

    it('switches to dark theme', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.colorScheme).toBe('dark');
      expect(result.current.colors.background).toBe('#111111'); // Dark background
    });

    it('switches to system theme', async () => {
      Appearance.getColorScheme.mockReturnValue('dark');

      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
      expect(result.current.colorScheme).toBe('dark'); // Follows OS
    });

    it('persists theme preference to AsyncStorage', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('dark');
      });

      const stored = await AsyncStorage.getItem('theme_preference');
      expect(stored).toBe('dark');
    });
  });

  describe('System Theme Behavior', () => {
    it('follows OS color scheme when theme is system', async () => {
      Appearance.getColorScheme.mockReturnValue('light');

      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('system');
      });

      expect(result.current.colorScheme).toBe('light');
    });

    it('updates color scheme when OS color scheme changes', async () => {
      Appearance.getColorScheme.mockReturnValue('light');
      let changeListener;
      Appearance.addChangeListener.mockImplementation((callback) => {
        changeListener = callback;
        return { remove: jest.fn() };
      });

      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('system');
      });

      expect(result.current.colorScheme).toBe('light');

      // Simulate OS color scheme change
      act(() => {
        changeListener({ colorScheme: 'dark' });
      });

      expect(result.current.colorScheme).toBe('dark');
    });

    it('does not follow OS changes when theme is manually set', async () => {
      let changeListener;
      Appearance.addChangeListener.mockImplementation((callback) => {
        changeListener = callback;
        return { remove: jest.fn() };
      });

      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('light');
      });

      expect(result.current.colorScheme).toBe('light');

      // Simulate OS color scheme change
      act(() => {
        changeListener({ colorScheme: 'dark' });
      });

      // Should still be light because theme is not 'system'
      expect(result.current.colorScheme).toBe('light');
    });
  });

  describe('Theme Colors', () => {
    it('provides light theme colors when colorScheme is light', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('light');
      });

      expect(result.current.colors.background).toBe('#ffffff');
      expect(result.current.colors.text).toBe('#111111');
      expect(result.current.colors.primary).toBe('#007AFF');
    });

    it('provides dark theme colors when colorScheme is dark', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('dark');
      });

      expect(result.current.colors.background).toBe('#111111');
      expect(result.current.colors.text).toBe('#ffffff');
      expect(result.current.colors.primary).toBe('#4da3ff');
    });

    it('includes all required color keys', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      const requiredKeys = [
        'background',
        'surface',
        'primary',
        'text',
        'mutedText',
        'border',
        'modalBackground',
        'inputBackground',
        'inputBorder',
        'danger',
        'delete',
        'selected',
        'altRow',
        'expense',
        'income',
        'transfer',
      ];

      requiredKeys.forEach((key) => {
        expect(result.current.colors).toHaveProperty(key);
      });
    });
  });

  describe('Listener Cleanup', () => {
    it('removes appearance listener on unmount', () => {
      const mockRemove = jest.fn();
      Appearance.addChangeListener.mockReturnValue({ remove: mockRemove });

      const { unmount } = renderHook(() => useTheme(), { wrapper });

      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  // Regression tests
  describe('Regression Tests', () => {
    it('handles missing OS color scheme gracefully', () => {
      Appearance.getColorScheme.mockReturnValue(null);

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.colorScheme).toBe('light'); // Falls back to light
    });

    it('maintains theme consistency after multiple changes', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('dark');
      });
      expect(result.current.theme).toBe('dark');

      await act(async () => {
        await result.current.setTheme('light');
      });
      expect(result.current.theme).toBe('light');

      await act(async () => {
        await result.current.setTheme('system');
      });
      expect(result.current.theme).toBe('system');

      const stored = await AsyncStorage.getItem('theme_preference');
      expect(stored).toBe('system');
    });

    it('colors object remains immutable between renders', async () => {
      const { result, rerender } = renderHook(() => useTheme(), { wrapper });

      const initialColors = result.current.colors;
      rerender();

      // Colors object should be the same reference if theme hasn't changed
      expect(result.current.colors).toBe(initialColors);
    });

    it('handles rapid theme changes', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });

      await act(async () => {
        await result.current.setTheme('light');
        await result.current.setTheme('dark');
        await result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
    });
  });
});
