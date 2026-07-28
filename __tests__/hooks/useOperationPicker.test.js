import { renderHook, act } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import useOperationPicker from '../../app/hooks/useOperationPicker';

// Mock Keyboard
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return Object.defineProperty(RN, 'Keyboard', {
    value: {
      dismiss: jest.fn(),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
    },
    writable: false,
  });
});

// Folder navigation is NOT tested here any more: the hook only tracks which
// picker is open, and walking the category tree belongs to CategoryGridSelector
// (see __tests__/components/CategoryGridSelector.test.js).
describe('useOperationPicker', () => {
  const mockCategories = [
    { id: 'cat-1', name: 'Food', nameKey: 'food', parentId: null, type: 'folder' },
    { id: 'cat-2', name: 'Groceries', parentId: 'cat-1', type: 'entry' },
    { id: 'cat-3', name: 'Income', parentId: null, type: 'entry' },
  ];

  const mockAccounts = [
    { id: 'acc-1', name: 'Checking', currency: 'USD' },
    { id: 'acc-2', name: 'Savings', currency: 'EUR' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      expect(result.current.pickerState).toEqual({
        visible: false,
        type: null,
        data: [],
      });
    });
  });

  describe('openPicker', () => {
    it('should open picker for non-category type', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      await act(async () => {
        result.current.openPicker('account', mockAccounts);
      });

      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(result.current.pickerState).toEqual({
        visible: true,
        type: 'account',
        data: mockAccounts,
      });
    });

    it('hands the category picker the whole tree, not one level of it', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      await act(async () => {
        result.current.openPicker('category', mockCategories);
      });

      expect(result.current.pickerState.visible).toBe(true);
      expect(result.current.pickerState.type).toBe('category');
      // Nested categories included — the grid decides what to show at each level.
      expect(result.current.pickerState.data).toEqual(mockCategories);
    });
  });

  describe('closePicker', () => {
    it('should close picker and reset state', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      await act(async () => {
        result.current.openPicker('account', mockAccounts);
      });

      expect(result.current.pickerState.visible).toBe(true);

      await act(async () => {
        result.current.closePicker();
      });

      expect(result.current.pickerState).toEqual({
        visible: false,
        type: null,
        data: [],
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty category list', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      await act(async () => {
        result.current.openPicker('category', []);
      });

      expect(result.current.pickerState.data).toEqual([]);
    });

    it('replaces the previous picker rather than merging into it', async () => {
      const { result } = await renderHook(() => useOperationPicker());

      await act(async () => {
        result.current.openPicker('category', mockCategories);
      });

      await act(async () => {
        result.current.openPicker('account', mockAccounts);
      });

      expect(result.current.pickerState).toEqual({
        visible: true,
        type: 'account',
        data: mockAccounts,
      });
    });
  });
});
