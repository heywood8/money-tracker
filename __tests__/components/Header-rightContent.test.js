import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Header from '../../app/components/Header';

// Mock contexts
jest.mock('../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: () => ({ colorScheme: 'light', setTheme: jest.fn() }),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff',
      border: '#ddd',
      text: '#000',
      mutedText: '#999',
      primary: '#007AFF',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ isDownloading: false, downloadProgress: 0 }),
}));

jest.mock('../../app/services/db', () => ({
  getDatabaseVersion: jest.fn().mockResolvedValue(1),
}));

describe('Header - rightContent prop', () => {
  it('renders default buttons when rightContent not provided', () => {
    const { getByTestId } = render(<Header onOpenSettings={jest.fn()} />);

    expect(getByTestId('theme-toggle-button')).toBeTruthy();
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  it('renders rightContent instead of default buttons when provided', () => {
    const customContent = <Text testID="custom-content">Custom</Text>;
    const { getByTestId, queryByTestId } = render(
      <Header onOpenSettings={jest.fn()} rightContent={customContent} />,
    );

    expect(getByTestId('custom-content')).toBeTruthy();
    expect(queryByTestId('theme-toggle-button')).toBeNull();
    expect(queryByTestId('settings-button')).toBeNull();
  });
});
