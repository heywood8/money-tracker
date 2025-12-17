/**
 * Tests for MerchantBindingsContext - Merchant bindings management context
 * Tests loading, creating, updating, deleting, and finding merchant bindings
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { MerchantBindingsProvider, useMerchantBindings } from '../../app/contexts/MerchantBindingsContext';
import * as MerchantBindingsDB from '../../app/services/MerchantBindingsDB';
import { DialogProvider } from '../../app/contexts/DialogContext';

// Mock the database service
jest.mock('../../app/services/MerchantBindingsDB');

// Mock MaterialDialog
jest.mock('../../app/components/MaterialDialog', () => 'MaterialDialog');

describe('MerchantBindingsContext', () => {
  const wrapper = ({ children }) => (
    <DialogProvider>
      <MerchantBindingsProvider>{children}</MerchantBindingsProvider>
    </DialogProvider>
  );

  const mockBindings = [
    {
      id: 1,
      merchantName: 'YANDEX.GO, AM',
      categoryId: 'transport',
      lastUsed: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      merchantName: 'STARBUCKS',
      categoryId: 'cafe',
      lastUsed: '2025-01-02T00:00:00.000Z',
      createdAt: '2025-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    MerchantBindingsDB.getAll.mockResolvedValue(mockBindings);
    MerchantBindingsDB.create.mockImplementation((merchantName, categoryId) =>
      Promise.resolve({
        id: 3,
        merchantName,
        categoryId,
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
    );
    MerchantBindingsDB.update.mockResolvedValue();
    MerchantBindingsDB.deleteBinding.mockResolvedValue();
    MerchantBindingsDB.getByMerchantName.mockResolvedValue(mockBindings[0]);
    MerchantBindingsDB.updateLastUsed.mockResolvedValue();
  });

  describe('Initialization', () => {
    it('provides merchant bindings context', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.bindings).toBeDefined();
      expect(result.current.addBinding).toBeDefined();
      expect(result.current.updateBinding).toBeDefined();
      expect(result.current.removeBinding).toBeDefined();
      expect(result.current.findByMerchantName).toBeDefined();
    });

    it('throws error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useMerchantBindings());
      }).toThrow('useMerchantBindings must be used within a MerchantBindingsProvider');

      consoleSpy.mockRestore();
    });

    it('loads bindings on mount', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(MerchantBindingsDB.getAll).toHaveBeenCalled();
      expect(result.current.bindings).toEqual(mockBindings);
    });

    it('sets loading state during initialization', () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      expect(result.current.loading).toBe(true);
    });
  });

  describe('addBinding', () => {
    it('adds a new merchant binding', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let newBinding;
      await act(async () => {
        newBinding = await result.current.addBinding('ZARA YEREVAN', 'shopping');
      });

      expect(MerchantBindingsDB.create).toHaveBeenCalledWith('ZARA YEREVAN', 'shopping');
      expect(newBinding).toBeDefined();
      expect(newBinding.merchantName).toBe('ZARA YEREVAN');
      expect(result.current.bindings).toHaveLength(3);
    });

    it('handles error when adding binding fails', async () => {
      MerchantBindingsDB.create.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.addBinding('ZARA', 'shopping')).rejects.toThrow('Database error');
      });
    });
  });

  describe('updateBinding', () => {
    it('updates an existing merchant binding', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateBinding(1, 'new-category');
      });

      expect(MerchantBindingsDB.update).toHaveBeenCalledWith(1, 'new-category');
      expect(MerchantBindingsDB.getAll).toHaveBeenCalledTimes(2); // Initial load + reload after update
    });

    it('handles error when updating binding fails', async () => {
      MerchantBindingsDB.update.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.updateBinding(1, 'new-category')).rejects.toThrow('Update failed');
      });
    });
  });

  describe('removeBinding', () => {
    it('removes a merchant binding', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.removeBinding(1);
      });

      expect(MerchantBindingsDB.deleteBinding).toHaveBeenCalledWith(1);
      expect(result.current.bindings).toHaveLength(1);
      expect(result.current.bindings.find(b => b.id === 1)).toBeUndefined();
    });

    it('handles error when removing binding fails', async () => {
      MerchantBindingsDB.deleteBinding.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.removeBinding(1)).rejects.toThrow('Delete failed');
      });
    });
  });

  describe('findByMerchantName', () => {
    it('finds binding by merchant name', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByMerchantName('YANDEX.GO, AM');
      });

      expect(MerchantBindingsDB.getByMerchantName).toHaveBeenCalledWith('YANDEX.GO, AM');
      expect(found).toEqual(mockBindings[0]);
    });

    it('returns null when binding not found', async () => {
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByMerchantName('UNKNOWN MERCHANT');
      });

      expect(found).toBeNull();
    });

    it('handles error gracefully', async () => {
      MerchantBindingsDB.getByMerchantName.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByMerchantName('YANDEX.GO, AM');
      });

      expect(found).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('updates last used timestamp', async () => {
      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateLastUsed(1);
      });

      expect(MerchantBindingsDB.updateLastUsed).toHaveBeenCalledWith(1);
      expect(MerchantBindingsDB.getAll).toHaveBeenCalledTimes(2); // Initial load + reload
    });

    it('handles error silently', async () => {
      MerchantBindingsDB.updateLastUsed.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not throw error
      await act(async () => {
        await result.current.updateLastUsed(1);
      });
    });
  });

  describe('Error Handling', () => {
    it('sets error state when loading fails', async () => {
      MerchantBindingsDB.getAll.mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Load failed');
    });

    it('clears error on successful reload', async () => {
      MerchantBindingsDB.getAll.mockRejectedValueOnce(new Error('Load failed')).mockResolvedValue(mockBindings);

      const { result } = renderHook(() => useMerchantBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Load failed');

      await act(async () => {
        await result.current.loadBindings();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
