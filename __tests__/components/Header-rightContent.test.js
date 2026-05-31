import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Header from '../../app/components/Header';

// Mock contexts
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

jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: () => ({ openSearch: jest.fn(), registerSearchHandler: jest.fn() }),
}));

jest.mock('../../app/services/db', () => ({
  getDatabaseVersion: jest.fn().mockResolvedValue(1),
}));

describe('Header - rightContent prop', () => {
  it('renders without crashing when rightContent not provided', () => {
    const { toJSON } = render(<Header />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders rightContent when provided', () => {
    const customContent = <Text testID="custom-content">Custom</Text>;
    const { getByTestId } = render(
      <Header rightContent={customContent} />,
    );

    expect(getByTestId('custom-content')).toBeTruthy();
  });
});
