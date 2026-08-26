/* eslint-disable react/prop-types */
/**
 * Wiring between AppInitializer and the cold-start screen.
 *
 * The screen's own behaviour is covered in
 * __tests__/components/ColdStartScreen.test.js; here it is stubbed so these
 * tests are about who mounts it, and when it goes away.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import AppInitializer from '../../app/screens/AppInitializer';
import { useLocalization } from '../../app/contexts/LocalizationContext';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({ colors: { background: '#fff', primary: '#000' } })),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: jest.fn(() => ({ showDialog: jest.fn() })),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: jest.fn(() => ({ isDownloading: false, startDownload: jest.fn() })),
}));

jest.mock('../../app/contexts/AppBlurContext', () => ({
  useAppBlurControls: jest.fn(() => ({
    increment: jest.fn(),
    decrement: jest.fn(),
    blurCountRef: { current: 0 },
  })),
}));

jest.mock('../../app/hooks/useSqliteFileImport', () => ({ useSqliteFileImport: jest.fn() }));
jest.mock('../../app/hooks/useNotificationResponseRouter', () => jest.fn());
jest.mock('../../app/services/DailyBackupService', () => ({ performDailyBackupIfNeeded: jest.fn() }));
jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(async () => ({ success: true, isUpdateAvailable: false })),
}));
jest.mock('../../app/services/notifications/processBankNotifications', () => ({
  processBankNotifications: jest.fn(async () => {}),
}));
jest.mock('../../app/services/notifications/backgroundBankTask', () => ({
  syncBackgroundBankTaskRegistrationAsync: jest.fn(async () => {}),
}));
jest.mock('../../app/services/notifications/acknowledgeTask', () => ({
  registerAcknowledgeTaskAsync: jest.fn(async () => {}),
}));
jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(async () => {}),
  PREF_KEYS: { UPDATE_LAST_PROMPTED_VERSION: 'v', UPDATE_SKIP_UNTIL: 's' },
}));

jest.mock('../../app/navigation/SimpleTabs', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockSimpleTabs() {
    return <View testID="simple-tabs" />;
  };
});

jest.mock('../../app/modals/UpdateAvailableModal', () => () => null);

// Not under test here, and it reads `availableLanguages` off the localization
// module at import time — which this file replaces with a bare hook mock.
jest.mock('../../app/screens/LanguageSelectionScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockLanguageSelectionScreen() {
    return <View testID="language-selection" />;
  };
});

// The stub records that it was mounted and hands back a way to finish. The
// real flag is module state that lives for the whole launch, so the tests own
// it here instead and reset it between them.
let mockColdStartPlayed = false;
let mockFinishColdStart = null;
jest.mock('../../app/components/startup/ColdStartScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockColdStartScreen = ({ onFinish }) => {
    mockColdStartPlayed = true;
    mockFinishColdStart = onFinish;
    return <View testID="cold-start-screen" />;
  };
  MockColdStartScreen.displayName = 'MockColdStartScreen';
  return {
    __esModule: true,
    default: MockColdStartScreen,
    hasColdStartPlayed: () => mockColdStartPlayed,
  };
});

describe('AppInitializer cold start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockColdStartPlayed = false;
    mockFinishColdStart = null;
    useLocalization.mockReturnValue({
      t: (key) => key,
      isLoading: false,
      isFirstLaunch: false,
      setFirstLaunchComplete: jest.fn(),
    });
  });

  it('covers the app with the cold-start screen on the first launch of the process', async () => {
    const { getByTestId } = await render(<AppInitializer />);

    expect(getByTestId('simple-tabs')).toBeTruthy();
    expect(getByTestId('cold-start-screen')).toBeTruthy();
  });

  it('takes the screen away once it reports it is finished', async () => {
    const { queryByTestId } = await render(<AppInitializer />);

    await act(async () => { mockFinishColdStart(); });

    expect(queryByTestId('cold-start-screen')).toBeNull();
    expect(queryByTestId('simple-tabs')).toBeTruthy();
  });

  it('does not mount it again later in the same launch', async () => {
    mockColdStartPlayed = true;

    const { queryByTestId } = await render(<AppInitializer />);

    expect(queryByTestId('cold-start-screen')).toBeNull();
  });

  it('shows nothing at all while the language preference is still being read', async () => {
    useLocalization.mockReturnValue({
      t: (key) => key,
      isLoading: true,
      isFirstLaunch: true,
      setFirstLaunchComplete: jest.fn(),
    });

    const { queryByTestId } = await render(<AppInitializer />);

    expect(queryByTestId('cold-start-screen')).toBeNull();
    expect(queryByTestId('simple-tabs')).toBeNull();
  });
});
