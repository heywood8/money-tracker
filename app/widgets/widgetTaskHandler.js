import { registerWidgetTaskHandler } from 'react-native-android-widget';
import * as WidgetDataService from '../services/WidgetDataService';

/**
 * Widget Task Handler
 *
 * This handler is called when widgets need to be updated.
 * It fetches and returns the widget data that will be passed to widget components.
 */

const widgetTaskHandler = async ({ widgetInfo, widgetAction }) => {
  console.log('Widget task handler called:', { widgetInfo, widgetAction });

  try {
    // Prepare widget data
    const widgetData = await WidgetDataService.prepareWidgetData();
    console.log('Widget data prepared:', {
      accountCount: widgetData.accountCount,
      totalsByCurrency: widgetData.totalsByCurrency?.length,
      recentOperations: widgetData.recentOperations?.length,
    });

    // Return the data - this will be passed to the widget component
    return widgetData;
  } catch (error) {
    console.error('Widget task handler error:', error);
    // Return empty data on error
    return {
      totalsByCurrency: [],
      recentOperations: [],
      topAccounts: [],
      accountCount: 0,
      lastUpdate: new Date().toISOString(),
    };
  }
};

// Register the task handler
registerWidgetTaskHandler(widgetTaskHandler);

export default widgetTaskHandler;
