/**
 * Tests for CardBindingsContext - Card bindings management context
 * Tests loading, creating, updating, deleting, and finding card bindings
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { CardBindingsProvider, useCardBindings } from '../../app/contexts/CardBindingsContext';
import * as CardBindingsDB from '../../app/services/CardBindingsDB';
import { DialogProvider } from '../../app/contexts/DialogContext';

// Mock the database service
jest.mock('../../app/services/CardBindingsDB');

// Mock MaterialDialog
jest.mock('../../app/components/MaterialDialog', () => 'MaterialDialog');

describe('CardBindingsContext', () => {
  const wrapper = ({ children }) => (
    <DialogProvider>
      <CardBindingsProvider>{children}</CardBindingsProvider>
    </DialogProvider>
  );

  const mockBindings = [
    {
      id: 1,
      cardMask: '4083***7027',
      accountId: 1,
      bankName: 'ARCA',
      lastUsed: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      cardMask: '5321***1234',
      accountId: 2,
      bankName: 'ACBA',
      lastUsed: '2025-01-02T00:00:00.000Z',
      createdAt: '2025-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    CardBindingsDB.getAll.mockResolvedValue(mockBindings);
    CardBindingsDB.create.mockImplementation((cardMask, accountId, bankName) =>
      Promise.resolve({
        id: 3,
        cardMask,
        accountId,
        bankName,
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
    );
    CardBindingsDB.update.mockResolvedValue();
    CardBindingsDB.deleteBinding.mockResolvedValue();
    CardBindingsDB.getByCardMask.mockResolvedValue(mockBindings[0]);
    CardBindingsDB.updateLastUsed.mockResolvedValue();
  });

  describe('Initialization', () => {
    it('provides card bindings context', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.bindings).toBeDefined();
      expect(result.current.addBinding).toBeDefined();
      expect(result.current.updateBinding).toBeDefined();
      expect(result.current.removeBinding).toBeDefined();
      expect(result.current.findByCardMask).toBeDefined();
    });

    it('throws error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useCardBindings());
      }).toThrow('useCardBindings must be used within a CardBindingsProvider');

      consoleSpy.mockRestore();
    });

    it('loads bindings on mount', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(CardBindingsDB.getAll).toHaveBeenCalled();
      expect(result.current.bindings).toEqual(mockBindings);
    });

    it('sets loading state during initialization', () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      expect(result.current.loading).toBe(true);
    });
  });

  describe('addBinding', () => {
    it('adds a new card binding', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let newBinding;
      await act(async () => {
        newBinding = await result.current.addBinding('6789***4321', 3, 'INECO');
      });

      expect(CardBindingsDB.create).toHaveBeenCalledWith('6789***4321', 3, 'INECO');
      expect(newBinding).toBeDefined();
      expect(newBinding.cardMask).toBe('6789***4321');
      expect(result.current.bindings).toHaveLength(3);
    });

    it('adds binding without bank name', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addBinding('6789***4321', 3);
      });

      expect(CardBindingsDB.create).toHaveBeenCalledWith('6789***4321', 3, null);
    });

    it('handles error when adding binding fails', async () => {
      CardBindingsDB.create.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.addBinding('6789***4321', 3)).rejects.toThrow('Database error');
      });
    });
  });

  describe('updateBinding', () => {
    it('updates an existing card binding', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateBinding(1, 5);
      });

      expect(CardBindingsDB.update).toHaveBeenCalledWith(1, 5);
      expect(CardBindingsDB.getAll).toHaveBeenCalledTimes(2); // Initial load + reload after update
    });

    it('handles error when updating binding fails', async () => {
      CardBindingsDB.update.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.updateBinding(1, 5)).rejects.toThrow('Update failed');
      });
    });
  });

  describe('removeBinding', () => {
    it('removes a card binding', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.removeBinding(1);
      });

      expect(CardBindingsDB.deleteBinding).toHaveBeenCalledWith(1);
      expect(result.current.bindings).toHaveLength(1);
      expect(result.current.bindings.find(b => b.id === 1)).toBeUndefined();
    });

    it('handles error when removing binding fails', async () => {
      CardBindingsDB.deleteBinding.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.removeBinding(1)).rejects.toThrow('Delete failed');
      });
    });
  });

  describe('findByCardMask', () => {
    it('finds binding by card mask', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByCardMask('4083***7027');
      });

      expect(CardBindingsDB.getByCardMask).toHaveBeenCalledWith('4083***7027');
      expect(found).toEqual(mockBindings[0]);
    });

    it('returns null when binding not found', async () => {
      CardBindingsDB.getByCardMask.mockResolvedValue(null);

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByCardMask('9999***9999');
      });

      expect(found).toBeNull();
    });

    it('handles error gracefully', async () => {
      CardBindingsDB.getByCardMask.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let found;
      await act(async () => {
        found = await result.current.findByCardMask('4083***7027');
      });

      expect(found).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('updates last used timestamp', async () => {
      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateLastUsed(1);
      });

      expect(CardBindingsDB.updateLastUsed).toHaveBeenCalledWith(1);
      expect(CardBindingsDB.getAll).toHaveBeenCalledTimes(2); // Initial load + reload
    });

    it('handles error silently', async () => {
      CardBindingsDB.updateLastUsed.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

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
      CardBindingsDB.getAll.mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() => useCardBindings(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Load failed');
    });

    it('clears error on successful reload', async () => {
      CardBindingsDB.getAll.mockRejectedValueOnce(new Error('Load failed')).mockResolvedValue(mockBindings);

      const { result } = renderHook(() => useCardBindings(), { wrapper });

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
