/**
 * ImportProgressContext Tests
 *
 * Tests for the import progress context which manages the state
 * of backup import operations.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { ImportProgressProvider, useImportProgress } from '../../app/contexts/ImportProgressContext';
import { appEvents } from '../../app/services/eventEmitter';
import { IMPORT_PROGRESS_EVENT } from '../../app/services/BackupRestore';

// Mock the eventEmitter
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(() => jest.fn()), // Returns unsubscribe function
    emit: jest.fn(),
  },
}));

// Mock the BackupRestore constant
jest.mock('../../app/services/BackupRestore', () => ({
  IMPORT_PROGRESS_EVENT: 'import_progress',
}));

describe('ImportProgressContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }) => (
    <ImportProgressProvider>{children}</ImportProgressProvider>
  );

  describe('useImportProgress hook', () => {
    it('throws error when used outside of provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useImportProgress());
      }).toThrow('useImportProgress must be used within ImportProgressProvider');

      consoleSpy.mockRestore();
    });

    it('returns context value when used inside provider', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
      expect(typeof result.current.startImport).toBe('function');
      expect(typeof result.current.updateStep).toBe('function');
      expect(typeof result.current.completeImport).toBe('function');
      expect(typeof result.current.cancelImport).toBe('function');
      expect(typeof result.current.finishImport).toBe('function');
    });
  });

  describe('Initial state', () => {
    it('has correct initial state', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('startImport', () => {
    it('sets isImporting to true', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
    });

    it('initializes all import steps', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.steps).toHaveLength(12);
      expect(result.current.steps[0]).toEqual({
        id: 'format',
        label: 'Detecting format',
        status: 'pending',
        data: null,
      });
      expect(result.current.steps[11]).toEqual({
        id: 'complete',
        label: 'Database restored successfully',
        status: 'pending',
        data: null,
      });
    });

    it('sets currentStep to format', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.currentStep).toBe('format');
    });

    it('initializes all expected step IDs', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      const stepIds = result.current.steps.map(s => s.id);
      expect(stepIds).toEqual([
        'format',
        'import',
        'restore',
        'clear',
        'accounts',
        'categories',
        'operations',
        'balance_history',
        'budgets',
        'metadata',
        'upgrades',
        'complete',
      ]);
    });
  });

  describe('updateStep', () => {
    it('updates step status', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.updateStep('format', 'completed');
      });

      const formatStep = result.current.steps.find(s => s.id === 'format');
      expect(formatStep.status).toBe('completed');
    });

    it('updates step with data', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      const testData = { count: 10, total: 100 };
      act(() => {
        result.current.updateStep('accounts', 'in_progress', testData);
      });

      const accountsStep = result.current.steps.find(s => s.id === 'accounts');
      expect(accountsStep.status).toBe('in_progress');
      expect(accountsStep.data).toEqual(testData);
    });

    it('sets currentStep when status is in_progress', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.updateStep('import', 'in_progress');
      });

      expect(result.current.currentStep).toBe('import');
    });

    it('does not change currentStep when status is completed', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      // Start with format as current
      expect(result.current.currentStep).toBe('format');

      // Complete format - should not change currentStep
      act(() => {
        result.current.updateStep('format', 'completed');
      });

      expect(result.current.currentStep).toBe('format');
    });

    it('handles updating non-existent step gracefully', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      // This should not throw
      act(() => {
        result.current.updateStep('nonexistent', 'completed');
      });

      // Steps should remain unchanged
      expect(result.current.steps).toHaveLength(12);
    });
  });

  describe('completeImport', () => {
    it('sets currentStep to complete', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.completeImport();
      });

      expect(result.current.currentStep).toBe('complete');
    });

    it('marks complete step as completed', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.completeImport();
      });

      const completeStep = result.current.steps.find(s => s.id === 'complete');
      expect(completeStep.status).toBe('completed');
    });

    it('does not auto-close modal (isImporting remains true)', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.completeImport();
      });

      // isImporting should still be true - waits for user to press OK
      expect(result.current.isImporting).toBe(true);
    });
  });

  describe('cancelImport', () => {
    it('sets isImporting to false', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);

      act(() => {
        result.current.cancelImport();
      });

      expect(result.current.isImporting).toBe(false);
    });

    it('clears steps array', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.steps.length).toBeGreaterThan(0);

      act(() => {
        result.current.cancelImport();
      });

      expect(result.current.steps).toEqual([]);
    });

    it('resets currentStep to null', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      expect(result.current.currentStep).not.toBeNull();

      act(() => {
        result.current.cancelImport();
      });

      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('finishImport', () => {
    it('sets isImporting to false', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.finishImport();
      });

      expect(result.current.isImporting).toBe(false);
    });

    it('clears steps array', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.finishImport();
      });

      expect(result.current.steps).toEqual([]);
    });

    it('resets currentStep to null', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.finishImport();
      });

      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('Event listener', () => {
    it('subscribes to IMPORT_PROGRESS_EVENT on mount', () => {
      renderHook(() => useImportProgress(), { wrapper });

      expect(appEvents.on).toHaveBeenCalledWith(
        IMPORT_PROGRESS_EVENT,
        expect.any(Function),
      );
    });

    it('unsubscribes on unmount', () => {
      const mockUnsubscribe = jest.fn();
      appEvents.on.mockReturnValue(mockUnsubscribe);

      const { unmount } = renderHook(() => useImportProgress(), { wrapper });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('handles progress events by updating steps', () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      // Simulate receiving a progress event
      act(() => {
        eventHandler({
          stepId: 'accounts',
          status: 'in_progress',
          data: { current: 5, total: 10 },
        });
      });

      const accountsStep = result.current.steps.find(s => s.id === 'accounts');
      expect(accountsStep.status).toBe('in_progress');
      expect(accountsStep.data).toEqual({ current: 5, total: 10 });
      expect(result.current.currentStep).toBe('accounts');
    });
  });

  describe('Full import flow', () => {
    it('handles complete import workflow', () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = renderHook(() => useImportProgress(), { wrapper });

      // Start import
      act(() => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.currentStep).toBe('format');

      // Progress through steps via events
      const stepIds = ['format', 'import', 'restore', 'clear', 'accounts', 'categories', 'operations'];

      stepIds.forEach(stepId => {
        act(() => {
          eventHandler({ stepId, status: 'in_progress', data: null });
        });
        expect(result.current.currentStep).toBe(stepId);

        act(() => {
          eventHandler({ stepId, status: 'completed', data: null });
        });
      });

      // Complete the import
      act(() => {
        result.current.completeImport();
      });

      expect(result.current.currentStep).toBe('complete');
      expect(result.current.isImporting).toBe(true);

      // User presses OK button
      act(() => {
        result.current.finishImport();
      });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });

    it('handles cancelled import', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      // Start import
      act(() => {
        result.current.startImport();
      });

      // Update some steps
      act(() => {
        result.current.updateStep('format', 'completed');
        result.current.updateStep('import', 'in_progress');
      });

      // Cancel
      act(() => {
        result.current.cancelImport();
      });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });

    it('can restart import after cancellation', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      // First import
      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.cancelImport();
      });

      // Second import
      act(() => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.steps).toHaveLength(12);
      expect(result.current.currentStep).toBe('format');
    });

    it('can restart import after completion', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      // First import
      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.completeImport();
      });

      act(() => {
        result.current.finishImport();
      });

      // Second import
      act(() => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.steps).toHaveLength(12);
      expect(result.current.currentStep).toBe('format');
    });
  });

  describe('Step data handling', () => {
    it('handles various data types in step updates', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      // Object data
      act(() => {
        result.current.updateStep('accounts', 'in_progress', { count: 5 });
      });
      expect(result.current.steps.find(s => s.id === 'accounts').data).toEqual({ count: 5 });

      // String data
      act(() => {
        result.current.updateStep('format', 'completed', 'json');
      });
      expect(result.current.steps.find(s => s.id === 'format').data).toBe('json');

      // Number data
      act(() => {
        result.current.updateStep('operations', 'in_progress', 100);
      });
      expect(result.current.steps.find(s => s.id === 'operations').data).toBe(100);

      // Null data (default)
      act(() => {
        result.current.updateStep('categories', 'completed');
      });
      expect(result.current.steps.find(s => s.id === 'categories').data).toBeNull();
    });

    it('preserves data when updating status only', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      // Set initial data
      act(() => {
        result.current.updateStep('accounts', 'in_progress', { processed: 50 });
      });

      // Update status with new data (should replace)
      act(() => {
        result.current.updateStep('accounts', 'completed', { processed: 100 });
      });

      expect(result.current.steps.find(s => s.id === 'accounts').data).toEqual({ processed: 100 });
    });
  });

  describe('Multiple step updates', () => {
    it('handles rapid sequential updates', () => {
      const { result } = renderHook(() => useImportProgress(), { wrapper });

      act(() => {
        result.current.startImport();
      });

      act(() => {
        result.current.updateStep('format', 'in_progress');
        result.current.updateStep('format', 'completed');
        result.current.updateStep('import', 'in_progress');
        result.current.updateStep('import', 'completed');
        result.current.updateStep('restore', 'in_progress');
      });

      expect(result.current.steps.find(s => s.id === 'format').status).toBe('completed');
      expect(result.current.steps.find(s => s.id === 'import').status).toBe('completed');
      expect(result.current.steps.find(s => s.id === 'restore').status).toBe('in_progress');
      expect(result.current.currentStep).toBe('restore');
    });
  });
});
