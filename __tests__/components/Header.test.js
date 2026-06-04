/**
 * Header Component Tests
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Header from '../../app/components/Header';

// Mock contexts
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#FFFFFF',
    },
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('returns null when no rightContent provided', () => {
      const { toJSON } = render(<Header />);
      expect(toJSON()).toBeNull();
    });

    it('renders rightContent when provided', () => {
      const content = <Text testID="custom">Custom</Text>;
      const { getByTestId } = render(<Header rightContent={content} />);
      expect(getByTestId('custom')).toBeTruthy();
    });

    it('does not render version text in header', () => {
      const content = <Text>Hi</Text>;
      const { queryByText } = render(<Header rightContent={content} />);
      expect(queryByText(/v\d+\.\d+/)).toBeNull();
      expect(queryByText(/DB v/)).toBeNull();
    });
  });
});
