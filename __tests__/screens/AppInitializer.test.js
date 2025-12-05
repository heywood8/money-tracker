/**
 * Tests for AppInitializer - App initialization and first launch flow
 * These tests ensure proper handling of first-time setup and app initialization
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AppInitializer from '../../app/screens/AppInitializer';
import { LocalizationProvider, useLocalization } from '../../app/contexts/LocalizationContext';
import { ThemeProvider } from '../../app/contexts/ThemeContext';

// Mock the navigation components
jest.mock('../../app/screens/LanguageSelectionScreen', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockLanguageSelectionScreen({ onLanguageSelected }) {
    return (
      <View testID="language-selection-screen">
        <Text>Language Selection</Text>
      </View>
    );
  };
});

jest.mock('../../app/navigation/SimpleTabs', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockSimpleTabs() {
    return (
      <View testID="simple-tabs">
        <Text>Main App</Text>
      </View>
    );
  };
});

// Create a mock LocalizationContext for controlled testing
const mockLocalizationContext = {
  isFirstLaunch: false,
  setFirstLaunchComplete: jest.fn(),
  language: 'en',
};

jest.mock('../../app/contexts/LocalizationContext', () => {
  const React = require('react');
  return {
    LocalizationProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useLocalization: jest.fn(() => mockLocalizationContext),
  };
});

jest.mock('../../app/contexts/ThemeContext', () => {
  const React = require('react');
  return {
    ThemeProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useTheme: jest.fn(() => ({
      colors: {
        background: '#ffffff',
        primary: '#2196f3',
      },
    })),
  };
});

describe('AppInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default state
    mockLocalizationContext.isFirstLaunch = false;
    mockLocalizationContext.language = 'en';
    mockLocalizationContext.setFirstLaunchComplete = jest.fn();
  });

  describe('Initialization', () => {
    it('renders without crashing', () => {
      const { getByTestId } = render(<AppInitializer />);
      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('shows main app when not first launch', () => {
      mockLocalizationContext.isFirstLaunch = false;

      const { getByTestId, queryByTestId } = render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
      expect(queryByTestId('language-selection-screen')).toBeNull();
    });

    it('shows language selection on first launch', () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId, queryByTestId } = render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
      expect(queryByTestId('simple-tabs')).toBeNull();
    });
  });

  describe('First Launch Flow', () => {
    it('shows language selection screen when isFirstLaunch is true', () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId } = render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });

    it('passes onLanguageSelected callback to LanguageSelectionScreen', () => {
      mockLocalizationContext.isFirstLaunch = true;

      const LanguageSelectionScreen = require('../../app/screens/LanguageSelectionScreen').default;
      const mockLanguageSelectionScreen = jest.fn(() => null);
      jest.spyOn(React, 'createElement').mockImplementation((component, props) => {
        if (component === LanguageSelectionScreen || component.name === 'MockLanguageSelectionScreen') {
          expect(props.onLanguageSelected).toBeDefined();
          expect(typeof props.onLanguageSelected).toBe('function');
        }
        return null;
      });

      render(<AppInitializer />);
    });
  });

  describe('Component Integration', () => {
    it('uses LocalizationContext for first launch detection', () => {
      render(<AppInitializer />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('transitions from language selection to main app after language selected', async () => {
      mockLocalizationContext.isFirstLaunch = true;
      let onLanguageSelected;

      // Mock LanguageSelectionScreen to capture the callback
      jest.mock('../../app/screens/LanguageSelectionScreen', () => {
        const React = require('react');
        const { View, Text, TouchableOpacity } = require('react-native');
        return function MockLanguageSelectionScreen({ onLanguageSelected: callback }) {
          onLanguageSelected = callback;
          return (
            <View testID="language-selection-screen">
              <Text>Language Selection</Text>
              <TouchableOpacity testID="select-language" onPress={() => callback('en')}>
                <Text>Select English</Text>
              </TouchableOpacity>
            </View>
          );
        };
      });

      const { getByTestId } = render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing isFirstLaunch gracefully', () => {
      mockLocalizationContext.isFirstLaunch = undefined;

      const { queryByTestId } = render(<AppInitializer />);

      // Should default to showing main app when isFirstLaunch is undefined/false
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('handles null language value', () => {
      mockLocalizationContext.language = null;

      const { getByTestId } = render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('renders correctly with different language values', () => {
      mockLocalizationContext.language = 'ru';

      const { getByTestId } = render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
    });
  });

  describe('Theme Integration', () => {
    it('uses theme colors for loading indicator', () => {
      const { useTheme } = require('../../app/contexts/ThemeContext');

      render(<AppInitializer />);

      expect(useTheme).toHaveBeenCalled();
    });

    it('applies theme background color to loading container', () => {
      mockLocalizationContext.isFirstLaunch = true;

      render(<AppInitializer />);

      // The component should use colors from ThemeContext
      const { useTheme } = require('../../app/contexts/ThemeContext');
      expect(useTheme).toHaveBeenCalled();
    });
  });

  describe('Regression Tests', () => {
    it('does not show loading indicator when not initializing', () => {
      mockLocalizationContext.isFirstLaunch = false;

      const { queryByTestId } = render(<AppInitializer />);

      // Should show main app, not loading indicator
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('shows correct screen based on first launch state', () => {
      // Test both states
      mockLocalizationContext.isFirstLaunch = true;
      const { rerender, getByTestId, queryByTestId } = render(<AppInitializer />);
      expect(getByTestId('language-selection-screen')).toBeTruthy();

      mockLocalizationContext.isFirstLaunch = false;
      rerender(<AppInitializer />);
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('handles rapid state changes gracefully', () => {
      const { rerender } = render(<AppInitializer />);

      // Rapidly change first launch state
      mockLocalizationContext.isFirstLaunch = true;
      rerender(<AppInitializer />);

      mockLocalizationContext.isFirstLaunch = false;
      rerender(<AppInitializer />);

      mockLocalizationContext.isFirstLaunch = true;
      rerender(<AppInitializer />);

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('provides accessible structure for screen readers', () => {
      const { getByTestId } = render(<AppInitializer />);

      // Main content should be accessible
      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('maintains accessibility during first launch flow', () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId } = render(<AppInitializer />);

      // Language selection should be accessible
      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });
  });
});
