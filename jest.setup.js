// Mock Expo's internal module registry and utilities to prevent "outside scope" errors
global.__ExpoImportMetaRegistry = {};

// Mock structuredClone which is causing scope issues
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock Expo's winter module to bypass scope checks
jest.mock('expo/src/winter/runtime.native.ts', () => ({
  require: jest.fn((module) => require(module)),
}), { virtual: true });

jest.mock('expo/src/winter/installGlobal.ts', () => ({
  getValue: jest.fn((key) => {
    if (key === 'structuredClone') return global.structuredClone;
    return undefined;
  }),
}), { virtual: true });

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

// Mock split context providers for tests that don't explicitly mock them
// These mocks provide the split contexts needed by the deprecated wrappers
jest.mock('./app/contexts/ThemeConfigContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const ThemeConfigContext = React.createContext();

  function ThemeConfigProvider({ children }) {
    const value = {
      theme: 'light',
      colorScheme: 'light',
      setTheme: jest.fn(),
    };
    return React.createElement(ThemeConfigContext.Provider, { value }, children);
  }
  ThemeConfigProvider.propTypes = { children: PropTypes.node };

  return {
    ThemeConfigProvider,
    useThemeConfig: jest.fn(() => ({
      theme: 'light',
      colorScheme: 'light',
      setTheme: jest.fn(),
    })),
  };
});

jest.mock('./app/contexts/ThemeColorsContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const ThemeColorsContext = React.createContext();

  const mockColors = {
    background: '#ffffff',
    surface: '#ffffff',
    primary: '#007AFF',
    text: '#111111',
    mutedText: '#666666',
    border: '#e6e6e6',
    danger: 'red',
  };

  function ThemeColorsProvider({ children }) {
    return React.createElement(ThemeColorsContext.Provider, { value: { colors: mockColors } }, children);
  }
  ThemeColorsProvider.propTypes = { children: PropTypes.node };

  return {
    ThemeColorsProvider,
    useThemeColors: jest.fn(() => ({ colors: mockColors })),
  };
});

jest.mock('./app/contexts/AccountsDataContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const AccountsDataContext = React.createContext();

  function AccountsDataProvider({ children }) {
    const value = {
      accounts: [],
      visibleAccounts: [],
      hiddenAccounts: [],
      displayedAccounts: [],
      showHiddenAccounts: false,
      loading: false,
      error: null,
    };
    return React.createElement(AccountsDataContext.Provider, { value }, children);
  }
  AccountsDataProvider.propTypes = { children: PropTypes.node };

  return {
    AccountsDataProvider,
    useAccountsData: jest.fn(() => ({
      accounts: [],
      visibleAccounts: [],
      hiddenAccounts: [],
      displayedAccounts: [],
      showHiddenAccounts: false,
      loading: false,
      error: null,
    })),
  };
});

jest.mock('./app/contexts/AccountsActionsContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const AccountsActionsContext = React.createContext();

  function AccountsActionsProvider({ children }) {
    const value = {
      addAccount: jest.fn(),
      updateAccount: jest.fn(),
      deleteAccount: jest.fn(),
      reloadAccounts: jest.fn(),
      reorderAccounts: jest.fn(),
      resetDatabase: jest.fn(),
      validateAccount: jest.fn(),
      getOperationCount: jest.fn(),
      toggleShowHiddenAccounts: jest.fn(),
    };
    return React.createElement(AccountsActionsContext.Provider, { value }, children);
  }
  AccountsActionsProvider.propTypes = { children: PropTypes.node };

  return {
    AccountsActionsProvider,
    useAccountsActions: jest.fn(() => ({
      addAccount: jest.fn(),
      updateAccount: jest.fn(),
      deleteAccount: jest.fn(),
      reloadAccounts: jest.fn(),
      reorderAccounts: jest.fn(),
      resetDatabase: jest.fn(),
      validateAccount: jest.fn(),
      getOperationCount: jest.fn(),
      toggleShowHiddenAccounts: jest.fn(),
    })),
  };
});

