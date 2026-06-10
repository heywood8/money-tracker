import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SearchProvider, useSearch } from '../../app/contexts/SearchContext';

describe('SearchContext', () => {
  describe('Initialization', () => {
    it('throws error when used outside SearchProvider', async () => {
      // Suppress console.error for this test
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(renderHook(() => useSearch())).rejects.toThrow('useSearch must be used within SearchProvider');

      consoleError.mockRestore();
    });

    it('provides default values', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.openSearch).toBeInstanceOf(Function);
      expect(result.current.setSearchMode).toBeInstanceOf(Function);
      expect(result.current.searchMode).toBe('closed');
      expect(result.current.filtersExpanded).toBe(false);
      expect(result.current.toggleFilters).toBeInstanceOf(Function);
    });

    it('initializes with searchMode as closed', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.searchMode).toBe('closed');
    });
  });

  describe('Search Mode Management', () => {
    it('sets searchMode to open when openSearch is called', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.searchMode).toBe('closed');

      await act(async () => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');
    });

    it('sets searchMode to open from collapsed state', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });

      await act(async () => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');
    });

    it('changes searchMode when setSearchMode is called', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('open');
      });
      expect(result.current.searchMode).toBe('open');

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });
      expect(result.current.searchMode).toBe('collapsed');

      await act(async () => {
        result.current.setSearchMode('closed');
      });
      expect(result.current.searchMode).toBe('closed');
    });

    it('validates searchMode values and warns on invalid', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await act(async () => {
        result.current.setSearchMode('invalid');
      });

      expect(result.current.searchMode).toBe('closed');
      expect(consoleWarn).toHaveBeenCalledWith('[SearchContext] Invalid searchMode:', 'invalid');

      consoleWarn.mockRestore();
    });

    it('closes search to closed when no filters are active', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');

      await act(async () => {
        result.current.closeSearch(false); // false = no active filters
      });

      expect(result.current.searchMode).toBe('closed');
    });

    it('closes search to collapsed when filters are active', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.openSearch();
      });

      expect(result.current.searchMode).toBe('open');

      await act(async () => {
        result.current.closeSearch(true); // true = filters active
      });

      expect(result.current.searchMode).toBe('collapsed');
    });

    it('reopens search from collapsed without auto-expanding filters when only text filter', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });

      const mockCallback = jest.fn();

      await act(async () => {
        result.current.reopenSearch(true, false, mockCallback); // hasText=true, hasOtherFilters=false
      });

      expect(result.current.searchMode).toBe('open');
      expect(mockCallback).toHaveBeenCalledWith(false); // should NOT auto-expand filters
    });

    it('reopens search from collapsed and auto-expands filters when other filters present', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });

      const mockCallback = jest.fn();

      await act(async () => {
        result.current.reopenSearch(false, true, mockCallback); // hasText=false, hasOtherFilters=true
      });

      expect(result.current.searchMode).toBe('open');
      expect(mockCallback).toHaveBeenCalledWith(true); // should auto-expand filters
    });

    it('reopens search and auto-expands when both text and other filters', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });

      const mockCallback = jest.fn();

      await act(async () => {
        result.current.reopenSearch(true, true, mockCallback); // both present
      });

      expect(result.current.searchMode).toBe('open');
      expect(mockCallback).toHaveBeenCalledWith(true); // should auto-expand filters
    });

    it('reopens search without onShouldExpandFilters callback (no-op branch)', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      await act(async () => {
        result.current.setSearchMode('collapsed');
      });

      // Call without third argument — onShouldExpandFilters is undefined, branch is skipped
      await act(async () => {
        result.current.reopenSearch(false, true);
      });;

      expect(result.current.searchMode).toBe('open');
    });
  });

  describe('Filters Expansion State', () => {
    it('initializes filtersExpanded to false', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.filtersExpanded).toBe(false);
    });

    it('toggles filtersExpanded when toggleFilters is called', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      expect(result.current.filtersExpanded).toBe(false);

      await act(async () => {
        result.current.toggleFilters();
      });

      expect(result.current.filtersExpanded).toBe(true);

      await act(async () => {
        result.current.toggleFilters();
      });

      expect(result.current.filtersExpanded).toBe(false);
    });

    it('toggles filtersExpanded multiple times', async () => {
      const { result } = await renderHook(() => useSearch(), {
        wrapper: SearchProvider,
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.toggleFilters();
        });

        const expectedState = (i + 1) % 2 === 1;
        expect(result.current.filtersExpanded).toBe(expectedState);
      }
    });
  });

});
