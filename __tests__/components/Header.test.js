/**
 * Header Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Header from '../../app/components/Header';

// Mock contexts
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      surface: '#FFFFFF',
      border: '#E0E0E0',
      text: '#000000',
      mutedText: '#999999',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
  }),
}));

// Mock expo vector icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIcon({ name }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string };
  return { Ionicons: MockIcon, MaterialCommunityIcons: MockIcon };
});

// Mock layout constants
jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
}));

// Mock SearchContext
jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: () => ({
    openSearch: jest.fn(),
    registerSearchHandler: jest.fn(),
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { toJSON } = render(<Header />);
      expect(toJSON()).toBeTruthy();
    });

    it('does not render version text in header', () => {
      const { queryByText } = render(<Header />);
      expect(queryByText(/v\d+\.\d+/)).toBeNull();
      expect(queryByText(/DB v/)).toBeNull();
    });

    it('does not render theme toggle button in header', () => {
      const { queryByTestId } = render(<Header />);
      expect(queryByTestId('theme-toggle-button')).toBeNull();
    });
  });

  describe('Download indicator', () => {
    it('never shows a download indicator in the header (indicator lives on the tab bar)', () => {
      const { queryByTestId } = render(<Header />);
      expect(queryByTestId('download-indicator')).toBeNull();
    });
  });

});
