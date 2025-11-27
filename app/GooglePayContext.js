import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Alert } from 'react-native';
import {
  getGooglePaySettings,
  saveGooglePaySettings,
  handleGooglePayNotification,
  confirmPendingTransaction,
} from './services/NotificationHandler';
import { useLocalization } from './LocalizationContext';

const GooglePayContext = createContext();

const GooglePayNotificationModule = Platform.OS === 'android' ? NativeModules.GooglePayNotificationModule : null;

export const GooglePayProvider = ({ children }) => {
  const { t } = useLocalization();
  const [settings, setSettings] = useState({
    enabled: false,
    autoCreateTransactions: true,
    defaultAccountId: null,
    defaultCategoryId: null,
    requireConfirmation: true,
  });
  const [hasNotificationAccess, setHasNotificationAccess] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState([]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    if (Platform.OS === 'android' && GooglePayNotificationModule) {
      checkNotificationAccess();
    }
  }, []);

  // Set up notification listener
  useEffect(() => {
    if (Platform.OS !== 'android' || !GooglePayNotificationModule) {
      return;
    }

    const eventEmitter = new NativeEventEmitter(NativeModules.DeviceEventManagerModule);
    const subscription = eventEmitter.addListener('GooglePayNotification', (notification) => {
      if (settings.enabled) {
        handleNotification(notification);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [settings.enabled, handleNotification]);

  const loadSettings = async () => {
    try {
      const loadedSettings = await getGooglePaySettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load Google Pay settings:', error);
    }
  };

  const checkNotificationAccess = async () => {
    try {
      if (GooglePayNotificationModule) {
        const hasAccess = await GooglePayNotificationModule.isNotificationAccessGranted();
        setHasNotificationAccess(hasAccess);
      }
    } catch (error) {
      console.error('Failed to check notification access:', error);
    }
  };

  const requestNotificationAccess = async () => {
    try {
      if (GooglePayNotificationModule) {
        await GooglePayNotificationModule.requestNotificationAccess();
        // Check again after a delay (user might have granted access)
        setTimeout(checkNotificationAccess, 1000);
      }
    } catch (error) {
      console.error('Failed to request notification access:', error);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      await saveGooglePaySettings(newSettings);
      setSettings(prev => ({ ...prev, ...newSettings }));
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  };

  const handleNotification = useCallback(async (notification) => {
    try {
      await handleGooglePayNotification(notification, (pendingTransaction) => {
        // Add to pending transactions for user confirmation
        setPendingTransactions(prev => [...prev, pendingTransaction]);

        // Show alert for confirmation
        Alert.alert(
          t('google_pay_transaction'),
          `${t('merchant')}: ${pendingTransaction.merchant}\n${t('amount')}: ${pendingTransaction.amount} ${pendingTransaction.currency}`,
          [
            {
              text: t('cancel'),
              style: 'cancel',
              onPress: () => {
                removePendingTransaction(pendingTransaction.id);
              },
            },
            {
              text: t('confirm'),
              onPress: async () => {
                try {
                  await confirmPendingTransaction(pendingTransaction);
                  removePendingTransaction(pendingTransaction.id);
                } catch (error) {
                  Alert.alert(t('error'), t('failed_to_create_operation'));
                }
              },
            },
          ]
        );
      });
    } catch (error) {
      console.error('Failed to handle notification:', error);
    }
  }, [t]);

  const removePendingTransaction = (id) => {
    setPendingTransactions(prev => prev.filter(t => t.id !== id));
  };

  const value = {
    settings,
    updateSettings,
    hasNotificationAccess,
    requestNotificationAccess,
    checkNotificationAccess,
    pendingTransactions,
    removePendingTransaction,
    isAvailable: Platform.OS === 'android' && GooglePayNotificationModule !== null,
  };

  return (
    <GooglePayContext.Provider value={value}>
      {children}
    </GooglePayContext.Provider>
  );
};

export const useGooglePay = () => {
  const context = useContext(GooglePayContext);
  if (!context) {
    throw new Error('useGooglePay must be used within GooglePayProvider');
  }
  return context;
};
