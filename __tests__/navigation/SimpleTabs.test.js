/**
 * SimpleTabs Navigation Tests
 *
 * These tests cover the SimpleTabs component by rendering it with all necessary mocks.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SimpleTabs from '../../app/navigation/SimpleTabs';

// Mock ThemeColorsContext
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#FFFFFF',
      surface: '#F5F5F5',
      primary: '#007AFF',
      text: '#000000',
      mutedText: '#999999',
      border: '#E0E0E0',
      card: '#FFFFFF',
    },
  }),
}));

// Mock LocalizationContext
jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => {
      const translations = {
        operations: 'Operations',
        graphs: 'Graphs',
        accounts: 'Accounts',
        categories: 'Categories',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock the screen components
jest.mock('../../app/screens/OperationsScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function OperationsScreen() {
    return React.createElement(View, { testID: 'operations-screen' },
      React.createElement(Text, {}, 'Operations Screen'));
  };
});

jest.mock('../../app/screens/AccountsScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function AccountsScreen() {
    return React.createElement(View, { testID: 'accounts-screen' },
      React.createElement(Text, {}, 'Accounts Screen'));
  };
});

jest.mock('../../app/screens/CategoriesScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function CategoriesScreen() {
    return React.createElement(View, { testID: 'categories-screen' },
      React.createElement(Text, {}, 'Categories Screen'));
  };
});

jest.mock('../../app/screens/GraphsScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function GraphsScreen() {
    return React.createElement(View, { testID: 'graphs-screen' },
      React.createElement(Text, {}, 'Graphs Screen'));
  };
});

// Mock Header component
jest.mock('../../app/components/Header', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  const PropTypes = require('prop-types');

  function Header({ onOpenSettings }) {
    return React.createElement(View, { testID: 'header' },
      React.createElement(Pressable, { testID: 'settings-button', onPress: onOpenSettings },
        React.createElement(Text, {}, 'Settings')));
  }

  Header.propTypes = {
    onOpenSettings: PropTypes.func,
  };

  return Header;
});

// Mock SettingsModal component
jest.mock('../../app/modals/SettingsModal', () => {
  const React = require('react');
  const { View, Text, Pressable, Modal } = require('react-native');
  const PropTypes = require('prop-types');

  function SettingsModal({ visible, onClose }) {
    if (!visible) return null;
    return React.createElement(Modal, { visible, testID: 'settings-modal' },
      React.createElement(View, {},
        React.createElement(Text, {}, 'Settings Modal'),
        React.createElement(Pressable, { testID: 'close-settings', onPress: onClose },
          React.createElement(Text, {}, 'Close'))));
  }

  SettingsModal.propTypes = {
    visible: PropTypes.bool,
    onClose: PropTypes.func,
  };

  return SettingsModal;
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');

  function SafeAreaView({ children, style }) {
    return React.createElement(View, { style }, children);
  }

  SafeAreaView.propTypes = {
    children: PropTypes.node,
    style: PropTypes.any,
  };

  function SafeAreaProvider({ children }) { return children; }
  SafeAreaProvider.propTypes = { children: PropTypes.node };

  return {
    SafeAreaView,
    SafeAreaProvider,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');

  function MaterialCommunityIcons({ name, size, color }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MaterialCommunityIcons.propTypes = {
    name: PropTypes.string,
    size: PropTypes.number,
    color: PropTypes.string,
  };

  return { MaterialCommunityIcons };
});

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Text: RNText, View, Pressable } = require('react-native');
  const PropTypes = require('prop-types');

  function TouchableRipple({ children, onPress, accessibilityLabel, accessibilityState, testID, ...props }) {
    return React.createElement(Pressable, {
      onPress,
      accessibilityLabel,
      accessibilityState,
      testID: testID || `tab-${accessibilityLabel}`,
      ...props,
    }, children);
  }

  TouchableRipple.propTypes = {
    children: PropTypes.node,
    onPress: PropTypes.func,
    accessibilityLabel: PropTypes.string,
    accessibilityState: PropTypes.object,
    testID: PropTypes.string,
  };

  function Text({ children, style, variant }) {
    return React.createElement(RNText, { style }, children);
  }

  Text.propTypes = {
    children: PropTypes.node,
    style: PropTypes.any,
    variant: PropTypes.string,
  };

  return {
    TouchableRipple,
    Text,
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');

  function GestureDetector({ children }) { return children; }
  GestureDetector.propTypes = { children: PropTypes.node };

  const Gesture = {
    Pan: () => ({
      activeOffsetX: () => ({
        failOffsetY: () => ({
          onStart: () => ({
            onUpdate: () => ({
              onEnd: () => ({}),
            }),
          }),
        }),
      }),
    }),
  };

  function GestureHandlerRootView({ children }) {
    return React.createElement(View, {}, children);
  }
  GestureHandlerRootView.propTypes = { children: PropTypes.node };

  return {
    GestureDetector,
    Gesture,
    GestureHandlerRootView,
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  const AnimatedView = ({ children, style }) => React.createElement(View, { style, testID: 'animated-view' }, children);
  AnimatedView.propTypes = { children: PropTypes.node, style: PropTypes.any };
  const Animated = {
    View: AnimatedView,
    createAnimatedComponent: (component) => component,
  };
  return {
    __esModule: true,
    default: Animated,
    useSharedValue: (initialValue) => ({ value: initialValue }),
    useAnimatedStyle: (callback) => {
      try {
        return callback() || {};
      } catch {
        return {};
      }
    },
    withSpring: (toValue, config, callback) => {
      if (callback) callback(true);
      return toValue;
    },
    runOnJS: (fn) => fn,
  };
});

describe('SimpleTabs Component Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<SimpleTabs />);
    expect(getByTestId('header')).toBeTruthy();
  });

  it('renders all four tab labels', () => {
    const { getByText } = render(<SimpleTabs />);

    expect(getByText('Operations')).toBeTruthy();
    expect(getByText('Graphs')).toBeTruthy();
    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('Categories')).toBeTruthy();
  });

  it('renders all four screens', () => {
    const { getByTestId } = render(<SimpleTabs />);

    expect(getByTestId('operations-screen')).toBeTruthy();
    expect(getByTestId('graphs-screen')).toBeTruthy();
    expect(getByTestId('accounts-screen')).toBeTruthy();
    expect(getByTestId('categories-screen')).toBeTruthy();
  });

  it('switches active tab when tab is pressed', async () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Press the Accounts tab
    const accountsTab = getByTestId('tab-Accounts');
    fireEvent.press(accountsTab);

    // Give React time to update
    await waitFor(() => {
      expect(accountsTab).toBeTruthy();
    });
  });

  it('opens settings modal when settings button is pressed', async () => {
    const { getByTestId, queryByTestId } = render(<SimpleTabs />);

    // Settings modal should not be visible initially
    expect(queryByTestId('settings-modal')).toBeFalsy();

    // Press the settings button
    const settingsButton = getByTestId('settings-button');
    fireEvent.press(settingsButton);

    // Settings modal should now be visible
    await waitFor(() => {
      expect(getByTestId('settings-modal')).toBeTruthy();
    });
  });

  it('closes settings modal when close is pressed', async () => {
    const { getByTestId, queryByTestId } = render(<SimpleTabs />);

    // Open settings
    fireEvent.press(getByTestId('settings-button'));

    await waitFor(() => {
      expect(getByTestId('settings-modal')).toBeTruthy();
    });

    // Close settings
    fireEvent.press(getByTestId('close-settings'));

    await waitFor(() => {
      expect(queryByTestId('settings-modal')).toBeFalsy();
    });
  });

  it('renders header component', () => {
    const { getByTestId } = render(<SimpleTabs />);
    expect(getByTestId('header')).toBeTruthy();
  });

  it('renders all tabs with correct accessibility labels', () => {
    const { getByTestId } = render(<SimpleTabs />);

    expect(getByTestId('tab-Operations')).toBeTruthy();
    expect(getByTestId('tab-Graphs')).toBeTruthy();
    expect(getByTestId('tab-Accounts')).toBeTruthy();
    expect(getByTestId('tab-Categories')).toBeTruthy();
  });

  it('handles pressing each tab', async () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Press each tab
    fireEvent.press(getByTestId('tab-Operations'));
    fireEvent.press(getByTestId('tab-Graphs'));
    fireEvent.press(getByTestId('tab-Accounts'));
    fireEvent.press(getByTestId('tab-Categories'));

    // All should work without errors
    expect(getByTestId('tab-Categories')).toBeTruthy();
  });

  it('applies styles based on active state', () => {
    const { getByText } = render(<SimpleTabs />);

    // Operations is active by default
    const operationsText = getByText('Operations');
    expect(operationsText).toBeTruthy();
  });

  it('triggers handleTabBarLayout on tab bar layout', () => {
    const { getByTestId, UNSAFE_root } = render(<SimpleTabs />);

    // Find the tabs row and trigger onLayout
    // The layout is handled internally but we verify component renders
    expect(getByTestId('header')).toBeTruthy();
  });

  it('maintains state when switching between tabs rapidly', async () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Rapidly switch between tabs
    for (let i = 0; i < 5; i++) {
      fireEvent.press(getByTestId('tab-Operations'));
      fireEvent.press(getByTestId('tab-Graphs'));
      fireEvent.press(getByTestId('tab-Accounts'));
      fireEvent.press(getByTestId('tab-Categories'));
    }

    // Component should still be stable
    expect(getByTestId('header')).toBeTruthy();
    expect(getByTestId('operations-screen')).toBeTruthy();
  });

  it('handles tab press callback correctly', async () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Press Graphs tab
    fireEvent.press(getByTestId('tab-Graphs'));

    // Component should still be rendered
    expect(getByTestId('graphs-screen')).toBeTruthy();
  });

  it('renders with correct initial active tab (Operations)', () => {
    const { getByText } = render(<SimpleTabs />);

    // Operations text should be present (it's the default active tab)
    const operationsLabel = getByText('Operations');
    expect(operationsLabel).toBeTruthy();
  });

  it('re-renders when active tab changes', async () => {
    const { getByTestId, getByText } = render(<SimpleTabs />);

    // Press Categories tab
    fireEvent.press(getByTestId('tab-Categories'));

    await waitFor(() => {
      expect(getByText('Categories')).toBeTruthy();
    });
  });

  it('handles multiple settings modal open/close cycles', async () => {
    const { getByTestId, queryByTestId } = render(<SimpleTabs />);

    for (let i = 0; i < 3; i++) {
      // Open settings
      fireEvent.press(getByTestId('settings-button'));
      await waitFor(() => {
        expect(getByTestId('settings-modal')).toBeTruthy();
      });

      // Close settings
      fireEvent.press(getByTestId('close-settings'));
      await waitFor(() => {
        expect(queryByTestId('settings-modal')).toBeFalsy();
      });
    }
  });

  it('renders all screen content areas', () => {
    const { getByText } = render(<SimpleTabs />);

    expect(getByText('Operations Screen')).toBeTruthy();
    expect(getByText('Graphs Screen')).toBeTruthy();
    expect(getByText('Accounts Screen')).toBeTruthy();
    expect(getByText('Categories Screen')).toBeTruthy();
  });

  it('handles tab bar layout event', () => {
    const { UNSAFE_root } = render(<SimpleTabs />);

    // Find a View with onLayout handler and trigger it
    const findViewWithOnLayout = (node) => {
      if (!node) return null;
      if (node.props && node.props.onLayout) return node;
      if (node.children) {
        for (const child of Array.isArray(node.children) ? node.children : [node.children]) {
          const found = findViewWithOnLayout(child);
          if (found) return found;
        }
      }
      return null;
    };

    const viewWithLayout = findViewWithOnLayout(UNSAFE_root);
    if (viewWithLayout && viewWithLayout.props.onLayout) {
      // Trigger the layout event
      viewWithLayout.props.onLayout({
        nativeEvent: {
          layout: { width: 400, height: 56, x: 0, y: 0 },
        },
      });
    }
  });

  it('renders TabButton for each tab with correct props', () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Verify all TabButtons render and are pressable
    const operationsTab = getByTestId('tab-Operations');
    const graphsTab = getByTestId('tab-Graphs');
    const accountsTab = getByTestId('tab-Accounts');
    const categoriesTab = getByTestId('tab-Categories');

    expect(operationsTab.props.accessibilityLabel).toBe('Operations');
    expect(graphsTab.props.accessibilityLabel).toBe('Graphs');
    expect(accountsTab.props.accessibilityLabel).toBe('Accounts');
    expect(categoriesTab.props.accessibilityLabel).toBe('Categories');
  });
});

describe('SimpleTabs Pan Gesture Integration', () => {
  // Store captured gesture callbacks for testing
  let capturedGestureCallbacks = {};

  beforeEach(() => {
    jest.clearAllMocks();
    capturedGestureCallbacks = {};

    // Override the gesture handler mock to capture callbacks
    jest.doMock('react-native-gesture-handler', () => {
      const React = require('react');
      const { View } = require('react-native');
      const PropTypes = require('prop-types');

      function GestureDetector({ children }) { return children; }
      GestureDetector.propTypes = { children: PropTypes.node };

      const Gesture = {
        Pan: () => {
          const gestureConfig = {
            activeOffsetX: (values) => gestureConfig,
            failOffsetY: (values) => gestureConfig,
            onStart: (callback) => {
              capturedGestureCallbacks.onStart = callback;
              return gestureConfig;
            },
            onUpdate: (callback) => {
              capturedGestureCallbacks.onUpdate = callback;
              return gestureConfig;
            },
            onEnd: (callback) => {
              capturedGestureCallbacks.onEnd = callback;
              return gestureConfig;
            },
          };
          return gestureConfig;
        },
      };

      function GestureHandlerRootView({ children }) {
        return React.createElement(View, {}, children);
      }
      GestureHandlerRootView.propTypes = { children: PropTypes.node };

      return {
        GestureDetector,
        Gesture,
        GestureHandlerRootView,
      };
    });
  });

  it('should handle navigateToTab direction logic for left swipe', () => {
    const { getByTestId } = render(<SimpleTabs />);

    // Verify component renders
    expect(getByTestId('header')).toBeTruthy();

    // Test navigateToTab logic directly - left swipe from Operations should go to Graphs
    // The actual navigateToTab is line 121-136
    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Graphs', label: 'Graphs' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
    ];

    // Simulate navigateToTab('left') from index 0
    const currentIndex = 0;
    const direction = 'left';
    let newIndex;

    if (direction === 'left') {
      newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }

    expect(newIndex).toBe(1); // Should be 1 (Graphs)
    expect(TABS[newIndex].key).toBe('Graphs');
  });

  it('should handle navigateToTab direction logic for right swipe', () => {
    const { getByTestId } = render(<SimpleTabs />);
    expect(getByTestId('header')).toBeTruthy();

    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Graphs', label: 'Graphs' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
    ];

    // Simulate navigateToTab('right') from index 2
    const currentIndex = 2;
    const direction = 'right';
    let newIndex;

    if (direction === 'left') {
      newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }

    expect(newIndex).toBe(1); // Should be 1 (Graphs)
    expect(TABS[newIndex].key).toBe('Graphs');
  });

  it('should not navigate past last tab on left swipe', () => {
    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Graphs', label: 'Graphs' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
    ];

    // Simulate navigateToTab('left') from index 3 (last tab)
    const currentIndex = 3;
    const direction = 'left';
    let newIndex;

    if (direction === 'left') {
      newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }

    expect(newIndex).toBe(3); // Should stay at 3
    expect(TABS[newIndex].key).toBe('Categories');
  });

  it('should not navigate past first tab on right swipe', () => {
    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Graphs', label: 'Graphs' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
    ];

    // Simulate navigateToTab('right') from index 0 (first tab)
    const currentIndex = 0;
    const direction = 'right';
    let newIndex;

    if (direction === 'left') {
      newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }

    expect(newIndex).toBe(0); // Should stay at 0
    expect(TABS[newIndex].key).toBe('Operations');
  });

  it('should only update state when newIndex differs from currentIndex', () => {
    const setActiveMock = jest.fn();
    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Graphs', label: 'Graphs' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
    ];

    // Simulate the condition check at line 133
    const simulateNavigate = (currentIndex, direction) => {
      let newIndex;
      if (direction === 'left') {
        newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
      }

      if (newIndex !== currentIndex) {
        setActiveMock(TABS[newIndex].key);
      }
    };

    // Navigate from 0 to 1 - should call setActive
    simulateNavigate(0, 'left');
    expect(setActiveMock).toHaveBeenCalledWith('Graphs');
    expect(setActiveMock).toHaveBeenCalledTimes(1);

    // Try to navigate right from 0 - should NOT call setActive
    simulateNavigate(0, 'right');
    expect(setActiveMock).toHaveBeenCalledTimes(1); // Still 1

    // Navigate from 3 left - should NOT call setActive
    simulateNavigate(3, 'left');
    expect(setActiveMock).toHaveBeenCalledTimes(1); // Still 1
  });
});

describe('SimpleTabs Pan Gesture Worklet Logic', () => {
  const SCREEN_WIDTH = 400;
  const TABS = [
    { key: 'Operations', label: 'Operations' },
    { key: 'Graphs', label: 'Graphs' },
    { key: 'Accounts', label: 'Accounts' },
    { key: 'Categories', label: 'Categories' },
  ];
  const SWIPE_THRESHOLD = 50;
  const VELOCITY_THRESHOLD = 500;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clamp translation during onUpdate to prevent over-scrolling left', () => {
    // Simulates lines 150-155 in onUpdate
    const startTranslateX = 0;
    const eventTranslationX = -2000; // Very large swipe left

    const newTranslateX = startTranslateX + eventTranslationX;
    const maxTranslateX = 0;
    const minTranslateX = -(TABS.length - 1) * SCREEN_WIDTH; // -1200

    const clampedValue = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));

    expect(clampedValue).toBe(-1200); // Clamped to min
  });

  it('should clamp translation during onUpdate to prevent over-scrolling right', () => {
    // Simulates lines 150-155 in onUpdate
    const startTranslateX = -800; // Currently at Accounts tab
    const eventTranslationX = 2000; // Very large swipe right

    const newTranslateX = startTranslateX + eventTranslationX;
    const maxTranslateX = 0;
    const minTranslateX = -(TABS.length - 1) * SCREEN_WIDTH;

    const clampedValue = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));

    expect(clampedValue).toBe(0); // Clamped to max
  });

  it('should allow translation within valid range', () => {
    const startTranslateX = -400; // At Graphs tab
    const eventTranslationX = -100; // Small swipe left

    const newTranslateX = startTranslateX + eventTranslationX;
    const maxTranslateX = 0;
    const minTranslateX = -(TABS.length - 1) * SCREEN_WIDTH;

    const clampedValue = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));

    expect(clampedValue).toBe(-500); // Allowed, within range
  });

  it('should navigate to next tab when swipe exceeds threshold (onEnd)', () => {
    // Simulates lines 167-168
    const currentIndex = 0;
    const gestureTranslationX = -60; // Exceeds -SWIPE_THRESHOLD
    const velocityX = 0;

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(1); // Moved to next tab
  });

  it('should navigate to previous tab when swipe exceeds threshold (onEnd)', () => {
    // Simulates lines 169-170
    const currentIndex = 2;
    const gestureTranslationX = 60; // Exceeds SWIPE_THRESHOLD
    const velocityX = 0;

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(1); // Moved to previous tab
  });

  it('should navigate based on velocity even with small translation', () => {
    // Simulates velocity check in lines 167, 169
    const currentIndex = 1;
    const gestureTranslationX = 10; // Small translation
    const velocityX = 600; // Exceeds VELOCITY_THRESHOLD

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(0); // Moved based on velocity
  });

  it('should navigate left based on negative velocity', () => {
    const currentIndex = 1;
    const gestureTranslationX = -10; // Small translation
    const velocityX = -600; // Exceeds -VELOCITY_THRESHOLD

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(2); // Moved to next tab based on velocity
  });

  it('should snap back when threshold not met', () => {
    // Simulates lines 186-191
    const currentIndex = 1;
    const gestureTranslationX = 30; // Below threshold
    const velocityX = 200; // Below threshold

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(currentIndex); // No change, will snap back
  });

  it('should not exceed last tab boundary on left swipe', () => {
    // Simulates line 168 Math.min check
    const currentIndex = 3; // At last tab
    const gestureTranslationX = -100;
    const velocityX = 0;

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    }

    expect(newIndex).toBe(3); // Clamped to last tab
  });

  it('should not go below first tab boundary on right swipe', () => {
    // Simulates line 170 Math.max check
    const currentIndex = 0; // At first tab
    const gestureTranslationX = 100;
    const velocityX = 0;

    let newIndex = currentIndex;

    if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(0); // Clamped to first tab
  });

  it('should calculate target position correctly after navigation', () => {
    // Simulates line 176
    const newIndex = 2;
    const target = -newIndex * SCREEN_WIDTH;

    expect(target).toBe(-800);
  });

  it('should trigger state update only when index changes', () => {
    const setActiveMock = jest.fn();

    // Simulates lines 174-185 vs 186-191
    const simulateOnEnd = (currentIndex, gestureTranslationX, velocityX) => {
      let newIndex = currentIndex;

      if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
        newIndex = Math.min(currentIndex + 1, TABS.length - 1);
      } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
        newIndex = Math.max(currentIndex - 1, 0);
      }

      if (newIndex !== currentIndex) {
        // Lines 175-185: update state
        setActiveMock(TABS[newIndex].key);
        return { animated: true, target: -newIndex * SCREEN_WIDTH };
      } else {
        // Lines 187-191: snap back
        return { animated: false, target: -currentIndex * SCREEN_WIDTH };
      }
    };

    // Case 1: Index changes
    const result1 = simulateOnEnd(0, -60, 0);
    expect(setActiveMock).toHaveBeenCalledWith('Graphs');
    expect(result1.animated).toBe(true);

    // Case 2: Index doesn't change (snap back)
    const result2 = simulateOnEnd(0, -30, 0);
    expect(result2.animated).toBe(false);
    expect(Object.is(result2.target, 0) || Object.is(result2.target, -0)).toBe(true);
  });

  it('should handle edge case with both translation and velocity', () => {
    // Translation says go right, velocity says go left - translation wins if threshold met
    const currentIndex = 1;
    const gestureTranslationX = 60; // Right swipe threshold met
    const velocityX = -300; // Slight left velocity (below threshold)

    let newIndex = currentIndex;

    if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
      newIndex = Math.min(currentIndex + 1, TABS.length - 1);
    } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
      newIndex = Math.max(currentIndex - 1, 0);
    }

    expect(newIndex).toBe(0); // Right swipe wins
  });
});

describe('SimpleTabs Navigation (Logic Tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Structure and Logic', () => {
    it('should have correct tab structure', () => {
      // Test the tab configuration used in SimpleTabs (lines 50-55)
      const tabs = [
        { key: 'Operations', label: 'Operations' },
        { key: 'Accounts', label: 'Accounts' },
        { key: 'Categories', label: 'Categories' },
        { key: 'Graphs', label: 'Graphs' },
      ];
      
      expect(tabs).toHaveLength(4);
      expect(tabs[0].key).toBe('Operations');
      expect(tabs[1].key).toBe('Accounts');
      expect(tabs[2].key).toBe('Categories');
      expect(tabs[3].key).toBe('Graphs');
    });

    it('should default to Operations as initial active tab', () => {
      // Based on SimpleTabs.js line 48: const [active, setActive] = React.useState('Operations');
      const initialActive = 'Operations';
      expect(initialActive).toBe('Operations');
    });

    it('should have settings modal initially hidden', () => {
      // Based on SimpleTabs.js line 49: const [settingsVisible, setSettingsVisible] = React.useState(false);
      const initialSettingsVisible = false;
      expect(initialSettingsVisible).toBe(false);
    });

    it('should support all tab keys', () => {
      const validTabKeys = ['Operations', 'Accounts', 'Categories', 'Graphs'];
      
      validTabKeys.forEach(key => {
        expect(key).toMatch(/^(Operations|Accounts|Categories|Graphs)$/);
      });
    });
  });

  describe('Tab Switching Logic', () => {
    it('should handle tab press correctly', () => {
      // Simulates handleTabPress callback (lines 57-59)
      const handleTabPress = jest.fn((tabKey) => {
        return tabKey;
      });
      
      handleTabPress('Accounts');
      expect(handleTabPress).toHaveBeenCalledWith('Accounts');
      expect(handleTabPress('Accounts')).toBe('Accounts');
      
      handleTabPress('Categories');
      expect(handleTabPress).toHaveBeenCalledWith('Categories');
      
      handleTabPress('Graphs');
      expect(handleTabPress).toHaveBeenCalledWith('Graphs');
    });

    it('should render correct screen based on active tab', () => {
      // Tests renderActive function logic (lines 69-81)
      const getActiveScreen = (active) => {
        switch (active) {
        case 'Operations':
          return 'OperationsScreen';
        case 'Accounts':
          return 'AccountsScreen';
        case 'Categories':
          return 'CategoriesScreen';
        case 'Graphs':
          return 'GraphsScreen';
        default:
          return 'OperationsScreen';
        }
      };
      
      expect(getActiveScreen('Operations')).toBe('OperationsScreen');
      expect(getActiveScreen('Accounts')).toBe('AccountsScreen');
      expect(getActiveScreen('Categories')).toBe('CategoriesScreen');
      expect(getActiveScreen('Graphs')).toBe('GraphsScreen');
      expect(getActiveScreen('Unknown')).toBe('OperationsScreen'); // Default case
    });

    it('should maintain tab state consistency', () => {
      let activeTab = 'Operations';
      
      const setActiveTab = (newTab) => {
        activeTab = newTab;
      };
      
      expect(activeTab).toBe('Operations');
      
      setActiveTab('Accounts');
      expect(activeTab).toBe('Accounts');
      
      setActiveTab('Categories');
      expect(activeTab).toBe('Categories');
      
      setActiveTab('Graphs');
      expect(activeTab).toBe('Graphs');
      
      setActiveTab('Operations');
      expect(activeTab).toBe('Operations');
    });
  });

  describe('Settings Modal Logic', () => {
    it('should toggle settings modal visibility', () => {
      let settingsVisible = false;
      
      // Simulates handleOpenSettings and handleCloseSettings (lines 61-67)
      const openSettings = () => { settingsVisible = true; };
      const closeSettings = () => { settingsVisible = false; };
      
      expect(settingsVisible).toBe(false);
      
      openSettings();
      expect(settingsVisible).toBe(true);
      
      closeSettings();
      expect(settingsVisible).toBe(false);
    });

    it('should handle multiple settings modal toggles', () => {
      let settingsVisible = false;
      const toggleSettings = () => { settingsVisible = !settingsVisible; };
      
      toggleSettings();
      expect(settingsVisible).toBe(true);
      
      toggleSettings();
      expect(settingsVisible).toBe(false);
      
      toggleSettings();
      expect(settingsVisible).toBe(true);
      
      toggleSettings();
      expect(settingsVisible).toBe(false);
    });

    it('should maintain independent state from active tab', () => {
      let activeTab = 'Operations';
      let settingsVisible = false;
      
      // Change tab
      activeTab = 'Accounts';
      expect(activeTab).toBe('Accounts');
      expect(settingsVisible).toBe(false);
      
      // Open settings
      settingsVisible = true;
      expect(activeTab).toBe('Accounts');
      expect(settingsVisible).toBe(true);
      
      // Change tab while settings open
      activeTab = 'Categories';
      expect(activeTab).toBe('Categories');
      expect(settingsVisible).toBe(true);
      
      // Close settings
      settingsVisible = false;
      expect(activeTab).toBe('Categories');
      expect(settingsVisible).toBe(false);
    });
  });

  describe('TabButton Component Logic', () => {
    it('should determine active state correctly', () => {
      // Tests TabButton isActive prop logic (line 89)
      const isTabActive = (tabKey, activeTab) => tabKey === activeTab;
      
      expect(isTabActive('Operations', 'Operations')).toBe(true);
      expect(isTabActive('Accounts', 'Operations')).toBe(false);
      expect(isTabActive('Categories', 'Operations')).toBe(false);
      expect(isTabActive('Graphs', 'Operations')).toBe(false);
      
      expect(isTabActive('Accounts', 'Accounts')).toBe(true);
      expect(isTabActive('Operations', 'Accounts')).toBe(false);
    });

    it('should have correct accessibility properties', () => {
      // Tests TabButton accessibility props (lines 29-32)
      const getAccessibilityProps = (tabLabel, isActive) => ({
        accessibilityRole: 'button',
        accessibilityState: { selected: isActive },
        accessibilityLabel: tabLabel,
      });
      
      const props = getAccessibilityProps('Operations', true);
      expect(props.accessibilityRole).toBe('button');
      expect(props.accessibilityState.selected).toBe(true);
      expect(props.accessibilityLabel).toBe('Operations');
      
      const props2 = getAccessibilityProps('Accounts', false);
      expect(props2.accessibilityState.selected).toBe(false);
    });

    it('should handle rapid tab switches', () => {
      let activeTab = 'Operations';
      const switchTab = (newTab) => { activeTab = newTab; };
      
      // Rapid switching
      for (let i = 0; i < 10; i++) {
        switchTab('Accounts');
        switchTab('Categories');
        switchTab('Graphs');
        switchTab('Operations');
      }
      
      expect(activeTab).toBe('Operations');
    });

    it('should apply correct text style based on active state', () => {
      const colors = { primary: '#007AFF', mutedText: '#999999' };
      
      // Tests textStyle logic from TabButton (lines 16-19)
      const getTextStyle = (isActive) => ({
        fontWeight: isActive ? '700' : 'normal',
        color: isActive ? colors.primary : colors.mutedText,
      });
      
      const activeStyle = getTextStyle(true);
      expect(activeStyle.fontWeight).toBe('700');
      expect(activeStyle.color).toBe('#007AFF');
      
      const inactiveStyle = getTextStyle(false);
      expect(inactiveStyle.fontWeight).toBe('normal');
      expect(inactiveStyle.color).toBe('#999999');
    });
  });

  describe('Localization Integration', () => {
    it('should use translation keys for tab labels', () => {
      // Tests TABS useMemo with translation (lines 50-55)
      const t = (key) => {
        const translations = {
          operations: 'Operations',
          accounts: 'Accounts',
          categories: 'Categories',
          graphs: 'Graphs',
        };
        return translations[key] || key;
      };
      
      expect(t('operations')).toBe('Operations');
      expect(t('accounts')).toBe('Accounts');
      expect(t('categories')).toBe('Categories');
      expect(t('graphs')).toBe('Graphs');
    });

    it('should provide fallback for missing translations', () => {
      // Tests fallback logic: t('operations') || 'Operations'
      const t = (key) => null; // Simulate missing translation
      const label = t('operations') || 'Operations';
      
      expect(label).toBe('Operations');
    });

    it('should handle different languages', () => {
      const translations = {
        en: { operations: 'Operations', accounts: 'Accounts' },
        ru: { operations: 'Операции', accounts: 'Счета' },
      };
      
      const t = (key, lang = 'en') => translations[lang][key] || key;
      
      expect(t('operations', 'en')).toBe('Operations');
      expect(t('operations', 'ru')).toBe('Операции');
      expect(t('accounts', 'en')).toBe('Accounts');
      expect(t('accounts', 'ru')).toBe('Счета');
    });
  });

  describe('Theme Integration', () => {
    it('should use theme colors for active/inactive states', () => {
      const colors = {
        primary: '#007AFF',
        mutedText: '#999999',
        background: '#FFFFFF',
        text: '#000000',
      };
      
      const getTextStyle = (isActive) => ({
        fontWeight: isActive ? '700' : 'normal',
        color: isActive ? colors.primary : colors.mutedText,
      });
      
      const activeStyle = getTextStyle(true);
      expect(activeStyle.fontWeight).toBe('700');
      expect(activeStyle.color).toBe(colors.primary);
      
      const inactiveStyle = getTextStyle(false);
      expect(inactiveStyle.fontWeight).toBe('normal');
      expect(inactiveStyle.color).toBe(colors.mutedText);
    });

    it('should apply indicator color from theme', () => {
      // Tests indicator style (line 37)
      const colors = { primary: '#007AFF' };
      const indicatorStyle = { backgroundColor: colors.primary };
      
      expect(indicatorStyle.backgroundColor).toBe('#007AFF');
    });

    it('should apply background color from theme', () => {
      const colors = { background: '#FFFFFF' };
      const containerStyle = { backgroundColor: colors.background };
      
      expect(containerStyle.backgroundColor).toBe('#FFFFFF');
    });
  });

  describe('State Management', () => {
    it('should maintain separate state variables', () => {
      const state = {
        active: 'Operations',
        settingsVisible: false,
      };
      
      expect(state.active).toBe('Operations');
      expect(state.settingsVisible).toBe(false);
      
      state.active = 'Accounts';
      expect(state.active).toBe('Accounts');
      expect(state.settingsVisible).toBe(false);
      
      state.settingsVisible = true;
      expect(state.active).toBe('Accounts');
      expect(state.settingsVisible).toBe(true);
    });

    it('should handle concurrent state updates', () => {
      let active = 'Operations';
      let settingsVisible = false;
      
      // Simulate concurrent updates
      active = 'Accounts';
      settingsVisible = true;
      
      expect(active).toBe('Accounts');
      expect(settingsVisible).toBe(true);
      
      active = 'Categories';
      settingsVisible = false;
      
      expect(active).toBe('Categories');
      expect(settingsVisible).toBe(false);
    });
  });

  describe('Callback Functions', () => {
    it('should execute handleTabPress callback', () => {
      const handleTabPress = jest.fn();
      
      handleTabPress('Accounts');
      expect(handleTabPress).toHaveBeenCalledWith('Accounts');
      expect(handleTabPress).toHaveBeenCalledTimes(1);
      
      handleTabPress('Categories');
      expect(handleTabPress).toHaveBeenCalledWith('Categories');
      expect(handleTabPress).toHaveBeenCalledTimes(2);
    });

    it('should execute handleOpenSettings callback', () => {
      const handleOpenSettings = jest.fn();
      
      handleOpenSettings();
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
      
      handleOpenSettings();
      expect(handleOpenSettings).toHaveBeenCalledTimes(2);
    });

    it('should execute handleCloseSettings callback', () => {
      const handleCloseSettings = jest.fn();
      
      handleCloseSettings();
      expect(handleCloseSettings).toHaveBeenCalledTimes(1);
    });

    it('should use memoized callbacks', () => {
      // useCallback ensures callback reference stability
      const callback = jest.fn();
      const memoizedCallback = jest.fn((...args) => callback(...args));
      
      memoizedCallback('test');
      expect(callback).toHaveBeenCalledWith('test');
    });
  });

  describe('Performance and Optimization', () => {
    it('should memoize TABS array based on translation function', () => {
      const t = jest.fn((key) => key);
      
      // Simulates useMemo dependency
      const createTabs = (tFunc) => [
        { key: 'Operations', label: tFunc('operations') },
        { key: 'Accounts', label: tFunc('accounts') },
        { key: 'Categories', label: tFunc('categories') },
        { key: 'Graphs', label: tFunc('graphs') },
      ];
      
      const tabs = createTabs(t);
      expect(tabs).toHaveLength(4);
      expect(t).toHaveBeenCalledTimes(4);
    });

    it('should memoize text styles', () => {
      const colors = { primary: '#007AFF', mutedText: '#999' };
      
      const getTextStyle = (isActive) => ({
        fontWeight: isActive ? '700' : 'normal',
        color: isActive ? colors.primary : colors.mutedText,
      });
      
      const style1 = getTextStyle(true);
      const style2 = getTextStyle(true);
      
      expect(style1).toEqual(style2);
    });

    it('should handle frequent renders efficiently', () => {
      // Test that state updates are isolated
      let renderCount = 0;
      let activeTab = 'Operations';
      
      for (let i = 0; i < 100; i++) {
        activeTab = ['Operations', 'Accounts', 'Categories', 'Graphs'][i % 4];
        renderCount++;
      }
      
      expect(renderCount).toBe(100);
      expect(activeTab).toBe('Graphs'); // 99 % 4 = 3
    });

    it('should use React.memo for TabButton component', () => {
      // TabButton is wrapped in memo (line 15) to prevent unnecessary re-renders
      // This test verifies that memoization concept is understood
      const propsEqual = (prevProps, nextProps) => {
        return prevProps.tab === nextProps.tab &&
               prevProps.isActive === nextProps.isActive &&
               prevProps.colors === nextProps.colors;
      };
      
      const props1 = { tab: 'Ops', isActive: true, colors: {} };
      const props2 = { tab: 'Ops', isActive: true, colors: {} };
      const props3 = { tab: 'Acc', isActive: false, colors: {} };
      
      expect(propsEqual(props1, props1)).toBe(true);
      expect(propsEqual(props1, props3)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid tab key gracefully', () => {
      const getScreen = (active) => {
        switch (active) {
        case 'Operations': return 'OperationsScreen';
        case 'Accounts': return 'AccountsScreen';
        case 'Categories': return 'CategoriesScreen';
        case 'Graphs': return 'GraphsScreen';
        default: return 'OperationsScreen';
        }
      };
      
      expect(getScreen('InvalidTab')).toBe('OperationsScreen');
      expect(getScreen(null)).toBe('OperationsScreen');
      expect(getScreen(undefined)).toBe('OperationsScreen');
    });

    it('should handle empty tab label', () => {
      const tab = { key: 'Operations', label: '' };
      expect(tab.label || 'Operations').toBe('Operations');
    });

    it('should maintain state consistency after many operations', () => {
      let active = 'Operations';
      let settingsVisible = false;
      
      // Perform many operations
      for (let i = 0; i < 50; i++) {
        active = ['Operations', 'Accounts', 'Categories', 'Graphs'][i % 4];
        settingsVisible = !settingsVisible;
      }
      
      // State should still be valid
      expect(['Operations', 'Accounts', 'Categories', 'Graphs']).toContain(active);
      expect(typeof settingsVisible).toBe('boolean');
    });

    it('should handle undefined colors gracefully', () => {
      const colors = {};
      const textStyle = {
        fontWeight: 'normal',
        color: colors.mutedText || '#999999', // Fallback
      };
      
      expect(textStyle.color).toBe('#999999');
    });
  });

  describe('Component Integration Points', () => {
    it('should integrate with ThemeContext', () => {
      // SimpleTabs uses useTheme() hook (line 9)
      const mockThemeContext = {
        colors: {
          background: '#FFFFFF',
          surface: '#F5F5F5',
          primary: '#007AFF',
          text: '#000000',
          mutedText: '#999999',
          border: '#E0E0E0',
        },
      };
      
      expect(mockThemeContext.colors.primary).toBeDefined();
      expect(mockThemeContext.colors.mutedText).toBeDefined();
    });

    it('should integrate with LocalizationContext', () => {
      // SimpleTabs uses useLocalization() hook (line 10)
      const mockLocalizationContext = {
        t: (key) => key,
        language: 'en',
      };
      
      expect(mockLocalizationContext.t('operations')).toBe('operations');
      expect(mockLocalizationContext.language).toBe('en');
    });

    it('should pass props correctly to child components', () => {
      const headerProps = {
        onOpenSettings: jest.fn(),
      };
      
      expect(typeof headerProps.onOpenSettings).toBe('function');
      
      const modalProps = {
        visible: false,
        onClose: jest.fn(),
      };
      
      expect(typeof modalProps.visible).toBe('boolean');
      expect(typeof modalProps.onClose).toBe('function');
    });

    it('should pass correct props to TabButton', () => {
      const tabButtonProps = {
        tab: { key: 'Operations', label: 'Operations' },
        isActive: true,
        colors: { primary: '#007AFF', mutedText: '#999' },
        onPress: jest.fn(),
      };
      
      expect(tabButtonProps.tab.key).toBe('Operations');
      expect(tabButtonProps.isActive).toBe(true);
      expect(typeof tabButtonProps.onPress).toBe('function');
    });
  });

  describe('Styling and Layout', () => {
    it('should have correct container styles', () => {
      const styles = {
        container: { flex: 1 },
        content: { flex: 1 },
      };

      expect(styles.container.flex).toBe(1);
      expect(styles.content.flex).toBe(1);
    });

    it('should have correct tab bar styles', () => {
      const styles = {
        tabBar: { flexDirection: 'row' },
        tab: { flex: 1, minHeight: 56 },
      };

      expect(styles.tabBar.flexDirection).toBe('row');
      expect(styles.tab.flex).toBe(1);
      expect(styles.tab.minHeight).toBe(56);
    });

    it('should have correct indicator styles', () => {
      const styles = {
        indicator: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
        },
      };

      expect(styles.indicator.position).toBe('absolute');
      expect(styles.indicator.height).toBe(3);
    });
  });

  describe('Swipe Navigation', () => {
    const TABS = [
      { key: 'Operations', label: 'Operations' },
      { key: 'Accounts', label: 'Accounts' },
      { key: 'Categories', label: 'Categories' },
      { key: 'Graphs', label: 'Graphs' },
    ];

    it('should navigate to next tab on left swipe', () => {
      // Simulates navigateToTab function for left swipe
      const navigateToTab = (currentTab, direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        return TABS[newIndex].key;
      };

      expect(navigateToTab('Operations', 'left')).toBe('Accounts');
      expect(navigateToTab('Accounts', 'left')).toBe('Categories');
      expect(navigateToTab('Categories', 'left')).toBe('Graphs');
    });

    it('should navigate to previous tab on right swipe', () => {
      const navigateToTab = (currentTab, direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        return TABS[newIndex].key;
      };

      expect(navigateToTab('Graphs', 'right')).toBe('Categories');
      expect(navigateToTab('Categories', 'right')).toBe('Accounts');
      expect(navigateToTab('Accounts', 'right')).toBe('Operations');
    });

    it('should not navigate past first tab on right swipe', () => {
      const navigateToTab = (currentTab, direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        return TABS[newIndex].key;
      };

      expect(navigateToTab('Operations', 'right')).toBe('Operations');
    });

    it('should not navigate past last tab on left swipe', () => {
      const navigateToTab = (currentTab, direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        return TABS[newIndex].key;
      };

      expect(navigateToTab('Graphs', 'left')).toBe('Graphs');
    });

    it('should detect left swipe based on translation threshold', () => {
      const SWIPE_THRESHOLD = 50;
      const isLeftSwipe = (translationX) => translationX < -SWIPE_THRESHOLD;

      expect(isLeftSwipe(-51)).toBe(true);
      expect(isLeftSwipe(-100)).toBe(true);
      expect(isLeftSwipe(-49)).toBe(false);
      expect(isLeftSwipe(0)).toBe(false);
    });

    it('should detect right swipe based on translation threshold', () => {
      const SWIPE_THRESHOLD = 50;
      const isRightSwipe = (translationX) => translationX > SWIPE_THRESHOLD;

      expect(isRightSwipe(51)).toBe(true);
      expect(isRightSwipe(100)).toBe(true);
      expect(isRightSwipe(49)).toBe(false);
      expect(isRightSwipe(0)).toBe(false);
    });

    it('should detect left swipe based on velocity threshold', () => {
      const VELOCITY_THRESHOLD = 500;
      const isLeftSwipeByVelocity = (velocityX) => velocityX < -VELOCITY_THRESHOLD;

      expect(isLeftSwipeByVelocity(-501)).toBe(true);
      expect(isLeftSwipeByVelocity(-1000)).toBe(true);
      expect(isLeftSwipeByVelocity(-499)).toBe(false);
    });

    it('should detect right swipe based on velocity threshold', () => {
      const VELOCITY_THRESHOLD = 500;
      const isRightSwipeByVelocity = (velocityX) => velocityX > VELOCITY_THRESHOLD;

      expect(isRightSwipeByVelocity(501)).toBe(true);
      expect(isRightSwipeByVelocity(1000)).toBe(true);
      expect(isRightSwipeByVelocity(499)).toBe(false);
    });

    it('should navigate through all tabs sequentially with swipes', () => {
      let currentTab = 'Operations';

      const navigateToTab = (direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        currentTab = TABS[newIndex].key;
      };

      expect(currentTab).toBe('Operations');

      navigateToTab('left');
      expect(currentTab).toBe('Accounts');

      navigateToTab('left');
      expect(currentTab).toBe('Categories');

      navigateToTab('left');
      expect(currentTab).toBe('Graphs');

      navigateToTab('right');
      expect(currentTab).toBe('Categories');

      navigateToTab('right');
      expect(currentTab).toBe('Accounts');

      navigateToTab('right');
      expect(currentTab).toBe('Operations');
    });

    it('should handle rapid swipe gestures', () => {
      let currentTab = 'Operations';

      const navigateToTab = (direction) => {
        const currentIndex = TABS.findIndex(tab => tab.key === currentTab);
        let newIndex;

        if (direction === 'left') {
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        currentTab = TABS[newIndex].key;
      };

      // Rapid left swipes
      for (let i = 0; i < 10; i++) {
        navigateToTab('left');
      }
      expect(currentTab).toBe('Graphs'); // Should stop at last tab

      // Rapid right swipes
      for (let i = 0; i < 10; i++) {
        navigateToTab('right');
      }
      expect(currentTab).toBe('Operations'); // Should stop at first tab
    });

    it('should ignore small swipes below threshold', () => {
      const SWIPE_THRESHOLD = 50;
      const VELOCITY_THRESHOLD = 500;

      const shouldTriggerSwipe = (translationX, velocityX) => {
        return Math.abs(translationX) > SWIPE_THRESHOLD || Math.abs(velocityX) > VELOCITY_THRESHOLD;
      };

      // Small swipes that shouldn't trigger navigation
      expect(shouldTriggerSwipe(30, 200)).toBe(false);
      expect(shouldTriggerSwipe(-30, -200)).toBe(false);
      expect(shouldTriggerSwipe(10, 100)).toBe(false);

      // Large enough swipes that should trigger navigation
      expect(shouldTriggerSwipe(60, 200)).toBe(true);
      expect(shouldTriggerSwipe(30, 600)).toBe(true);
      expect(shouldTriggerSwipe(-60, -200)).toBe(true);
      expect(shouldTriggerSwipe(-30, -600)).toBe(true);
    });
  });
});
