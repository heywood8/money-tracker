/**
 * NotificationListener Service
 *
 * Listens to notifications from bank apps and filters relevant transaction notifications.
 *
 * IMPLEMENTATION: Custom native Android module
 * This service uses a custom native Android module instead of react-native-notification-listener
 * because that package doesn't support React 19.
 *
 * The native module is implemented via Expo config plugin: plugins/withNotificationListener.js
 *
 * Build: npx expo run:android (or npx expo prebuild then rebuild)
 * User must grant notification access in Android Settings
 *
 * Required Android Permissions:
 * - android.permission.BIND_NOTIFICATION_LISTENER_SERVICE (added by plugin)
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { appEvents } from '../eventEmitter';

// Get native module
const { NotificationListenerModule } = NativeModules;
const notificationEmitter = NotificationListenerModule
  ? new NativeEventEmitter(NotificationListenerModule)
  : null;

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

    if (!NotificationListenerModule) {
      console.warn('[NotificationListener] Native module not found. Did you rebuild the app?');
      return false;
    }

    try {
      const hasPermission = await NotificationListenerModule.checkPermission();
      console.log('[NotificationListener] Permission status:', hasPermission);
      return hasPermission;
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

    if (!NotificationListenerModule) {
      console.warn('[NotificationListener] Native module not found. Did you rebuild the app?');
      return false;
    }

    try {
      await NotificationListenerModule.requestPermission();
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

    if (!notificationEmitter) {
      console.warn('[NotificationListener] Native module not available. Did you rebuild the app?');
      appEvents.emit(NOTIFICATION_EVENTS.LISTENER_ERROR, new Error('Native module not available'));
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

      // Set up event listener for notifications from native module
      this.listener = notificationEmitter.addListener(
        'onNotificationReceived',
        (notification) => {
          this.handleNotification(notification);
        }
      );

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

      // Remove event listener
      if (this.listener) {
        this.listener.remove();
        this.listener = null;
      }

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

  /**
   * Open Android system settings for notification listener access
   * Convenience method that does the same as requestPermission
   * @returns {Promise<boolean>}
   */
  async openSystemSettings() {
    return await this.requestPermission();
  }
}

// Export singleton instance
export const notificationListener = new NotificationListenerService();

// Export bank packages for configuration
export { BANK_PACKAGES };
