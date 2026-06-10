import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Header from '../../app/components/Header';

// Mock contexts
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff',
    },
  }),
}));

describe('Header - rightContent prop', () => {
  it('returns null when rightContent not provided', async () => {
    const { toJSON } = await render(<Header />);
    expect(toJSON()).toBeNull();
  });

  it('renders rightContent when provided', async () => {
    const customContent = <Text testID="custom-content">Custom</Text>;
    const { getByTestId } = await render(
      <Header rightContent={customContent} />,
    );

    expect(getByTestId('custom-content')).toBeTruthy();
  });
});
