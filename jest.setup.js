// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    closeSync: jest.fn(),
  })),
}));

// Mock react-native-uuid
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// Mock Appearance API
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => 'light'),
  addChangeListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  removeChangeListener: jest.fn(),
}));

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('DateTimePicker'),
  };
});

// Mock react-native-chart-kit
jest.mock('react-native-chart-kit', () => ({
  LineChart: () => 'LineChart',
  PieChart: () => 'PieChart',
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Circle: 'Circle',
  Rect: 'Rect',
  Path: 'Path',
  G: 'G',
  Text: 'Text',
}));

// Mock ViewConfigIgnore to avoid Flow syntax issues
jest.mock('react-native/Libraries/NativeComponent/ViewConfigIgnore', () => ({
  ConditionallyIgnoredEventHandlers: (value) => value,
  DynamicallyInjectedByGestureHandler: (value) => value,
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native/Libraries/Components/View/View');
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(component => component),
    Directions: {},
    GestureHandlerRootView: View,
  };
});

// Mock react-native-draggable-flatlist
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: (props) => React.createElement(FlatList, props),
  };
});

// Suppress console.error and console.warn during tests to reduce noise
// This prevents expected errors from cluttering test output with red text
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = (...args) => {
    // Filter out expected error patterns that are part of normal test behavior
    // Combine all arguments into a single string for pattern matching
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const suppressedPatterns = [
      // Database and service layer errors (from AccountsDB, etc.)
      'Failed to',
      // Error messages used in tests
      'Database error',
      'Insert failed',
      'Update failed',
      'Delete failed',
      'Query failed',
      'Load failed',
      'Add failed',
      'Create failed',
      'Reload failed',
      'not found',
      'Division by zero',
      // React warnings during async tests
      'Warning: An update to',
      'Warning: Cannot update',
      'act(...)',
      // Error Boundary messages (expected during testing)
      'Error Boundary',
      'ErrorBoundary',
      'Element type is invalid',
      'Check the render method',
      'React will try to recreate',
      'The above error occurred',
      // Sentry-related messages
      '@sentry',
    ];
    
    const shouldSuppress = suppressedPatterns.some(pattern => 
      message.includes(pattern)
    );
    
    if (!shouldSuppress) {
      originalConsoleError.apply(console, args);
    }
  };

  console.warn = (...args) => {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const suppressedPatterns = [
      'act(...)',
      'Warning:',
      'not found',
      'skipping',
    ];
    
    const shouldSuppress = suppressedPatterns.some(pattern =>
      message.includes(pattern)
    );
    
    if (!shouldSuppress) {
      originalConsoleWarn.apply(console, args);
    }
  };

  console.log = (...args) => {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const suppressedPatterns = [
      // Suppress expected log messages during tests
      'Performing first-time migration',
      'No accounts found',
      'creating defaults',
    ];
    
    const shouldSuppress = suppressedPatterns.some(pattern =>
      message.includes(pattern)
    );
    
    if (!shouldSuppress) {
      originalConsoleLog.apply(console, args);
    }
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});
