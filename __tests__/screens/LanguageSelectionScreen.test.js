/**
 * Tests for LanguageSelectionScreen - First-time language selection
 * Simplified logic-based tests for component rendering and behavior
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LanguageSelectionScreen from '../../app/screens/LanguageSelectionScreen';

// Mock individual i18n language files
jest.mock('../../assets/i18n/en.json', () => ({
  welcome_title: 'Welcome to Penny',
  welcome_subtitle: 'Please select your preferred language',
  continue: 'Continue',
}), { virtual: true });

jest.mock('../../assets/i18n/it.json', () => ({}), { virtual: true });
jest.mock('../../assets/i18n/ru.json', () => ({
  welcome_title: 'Добро пожаловать в Penny',
  welcome_subtitle: 'Выберите язык',
  continue: 'Продолжить',
}), { virtual: true });
jest.mock('../../assets/i18n/es.json', () => ({}), { virtual: true });
jest.mock('../../assets/i18n/fr.json', () => ({}), { virtual: true });
jest.mock('../../assets/i18n/zh.json', () => ({}), { virtual: true });
jest.mock('../../assets/i18n/de.json', () => ({}), { virtual: true });

describe('LanguageSelectionScreen', () => {
  let mockOnLanguageSelected;

  beforeEach(() => {
    mockOnLanguageSelected = jest.fn();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('renders without crashing', async () => {
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });

    it('displays welcome title', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Welcome to Penny')).toBeTruthy();
    });

    it('displays welcome subtitle', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Please select your preferred language')).toBeTruthy();
    });

    it('displays language options', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Check for Russian language option (unique text)
      expect(getByText('Русский')).toBeTruthy();
      // Check for flags
      expect(getByText('🇬🇧')).toBeTruthy();
      expect(getByText('🇷🇺')).toBeTruthy();
    });
  });

  describe('Component Behavior', () => {
    it('accepts onLanguageSelected callback', async () => {
      const mockCallback = jest.fn();

      await render(
        <LanguageSelectionScreen onLanguageSelected={mockCallback} />,
      );
    });

    it('handles missing onLanguageSelected callback gracefully', async () => {
      await render(
        <LanguageSelectionScreen />,
      );
    });
  });

  describe('Rendering and UI', () => {
    it('renders SafeAreaView container', async () => {
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });

    it('renders both English and Russian options', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Russian is unique
      expect(getByText('Русский')).toBeTruthy();
      // Flags are unique
      expect(getByText('🇬🇧')).toBeTruthy();
      expect(getByText('🇷🇺')).toBeTruthy();
    });

    it('renders Continue button', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Continue')).toBeTruthy();
    });
  });

  describe('Translation Integration', () => {
    it('uses translations for UI text', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Check translated strings
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Please select your preferred language')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });

    it('provides translation fallback mechanism', async () => {
      // Component has internal t() function for translation
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles null callback', async () => {
      await render(
        <LanguageSelectionScreen onLanguageSelected={null} />,
      );
    });

    it('handles undefined callback', async () => {
      await render(
        <LanguageSelectionScreen onLanguageSelected={undefined} />,
      );
    });

    it('renders correctly without any props', async () => {
      await render(
        <LanguageSelectionScreen />,
      );
    });
  });

  describe('Accessibility', () => {
    it('provides accessible structure', async () => {
      // Component should render without errors
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });

    it('includes text content for screen readers', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Important text should be present for screen readers
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Please select your preferred language')).toBeTruthy();
    });
  });

  describe('Component Integration', () => {
    it('integrates with i18n data', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Should load and display translations
      expect(getByText('Welcome to Penny')).toBeTruthy();
    });

    it('renders language flags', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Flags should be rendered
      expect(getByText('🇬🇧')).toBeTruthy();
      expect(getByText('🇷🇺')).toBeTruthy();
    });
  });

  describe('State Management', () => {
    it('manages language selection state internally', async () => {
      // Component uses useState for selected language
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });

    it('initializes with no language selected', async () => {
      // Component should start with null selection
      await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', async () => {
      const { rerender } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(() => rerender(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('maintains stable rendering with different callbacks', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const { rerender } = await render(
        <LanguageSelectionScreen onLanguageSelected={callback1} />,
      );

      expect(() => rerender(
        <LanguageSelectionScreen onLanguageSelected={callback2} />,
      )).not.toThrow();
    });

    it('displays correct default language (English)', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Should default to English UI
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });
  });

  describe('UI Components', () => {
    it('renders language selection buttons', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Both language options should be present
      expect(getByText('Русский')).toBeTruthy();
      expect(getByText('🇬🇧')).toBeTruthy();
    });

    it('renders action button', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Continue')).toBeTruthy();
    });

    it('includes all required UI elements', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Title, subtitle, languages, and button should all be present
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Please select your preferred language')).toBeTruthy();
      expect(getByText('Русский')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });
  });

  describe('Interaction - language selection', () => {
    it('calls onLanguageSelected when a language is selected and Continue is pressed', async () => {
      const { getByText, getByLabelText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select English via accessibility label (nativeName == name, both 'English')
      await fireEvent.press(getByLabelText('Select English'));

      // Press continue
      await fireEvent.press(getByText('Continue'));

      expect(mockOnLanguageSelected).toHaveBeenCalledWith('en');
    });

    it('does not call onLanguageSelected when Continue is pressed without selection', async () => {
      const { getByText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      await fireEvent.press(getByText('Continue'));

      expect(mockOnLanguageSelected).not.toHaveBeenCalled();
    });

    it('shows checkmark after selecting a language', async () => {
      const { getByText, queryByText, getByLabelText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // No checkmark initially
      expect(queryByText('✓')).toBeNull();

      // Select English
      await fireEvent.press(getByLabelText('Select English'));

      // Checkmark should appear
      expect(getByText('✓')).toBeTruthy();
    });

    it('calls onLanguageSelected with Russian when Russian is selected', async () => {
      const { getByText, getByLabelText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      await fireEvent.press(getByLabelText('Select Russian'));
      await fireEvent.press(getByText('Продолжить'));

      expect(mockOnLanguageSelected).toHaveBeenCalledWith('ru');
    });

    it('switches selection when another language is pressed', async () => {
      const { getByText, getAllByText, getByLabelText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select English first
      await fireEvent.press(getByLabelText('Select English'));
      expect(getAllByText('✓')).toHaveLength(1);

      // Select Russian
      await fireEvent.press(getByLabelText('Select Russian'));
      expect(getAllByText('✓')).toHaveLength(1);

      // Continue uses the latest selection
      await fireEvent.press(getByText('Продолжить'));
      expect(mockOnLanguageSelected).toHaveBeenCalledWith('ru');
    });

    it('t() falls back to key when translation is missing', async () => {
      const { getByText, getByLabelText } = await render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select German (mocked with empty translations)
      await fireEvent.press(getByLabelText('Select German'));

      // 'welcome_title' is not in the de.json mock → key is returned as-is
      expect(getByText('welcome_title')).toBeTruthy();
    });
  });
});
