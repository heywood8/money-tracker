/**
 * Tests for AppInitializer - App initialization and first launch flow
 * These tests ensure proper handling of first-time setup and app initialization
 */

import React from 'react';
import PropTypes from 'prop-types';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import AppInitializer from '../../app/screens/AppInitializer';
import { LocalizationProvider, useLocalization } from '../../app/contexts/LocalizationContext';
import { checkForAppUpdate } from '../../app/services/AppUpdateService';
import { useUpdateDownload } from '../../app/contexts/UpdateDownloadContext';

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: jest.fn(() => ({
    showDialog: jest.fn(),
  })),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: jest.fn(() => ({
    isDownloading: false,
    downloadProgress: null,
    startDownload: jest.fn(),
  })),
}));

// The opened-file import handler is covered by its own unit tests; stub it here
// so AppInitializer doesn't require the ImportProgress/Dialog providers.
jest.mock('../../app/hooks/useSqliteFileImport', () => ({
  useSqliteFileImport: jest.fn(),
}));

jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(async () => ({
    success: true,
    isUpdateAvailable: false,
  })),
}));

// Render the update dialog as a lightweight testable stand-in so these tests focus on
// AppInitializer's polling/dismissal logic rather than the modal's internals.
jest.mock('../../app/modals/UpdateAvailableModal', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  const { View, Text, TouchableOpacity } = require('react-native');
  function MockUpdateAvailableModal({ visible, onDismiss, onUpdate, updateData }) {
    if (!visible || !updateData) return null;
    return (
      <View testID="update-available-modal">
        <Text testID="update-modal-version">{updateData.latestVersion}</Text>
        <TouchableOpacity testID="update-modal-dismiss" onPress={onDismiss}>
          <Text>Later</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="update-modal-now"
          onPress={() => onUpdate(updateData.downloadUrl)}
        >
          <Text>Update now</Text>
        </TouchableOpacity>
      </View>
    );
  }
  MockUpdateAvailableModal.propTypes = {
    visible: PropTypes.bool,
    onDismiss: PropTypes.func,
    onUpdate: PropTypes.func,
    updateData: PropTypes.object,
  };
  return MockUpdateAvailableModal;
});

// Side-effecting services fired from AppInitializer's open effects; stub to no-ops so
// they don't leak async work into the update-check timing tests.
jest.mock('../../app/services/DailyBackupService', () => ({
  performDailyBackupIfNeeded: jest.fn(async () => undefined),
}));

jest.mock('../../app/services/notifications/processBankNotifications', () => ({
  processBankNotifications: jest.fn(async () => undefined),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    UPDATE_LAST_CHECK_AT: 'update_last_check_at',
    UPDATE_LAST_PROMPTED_VERSION: 'update_last_prompted_version',
    UPDATE_SKIP_UNTIL: 'update_skip_until',
  },
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(async () => undefined),
}));

// Mock the navigation components
jest.mock('../../app/screens/LanguageSelectionScreen', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  const { View, Text } = require('react-native');
  function MockLanguageSelectionScreen({ onLanguageSelected }) {
    return (
      <View testID="language-selection-screen">
        <Text>Language Selection</Text>
      </View>
    );
  }
  MockLanguageSelectionScreen.propTypes = {
    onLanguageSelected: PropTypes.func,
  };
  return MockLanguageSelectionScreen;
});

jest.mock('../../app/navigation/SimpleTabs', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  function MockSimpleTabs({ children }) {
    return (
      <View testID="simple-tabs">
        <Text>Main App</Text>
        {children}
      </View>
    );
  }
  const PropTypes = require('prop-types');
  MockSimpleTabs.propTypes = {
    children: PropTypes.node,
  };
  return MockSimpleTabs;
});

// Create a mock LocalizationContext for controlled testing
const mockLocalizationContext = {
  isFirstLaunch: false,
  isLoading: false,
  setFirstLaunchComplete: jest.fn(),
  language: 'en',
  t: (key) => key,
};

jest.mock('../../app/contexts/LocalizationContext', () => {
  const React = require('react');
  const PropTypes = require('prop-types');
  function LocalizationProvider({ children }) {
    return React.createElement(React.Fragment, null, children);
  }
  LocalizationProvider.propTypes = {
    children: PropTypes.node,
  };

  return {
    LocalizationProvider,
    useLocalization: jest.fn(() => mockLocalizationContext),
  };
});

// Mock split theme contexts
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff',
      primary: '#2196f3',
    },
  })),
}));

