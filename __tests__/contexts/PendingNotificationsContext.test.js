/**
 * Tests for PendingNotificationsContext
 * Tests the notification queue management and processing orchestration
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { PendingNotificationsProvider, usePendingNotifications } from '../../app/contexts/PendingNotificationsContext';
import { CardBindingsProvider } from '../../app/contexts/CardBindingsContext';
import { MerchantBindingsProvider } from '../../app/contexts/MerchantBindingsContext';
import { OperationsProvider } from '../../app/contexts/OperationsContext';
import { AccountsProvider } from '../../app/contexts/AccountsContext';
import { DialogProvider } from '../../app/contexts/DialogContext';
import { notificationProcessor, ProcessingStatus } from '../../app/services/notification/NotificationProcessor';
import { parseNotification } from '../../app/services/notification/NotificationParser';
import { NOTIFICATION_EVENTS } from '../../app/services/notification/NotificationListener';
import { appEvents } from '../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../app/services/notification/NotificationProcessor');
jest.mock('../../app/services/notification/NotificationParser');
jest.mock('../../app/services/CardBindingsDB');
jest.mock('../../app/services/MerchantBindingsDB');
jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/BudgetsDB');
jest.mock('../../app/components/MaterialDialog', () => 'MaterialDialog');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('PendingNotificationsContext', () => {
  // Create wrapper with all required providers
  const wrapper = ({ children }) => (
    <DialogProvider>
      <AccountsProvider>
        <CardBindingsProvider>
          <MerchantBindingsProvider>
            <OperationsProvider>
              <PendingNotificationsProvider>
                {children}
              </PendingNotificationsProvider>
            </OperationsProvider>
          </MerchantBindingsProvider>
        </CardBindingsProvider>
      </AccountsProvider>
    </DialogProvider>
  );

  const mockParsedNotification = {
    type: 'expense',
    amount: '1300.00',
    currency: 'AMD',
    cardMask: '4083***7027',
    merchantName: 'YANDEX.GO',
    date: '2024-12-18',
    rawText: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
    bankName: 'ARCA',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('provides pending notifications context', () => {
      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      expect(result.current.pendingQueue).toBeDefined();
      expect(result.current.activeModal).toBeDefined();
      expect(result.current.isProcessing).toBeDefined();
      expect(result.current.processRawNotification).toBeDefined();
      expect(result.current.retryPendingNotification).toBeDefined();
    });

    it('throws error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePendingNotifications());
      }).toThrow('usePendingNotifications must be used within a PendingNotificationsProvider');

      consoleSpy.mockRestore();
    });

    it('initializes with empty queue', () => {
      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      expect(result.current.pendingQueue).toEqual([]);
      expect(result.current.activeModal).toBeNull();
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('Processing Notifications', () => {
    it('successfully processes notification with all bindings', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.SUCCESS,
        message: 'Operation created successfully',
        operation: { id: 1, ...mockParsedNotification },
        parsed: mockParsedNotification,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      expect(parseNotification).toHaveBeenCalled();
      expect(notificationProcessor.processNotification).toHaveBeenCalled();
      expect(result.current.pendingQueue).toEqual([]); // No pending items
    });

    it('adds notification to queue when card binding missing', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      const pendingItem = result.current.pendingQueue[0];
      expect(pendingItem.status).toBe(ProcessingStatus.MISSING_CARD_BINDING);
      expect(pendingItem.missingBindings.card).toBe(true);
      expect(pendingItem.missingBindings.merchant).toBe(false);
    });

    it('adds notification to queue when merchant binding missing', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_MERCHANT_BINDING,
        message: 'Missing merchant binding',
        parsed: mockParsedNotification,
        cardBinding: { id: 1, accountId: 1 },
        merchantBinding: null,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      const pendingItem = result.current.pendingQueue[0];
      expect(pendingItem.status).toBe(ProcessingStatus.MISSING_MERCHANT_BINDING);
      expect(pendingItem.missingBindings.card).toBe(false);
      expect(pendingItem.missingBindings.merchant).toBe(true);
    });

    it('adds notification to queue when both bindings missing', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_BOTH_BINDINGS,
        message: 'Missing both bindings',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: null,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      const pendingItem = result.current.pendingQueue[0];
      expect(pendingItem.status).toBe(ProcessingStatus.MISSING_BOTH_BINDINGS);
      expect(pendingItem.missingBindings.card).toBe(true);
      expect(pendingItem.missingBindings.merchant).toBe(true);
    });

    it('ignores duplicate notifications', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.DUPLICATE,
        message: 'Duplicate notification',
        parsed: mockParsedNotification,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      expect(result.current.pendingQueue).toEqual([]); // Not added to queue
    });

    it('handles parsing failure', async () => {
      parseNotification.mockReturnValue(null);

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'Unknown Bank',
          body: 'Unparseable notification',
        });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      expect(result.current.pendingQueue).toEqual([]);
      expect(notificationProcessor.processNotification).not.toHaveBeenCalled();
    });
  });

  describe('Modal Management', () => {
    it('shows card binding modal when card binding missing', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.activeModal).not.toBeNull();
      });

      expect(result.current.activeModal.type).toBe('card');
      expect(result.current.activeModal.parsed).toEqual(mockParsedNotification);
    });

    it('shows merchant binding modal when merchant binding missing', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_MERCHANT_BINDING,
        message: 'Missing merchant binding',
        parsed: mockParsedNotification,
        cardBinding: { id: 1, accountId: 1 },
        merchantBinding: null,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.activeModal).not.toBeNull();
      });

      expect(result.current.activeModal.type).toBe('merchant');
    });

    it('closes modal', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.activeModal).not.toBeNull();
      });

      act(() => {
        result.current.closeBindingModal();
      });

      expect(result.current.activeModal).toBeNull();
    });
  });

  describe('Queue Management', () => {
    it('clears entire queue', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      // Add items to queue
      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      // Clear queue
      act(() => {
        result.current.clearQueue();
      });

      expect(result.current.pendingQueue).toEqual([]);
      expect(result.current.activeModal).toBeNull();
    });

    it('dismisses individual notification', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      const notificationId = result.current.pendingQueue[0].id;

      act(() => {
        result.current.dismissNotification(notificationId);
      });

      expect(result.current.pendingQueue).toEqual([]);
    });

    it('gets pending count', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      expect(result.current.getPendingCount()).toBe(0);

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.getPendingCount()).toBe(1);
      });
    });
  });

  describe('Retry Processing', () => {
    it('retries pending notification successfully', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);

      // First attempt - missing binding
      notificationProcessor.processNotification.mockResolvedValueOnce({
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: 'Missing card binding',
        parsed: mockParsedNotification,
        cardBinding: null,
        merchantBinding: { id: 1, categoryId: 'cat1' },
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.processRawNotification({
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(1);
      });

      const notificationId = result.current.pendingQueue[0].id;

      // Retry - now successful
      notificationProcessor.retryProcessing.mockResolvedValue({
        status: ProcessingStatus.SUCCESS,
        message: 'Operation created successfully',
        operation: { id: 1 },
        parsed: mockParsedNotification,
      });

      await act(async () => {
        await result.current.retryPendingNotification(notificationId);
      });

      await waitFor(() => {
        expect(result.current.pendingQueue.length).toBe(0);
      });
    });

    it('handles retry when notification not in queue', async () => {
      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      await act(async () => {
        await result.current.retryPendingNotification('nonexistent-id');
      });

      // Should not throw error
      expect(result.current.pendingQueue).toEqual([]);
    });
  });

  describe('Event Listeners', () => {
    it('listens to bank notification events', async () => {
      parseNotification.mockReturnValue(mockParsedNotification);
      notificationProcessor.processNotification.mockResolvedValue({
        status: ProcessingStatus.SUCCESS,
        message: 'Operation created successfully',
        operation: { id: 1 },
        parsed: mockParsedNotification,
      });

      const { result } = renderHook(() => usePendingNotifications(), { wrapper });

      // Emit bank notification event
      await act(async () => {
        appEvents.emit(NOTIFICATION_EVENTS.BANK_NOTIFICATION, {
          title: 'ARCA transactions',
          body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM',
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(parseNotification).toHaveBeenCalled();
      });
    });
  });
});
