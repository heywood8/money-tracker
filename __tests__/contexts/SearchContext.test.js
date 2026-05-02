import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SearchProvider, useSearch } from '../../app/contexts/SearchContext';

describe('SearchContext', () => {
  describe('Initialization', () => {
    it('throws error when used outside SearchProvider', () => {
      // Suppress console.error for this test
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useSearch());
      }).toThrow('useSearch must be used within SearchProvider');

      consoleError.mockRestore();
    });

    it('provides default values when no handler is registered', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.registerSearchHandler).toBeInstanceOf(Function);
      expect(result.current.openSearch).toBeInstanceOf(Function);
    });

    it('initializes with searchMode as closed', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.searchMode).toBe('closed');
    });
  });

  describe('Handler Registration', () => {
    it('registers a search handler', () => {
      const mockHandler = jest.fn();
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler);
      });

      // Handler should be registered (can't directly test state, but we can test openSearch)
      act(() => {
        result.current.openSearch();
      });

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('replaces existing handler when new one is registered', () => {
      const mockHandler1 = jest.fn();
      const mockHandler2 = jest.fn();
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler1);
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler2);
      });

      act(() => {
        result.current.openSearch();
      });

      expect(mockHandler1).not.toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalledTimes(1);
    });

    it('unregisters handler when null is passed', () => {
      const mockHandler = jest.fn();
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler);
      });

      act(() => {
        result.current.registerSearchHandler(null);
      });

      // openSearch should do nothing when no handler is registered
      act(() => {
        result.current.openSearch();
      });

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Search Invocation', () => {
    it('calls registered handler when openSearch is invoked', () => {
      const mockHandler = jest.fn();
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler);
      });

      act(() => {
        result.current.openSearch();
      });

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('calls handler multiple times when openSearch is invoked multiple times', () => {
      const mockHandler = jest.fn();
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(mockHandler);
      });

      act(() => {
        result.current.openSearch();
        result.current.openSearch();
        result.current.openSearch();
      });

      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('does nothing when openSearch is called with no registered handler', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      // This should not throw - just do nothing
      expect(() => {
        act(() => {
          result.current.openSearch();
        });
      }).not.toThrow();
    });
  });

  describe('Multiple Consumers', () => {
    it('provides same context to multiple consumers', () => {
      const mockHandler = jest.fn();

      // Create a single provider instance and render both hooks within it
      const { result } = renderHook(
        () => ({
          consumer1: useSearch(),
          consumer2: useSearch(),
        }),
        { wrapper: SearchProvider },
      );

      act(() => {
        result.current.consumer1.registerSearchHandler(mockHandler);
      });

      act(() => {
        result.current.consumer2.openSearch();
      });

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles handler that throws error gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(errorHandler);
      });

      expect(() => {
        act(() => {
          result.current.openSearch();
        });
      }).toThrow('Handler error');

      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('handles async handler', async () => {
      const asyncHandler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.registerSearchHandler(asyncHandler);
      });

      await act(async () => {
        await result.current.openSearch();
      });

      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });
  });
});
