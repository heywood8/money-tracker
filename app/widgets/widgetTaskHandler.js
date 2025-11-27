import { registerWidgetTaskHandler } from 'react-native-android-widget';
import * as WidgetDataService from '../services/WidgetDataService';

/**
 * Widget Task Handler
 *
 * This handler is called when widgets need to be updated.
 * It prepares and updates the widget data in AsyncStorage.
 */

const widgetTaskHandler = async ({ widgetInfo, widgetAction }) => {
  console.log('Widget task handler called:', { widgetInfo, widgetAction });

  try {
    // Update widget data whenever a widget requests it
    if (
      widgetAction === 'UPDATE_WIDGET' ||
      widgetAction === 'WIDGET_ADDED' ||
      widgetAction === 'WIDGET_UPDATE'
    ) {
      console.log('Updating widget data...');
      await WidgetDataService.updateWidgetData();
      console.log('Widget data updated successfully');
    }
  } catch (error) {
    console.error('Widget task handler error:', error);
  }
};

// Register the task handler
registerWidgetTaskHandler(widgetTaskHandler);

export default widgetTaskHandler;
