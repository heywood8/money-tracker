import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { notificationProcessor, ProcessingStatus } from '../services/notification/NotificationProcessor';
import { parseNotification } from '../services/notification/NotificationParser';
import { NOTIFICATION_EVENTS } from '../services/notification/NotificationListener';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useCardBindings } from './CardBindingsContext';
import { useMerchantBindings } from './MerchantBindingsContext';
import { useOperations } from './OperationsContext';
import { useDialog } from './DialogContext';

/**
 * PendingNotificationsContext manages the queue of notifications
 * awaiting user input (bindings) before they can be processed into operations.
 *
 * Flow:
 * 1. Notification received → parsed
 * 2. Check bindings via NotificationProcessor
 * 3. If bindings missing → add to queue and show modal
 * 4. User creates binding → retry processing
 * 5. If successful → remove from queue
 */
const PendingNotificationsContext = createContext();

export const usePendingNotifications = () => {
  const context = useContext(PendingNotificationsContext);
  if (!context) {
    throw new Error('usePendingNotifications must be used within a PendingNotificationsProvider');
  }
  return context;
};

export const PendingNotificationsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { reloadOperations } = useOperations();
  const { findByCardMask } = useCardBindings();
  const { findByMerchantName } = useMerchantBindings();

  // Queue of pending notifications
  // Each item: { id, parsed, status, missingBindings, timestamp, result }
  const [pendingQueue, setPendingQueue] = useState([]);

  // Currently active modal for binding selection
  const [activeModal, setActiveModal] = useState(null);
  // { type: 'card' | 'merchant', parsed, onComplete }

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);

  // Counter for generating unique IDs
  const notificationIdCounter = useRef(0);

  /**
   * Generate unique ID for pending notification
   */
  const generateNotificationId = useCallback(() => {
    notificationIdCounter.current += 1;
    return `notif_${Date.now()}_${notificationIdCounter.current}`;
  }, []);

  /**
   * Add notification to pending queue
   */
  const addToPendingQueue = useCallback((parsed, result) => {
    const id = generateNotificationId();
    const pendingItem = {
      id,
      parsed,
      status: result.status,
      missingBindings: {
        card: result.status === ProcessingStatus.MISSING_CARD_BINDING ||
              result.status === ProcessingStatus.MISSING_BOTH_BINDINGS,
        merchant: result.status === ProcessingStatus.MISSING_MERCHANT_BINDING ||
                  result.status === ProcessingStatus.MISSING_BOTH_BINDINGS,
      },
      timestamp: new Date().toISOString(),
      result,
    };

    setPendingQueue(prev => [...prev, pendingItem]);
    console.log('[PendingNotifications] Added to queue:', id);

    return id;
  }, [generateNotificationId]);

  /**
   * Remove notification from queue
   */
  const removeFromQueue = useCallback((id) => {
    setPendingQueue(prev => prev.filter(item => item.id !== id));
    console.log('[PendingNotifications] Removed from queue:', id);
  }, []);

  /**
   * Update notification status in queue
   */
  const updateQueueItem = useCallback((id, updates) => {
    setPendingQueue(prev =>
      prev.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    );
  }, []);

  /**
   * Show modal for missing binding
   */
  const showBindingModal = useCallback((type, parsed, onComplete) => {
    setActiveModal({ type, parsed, onComplete });
    console.log('[PendingNotifications] Showing modal:', type);
  }, []);

  /**
   * Close active modal
   */
  const closeBindingModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  /**
   * Handle card binding creation
   * Called from SelectAccountForCardModal
   */
  const onCardBindingCreated = useCallback(async (cardMask, accountId) => {
    console.log('[PendingNotifications] Card binding created:', cardMask);

    // Close modal
    if (activeModal?.onComplete) {
      activeModal.onComplete({ cardMask, accountId });
    }
    closeBindingModal();

    // Retry pending notifications that were waiting for this card
    const waitingForCard = pendingQueue.filter(
      item => item.missingBindings.card && item.parsed.cardMask === cardMask
    );

    for (const item of waitingForCard) {
      await retryPendingNotification(item.id);
    }
  }, [activeModal, pendingQueue, closeBindingModal]);

  /**
   * Handle merchant binding creation
   * Called from SelectCategoryForMerchantModal
   */
  const onMerchantBindingCreated = useCallback(async (merchantName, categoryId) => {
    console.log('[PendingNotifications] Merchant binding created:', merchantName);

    // Close modal
    if (activeModal?.onComplete) {
      activeModal.onComplete({ merchantName, categoryId });
    }
    closeBindingModal();

    // Retry pending notifications that were waiting for this merchant
    const waitingForMerchant = pendingQueue.filter(
      item => item.missingBindings.merchant && item.parsed.merchantName === merchantName
    );

    for (const item of waitingForMerchant) {
      await retryPendingNotification(item.id);
    }
  }, [activeModal, pendingQueue, closeBindingModal]);

  /**
   * Retry processing a pending notification
   */
  const retryPendingNotification = useCallback(async (id) => {
    const item = pendingQueue.find(p => p.id === id);
    if (!item) {
      console.warn('[PendingNotifications] Notification not found in queue:', id);
      return;
    }

    console.log('[PendingNotifications] Retrying notification:', id);
    updateQueueItem(id, { status: 'processing' });

    try {
      const result = await notificationProcessor.retryProcessing(item.parsed);

      if (result.status === ProcessingStatus.SUCCESS) {
        // Success - remove from queue
        removeFromQueue(id);

        // Reload operations to show the new one
        await reloadOperations();

        // Show success notification (optional)
        console.log('[PendingNotifications] Successfully created operation from notification');
      } else if (
        result.status === ProcessingStatus.MISSING_CARD_BINDING ||
        result.status === ProcessingStatus.MISSING_MERCHANT_BINDING ||
        result.status === ProcessingStatus.MISSING_BOTH_BINDINGS
      ) {
        // Still missing bindings - update queue item
        updateQueueItem(id, {
          status: result.status,
          result,
          missingBindings: {
            card: result.status === ProcessingStatus.MISSING_CARD_BINDING ||
                  result.status === ProcessingStatus.MISSING_BOTH_BINDINGS,
            merchant: result.status === ProcessingStatus.MISSING_MERCHANT_BINDING ||
                      result.status === ProcessingStatus.MISSING_BOTH_BINDINGS,
          },
        });
      } else {
        // Error - keep in queue but update status
        updateQueueItem(id, { status: result.status, result });
        console.error('[PendingNotifications] Retry failed:', result);
      }
    } catch (error) {
      console.error('[PendingNotifications] Retry error:', error);
      updateQueueItem(id, { status: ProcessingStatus.OPERATION_ERROR });
    }
  }, [pendingQueue, updateQueueItem, removeFromQueue, reloadOperations]);

  /**
   * Process a raw notification
   * Main entry point when notification is received
   */
  const processRawNotification = useCallback(async (notification) => {
    if (isProcessing) {
      console.log('[PendingNotifications] Already processing, queuing for later');
      // Could implement a processing queue here if needed
      return;
    }

    setIsProcessing(true);

    try {
      console.log('[PendingNotifications] Processing raw notification:', {
        title: notification.title,
        body: notification.body?.substring(0, 50),
      });

      // Parse notification
      const parsed = parseNotification(notification.title, notification.body);

      if (!parsed) {
        console.warn('[PendingNotifications] Failed to parse notification');
        showDialog(
          'Notification Error',
          'Could not parse bank notification. The format may not be supported.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Process with NotificationProcessor
      const result = await notificationProcessor.processNotification(parsed);

      // Handle result
      if (result.status === ProcessingStatus.SUCCESS) {
        console.log('[PendingNotifications] Operation created successfully');

        // Reload operations to show the new one
        await reloadOperations();

        // Optional: Show success toast/notification to user
        // showDialog('Success', 'Transaction added from notification', [{ text: 'OK' }]);
      } else if (result.status === ProcessingStatus.DUPLICATE) {
        console.log('[PendingNotifications] Duplicate notification ignored');
        // Silently ignore duplicates
      } else if (
        result.status === ProcessingStatus.MISSING_CARD_BINDING ||
        result.status === ProcessingStatus.MISSING_MERCHANT_BINDING ||
        result.status === ProcessingStatus.MISSING_BOTH_BINDINGS
      ) {
        // Add to pending queue
        const id = addToPendingQueue(parsed, result);

        // Show appropriate modal
        // Priority: card binding first, then merchant
        if (result.status === ProcessingStatus.MISSING_CARD_BINDING ||
            result.status === ProcessingStatus.MISSING_BOTH_BINDINGS) {
          showBindingModal('card', parsed, () => {
            // After card binding created, check if we need merchant binding
            if (result.status === ProcessingStatus.MISSING_BOTH_BINDINGS) {
              // Wait a bit then show merchant modal
              setTimeout(() => {
                showBindingModal('merchant', parsed, null);
              }, 500);
            }
          });
        } else if (result.status === ProcessingStatus.MISSING_MERCHANT_BINDING) {
          showBindingModal('merchant', parsed, null);
        }
      } else {
        // Error
        console.error('[PendingNotifications] Processing error:', result);
        showDialog(
          'Processing Error',
          result.message || 'Failed to process notification',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[PendingNotifications] Unexpected error:', error);
      showDialog(
        'Error',
        'An unexpected error occurred while processing the notification.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    addToPendingQueue,
    showBindingModal,
    showDialog,
    reloadOperations,
  ]);

  /**
   * Listen for bank notifications
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(
      NOTIFICATION_EVENTS.BANK_NOTIFICATION,
      (notification) => {
        console.log('[PendingNotifications] Bank notification received');
        processRawNotification(notification);
      }
    );

    return unsubscribe;
  }, [processRawNotification]);

  /**
   * Clear all pending notifications
   */
  const clearQueue = useCallback(() => {
    setPendingQueue([]);
    setActiveModal(null);
  }, []);

  /**
   * Get count of pending notifications
   */
  const getPendingCount = useCallback(() => {
    return pendingQueue.length;
  }, [pendingQueue]);

  /**
   * Dismiss a pending notification without processing
   */
  const dismissNotification = useCallback((id) => {
    removeFromQueue(id);
  }, [removeFromQueue]);

  const value = {
    pendingQueue,
    activeModal,
    isProcessing,
    processRawNotification,
    retryPendingNotification,
    onCardBindingCreated,
    onMerchantBindingCreated,
    showBindingModal,
    closeBindingModal,
    clearQueue,
    getPendingCount,
    dismissNotification,
  };

  return (
    <PendingNotificationsContext.Provider value={value}>
      {children}
    </PendingNotificationsContext.Provider>
  );
};
