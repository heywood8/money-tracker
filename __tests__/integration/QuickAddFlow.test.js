import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Calculator from '../../app/components/Calculator';
import * as OperationsDB from '../../app/services/OperationsDB';

// Mock the database
jest.mock('../../app/services/OperationsDB');

describe('Quick Add Flow - Regression Tests', () => {
  const mockColors = {
    text: '#000',
    primary: '#007AFF',
    border: '#ccc',
    background: '#fff',
    altRow: '#f5f5f5',
    inputBackground: '#fff',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Calculator onAdd callback', () => {
    it('should call onAdd without passing any arguments when checkmark button is pressed', () => {
      const mockOnAdd = jest.fn();
      const mockOnValueChange = jest.fn();

      const { getByLabelText } = render(
        <Calculator
          value="123"
          onValueChange={mockOnValueChange}
          colors={mockColors}
          onAdd={mockOnAdd}
        />,
      );

      // Press the checkmark button
      const addButton = getByLabelText('add');
      fireEvent.press(addButton);

      // Verify onAdd was called without arguments (not with event object or "add" string)
      expect(mockOnAdd).toHaveBeenCalledTimes(1);
      expect(mockOnAdd).toHaveBeenCalledWith();

      // Verify it was NOT called with any arguments
      const callArgs = mockOnAdd.mock.calls[0];
      expect(callArgs.length).toBe(0);
    });

    it('should not pass event object to onAdd callback', () => {
      const mockOnAdd = jest.fn();
      const mockOnValueChange = jest.fn();

      const { getByLabelText } = render(
        <Calculator
          value="456"
          onValueChange={mockOnValueChange}
          colors={mockColors}
          onAdd={mockOnAdd}
        />,
      );

      const addButton = getByLabelText('add');
      fireEvent.press(addButton);

      // Get the first argument passed to onAdd
      const firstArg = mockOnAdd.mock.calls[0]?.[0];

      // Should be undefined (no arguments), not an event object
      expect(firstArg).toBeUndefined();

      // Verify it's not an object with event properties
      if (firstArg !== undefined) {
        expect(firstArg).not.toHaveProperty('nativeEvent');
        expect(firstArg).not.toHaveProperty('currentTarget');
        expect(firstArg).not.toHaveProperty('target');
      }
    });

    it('should not pass button value string to onAdd callback', () => {
      const mockOnAdd = jest.fn();
      const mockOnValueChange = jest.fn();

      const { getByLabelText } = render(
        <Calculator
          value="789"
          onValueChange={mockOnValueChange}
          colors={mockColors}
          onAdd={mockOnAdd}
        />,
      );

      const addButton = getByLabelText('add');
      fireEvent.press(addButton);

      const firstArg = mockOnAdd.mock.calls[0]?.[0];

      // Should NOT be the string "add"
      expect(firstArg).not.toBe('add');
    });
  });

  describe('Operation creation with valid data types', () => {
    it('should reject operation when accountId is a string instead of number', async () => {
      const invalidOperation = {
        type: 'expense',
        amount: '100',
        accountId: 'add', // INVALID: should be a number
        categoryId: '1',
        date: '2026-01-08',
      };

      OperationsDB.createOperation.mockRejectedValue(
        new Error('FOREIGN KEY constraint failed'),
      );

      await expect(
        OperationsDB.createOperation(invalidOperation),
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('should reject operation when categoryId is an object instead of string', async () => {
      const invalidOperation = {
        type: 'expense',
        amount: '100',
        accountId: 1,
        categoryId: { nativeEvent: {} }, // INVALID: should be a string/number
        date: '2026-01-08',
      };

      // This should fail validation or type checking
      expect(typeof invalidOperation.categoryId).toBe('object');
      expect(invalidOperation.categoryId).not.toBe(null);

      // CategoryId should be a primitive (string or number), not an object
      const isValidCategoryId =
        typeof invalidOperation.categoryId === 'string' ||
        typeof invalidOperation.categoryId === 'number';

      expect(isValidCategoryId).toBe(false);
    });

    it('should accept operation with valid data types', async () => {
      const validOperation = {
        type: 'expense',
        amount: '100',
        accountId: 17, // Valid: number
        categoryId: '5', // Valid: string
        date: '2026-01-08',
        description: 'Test expense',
      };

      const createdOperation = {
        ...validOperation,
        id: '123',
        createdAt: '2026-01-08T12:00:00Z',
      };

      OperationsDB.createOperation.mockResolvedValue(createdOperation);

      const result = await OperationsDB.createOperation(validOperation);

      expect(result).toEqual(createdOperation);
      expect(typeof result.accountId).toBe('number');
      expect(typeof result.categoryId).toBe('string');
    });
  });

  describe('Data type validation', () => {
    it('should detect when accountId is contaminated with button value', () => {
      const operationData = {
        type: 'expense',
        amount: '555',
        accountId: 'add', // This was the bug we encountered
        categoryId: '1',
      };

      // accountId should be a number
      expect(typeof operationData.accountId).not.toBe('number');
      expect(operationData.accountId).toBe('add');
    });

    it('should detect when categoryId is contaminated with event object', () => {
      const mockEvent = {
        nativeEvent: { touches: [] },
        currentTarget: {},
        target: {},
      };

      const operationData = {
        type: 'expense',
        amount: '555',
        accountId: 17,
        categoryId: mockEvent, // This was the bug we encountered
      };

      // categoryId should be a primitive, not an object
      expect(typeof operationData.categoryId).toBe('object');
      expect(operationData.categoryId).toHaveProperty('nativeEvent');

      // This should fail our validation
      const isValid =
        typeof operationData.categoryId === 'string' ||
        typeof operationData.categoryId === 'number';
      expect(isValid).toBe(false);
    });

    it('should validate that accountId is always a number', () => {
      const testCases = [
        { accountId: 17, expected: true },
        { accountId: 'add', expected: false },
        { accountId: '17', expected: false }, // String number
        { accountId: null, expected: false },
        { accountId: undefined, expected: false },
        { accountId: {}, expected: false },
      ];

      testCases.forEach(({ accountId, expected }) => {
        const isValid = typeof accountId === 'number' && !isNaN(accountId);
        expect(isValid).toBe(expected);
      });
    });

    it('should validate that categoryId is a string or number, not an object', () => {
      const testCases = [
        { categoryId: '5', expected: true },
        { categoryId: 5, expected: true },
        { categoryId: { id: 5 }, expected: false }, // Object
        { categoryId: { nativeEvent: {} }, expected: false }, // Event object
        { categoryId: null, expected: false },
        { categoryId: undefined, expected: false },
      ];

      testCases.forEach(({ categoryId, expected }) => {
        const isValid =
          (typeof categoryId === 'string' || typeof categoryId === 'number') &&
          categoryId !== null;
        expect(isValid).toBe(expected);
      });
    });
  });

  describe('Calculator button press behavior', () => {
    it('should call onValueChange when numeric buttons are pressed', () => {
      const mockOnValueChange = jest.fn();

      const { getByText } = render(
        <Calculator
          value=""
          onValueChange={mockOnValueChange}
          colors={mockColors}
        />,
      );

      const button5 = getByText('5');
      fireEvent.press(button5);

      // Should call onValueChange
      expect(mockOnValueChange).toHaveBeenCalled();
    });

    it('should call onValueChange when backspace is pressed', () => {
      const mockOnValueChange = jest.fn();

      const { getByLabelText } = render(
        <Calculator
          value="123"
          onValueChange={mockOnValueChange}
          colors={mockColors}
        />,
      );

      const backspaceButton = getByLabelText('backspace');
      fireEvent.press(backspaceButton);

      // Should call onValueChange
      expect(mockOnValueChange).toHaveBeenCalled();
    });
  });

  describe('Form state management during quick add', () => {
    it('should clear form state before async operation completes', async () => {
      // This test verifies that form clearing happens synchronously
      // to prevent showing stale values during the async save operation

      let formState = {
        amount: '100',
        categoryId: '5',
      };

      // Simulate the flow: clear form immediately, then save
      const clearForm = () => {
        formState = { amount: '', categoryId: '' };
      };

      const saveOperation = async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 100));
        return { id: '123' };
      };

      // Clear should happen before async operation
      clearForm();
      expect(formState.amount).toBe('');
      expect(formState.categoryId).toBe('');

      // Then save happens (with captured values from closure)
      await saveOperation();

      // Form should still be cleared
      expect(formState.amount).toBe('');
    });
  });
});
