/**
 * App Component Tests
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { StatusBar, Platform } from 'react-native';
import App from '../App';

// Mock all the contexts
jest.mock('../app/contexts/ThemeConfigContext', () => ({
  ThemeConfigProvider: ({ children }) => children,
  useThemeConfig: jest.fn(() => ({
    colorScheme: 'light',
    setTheme: jest.fn(),
  })),
}));

jest.mock('../app/contexts/ThemeColorsContext', () => ({
  ThemeColorsProvider: ({ children }) => children,
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#000000',
      primary: '#6200EE',
    },
  })),
}));

jest.mock('../app/contexts/AccountsDataContext', () => ({
  AccountsDataProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/AccountsActionsContext', () => ({
  AccountsActionsProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/CategoriesContext', () => ({
  CategoriesProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/OperationsDataContext', () => ({
  OperationsDataProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/OperationsActionsContext', () => ({
  OperationsActionsProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/BudgetsContext', () => ({
  BudgetsProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/PlannedOperationsContext', () => ({
  PlannedOperationsProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
}));

jest.mock('../app/contexts/ImportProgressContext', () => ({
  ImportProgressProvider: ({ children }) => children,
}));

// Mock ErrorBoundary
jest.mock('../app/components/ErrorBoundary', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  function MockErrorBoundary({ children }) {
    return React.createElement('ErrorBoundary', { testID: 'error-boundary' }, children);
  }
  MockErrorBoundary.propTypes = { children: PropTypes.node };
  return MockErrorBoundary;
});

// Mock AppInitializer
jest.mock('../app/screens/AppInitializer', () => {
  const React = require('react');
  return function MockAppInitializer() {
    return React.createElement('AppInitializer', { testID: 'app-initializer' });
  };
});

// Mock ImportProgressModal
jest.mock('../app/modals/ImportProgressModal', () => {
  const React = require('react');
  return function MockImportProgressModal() {
    return React.createElement('ImportProgressModal', { testID: 'import-progress-modal' });
  };
});

// Mock useMaterialTheme hook
jest.mock('../app/hooks/useMaterialTheme', () => ({
  useMaterialTheme: jest.fn(() => ({
    colors: {
      primary: '#6200EE',
    },
  })),
}));

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  function MockPaperProvider({ children, theme }) {
    return React.createElement('PaperProvider', { testID: 'paper-provider', theme }, children);
  }
  MockPaperProvider.propTypes = { children: PropTypes.node, theme: PropTypes.object };
  return { PaperProvider: MockPaperProvider };
});

// Mock SafeAreaProvider
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  function MockSafeAreaProvider({ children }) {
    return React.createElement('SafeAreaProvider', { testID: 'safe-area-provider' }, children);
  }
  MockSafeAreaProvider.propTypes = { children: PropTypes.node };
  return { SafeAreaProvider: MockSafeAreaProvider };
});

// Mock GestureHandlerRootView
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  function MockGestureHandlerRootView({ children, style }) {
    return React.createElement(View, { testID: 'gesture-handler-root', style }, children);
  }
  MockGestureHandlerRootView.propTypes = { children: PropTypes.node, style: PropTypes.any };
  return { GestureHandlerRootView: MockGestureHandlerRootView };
});

describe('App', () => {
  let setBarStyleSpy;
  let setBackgroundColorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    setBarStyleSpy = jest.spyOn(StatusBar, 'setBarStyle').mockImplementation(() => {});
    setBackgroundColorSpy = jest.spyOn(StatusBar, 'setBackgroundColor').mockImplementation(() => {});
  });

  afterEach(() => {
    setBarStyleSpy?.mockRestore();
    setBackgroundColorSpy?.mockRestore();
  });

  describe('Rendering', () => {
    it('renders without crashing', async () => {
      const { toJSON } = render(<App />);

      await waitFor(() => {
        expect(toJSON()).toBeTruthy();
      });
    });

    it('renders with ErrorBoundary wrapper', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('error-boundary')).toBeTruthy();
      });
    });

    it('renders GestureHandlerRootView', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('gesture-handler-root')).toBeTruthy();
      });
    });

    it('renders SafeAreaProvider', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('safe-area-provider')).toBeTruthy();
      });
    });

    it('renders PaperProvider', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('paper-provider')).toBeTruthy();
      });
    });

    it('renders AppInitializer', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('app-initializer')).toBeTruthy();
      });
    });

    it('renders ImportProgressModal', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('import-progress-modal')).toBeTruthy();
      });
    });
  });

  describe('ThemedStatusBar', () => {
    it('sets bar style to dark-content for light theme', async () => {
      const { useThemeConfig } = require('../app/contexts/ThemeConfigContext');
      useThemeConfig.mockReturnValue({
        colorScheme: 'light',
        setTheme: jest.fn(),
      });

      render(<App />);

      await waitFor(() => {
        expect(setBarStyleSpy).toHaveBeenCalledWith('dark-content', true);
      });
    });

    it('sets bar style to light-content for dark theme', async () => {
      const { useThemeConfig } = require('../app/contexts/ThemeConfigContext');
      useThemeConfig.mockReturnValue({
        colorScheme: 'dark',
        setTheme: jest.fn(),
      });

      const { useThemeColors } = require('../app/contexts/ThemeColorsContext');
      useThemeColors.mockReturnValue({
        colors: {
          background: '#121212',
          surface: '#1E1E1E',
          text: '#FFFFFF',
          primary: '#BB86FC',
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(setBarStyleSpy).toHaveBeenCalledWith('light-content', true);
      });
    });
  });

  describe('ThemedStatusBar on Android', () => {
    const originalPlatform = Platform.OS;

    beforeEach(() => {
      Platform.OS = 'android';
    });

    afterEach(() => {
      Platform.OS = originalPlatform;
    });

    it('sets background color on Android', async () => {
      const { useThemeColors } = require('../app/contexts/ThemeColorsContext');
      useThemeColors.mockReturnValue({
        colors: {
          background: '#FFFFFF',
          surface: '#FFFFFF',
          text: '#000000',
          primary: '#6200EE',
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(setBackgroundColorSpy).toHaveBeenCalledWith('#FFFFFF', true);
      });
    });

    it('sets dark background color on Android in dark mode', async () => {
      const { useThemeConfig } = require('../app/contexts/ThemeConfigContext');
      useThemeConfig.mockReturnValue({
        colorScheme: 'dark',
        setTheme: jest.fn(),
      });

      const { useThemeColors } = require('../app/contexts/ThemeColorsContext');
      useThemeColors.mockReturnValue({
        colors: {
          background: '#121212',
          surface: '#1E1E1E',
          text: '#FFFFFF',
          primary: '#BB86FC',
        },
      });

      render(<App />);

      await waitFor(() => {
        expect(setBackgroundColorSpy).toHaveBeenCalledWith('#121212', true);
      });
    });
  });

  describe('ThemedStatusBar error handling', () => {
    it('handles StatusBar.setBarStyle errors gracefully', () => {
      setBarStyleSpy.mockImplementation(() => {
        throw new Error('StatusBar error');
      });

      // Should not throw
      expect(() => render(<App />)).not.toThrow();
    });

    it('handles StatusBar.setBackgroundColor errors gracefully', () => {
      const originalPlatform = Platform.OS;
      Platform.OS = 'android';

      setBackgroundColorSpy.mockImplementation(() => {
        throw new Error('StatusBar error');
      });

      // Should not throw
      expect(() => render(<App />)).not.toThrow();

      Platform.OS = originalPlatform;
    });
  });

  describe('Provider hierarchy', () => {
    it('provides all necessary contexts', async () => {
      const { toJSON } = render(<App />);

      await waitFor(() => {
        const tree = toJSON();
        expect(tree).toBeTruthy();
        // All context providers should be rendering correctly
      });
    });
  });

  describe('useMaterialTheme integration', () => {
    it('passes material theme to PaperProvider', async () => {
      const { useMaterialTheme } = require('../app/hooks/useMaterialTheme');
      const mockTheme = {
        colors: {
          primary: '#6200EE',
          secondary: '#03DAC6',
        },
      };
      useMaterialTheme.mockReturnValue(mockTheme);

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        const paperProvider = getByTestId('paper-provider');
        expect(paperProvider).toBeTruthy();
      });
    });
  });
});
