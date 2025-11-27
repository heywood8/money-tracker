import { Platform } from 'react-native';
import { appEvents, EVENTS } from './eventEmitter';
import { updateWidgets } from '../hooks/useWidgetUpdate';

/**
 * Widget Event Listener
 *
 * Listens to app events and updates widgets accordingly.
 * This ensures widgets stay synchronized with app data.
 */

let isInitialized = false;

/**
 * Initialize widget event listeners
 */
export const initializeWidgetEventListeners = () => {
  if (isInitialized || Platform.OS !== 'android') {
    return;
  }

  console.log('Initializing widget event listeners...');

  // Listen for database changes and reload events
  appEvents.on(EVENTS.DATABASE_RESET, handleDataChange);
  appEvents.on(EVENTS.RELOAD_ALL, handleDataChange);

  // Additional event listeners for account and operation changes
  // These should be emitted by the contexts when data changes
  appEvents.on('account:created', handleDataChange);
  appEvents.on('account:updated', handleDataChange);
  appEvents.on('account:deleted', handleDataChange);
  appEvents.on('operation:created', handleDataChange);
  appEvents.on('operation:updated', handleDataChange);
  appEvents.on('operation:deleted', handleDataChange);

  isInitialized = true;
  console.log('Widget event listeners initialized');
};

/**
 * Handle data change events
 * Debounced to avoid excessive widget updates
 */
let updateTimeout = null;
const DEBOUNCE_MS = 2000; // Wait 2 seconds before updating widgets

const handleDataChange = () => {
  console.log('Data changed, scheduling widget update...');

  // Clear existing timeout
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  // Schedule new update
  updateTimeout = setTimeout(async () => {
    console.log('Executing scheduled widget update...');
    await updateWidgets();
    updateTimeout = null;
  }, DEBOUNCE_MS);
};

/**
 * Force immediate widget update
 */
export const forceWidgetUpdate = async () => {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  console.log('Forcing immediate widget update...');
  await updateWidgets();
};

/**
 * Cleanup event listeners
 */
export const cleanupWidgetEventListeners = () => {
  if (!isInitialized) {
    return;
  }

  console.log('Cleaning up widget event listeners...');

  appEvents.off(EVENTS.DATABASE_RESET, handleDataChange);
  appEvents.off(EVENTS.RELOAD_ALL, handleDataChange);
  appEvents.off('account:created', handleDataChange);
  appEvents.off('account:updated', handleDataChange);
  appEvents.off('account:deleted', handleDataChange);
  appEvents.off('operation:created', handleDataChange);
  appEvents.off('operation:updated', handleDataChange);
  appEvents.off('operation:deleted', handleDataChange);

  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  isInitialized = false;
  console.log('Widget event listeners cleaned up');
};
