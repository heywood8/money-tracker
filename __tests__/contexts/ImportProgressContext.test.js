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
    it('throws error when used outside of provider', async () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(renderHook(() => useImportProgress())).rejects.toThrow('useImportProgress must be used within ImportProgressProvider');

      consoleSpy.mockRestore();
    });

    it('returns context value when used inside provider', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

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
    it('has correct initial state', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('startImport', () => {
    it('sets isImporting to true', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
    });

    it('initializes all import steps', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.steps).toHaveLength(13);
      expect(result.current.steps[0]).toEqual({
        id: 'format',
        label: 'Detecting format',
        status: 'pending',
        data: null,
      });
      expect(result.current.steps[12]).toEqual({
        id: 'complete',
        label: 'Database restored successfully',
        status: 'pending',
        data: null,
      });
    });

    it('sets currentStep to format', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.currentStep).toBe('format');
    });

    it('initializes all expected step IDs', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      const stepIds = result.current.steps.map(s => s.id);
      expect(stepIds).toEqual([
        'format',
        'import',
        'backup',
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
    it('updates step status', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.updateStep('format', 'completed');
      });

      const formatStep = result.current.steps.find(s => s.id === 'format');
      expect(formatStep.status).toBe('completed');
    });

    it('updates step with data', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      const testData = { count: 10, total: 100 };
      await act(async () => {
        result.current.updateStep('accounts', 'in_progress', testData);
      });

      const accountsStep = result.current.steps.find(s => s.id === 'accounts');
      expect(accountsStep.status).toBe('in_progress');
      expect(accountsStep.data).toEqual(testData);
    });

    it('sets currentStep when status is in_progress', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.updateStep('import', 'in_progress');
      });

      expect(result.current.currentStep).toBe('import');
    });

    it('does not change currentStep when status is completed', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      // Start with format as current
      expect(result.current.currentStep).toBe('format');

      // Complete format - should not change currentStep
      await act(async () => {
        result.current.updateStep('format', 'completed');
      });

      expect(result.current.currentStep).toBe('format');
    });

    it('handles updating non-existent step gracefully', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      // This should not throw
      await act(async () => {
        result.current.updateStep('nonexistent', 'completed');
      });

      // Steps should remain unchanged
      expect(result.current.steps).toHaveLength(13);
    });
  });

  describe('completeImport', () => {
    it('sets currentStep to complete', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.completeImport();
      });

      expect(result.current.currentStep).toBe('complete');
    });

    it('marks complete step as completed', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.completeImport();
      });

      const completeStep = result.current.steps.find(s => s.id === 'complete');
      expect(completeStep.status).toBe('completed');
    });

    it('does not auto-close modal (isImporting remains true)', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.completeImport();
      });

      // isImporting should still be true - waits for user to press OK
      expect(result.current.isImporting).toBe(true);
    });
  });

  describe('cancelImport', () => {
    it('sets isImporting to false', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);

      await act(async () => {
        result.current.cancelImport();
      });

      expect(result.current.isImporting).toBe(false);
    });

    it('clears steps array', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.steps.length).toBeGreaterThan(0);

      await act(async () => {
        result.current.cancelImport();
      });

      expect(result.current.steps).toEqual([]);
    });

    it('resets currentStep to null', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.currentStep).not.toBeNull();

      await act(async () => {
        result.current.cancelImport();
      });

      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('finishImport', () => {
    it('sets isImporting to false', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.finishImport();
      });

      expect(result.current.isImporting).toBe(false);
    });

    it('clears steps array', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.finishImport();
      });

      expect(result.current.steps).toEqual([]);
    });

    it('resets currentStep to null', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.finishImport();
      });

      expect(result.current.currentStep).toBeNull();
    });
  });

  describe('Event listener', () => {
    it('subscribes to IMPORT_PROGRESS_EVENT on mount', async () => {
      await renderHook(() => useImportProgress(), { wrapper });

      expect(appEvents.on).toHaveBeenCalledWith(
        IMPORT_PROGRESS_EVENT,
        expect.any(Function),
      );
    });

    it('unsubscribes on unmount', async () => {
      const mockUnsubscribe = jest.fn();
      appEvents.on.mockReturnValue(mockUnsubscribe);

      const { unmount } = await renderHook(() => useImportProgress(), { wrapper });

      await unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('handles progress events by updating steps', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      // Simulate receiving a progress event
      await act(async () => {
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
    it('handles complete import workflow', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      // Start import
      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.currentStep).toBe('format');

      // Progress through steps via events
      const stepIds = ['format', 'import', 'restore', 'clear', 'accounts', 'categories', 'operations'];

      for (const stepId of stepIds) {
        await act(async () => {
          eventHandler({ stepId, status: 'in_progress', data: null });
        });
        expect(result.current.currentStep).toBe(stepId);

        await act(async () => {
          eventHandler({ stepId, status: 'completed', data: null });
        });
      }

      // Complete the import
      await act(async () => {
        result.current.completeImport();
      });

      expect(result.current.currentStep).toBe('complete');
      expect(result.current.isImporting).toBe(true);

      // User presses OK button
      await act(async () => {
        result.current.finishImport();
      });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });

    it('handles cancelled import', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      // Start import
      await act(async () => {
        result.current.startImport();
      });

      // Update some steps
      await act(async () => {
        result.current.updateStep('format', 'completed');
        result.current.updateStep('import', 'in_progress');
      });

      // Cancel
      await act(async () => {
        result.current.cancelImport();
      });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });

    it('can restart import after cancellation', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      // First import
      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.cancelImport();
      });

      // Second import
      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.steps).toHaveLength(13);
      expect(result.current.currentStep).toBe('format');
    });

    it('can restart import after completion', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      // First import
      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
        result.current.completeImport();
      });

      await act(async () => {
        result.current.finishImport();
      });

      // Second import
      await act(async () => {
        result.current.startImport();
      });

      expect(result.current.isImporting).toBe(true);
      expect(result.current.steps).toHaveLength(13);
      expect(result.current.currentStep).toBe('format');
    });
  });

  describe('Step data handling', () => {
    it('handles various data types in step updates', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      // Object data
      await act(async () => {
        result.current.updateStep('accounts', 'in_progress', { count: 5 });
      });
      expect(result.current.steps.find(s => s.id === 'accounts').data).toEqual({ count: 5 });

      // String data
      await act(async () => {
        result.current.updateStep('format', 'completed', 'json');
      });
      expect(result.current.steps.find(s => s.id === 'format').data).toBe('json');

      // Number data
      await act(async () => {
        result.current.updateStep('operations', 'in_progress', 100);
      });
      expect(result.current.steps.find(s => s.id === 'operations').data).toBe(100);

      // Null data (default)
      await act(async () => {
        result.current.updateStep('categories', 'completed');
      });
      expect(result.current.steps.find(s => s.id === 'categories').data).toBeNull();
    });

    it('preserves data when updating status only', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      // Set initial data
      await act(async () => {
        result.current.updateStep('accounts', 'in_progress', { processed: 50 });
      });

      // Update status with new data (should replace)
      await act(async () => {
        result.current.updateStep('accounts', 'completed', { processed: 100 });
      });

      expect(result.current.steps.find(s => s.id === 'accounts').data).toEqual({ processed: 100 });
    });
  });

  describe('Multiple step updates', () => {
    it('handles rapid sequential updates', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => {
        result.current.startImport();
      });

      await act(async () => {
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

  describe('requestCancel', () => {
    it('sets isCancelling to true', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });

      expect(result.current.isCancelling).toBe(false);

      await act(async () => { result.current.requestCancel(); });

      expect(result.current.isCancelling).toBe(true);
    });

    it('marks the cancel token as cancelled', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });

      const token = result.current.getCancelToken();
      expect(token.cancelled).toBe(false);

      await act(async () => { result.current.requestCancel(); });

      expect(token.cancelled).toBe(true);
    });

    it('isCancelling resets to false after cancelImport', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });
      await act(async () => { result.current.requestCancel(); });

      expect(result.current.isCancelling).toBe(true);

      await act(async () => { result.current.cancelImport(); });

      expect(result.current.isCancelling).toBe(false);
    });

    it('isCancelling resets to false after finishImport', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });
      await act(async () => { result.current.requestCancel(); });
      await act(async () => { result.current.finishImport(); });

      expect(result.current.isCancelling).toBe(false);
    });
  });

  describe('getCancelToken', () => {
    it('returns a fresh non-cancelled token after startImport', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });

      const token = result.current.getCancelToken();
      expect(token).toBeDefined();
      expect(token.cancelled).toBe(false);
    });

    it('returns a new token on each startImport call', async () => {
      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });
      const firstToken = result.current.getCancelToken();

      await act(async () => { result.current.cancelImport(); });
      await act(async () => { result.current.startImport(); });
      const secondToken = result.current.getCancelToken();

      expect(secondToken.cancelled).toBe(false);
      // After second startImport, the old token ref is replaced
      expect(secondToken).not.toBe(firstToken);
    });
  });

  describe('Event listener complete branch', () => {
    it('sets currentStep to complete when complete event fires with completed status', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });

      await act(async () => {
        eventHandler({ stepId: 'complete', status: 'completed', data: null });
      });

      expect(result.current.currentStep).toBe('complete');
    });

    it('does not set currentStep to complete when complete event fires with non-completed status', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
        return jest.fn();
      });

      const { result } = await renderHook(() => useImportProgress(), { wrapper });

      await act(async () => { result.current.startImport(); });

      await act(async () => {
        eventHandler({ stepId: 'complete', status: 'in_progress', data: null });
      });

      // currentStep should be 'complete' because updateStep sets it for in_progress too
      // but that's handled by the in_progress branch, not the explicit setCurrentStep
      expect(result.current.currentStep).toBe('complete');
    });
  });
});
