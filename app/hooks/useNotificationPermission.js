/**
 * useNotificationPermission Hook
 *
 * Simplified hook for managing notification permission status
 * Used in settings and other UI components that only need permission controls
 */

import { useState, useEffect, useCallback } from 'react';
import { notificationListener } from '../services/notification/NotificationListener';

/**
 * Hook for managing notification permission
 * Provides permission status and control methods
 *
 * @returns {Object} Permission status and control methods
 */
export function useNotificationPermission() {
  const [hasPermission, setHasPermission] = useState(false);
  const [checking, setChecking] = useState(true);

  /**
   * Check current permission status
   */
  const checkPermission = useCallback(async () => {
    try {
      setChecking(true);
      const granted = await notificationListener.checkPermission();
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('[useNotificationPermission] Failed to check permission:', error);
      setHasPermission(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  /**
   * Request notification listener permission
   * Opens Android settings to grant permission
   */
  const requestPermission = useCallback(async () => {
    try {
      const granted = await notificationListener.requestPermission();

      // Re-check permission after request
      await checkPermission();

      return granted;
    } catch (error) {
      console.error('[useNotificationPermission] Failed to request permission:', error);
      return false;
    }
  }, [checkPermission]);

  /**
   * Open system settings for notification listener
   * User can manually grant/revoke permission there
   */
  const openSystemSettings = useCallback(async () => {
    try {
      await notificationListener.openSystemSettings();
    } catch (error) {
      console.error('[useNotificationPermission] Failed to open settings:', error);
    }
  }, []);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  return {
    hasPermission,
    checking,
    checkPermission,
    requestPermission,
    openSystemSettings,
  };
}
