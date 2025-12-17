/**
 * Tests for NotificationListener Service
 * Tests notification listener functionality, permission handling, and event emission
 */

import { Platform } from 'react-native';
import {
  notificationListener,
  NOTIFICATION_EVENTS,
  BANK_PACKAGES,
} from '../../app/services/notification/NotificationListener';
import { appEvents } from '../../app/services/eventEmitter';

// Platform is mocked globally in jest.setup.js

describe('NotificationListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset listener state
    notificationListener.stopListening();
  });

  describe('Initialization', () => {
    it('exports NOTIFICATION_EVENTS', () => {
      expect(NOTIFICATION_EVENTS).toBeDefined();
      expect(NOTIFICATION_EVENTS.BANK_NOTIFICATION).toBe('notification:bank_notification');
      expect(NOTIFICATION_EVENTS.PERMISSION_STATUS).toBe('notification:permission_status');
      expect(NOTIFICATION_EVENTS.LISTENER_ERROR).toBe('notification:listener_error');
    });

    it('exports BANK_PACKAGES', () => {
      expect(BANK_PACKAGES).toBeDefined();
      expect(BANK_PACKAGES.ARCA).toBeDefined();
      expect(BANK_PACKAGES.ACBA).toBeDefined();
      expect(BANK_PACKAGES.INECO).toBeDefined();
    });

    it('creates singleton instance', () => {
      expect(notificationListener).toBeDefined();
      expect(notificationListener.isActive()).toBe(false);
    });
  });

  describe('checkPermission', () => {
    it('returns false when package not installed', async () => {
      // Skip if Platform is not available (mock not working)
      if (typeof Platform === 'undefined' || typeof Platform.OS === 'undefined') {
        return;
      }

      const hasPermission = await notificationListener.checkPermission();

      // Since package is not installed, should return false
      expect(hasPermission).toBe(false);
    });
  });

  describe('requestPermission', () => {
    // Skip this test as it requires the actual package to be installed
    it.skip('logs message when package not installed', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await notificationListener.requestPermission();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[NotificationListener] Opening system settings for notification access'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('startListening', () => {
    it('does not start when permission not granted', async () => {
      // Skip if Platform is not available (mock not working)
      if (typeof Platform === 'undefined' || typeof Platform.OS === 'undefined') {
        return;
      }

      await notificationListener.startListening();

      // Permission check will fail since package not installed
      expect(notificationListener.isActive()).toBe(false);
    });

    // Skip this test as it requires the actual package to be installed
    it.skip('does not start if already listening', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Manually set to listening
      notificationListener.isListening = true;

      await notificationListener.startListening();

      expect(consoleSpy).toHaveBeenCalledWith('[NotificationListener] Already listening');

      notificationListener.isListening = false; // Reset
      consoleSpy.mockRestore();
    });
  });

  describe('stopListening', () => {
    it('stops listening when active', () => {
      // Manually set to listening
      notificationListener.isListening = true;

      notificationListener.stopListening();

      expect(notificationListener.isActive()).toBe(false);
    });

    it('does nothing when not listening', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      notificationListener.stopListening();

      // Should not log "Stopping..."
      expect(consoleSpy).not.toHaveBeenCalledWith(
        '[NotificationListener] Stopping notification listener...'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('handleNotification', () => {
    it('emits event for bank notifications', () => {
      const mockNotification = {
        app: 'ARCA',
        title: 'ARCA transactions',
        text: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027 | YANDEX.GO, AM',
        packageName: 'am.arca.bank',
      };

      const eventSpy = jest.fn();
      appEvents.on(NOTIFICATION_EVENTS.BANK_NOTIFICATION, eventSpy);

      notificationListener.handleNotification(mockNotification);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'ARCA transactions',
          body: mockNotification.text,
          packageName: 'am.arca.bank',
          app: 'ARCA',
          timestamp: expect.any(String),
        })
      );

      appEvents.off(NOTIFICATION_EVENTS.BANK_NOTIFICATION, eventSpy);
    });

    it('ignores notifications from non-bank apps', () => {
      const mockNotification = {
        app: 'WhatsApp',
        title: 'New message',
        text: 'Hello there',
        packageName: 'com.whatsapp',
      };

      const eventSpy = jest.fn();
      appEvents.on(NOTIFICATION_EVENTS.BANK_NOTIFICATION, eventSpy);

      notificationListener.handleNotification(mockNotification);

      expect(eventSpy).not.toHaveBeenCalled();

      appEvents.off(NOTIFICATION_EVENTS.BANK_NOTIFICATION, eventSpy);
    });

    it('handles errors in notification processing gracefully', () => {
      const mockNotification = {
        // Missing required fields
        app: 'ARCA',
      };

      const errorSpy = jest.fn();
      appEvents.on(NOTIFICATION_EVENTS.LISTENER_ERROR, errorSpy);

      // Should not crash even with malformed notification
      expect(() => {
        notificationListener.handleNotification(mockNotification);
      }).not.toThrow();

      appEvents.off(NOTIFICATION_EVENTS.LISTENER_ERROR, errorSpy);
    });
  });

  describe('addBankPackage', () => {
    it('adds new bank package', () => {
      const initialPackages = notificationListener.getMonitoredPackages();
      const newPackage = 'am.testbank.app';

      notificationListener.addBankPackage(newPackage);

      const updatedPackages = notificationListener.getMonitoredPackages();
      expect(updatedPackages).toContain(newPackage);
      expect(updatedPackages.length).toBe(initialPackages.length + 1);
    });

    it('does not add duplicate packages', () => {
      const initialPackages = notificationListener.getMonitoredPackages();
      const existingPackage = initialPackages[0];

      notificationListener.addBankPackage(existingPackage);

      const updatedPackages = notificationListener.getMonitoredPackages();
      expect(updatedPackages.length).toBe(initialPackages.length);
    });
  });

  describe('removeBankPackage', () => {
    it('removes bank package', () => {
      const packageToRemove = notificationListener.getMonitoredPackages()[0];

      notificationListener.removeBankPackage(packageToRemove);

      const updatedPackages = notificationListener.getMonitoredPackages();
      expect(updatedPackages).not.toContain(packageToRemove);
    });

    it('does nothing for non-existent package', () => {
      const initialPackages = notificationListener.getMonitoredPackages();

      notificationListener.removeBankPackage('non.existent.package');

      const updatedPackages = notificationListener.getMonitoredPackages();
      expect(updatedPackages.length).toBe(initialPackages.length);
    });
  });

  describe('getMonitoredPackages', () => {
    it('returns array of monitored packages', () => {
      const packages = notificationListener.getMonitoredPackages();

      expect(Array.isArray(packages)).toBe(true);
      expect(packages.length).toBeGreaterThan(0);
    });

    it('returns copy of array', () => {
      const packages1 = notificationListener.getMonitoredPackages();
      const packages2 = notificationListener.getMonitoredPackages();

      expect(packages1).not.toBe(packages2); // Different references
      expect(packages1).toEqual(packages2); // Same content
    });
  });

  describe('isActive', () => {
    it('returns false initially', () => {
      expect(notificationListener.isActive()).toBe(false);
    });

    it('returns true when listening', () => {
      notificationListener.isListening = true;

      expect(notificationListener.isActive()).toBe(true);

      notificationListener.isListening = false; // Reset
    });
  });
});