jest.mock('./app/contexts/OperationsDataContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const OperationsDataContext = React.createContext();

  function OperationsDataProvider({ children }) {
    const value = {
      operations: [],
      loading: false,
      loadingMore: false,
      loadingNewer: false,
      hasMoreOperations: false,
      hasNewerOperations: false,
      activeFilters: {
        types: [],
        accountIds: [],
        categoryIds: [],
        searchText: '',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      },
      filtersActive: false,
    };
    return React.createElement(OperationsDataContext.Provider, { value }, children);
  }
  OperationsDataProvider.propTypes = { children: PropTypes.node };

  return {
    OperationsDataProvider,
    useOperationsData: jest.fn(() => ({
      operations: [],
      loading: false,
      loadingMore: false,
      loadingNewer: false,
      hasMoreOperations: false,
      hasNewerOperations: false,
      activeFilters: {
        types: [],
        accountIds: [],
        categoryIds: [],
        searchText: '',
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      },
      filtersActive: false,
    })),
  };
});

jest.mock('./app/contexts/OperationsActionsContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');

  const OperationsActionsContext = React.createContext();

  function OperationsActionsProvider({ children }) {
    const value = {
      addOperation: jest.fn(),
      updateOperation: jest.fn(),
      deleteOperation: jest.fn(),
      validateOperation: jest.fn(),
      getOperationsByAccount: jest.fn(),
      getOperationsByCategory: jest.fn(),
      getOperationsByDateRange: jest.fn(),
      reloadOperations: jest.fn(),
      loadMoreOperations: jest.fn(),
      loadNewerOperations: jest.fn(),
      loadInitialOperations: jest.fn(),
      jumpToDate: jest.fn(),
      updateFilters: jest.fn(),
      clearFilters: jest.fn(),
      getActiveFilterCount: jest.fn(() => 0),
    };
    return React.createElement(OperationsActionsContext.Provider, { value }, children);
  }
  OperationsActionsProvider.propTypes = { children: PropTypes.node };

  return {
    OperationsActionsProvider,
    useOperationsActions: jest.fn(() => ({
      addOperation: jest.fn(),
      updateOperation: jest.fn(),
      deleteOperation: jest.fn(),
      validateOperation: jest.fn(),
      getOperationsByAccount: jest.fn(),
      getOperationsByCategory: jest.fn(),
      getOperationsByDateRange: jest.fn(),
      reloadOperations: jest.fn(),
      loadMoreOperations: jest.fn(),
      loadNewerOperations: jest.fn(),
      loadInitialOperations: jest.fn(),
      jumpToDate: jest.fn(),
      updateFilters: jest.fn(),
      clearFilters: jest.fn(),
      getActiveFilterCount: jest.fn(() => 0),
    })),
  };
});

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
  const React = require('react');

  const PropTypes = require('prop-types');

  const GestureDetector = ({ children }) => React.createElement(View, {}, children);
  GestureDetector.propTypes = { children: PropTypes.node };

  const Gesture = {
    Pan: jest.fn(() => ({
      onStart: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onFinalize: jest.fn().mockReturnThis(),
      enabled: jest.fn().mockReturnThis(),
      shouldCancelWhenOutside: jest.fn().mockReturnThis(),
      activeOffsetX: jest.fn().mockReturnThis(),
      activeOffsetY: jest.fn().mockReturnThis(),
      failOffsetX: jest.fn().mockReturnThis(),
      failOffsetY: jest.fn().mockReturnThis(),
      minDistance: jest.fn().mockReturnThis(),
      minPointers: jest.fn().mockReturnThis(),
      maxPointers: jest.fn().mockReturnThis(),
    })),
    Tap: jest.fn(() => ({
      onStart: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onFinalize: jest.fn().mockReturnThis(),
      enabled: jest.fn().mockReturnThis(),
      numberOfTaps: jest.fn().mockReturnThis(),
      maxDuration: jest.fn().mockReturnThis(),
    })),
    LongPress: jest.fn(() => ({
      onStart: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
      onFinalize: jest.fn().mockReturnThis(),
      enabled: jest.fn().mockReturnThis(),
      minDuration: jest.fn().mockReturnThis(),
    })),
  };

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
    GestureDetector,
    Gesture,
  };
});

