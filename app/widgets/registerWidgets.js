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
 * Initialize widgets
 *
 * In react-native-android-widget v0.17+, widgets are automatically
 * registered based on app.json configuration and native code generation.
 * No manual registration is needed.
 */
export const initializeWidgets = () => {
  console.log('initializeWidgets called', {
    platform: Platform.OS,
  });

  if (Platform.OS !== 'android') {
    console.log('Widgets only supported on Android');
    return;
  }

  console.log('Widgets are configured via app.json and loaded automatically');
  console.log('Widget components exported from: app/widgets/widgets.js');
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
