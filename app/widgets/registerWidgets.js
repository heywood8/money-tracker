/**
 * Widget Registration
 *
 * This file registers all widgets with react-native-android-widget.
 * Import this file early in your app initialization (e.g., in App.js or index.js).
 */

import { Platform } from 'react-native';

let registerWidget;
let registerWidgetTaskHandler;

// Only import widget modules on Android
if (Platform.OS === 'android') {
  try {
    const widgetLib = require('react-native-android-widget');
    registerWidget = widgetLib.registerWidget;
    registerWidgetTaskHandler = widgetLib.registerWidgetTaskHandler;
  } catch (error) {
    console.log('Widget library not available:', error.message);
  }
}

/**
 * Initialize and register all widgets
 */
export const initializeWidgets = () => {
  if (Platform.OS !== 'android' || !registerWidget) {
    console.log('Widgets not supported on this platform or build');
    return;
  }

  try {
    // Import widgets
    const { BalanceWidget } = require('./BalanceWidget');
    const { RecentOperationsWidget } = require('./RecentOperationsWidget');

    // Register widgets
    registerWidget({
      name: 'BalanceWidget',
      widget: BalanceWidget,
    });

    registerWidget({
      name: 'RecentOperationsWidget',
      widget: RecentOperationsWidget,
    });

    console.log('Widgets registered successfully');
  } catch (error) {
    console.error('Failed to register widgets:', error);
  }
};

/**
 * Setup widget task handler
 * This handles widget update requests
 */
export const setupWidgetTaskHandler = () => {
  if (Platform.OS !== 'android' || !registerWidgetTaskHandler) {
    return;
  }

  try {
    // Import task handler
    const widgetTaskHandler = require('./widgetTaskHandler').default;
    console.log('Widget task handler setup complete');
  } catch (error) {
    console.error('Failed to setup widget task handler:', error);
  }
};
