import { registerRootComponent } from 'expo';

import App from './App';

// Import widgets for react-native-android-widget
// This ensures widgets are loaded and available to the native code
import './app/widgets/widgets';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
