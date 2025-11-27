/**
 * Widget Entry Point
 *
 * This file exports all widget components for react-native-android-widget.
 * The library will automatically discover widgets based on the native configuration.
 */

export { BalanceWidget } from './BalanceWidget';
export { RecentOperationsWidget } from './RecentOperationsWidget';

// Re-export the task handler registration
import './widgetTaskHandler';
