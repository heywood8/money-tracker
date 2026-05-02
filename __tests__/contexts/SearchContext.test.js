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

    it('provides default values', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.openSearch).toBeInstanceOf(Function);
      expect(result.current.setSearchMode).toBeInstanceOf(Function);
      expect(result.current.searchMode).toBe('closed');
    });

    it('initializes with searchMode as closed', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.searchMode).toBe('closed');
    });
  });

  describe.skip('Handler Registration (deprecated)', () => {
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

  describe.skip('Search Invocation (deprecated)', () => {
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

  describe.skip('Multiple Consumers (deprecated)', () => {
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

  describe('Search Mode Management', () => {
    it('sets searchMode to open when openSearch is called', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.searchMode).toBe('closed');

      act(() => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');
    });

    it('sets searchMode to open from collapsed state', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.setSearchMode('collapsed');
      });

      act(() => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');
    });

    it('changes searchMode when setSearchMode is called', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.setSearchMode('open');
      });
      expect(result.current.searchMode).toBe('open');

      act(() => {
        result.current.setSearchMode('collapsed');
      });
      expect(result.current.searchMode).toBe('collapsed');

      act(() => {
        result.current.setSearchMode('closed');
      });
      expect(result.current.searchMode).toBe('closed');
    });

    it('validates searchMode values and warns on invalid', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      act(() => {
        result.current.setSearchMode('invalid');
      });

      expect(result.current.searchMode).toBe('closed');
      expect(consoleWarn).toHaveBeenCalledWith('[SearchContext] Invalid searchMode:', 'invalid');

      consoleWarn.mockRestore();
    });

    it('closes search to closed when no filters are active', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');

      act(() => {
        result.current.closeSearch(false); // false = no active filters
      });

      expect(result.current.searchMode).toBe('closed');
    });

    it('closes search to collapsed when filters are active', () => {
      const { result } = renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      act(() => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');

      act(() => {
        result.current.closeSearch(true); // true = filters active
      });

      expect(result.current.searchMode).toBe('collapsed');
    });
  });

  describe.skip('Edge Cases (deprecated)', () => {
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
