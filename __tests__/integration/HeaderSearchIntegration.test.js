/**
 * Header Search Integration Tests
 *
 * Search functionality was moved from the Header to the OperationsScreen.
 * The Header component is now a minimal pass-through for rightContent.
 * These tests confirm the Header no longer renders search-related elements.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Header from '../../app/components/Header';

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#FFFFFF',
    },
  }),
}));

describe('Header Search Integration', () => {
  it('does not render search bar (search now lives in OperationsScreen)', () => {
    const { queryByTestId } = render(<Header />);
    expect(queryByTestId('search-bar-container')).toBeNull();
    expect(queryByTestId('search-input-container')).toBeNull();
  });

  it('returns null when no rightContent is passed', () => {
    const { toJSON } = render(<Header />);
    expect(toJSON()).toBeNull();
  });

  it('renders rightContent when provided', () => {
    const content = <Text testID="rc">hi</Text>;
    const { getByTestId } = render(<Header rightContent={content} />);
    expect(getByTestId('rc')).toBeTruthy();
  });
});