// Mock react-native-paper components used in ListCard
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const PropTypes = require('prop-types');

  const Card = ({ children, style, mode, ...props }) => React.createElement(View, { style, ...props }, children);
  Card.propTypes = {
    children: PropTypes.node,
    style: PropTypes.any,
    mode: PropTypes.string,
  };

  const TouchableRipple = ({ children, onPress, onLongPress, style, ...props }) =>
    React.createElement(TouchableOpacity, { onPress, onLongPress, style, ...props }, children);
  TouchableRipple.propTypes = {
    children: PropTypes.node,
    onPress: PropTypes.func,
    onLongPress: PropTypes.func,
    style: PropTypes.any,
  };

  const Portal = ({ children }) => children;
  Portal.propTypes = { children: PropTypes.node };

  const Modal = ({ children, visible, ...props }) => visible ? React.createElement(View, props, children) : null;
  Modal.propTypes = { children: PropTypes.node, visible: PropTypes.bool };

  const TextInput = ({ ...props }) => React.createElement(View, props);
  TextInput.propTypes = { children: PropTypes.node };

  const Button = ({ children, onPress, ...props }) => React.createElement(TouchableOpacity, { onPress, ...props }, children);
  Button.propTypes = { children: PropTypes.node, onPress: PropTypes.func };

  const FAB = ({ onPress, icon, label, ...props }) => React.createElement(TouchableOpacity, { onPress, ...props });
  FAB.propTypes = { onPress: PropTypes.func, icon: PropTypes.string, label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) };

  const Switch = ({ value, onValueChange, ...props }) => React.createElement(View, props);
  Switch.propTypes = { value: PropTypes.bool, onValueChange: PropTypes.func };

  const Provider = ({ children }) => children;
  Provider.propTypes = { children: PropTypes.node };

  const PaperText = ({ children, style, ...props }) => React.createElement(Text, { style, ...props }, children);
  PaperText.propTypes = { children: PropTypes.node, style: PropTypes.any };

  return {
    Card,
    TouchableRipple,
    Portal,
    Modal,
    Text: PaperText,
    TextInput,
    Button,
    FAB,
    ActivityIndicator: View,
    Divider: View,
    Switch,
    Provider,
  };
});

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');

  const MockIcon = ({ name, size, color, ...props }) =>
    React.createElement(Text, { ...props, testID: `icon-${name}` }, name);
  MockIcon.propTypes = {
    name: PropTypes.string,
    size: PropTypes.number,
    color: PropTypes.string,
  };

  return {
    MaterialCommunityIcons: MockIcon,
    Ionicons: MockIcon,
    FontAwesome: MockIcon,
    Feather: MockIcon,
    MaterialIcons: MockIcon,
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

// Mock react-native-worklets
jest.mock('react-native-worklets', () => ({
  useSharedValue: jest.fn((value) => ({ value })),
  useWorklet: jest.fn((fn) => fn),
  createWorklet: jest.fn((fn) => fn),
  runOnJS: jest.fn((fn) => fn),
  runOnUI: jest.fn((fn) => fn),
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, Image, ScrollView } = require('react-native');

  return {
    __esModule: true,
    default: {
      View,
      Text,
      Image,
      ScrollView,
      createAnimatedComponent: (Component) => Component,
    },
    useSharedValue: jest.fn((value) => ({ value })),
    useAnimatedStyle: jest.fn((fn) => ({})),
    useDerivedValue: jest.fn((fn) => ({ value: fn() })),
    useAnimatedProps: jest.fn(() => ({})),
    useAnimatedScrollHandler: jest.fn(() => () => {}),
    useAnimatedGestureHandler: jest.fn(() => () => {}),
    useAnimatedReaction: jest.fn(),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    useWorkletCallback: jest.fn((fn) => fn),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    withDecay: jest.fn((value) => value),
    withDelay: jest.fn((delay, value) => value),
    withRepeat: jest.fn((value) => value),
    withSequence: jest.fn((...values) => values[0]),
    cancelAnimation: jest.fn(),
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
    createWorklet: jest.fn((fn) => fn),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      bezier: jest.fn(() => jest.fn()),
      in: jest.fn((easing) => easing),
      out: jest.fn((easing) => easing),
      inOut: jest.fn((easing) => easing),
    },
    Extrapolation: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity',
    },
    interpolate: jest.fn((value, input, output) => output[0]),
    Keyframe: class Keyframe {
      duration(ms) { return this; }
      delay(ms) { return this; }
      withCallback(callback) { return this; }
    },
    SharedValue: class SharedValue {
      constructor(value) { this.value = value; }
    },
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
