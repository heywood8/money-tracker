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
    console.log('Widget library loaded:', {
      hasRegisterWidget: !!widgetLib.registerWidget,
      hasRegisterTaskHandler: !!widgetLib.registerWidgetTaskHandler,
      keys: Object.keys(widgetLib)
    });
    registerWidget = widgetLib.registerWidget;
    registerWidgetTaskHandler = widgetLib.registerWidgetTaskHandler;
  } catch (error) {
    console.error('Widget library not available:', error);
  }
}

/**
 * Initialize and register all widgets
 */
export const initializeWidgets = () => {
  console.log('initializeWidgets called', {
    platform: Platform.OS,
    hasRegisterWidget: !!registerWidget
  });

  if (Platform.OS !== 'android' || !registerWidget) {
    console.log('Widgets not supported on this platform or build');
    return;
  }

  try {
    console.log('Starting widget registration...');

    // Import widgets
    const { BalanceWidget } = require('./BalanceWidget');
    const { RecentOperationsWidget } = require('./RecentOperationsWidget');

    console.log('Widgets imported:', {
      hasBalanceWidget: !!BalanceWidget,
      hasRecentOpsWidget: !!RecentOperationsWidget
    });

    // Register widgets
    console.log('Registering BalanceWidget...');
    registerWidget({
      name: 'BalanceWidget',
      widget: BalanceWidget,
    });

    console.log('Registering RecentOperationsWidget...');
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
