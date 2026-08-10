/* eslint-disable react/prop-types */
/**
 * Tests for the language subpanel — every supported language named in its own
 * script, applied on tap with no confirmation step.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LanguagePanel from '../../../app/components/settings/LanguagePanel';

const mockSetLanguage = jest.fn();
const localizationState = { language: 'en' };

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', primary: '#6200ee' },
  }),
}));

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    language: localizationState.language,
    setLanguage: mockSetLanguage,
    availableLanguages: ['en', 'ru', 'hy', 'ja'],
  }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

describe('LanguagePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localizationState.language = 'en';
  });

  it('names each language in its own script, not in English', async () => {
    const { getByText } = await render(<LanguagePanel onSelected={jest.fn()} />);

    // Someone whose app is stuck in a language they cannot read has to be able
    // to find their own — "Armenian" would not help them.
    expect(getByText('🇦🇲  Հայերեն')).toBeTruthy();
    expect(getByText('🇷🇺  Русский')).toBeTruthy();
    expect(getByText('🇯🇵  日本語')).toBeTruthy();
  });

  it('renders every language the context offers', async () => {
    const { getByText } = await render(<LanguagePanel onSelected={jest.fn()} />);
    ['🇬🇧  English', '🇷🇺  Русский', '🇦🇲  Հայերեն', '🇯🇵  日本語'].forEach(label => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('applies the language and reports back so the host can dismiss', async () => {
    const onSelected = jest.fn();
    const { getByText } = await render(<LanguagePanel onSelected={onSelected} />);

    fireEvent.press(getByText('🇷🇺  Русский'));

    expect(mockSetLanguage).toHaveBeenCalledWith('ru');
    expect(onSelected).toHaveBeenCalled();
  });

  it('checks exactly the current language', async () => {
    localizationState.language = 'hy';
    const { getAllByTestId } = await render(<LanguagePanel onSelected={jest.fn()} />);

    expect(getAllByTestId('icon-checkmark-circle')).toHaveLength(1);
  });
});
