import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as WidgetDataService from '../services/WidgetDataService';

/**
 * Hook to handle widget updates
 *
 * This hook provides a function to update widget data and
 * optionally updates widgets automatically when dependencies change.
 *
 * @param {Array} dependencies - Dependencies to trigger auto-update (optional)
 * @returns {Object} Object with updateWidgets function
 */
export const useWidgetUpdate = (dependencies = []) => {
  /**
   * Update widget data
   * Only works on Android (for now)
   */
  const updateWidgets = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      console.log('Updating widgets...');
      await WidgetDataService.updateWidgetData();

      // Request widget update
      try {
        const { requestWidgetUpdate } = require('react-native-android-widget');
        await requestWidgetUpdate({
          widgetName: 'BalanceWidget',
        });
        await requestWidgetUpdate({
          widgetName: 'RecentOperationsWidget',
        });
        console.log('Widgets updated successfully');
      } catch (err) {
        // Widget library might not be available on iOS or in some builds
        console.log('Widget update request not available:', err.message);
      }
    } catch (error) {
      console.error('Failed to update widgets:', error);
    }
  }, []);

  // Auto-update when dependencies change
  useEffect(() => {
    if (dependencies.length > 0 && Platform.OS === 'android') {
      updateWidgets();
    }
  }, dependencies);

  return { updateWidgets };
};

/**
 * Standalone function to update widgets
 * Can be called from anywhere without needing a hook
 */
export const updateWidgets = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    console.log('Updating widgets...');
    await WidgetDataService.updateWidgetData();

    // Request widget update
    try {
      const { requestWidgetUpdate } = require('react-native-android-widget');
      await requestWidgetUpdate({
        widgetName: 'BalanceWidget',
      });
      await requestWidgetUpdate({
        widgetName: 'RecentOperationsWidget',
      });
      console.log('Widgets updated successfully');
    } catch (err) {
      console.log('Widget update not available:', err.message);
    }
  } catch (error) {
    console.error('Failed to update widgets:', error);
  }
};
