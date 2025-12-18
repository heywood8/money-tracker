/**
 * useNotificationListener Hook
 *
 * React hook for managing notification listener functionality
 * Provides permission status, listener controls, and notification event handling
 */

import { useState, useEffect, useCallback } from 'react';
import { notificationListener, NOTIFICATION_EVENTS } from '../services/notification/NotificationListener';
import { parseNotification } from '../services/notification/NotificationParser';
import { appEvents } from '../services/eventEmitter';

/**
 * Hook for managing notification listener
 * @param {Object} options - Configuration options
 * @param {function} options.onNotificationReceived - Callback when bank notification received
 * @param {function} options.onPermissionChange - Callback when permission status changes
 * @param {function} options.onError - Callback when error occurs
 * @param {boolean} options.autoStart - Whether to auto-start listener on mount
 * @returns {Object} Notification listener controls and status
 */
export function useNotificationListener({
  onNotificationReceived,
  onPermissionChange,
  onError,
  autoStart = false,
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Check permission status
   */
  const checkPermission = useCallback(async () => {
    try {
      const granted = await notificationListener.checkPermission();
      setHasPermission(granted);
      onPermissionChange?.(granted);
      return granted;
    } catch (err) {
      console.error('[useNotificationListener] Failed to check permission:', err);
      setError(err);
      onError?.(err);
      return false;
    }
  }, [onPermissionChange, onError]);

  /**
   * Request notification listener permission
   */
  const requestPermission = useCallback(async () => {
    try {
      setError(null);
      const granted = await notificationListener.requestPermission();

      // Check permission again after request
      await checkPermission();

      return granted;
    } catch (err) {
      console.error('[useNotificationListener] Failed to request permission:', err);
      setError(err);
      onError?.(err);
      return false;
    }
  }, [checkPermission, onError]);

  /**
   * Start listening to notifications
   */
  const startListening = useCallback(async () => {
    try {
      setError(null);
      await notificationListener.startListening();
      setIsListening(notificationListener.isActive());
    } catch (err) {
      console.error('[useNotificationListener] Failed to start listening:', err);
      setError(err);
      onError?.(err);
    }
  }, [onError]);

  /**
   * Stop listening to notifications
   */
  const stopListening = useCallback(() => {
    try {
      notificationListener.stopListening();
      setIsListening(false);
    } catch (err) {
      console.error('[useNotificationListener] Failed to stop listening:', err);
      setError(err);
      onError?.(err);
    }
  }, [onError]);

  /**
   * Handle incoming bank notification
   */
  const handleBankNotification = useCallback((notification) => {
    console.log('[useNotificationListener] Processing bank notification:', notification);

    try {
      // Parse notification to extract transaction details
      const parsed = parseNotification(notification.title, notification.body);

      if (!parsed) {
        console.warn('[useNotificationListener] Failed to parse notification');
        return;
      }

      const enrichedNotification = {
        ...notification,
        parsed,
      };

      setLastNotification(enrichedNotification);
      onNotificationReceived?.(enrichedNotification);
    } catch (err) {
      console.error('[useNotificationListener] Error processing notification:', err);
      setError(err);
      onError?.(err);
    }
  }, [onNotificationReceived, onError]);

  /**
   * Handle permission status change
   */
  const handlePermissionStatus = useCallback((granted) => {
    setHasPermission(granted);
    onPermissionChange?.(granted);
  }, [onPermissionChange]);

  /**
   * Handle listener error
   */
  const handleListenerError = useCallback((err) => {
    console.error('[useNotificationListener] Listener error:', err);
    setError(err);
    onError?.(err);
  }, [onError]);

  /**
   * Subscribe to notification events on mount
   */
  useEffect(() => {
    // Subscribe to events
    const unsubscribeNotification = appEvents.on(
      NOTIFICATION_EVENTS.BANK_NOTIFICATION,
      handleBankNotification
    );

    const unsubscribePermission = appEvents.on(
      NOTIFICATION_EVENTS.PERMISSION_STATUS,
      handlePermissionStatus
    );

    const unsubscribeError = appEvents.on(
      NOTIFICATION_EVENTS.LISTENER_ERROR,
      handleListenerError
    );

    // Check initial permission status
    checkPermission();

    // Auto-start if requested
    if (autoStart) {
      startListening();
    }

    // Cleanup on unmount
    return () => {
      unsubscribeNotification();
      unsubscribePermission();
      unsubscribeError();

      if (isListening) {
        stopListening();
      }
    };
  }, []); // Empty deps - only run on mount/unmount

  /**
   * Update listening state when listener changes
   */
  useEffect(() => {
    setIsListening(notificationListener.isActive());
  }, []);

  return {
    // Status
    isListening,
    hasPermission,
    lastNotification,
    error,

    // Actions
    checkPermission,
    requestPermission,
    startListening,
    stopListening,

    // Utility
    getMonitoredPackages: () => notificationListener.getMonitoredPackages(),
    addBankPackage: (packageName) => notificationListener.addBankPackage(packageName),
    removeBankPackage: (packageName) => notificationListener.removeBankPackage(packageName),
  };
}

/**
 * Hook for just checking permission status
 * Lightweight version without event subscriptions
 */
export function useNotificationPermission() {
  const [hasPermission, setHasPermission] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const granted = await notificationListener.checkPermission();
        setHasPermission(granted);
      } catch (err) {
        console.error('[useNotificationPermission] Failed to check permission:', err);
      } finally {
        setChecking(false);
      }
    };

    check();
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      await notificationListener.requestPermission();

      // Re-check after request
      const granted = await notificationListener.checkPermission();
      setHasPermission(granted);
      return granted;
    } catch (err) {
      console.error('[useNotificationPermission] Failed to request permission:', err);
      return false;
    }
  }, []);

  return {
    hasPermission,
    checking,
    requestPermission,
  };
}
