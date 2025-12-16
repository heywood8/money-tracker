// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock Sentry to prevent open handle from AsyncExpiringMap timer
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((component) => component),
  ReactNativeProfiler: ({ children }) => children,
  ReactNavigationInstrumentation: jest.fn(),
  TouchEventBoundary: ({ children }) => children,
  FeedbackWidgetProvider: ({ children }) => children,
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  addBreadcrumb: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({})),
  feedbackIntegration: jest.fn(() => ({})),
}));

// Mock expo-sqlite with async methods
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn(() => Promise.resolve({ changes: 0, lastInsertRowId: 0 })),
    getFirstAsync: jest.fn(() => Promise.resolve(null)),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    closeAsync: jest.fn(() => Promise.resolve()),
    withTransactionAsync: jest.fn((callback) => callback()),
  })),
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    closeSync: jest.fn(),
  })),
}));

// Mock Drizzle migrations
jest.mock('./drizzle/migrations', () => ({
  __esModule: true,
  default: {
    journal: {
      version: '7',
      dialect: 'sqlite',
      entries: [],
    },
    migrations: {},
  },
}));

// Mock drizzle-orm migrator
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  migrate: jest.fn(() => Promise.resolve()),
}));

// Mock drizzle-orm
jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn((db, config) => {
    // Return a mock Drizzle instance with query builder methods
    return {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve([])),
            orderBy: jest.fn(() => Promise.resolve([])),
          })),
          orderBy: jest.fn(() => Promise.resolve([])),
          leftJoin: jest.fn(() => ({
            where: jest.fn(() => Promise.resolve([])),
          })),
          limit: jest.fn(() => Promise.resolve([])),
        })),
      })),
      insert: jest.fn(() => ({
        values: jest.fn(() => Promise.resolve()),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve()),
        })),
      })),
      delete: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve()),
      })),
    };
  }),
}));

// Mock drizzle-orm operators
jest.mock('drizzle-orm', () => {
  // Mock sql as a template literal function
  const sqlMock = jest.fn((strings, ...values) => {
    // Return a simple object representing the SQL query
    return { strings, values, sql: true };
  });
  sqlMock.raw = jest.fn((str) => str);

  return {
    eq: jest.fn((field, value) => ({ field, value, op: 'eq' })),
    and: jest.fn((...conditions) => ({ conditions, op: 'and' })),
    desc: jest.fn((field) => ({ field, direction: 'desc' })),
    asc: jest.fn((field) => ({ field, direction: 'asc' })),
    sql: sqlMock,
  };
});

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
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
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
      message.includes(pattern),
    );
    
    if (!shouldSuppress) {
      originalConsoleError.apply(console, args);
    }
  };

  console.warn = (...args) => {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
    ).join(' ');
    
    const suppressedPatterns = [
      'act(...)',
      'Warning:',
      'not found',
      'skipping',
      'Failed to checkpoint database',
      'dynamic import callback',
      'experimental-vm-modules',
    ];
    
    const shouldSuppress = suppressedPatterns.some(pattern =>
      message.includes(pattern),
    );
    
    if (!shouldSuppress) {
      originalConsoleWarn.apply(console, args);
    }
  };

  console.log = (...args) => {
    // Suppress all console.log during tests
    // If you need to see logs for debugging, comment out this line
    // originalConsoleLog.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});
