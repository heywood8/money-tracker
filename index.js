import { registerRootComponent } from 'expo';

// Registers the background "transactions to review" task at bundle load so the OS
// can invoke it in a headless JS context (app closed/backgrounded). The task's
// TaskManager.defineTask call runs as a side effect of this import.
import './app/services/notifications/backgroundBankTask';

// Same reason: defines the handler for the receipt's "Acknowledged" button, which
// the OS invokes headless when the button is pressed with the app not running.
import './app/services/notifications/acknowledgeTask';

// Home-screen widgets. The launcher invokes the task handler headless (to place,
// resize or periodically update a widget with the app closed) and opens the
// configuration screen as its own React root, so both register at bundle load.
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './app/widgets/widgetTaskHandler';
import WidgetConfigScreen from './app/widgets/WidgetConfigScreen';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(WidgetConfigScreen);