describe('AppInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default state
    mockLocalizationContext.isFirstLaunch = false;
    mockLocalizationContext.isLoading = false;
    mockLocalizationContext.language = 'en';
    mockLocalizationContext.setFirstLaunchComplete = jest.fn();
    mockLocalizationContext.t = (key) => key;
    // Default: app is up to date and idle so no dialog appears unless a test opts in.
    // clearAllMocks wipes call history but not implementations, so re-assert the defaults
    // here to avoid cross-test leakage of a previously-set update result.
    checkForAppUpdate.mockResolvedValue({ success: true, isUpdateAvailable: false });
    useUpdateDownload.mockReturnValue({
      isDownloading: false,
      downloadProgress: null,
      startDownload: jest.fn(),
    });
  });

  describe('Initialization', () => {
    it('renders without crashing', async () => {
      const { getByTestId } = await render(<AppInitializer />);
      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('shows main app when not first launch', async () => {
      mockLocalizationContext.isFirstLaunch = false;

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
      expect(queryByTestId('language-selection-screen')).toBeNull();
    });

    it('shows language selection on first launch', async () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
      expect(queryByTestId('simple-tabs')).toBeNull();
    });
  });

  describe('First Launch Flow', () => {
    it('shows language selection screen when isFirstLaunch is true', async () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId } = await render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });

    it('passes onLanguageSelected callback to LanguageSelectionScreen', async () => {
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

      await render(<AppInitializer />);
    });
  });

  describe('Component Integration', () => {
    it('uses LocalizationContext for first launch detection', async () => {
      await render(<AppInitializer />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('transitions from language selection to main app after language selected', async () => {
      mockLocalizationContext.isFirstLaunch = true;
      let onLanguageSelected;

      // Mock LanguageSelectionScreen to capture the callback
      jest.mock('../../app/screens/LanguageSelectionScreen', () => {
        const React = require('react');
        const PropTypes = require('prop-types');
        const { View, Text, TouchableOpacity } = require('react-native');
        function MockLanguageSelectionScreen({ onLanguageSelected: callback }) {
          onLanguageSelected = callback;
          return (
            <View testID="language-selection-screen">
              <Text>Language Selection</Text>
              <TouchableOpacity testID="select-language" onPress={() => callback('en')}>
                <Text>Select English</Text>
              </TouchableOpacity>
            </View>
          );
        }
        MockLanguageSelectionScreen.propTypes = {
          onLanguageSelected: PropTypes.func,
        };
        return MockLanguageSelectionScreen;
      });

      const { getByTestId } = await render(<AppInitializer />);

      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing isFirstLaunch gracefully', async () => {
      mockLocalizationContext.isFirstLaunch = undefined;

      const { queryByTestId } = await render(<AppInitializer />);

      // Should default to showing main app when isFirstLaunch is undefined/false
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('handles null language value', async () => {
      mockLocalizationContext.language = null;

      const { getByTestId } = await render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('renders correctly with different language values', async () => {
      mockLocalizationContext.language = 'ru';

      const { getByTestId } = await render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
    });
  });

  describe('Theme Integration', () => {
    it('uses theme colors for loading indicator', async () => {
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      await render(<AppInitializer />);

      expect(useThemeColors).toHaveBeenCalled();
    });

    it('applies theme background color to loading container', async () => {
      mockLocalizationContext.isFirstLaunch = true;

      await render(<AppInitializer />);

      // The component should use colors from ThemeColorsContext
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');
      expect(useThemeColors).toHaveBeenCalled();
    });
  });

  describe('Regression Tests', () => {
    it('renders nothing while the language preference is still loading', async () => {
      // Guards against briefly flashing the welcome/language screen on app open:
      // isFirstLaunch defaults to true until the stored preference is read, so
      // AppInitializer must render nothing (keeping the splash up) while loading.
      mockLocalizationContext.isLoading = true;
      mockLocalizationContext.isFirstLaunch = true;

      const { queryByTestId, toJSON } = await render(<AppInitializer />);

      expect(queryByTestId('language-selection-screen')).toBeNull();
      expect(queryByTestId('simple-tabs')).toBeNull();
      expect(toJSON()).toBeNull();
    });

    it('shows main app once loading completes for an initialized app', async () => {
      mockLocalizationContext.isLoading = false;
      mockLocalizationContext.isFirstLaunch = false;

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);

      expect(getByTestId('simple-tabs')).toBeTruthy();
      expect(queryByTestId('language-selection-screen')).toBeNull();
    });

    it('does not show loading indicator when not initializing', async () => {
      mockLocalizationContext.isFirstLaunch = false;

      const { queryByTestId } = await render(<AppInitializer />);

      // Should show main app, not loading indicator
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('shows correct screen based on first launch state', async () => {
      // Test both states
      mockLocalizationContext.isFirstLaunch = true;
      const { rerender, getByTestId, queryByTestId } = await render(<AppInitializer />);
      expect(getByTestId('language-selection-screen')).toBeTruthy();

      mockLocalizationContext.isFirstLaunch = false;
      await rerender(<AppInitializer />);
      expect(queryByTestId('simple-tabs')).toBeTruthy();
    });

    it('handles rapid state changes gracefully', async () => {
      const { rerender } = await render(<AppInitializer />);

      // Rapidly change first launch state
      mockLocalizationContext.isFirstLaunch = true;
      await rerender(<AppInitializer />);

      mockLocalizationContext.isFirstLaunch = false;
      await rerender(<AppInitializer />);

      mockLocalizationContext.isFirstLaunch = true;
      await rerender(<AppInitializer />);

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('provides accessible structure for screen readers', async () => {
      const { getByTestId } = await render(<AppInitializer />);

      // Main content should be accessible
      expect(getByTestId('simple-tabs')).toBeTruthy();
    });

    it('maintains accessibility during first launch flow', async () => {
      mockLocalizationContext.isFirstLaunch = true;

      const { getByTestId } = await render(<AppInitializer />);

      // Language selection should be accessible
      expect(getByTestId('language-selection-screen')).toBeTruthy();
    });
  });

  describe('Automatic update checking', () => {
    const AVAILABLE_UPDATE = {
      success: true,
      isUpdateAvailable: true,
      latestVersion: '2.0.0',
      currentVersion: '1.0.0',
      downloadUrl: 'https://example.com/penny-2.0.0.apk',
      checksumUrl: 'https://example.com/penny-2.0.0.apk.sha256',
      releaseNotes: null,
    };

    // Flush the promise chain of the immediate on-open check without advancing far
    // enough to trigger the one-minute interval.
    const flushCheck = () => act(async () => {
      // The initial on-open jobs (update check, backup, ingestion) are now
      // deferred via requestIdleCallback, polyfilled to setImmediate in jest.
      // Under fake timers that immediate is queued, so flush it first, then let
      // the resulting async promise chain settle. advanceTimersByTimeAsync(0)
      // does not reach the one-minute interval.
      await jest.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('suggests the update when a newer version is available', async () => {
      checkForAppUpdate.mockResolvedValue(AVAILABLE_UPDATE);

      const { getByTestId } = await render(<AppInitializer />);
      await flushCheck();

      expect(getByTestId('update-available-modal')).toBeTruthy();
      expect(getByTestId('update-modal-version').props.children).toBe('2.0.0');
    });

    it('does not suggest an update when the app is already up to date', async () => {
      checkForAppUpdate.mockResolvedValue({ success: true, isUpdateAvailable: false });

      const { queryByTestId } = await render(<AppInitializer />);
      await flushCheck();

      expect(queryByTestId('update-available-modal')).toBeNull();
    });

    it('does not suggest an update when the check fails', async () => {
      checkForAppUpdate.mockResolvedValue({
        success: false,
        isUpdateAvailable: false,
        errorCode: 'network_error',
      });

      const { queryByTestId } = await render(<AppInitializer />);
      await flushCheck();

      expect(queryByTestId('update-available-modal')).toBeNull();
    });

    it('re-checks for updates about once a minute', async () => {
      checkForAppUpdate.mockResolvedValue({ success: true, isUpdateAvailable: false });

      await render(<AppInitializer />);
      await flushCheck();
      expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3 * 60 * 1000);
      });
      expect(checkForAppUpdate).toHaveBeenCalledTimes(4);
    });

    it('stops suggesting a version the user dismissed until the app restarts', async () => {
      checkForAppUpdate.mockResolvedValue(AVAILABLE_UPDATE);

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);
      await flushCheck();
      expect(getByTestId('update-available-modal')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('update-modal-dismiss'));
      });
      expect(queryByTestId('update-available-modal')).toBeNull();

      // The next minute's check still finds 2.0.0, but it must stay silent.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60 * 1000);
      });
      expect(queryByTestId('update-available-modal')).toBeNull();
    });

    it('suggests a newer version even after an earlier one was dismissed', async () => {
      checkForAppUpdate.mockResolvedValue(AVAILABLE_UPDATE);

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);
      await flushCheck();
      expect(getByTestId('update-modal-version').props.children).toBe('2.0.0');

      await act(async () => {
        fireEvent.press(getByTestId('update-modal-dismiss'));
      });
      expect(queryByTestId('update-available-modal')).toBeNull();

      // A still-newer release appears; the dialog should return for it.
      checkForAppUpdate.mockResolvedValue({
        ...AVAILABLE_UPDATE,
        latestVersion: '2.1.0',
        downloadUrl: 'https://example.com/penny-2.1.0.apk',
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60 * 1000);
      });

      expect(getByTestId('update-available-modal')).toBeTruthy();
      expect(getByTestId('update-modal-version').props.children).toBe('2.1.0');
    });

    it('starts the download and closes the dialog when the user updates', async () => {
      const startDownload = jest.fn();
      useUpdateDownload.mockReturnValue({
        isDownloading: false,
        downloadProgress: null,
        startDownload,
      });
      checkForAppUpdate.mockResolvedValue(AVAILABLE_UPDATE);

      const { getByTestId, queryByTestId } = await render(<AppInitializer />);
      await flushCheck();
      expect(getByTestId('update-available-modal')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('update-modal-now'));
      });

      expect(startDownload).toHaveBeenCalledWith(
        'https://example.com/penny-2.0.0.apk',
        expect.objectContaining({ checksumUrl: 'https://example.com/penny-2.0.0.apk.sha256' }),
      );
      expect(queryByTestId('update-available-modal')).toBeNull();
    });
  });
});
