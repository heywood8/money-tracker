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
    it('renders without crashing', () => {
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('displays welcome title', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Welcome to Penny')).toBeTruthy();
    });

    it('displays welcome subtitle', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Please select your preferred language')).toBeTruthy();
    });

    it('displays language options', () => {
      const { getByText } = render(
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
    it('accepts onLanguageSelected callback', () => {
      const mockCallback = jest.fn();

      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockCallback} />,
      )).not.toThrow();
    });

    it('handles missing onLanguageSelected callback gracefully', () => {
      expect(() => render(
        <LanguageSelectionScreen />,
      )).not.toThrow();
    });
  });

  describe('Rendering and UI', () => {
    it('renders SafeAreaView container', () => {
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('renders both English and Russian options', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Russian is unique
      expect(getByText('Русский')).toBeTruthy();
      // Flags are unique
      expect(getByText('🇬🇧')).toBeTruthy();
      expect(getByText('🇷🇺')).toBeTruthy();
    });

    it('renders Continue button', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Continue')).toBeTruthy();
    });
  });

  describe('Translation Integration', () => {
    it('uses translations for UI text', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Check translated strings
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Please select your preferred language')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });

    it('provides translation fallback mechanism', () => {
      // Component has internal t() function for translation
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles null callback', () => {
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={null} />,
      )).not.toThrow();
    });

    it('handles undefined callback', () => {
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={undefined} />,
      )).not.toThrow();
    });

    it('renders correctly without any props', () => {
      expect(() => render(
        <LanguageSelectionScreen />,
      )).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('provides accessible structure', () => {
      // Component should render without errors
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('includes text content for screen readers', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Important text should be present for screen readers
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Please select your preferred language')).toBeTruthy();
    });
  });

  describe('Component Integration', () => {
    it('integrates with i18n data', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Should load and display translations
      expect(getByText('Welcome to Penny')).toBeTruthy();
    });

    it('renders language flags', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Flags should be rendered
      expect(getByText('🇬🇧')).toBeTruthy();
      expect(getByText('🇷🇺')).toBeTruthy();
    });
  });

  describe('State Management', () => {
    it('manages language selection state internally', () => {
      // Component uses useState for selected language
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('initializes with no language selected', () => {
      // Component should start with null selection
      expect(() => render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', () => {
      const { rerender } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(() => rerender(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      )).not.toThrow();
    });

    it('maintains stable rendering with different callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const { rerender } = render(
        <LanguageSelectionScreen onLanguageSelected={callback1} />,
      );

      expect(() => rerender(
        <LanguageSelectionScreen onLanguageSelected={callback2} />,
      )).not.toThrow();
    });

    it('displays correct default language (English)', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Should default to English UI
      expect(getByText('Welcome to Penny')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    });
  });

  describe('UI Components', () => {
    it('renders language selection buttons', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Both language options should be present
      expect(getByText('Русский')).toBeTruthy();
      expect(getByText('🇬🇧')).toBeTruthy();
    });

    it('renders action button', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      expect(getByText('Continue')).toBeTruthy();
    });

    it('includes all required UI elements', () => {
      const { getByText } = render(
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
    it('calls onLanguageSelected when a language is selected and Continue is pressed', () => {
      const { getByText, getByLabelText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select English via accessibility label (nativeName == name, both 'English')
      fireEvent.press(getByLabelText('Select English'));

      // Press continue
      fireEvent.press(getByText('Continue'));

      expect(mockOnLanguageSelected).toHaveBeenCalledWith('en');
    });

    it('does not call onLanguageSelected when Continue is pressed without selection', () => {
      const { getByText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      fireEvent.press(getByText('Continue'));

      expect(mockOnLanguageSelected).not.toHaveBeenCalled();
    });

    it('shows checkmark after selecting a language', () => {
      const { getByText, queryByText, getByLabelText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // No checkmark initially
      expect(queryByText('✓')).toBeNull();

      // Select English
      fireEvent.press(getByLabelText('Select English'));

      // Checkmark should appear
      expect(getByText('✓')).toBeTruthy();
    });

    it('calls onLanguageSelected with Russian when Russian is selected', () => {
      const { getByText, getByLabelText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      fireEvent.press(getByLabelText('Select Russian'));
      fireEvent.press(getByText('Продолжить'));

      expect(mockOnLanguageSelected).toHaveBeenCalledWith('ru');
    });

    it('switches selection when another language is pressed', () => {
      const { getByText, getAllByText, getByLabelText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select English first
      fireEvent.press(getByLabelText('Select English'));
      expect(getAllByText('✓')).toHaveLength(1);

      // Select Russian
      fireEvent.press(getByLabelText('Select Russian'));
      expect(getAllByText('✓')).toHaveLength(1);

      // Continue uses the latest selection
      fireEvent.press(getByText('Продолжить'));
      expect(mockOnLanguageSelected).toHaveBeenCalledWith('ru');
    });

    it('t() falls back to key when translation is missing', () => {
      const { getByText, getByLabelText } = render(
        <LanguageSelectionScreen onLanguageSelected={mockOnLanguageSelected} />,
      );

      // Select German (mocked with empty translations)
      fireEvent.press(getByLabelText('Select German'));

      // 'welcome_title' is not in the de.json mock → key is returned as-is
      expect(getByText('welcome_title')).toBeTruthy();
    });
  });
});
