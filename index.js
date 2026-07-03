import { registerRootComponent } from 'expo';

// Registers the background "transactions to review" task at bundle load so the OS
// can invoke it in a headless JS context (app closed/backgrounded). The task's
// TaskManager.defineTask call runs as a side effect of this import.
import './app/services/notifications/backgroundBankTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
