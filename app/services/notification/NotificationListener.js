/**
 * NotificationListener Service
 *
 * Listens to notifications from bank apps and filters relevant transaction notifications.
 *
 * IMPORTANT: This service requires react-native-notification-listener package
 * and special Android permissions to read notifications from other apps.
 *
 * Installation:
 * 1. npm install react-native-notification-listener
 * 2. Add permissions to app.config.js (see below)
 * 3. User must grant notification access in Android Settings
 *
 * Required Android Permissions:
 * - android.permission.BIND_NOTIFICATION_LISTENER_SERVICE
 *
 * Package: https://github.com/giocapardi/react-native-notification-listener
 */

import { Platform } from 'react-native';
import { appEvents } from '../eventEmitter';

// Event types
export const NOTIFICATION_EVENTS = {
  BANK_NOTIFICATION: 'notification:bank_notification',
  PERMISSION_STATUS: 'notification:permission_status',
  LISTENER_ERROR: 'notification:listener_error',
};

// Configuration for bank app package names
// These are the Android package names for bank apps we want to monitor
const BANK_PACKAGES = {
  ARCA: 'am.arca.bank', // Example package name - verify actual package
  ACBA: 'am.acba.mobile', // Example package name
  INECO: 'am.ineco.bank', // Example package name
  // Add more banks as needed
};

class NotificationListenerService {
  constructor() {
    this.isListening = false;
    this.listener = null;
    this.monitoredPackages = Object.values(BANK_PACKAGES);
  }

  /**
   * Check if notification listener permission is granted
   * @returns {Promise<boolean>}
   */
  async checkPermission() {
    if (Platform.OS !== 'android') {
      console.warn('[NotificationListener] Only available on Android');
      return false;
    }

    try {
      // TODO: Implement actual permission check when package is installed
      // const RNNotificationListener = require('react-native-notification-listener');
      // const status = await RNNotificationListener.getPermissionStatus();
      // return status === 'granted';

      console.log('[NotificationListener] Permission check not implemented yet');
      return false;
    } catch (error) {
      console.error('[NotificationListener] Failed to check permission:', error);
      return false;
    }
  }

  /**
   * Request notification listener permission
   * Opens Android system settings for notification access
   */
  async requestPermission() {
    if (Platform.OS !== 'android') {
      console.warn('[NotificationListener] Only available on Android');
      return false;
    }

    try {
      // TODO: Implement actual permission request when package is installed
      // const RNNotificationListener = require('react-native-notification-listener');
      // await RNNotificationListener.requestPermission();

      console.log('[NotificationListener] Opening system settings for notification access');
      console.log('[NotificationListener] User must manually grant notification access');
      return true;
    } catch (error) {
      console.error('[NotificationListener] Failed to request permission:', error);
      appEvents.emit(NOTIFICATION_EVENTS.LISTENER_ERROR, error);
      return false;
    }
  }

  /**
   * Start listening to notifications
   */
  async startListening() {
    if (Platform.OS !== 'android') {
      console.warn('[NotificationListener] Only available on Android');
      return;
    }

    if (this.isListening) {
      console.log('[NotificationListener] Already listening');
      return;
    }

    const hasPermission = await this.checkPermission();
    if (!hasPermission) {
      console.warn('[NotificationListener] Permission not granted');
      appEvents.emit(NOTIFICATION_EVENTS.PERMISSION_STATUS, false);
      return;
    }

    try {
      console.log('[NotificationListener] Starting notification listener...');

      // TODO: Implement actual listener when package is installed
      // const RNNotificationListener = require('react-native-notification-listener');
      //
      // this.listener = RNNotificationListener.addListener((notification) => {
      //   this.handleNotification(notification);
      // });

      this.isListening = true;
      console.log('[NotificationListener] Listening for notifications from:', this.monitoredPackages);
      appEvents.emit(NOTIFICATION_EVENTS.PERMISSION_STATUS, true);
    } catch (error) {
      console.error('[NotificationListener] Failed to start listening:', error);
      appEvents.emit(NOTIFICATION_EVENTS.LISTENER_ERROR, error);
    }
  }

  /**
   * Stop listening to notifications
   */
  stopListening() {
    if (!this.isListening) {
      return;
    }

    try {
      console.log('[NotificationListener] Stopping notification listener...');

      // TODO: Implement actual listener cleanup when package is installed
      // if (this.listener) {
      //   this.listener.remove();
      //   this.listener = null;
      // }

      this.isListening = false;
      console.log('[NotificationListener] Stopped listening');
    } catch (error) {
      console.error('[NotificationListener] Failed to stop listening:', error);
    }
  }

  /**
   * Handle incoming notification
   * Filters for bank notifications and emits event
   * @param {Object} notification - Notification object from listener
   */
  handleNotification(notification) {
    try {
      const { app, title, text, packageName } = notification;

      // Check if notification is from a monitored bank app
      if (!this.monitoredPackages.includes(packageName)) {
        return;
      }

      console.log('[NotificationListener] Bank notification received:', {
        app,
        packageName,
        title,
        text: text?.substring(0, 50) + '...',
      });

      // Emit event with notification data
      appEvents.emit(NOTIFICATION_EVENTS.BANK_NOTIFICATION, {
        title,
        body: text,
        packageName,
        app,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[NotificationListener] Error handling notification:', error);
      appEvents.emit(NOTIFICATION_EVENTS.LISTENER_ERROR, error);
    }
  }

  /**
   * Add a bank package to monitor
   * @param {string} packageName - Android package name
   */
  addBankPackage(packageName) {
    if (!this.monitoredPackages.includes(packageName)) {
      this.monitoredPackages.push(packageName);
      console.log('[NotificationListener] Added bank package:', packageName);
    }
  }

  /**
   * Remove a bank package from monitoring
   * @param {string} packageName - Android package name
   */
  removeBankPackage(packageName) {
    const index = this.monitoredPackages.indexOf(packageName);
    if (index > -1) {
      this.monitoredPackages.splice(index, 1);
      console.log('[NotificationListener] Removed bank package:', packageName);
    }
  }

  /**
   * Get list of monitored bank packages
   * @returns {string[]}
   */
  getMonitoredPackages() {
    return [...this.monitoredPackages];
  }

  /**
   * Check if service is currently listening
   * @returns {boolean}
   */
  isActive() {
    return this.isListening;
  }
}

// Export singleton instance
export const notificationListener = new NotificationListenerService();

// Export bank packages for configuration
export { BANK_PACKAGES };
