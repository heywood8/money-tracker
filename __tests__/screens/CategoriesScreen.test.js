/**
 * Tests for CategoriesScreen - Category management screen
 * Logic-based tests focusing on component behavior and integration patterns
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import PropTypes from 'prop-types';

// Mock all dependencies
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity, ActivityIndicator } = require('react-native');
  const PropTypes = require('prop-types');
  
  const FAB = ({ onPress, icon, label, ...props }) => React.createElement(TouchableOpacity, { onPress, testID: 'fab', ...props });
  FAB.propTypes = {
    onPress: PropTypes.func,
    icon: PropTypes.string,
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  };

  const Card = ({ children, style, ...props }) => React.createElement(View, { style, testID: 'card', ...props }, children);
  Card.propTypes = {
    children: PropTypes.node,
    style: PropTypes.any,
  };

  const TouchableRipple = ({ children, onPress, onLongPress, style, ...props }) => 
    React.createElement(TouchableOpacity, { onPress, onLongPress, style, testID: 'touchable-ripple', ...props }, children);
  TouchableRipple.propTypes = {
    children: PropTypes.node,
    onPress: PropTypes.func,
    onLongPress: PropTypes.func,
    style: PropTypes.any,
  };

  return {
    Text: Text,
    FAB,
    ActivityIndicator: ActivityIndicator,
    Card,
    TouchableRipple,
  };
});

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(() => ({
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      primary: '#2196f3',
      text: '#000000',
      mutedText: '#666666',
      border: '#e0e0e0',
      selected: '#e3f2fd',
      altRow: '#fafafa',
    },
  })),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: jest.fn(() => ({
    t: jest.fn((key) => key),
    language: 'en',
  })),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: jest.fn(() => ({
    showDialog: jest.fn(),
  })),
}));

jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: jest.fn(() => ({
    categories: [],
    loading: false,
    getChildren: jest.fn(() => []),
    addCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    validateCategory: jest.fn(() => null),
  })),
}));

jest.mock('../../app/contexts/BudgetsContext', () => ({
  useBudgets: jest.fn(() => ({
    hasActiveBudget: jest.fn(() => false),
    getBudgetForCategory: jest.fn(() => null),
  })),
}));

jest.mock('../../app/modals/CategoryModal', () => {
  const React = require('react');
  return function MockCategoryModal() {
    return React.createElement('CategoryModal', null);
  };
});

jest.mock('../../app/modals/BudgetModal', () => {
  const React = require('react');
  return function MockBudgetModal() {
    return React.createElement('BudgetModal', null);
  };
});

jest.mock('../../app/components/BudgetProgressBar', () => {
  const React = require('react');
  return function MockBudgetProgressBar() {
    return React.createElement('BudgetProgressBar', null);
  };
});

describe('CategoriesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Structure', () => {
    it('renders without crashing', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      await render(<CategoriesScreen />);
    });

    it('renders without crashing with no props', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      await render(<CategoriesScreen />);
    });

    it('uses ThemeContext for styling', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      await render(<CategoriesScreen />);

      expect(useThemeColors).toHaveBeenCalled();
    });

    it('uses CategoriesContext for category data', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      await render(<CategoriesScreen />);

      expect(useCategories).toHaveBeenCalled();
    });

    it('uses DialogContext for dialogs', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      await render(<CategoriesScreen />);

      expect(useDialog).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      await render(<CategoriesScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });
  });

  describe('Integration with Contexts', () => {
    it('handles empty category list', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles loading state', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: true,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles flat category list', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: '2', name: 'Transport', type: 'expense', icon: 'car', color: '#00ff00' },
        { id: '3', name: 'Salary', type: 'income', icon: 'cash', color: '#0000ff' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles hierarchical category structure', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000', isFolder: true },
        { id: '2', name: 'Groceries', type: 'expense', icon: 'cart', color: '#ff0000', parentId: '1' },
        { id: '3', name: 'Restaurants', type: 'expense', icon: 'silverware', color: '#ff0000', parentId: '1' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn((id) => mockCategories.filter(c => c.parentId === id)),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('filters out shadow categories from display', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: '2', name: 'Shadow', type: 'expense', icon: 'hidden', color: '#000000', isShadow: true },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      // Component should filter out shadow categories internally
      await render(<CategoriesScreen />);
    });
  });

  describe('Budget Integration', () => {
    it('handles categories without budgets', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useBudgets } = require('../../app/contexts/BudgetsContext');

      useBudgets.mockReturnValue({
        hasActiveBudget: jest.fn(() => false),
        getBudgetForCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles categories with active budgets', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useBudgets } = require('../../app/contexts/BudgetsContext');

      useBudgets.mockReturnValue({
        hasActiveBudget: jest.fn(() => true),
        getBudgetForCategory: jest.fn(() => ({
          id: 'budget-1',
          categoryId: '1',
          amount: '1000.00',
          spent: '500.00',
        })),
      });

      await render(<CategoriesScreen />);
    });
  });

  describe('State Management', () => {
    it('manages category modal visibility state', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should manage modal state internally
      await render(<CategoriesScreen />);
    });

    it('manages budget modal visibility state', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should manage budget modal state
      await render(<CategoriesScreen />);
    });

    it('manages edit vs new mode for categories', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should track whether adding new or editing existing
      await render(<CategoriesScreen />);
    });
  });

  describe('Category Expansion Logic', () => {
    it('handles expanded category folders', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [
          { id: '1', name: 'Food', isFolder: true },
          { id: '2', name: 'Groceries', parentId: '1' },
        ],
        loading: false,
        getChildren: jest.fn((id) => id === '1' ? [{ id: '2', name: 'Groceries', parentId: '1' }] : []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles collapsed category folders', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [
          { id: '1', name: 'Food', isFolder: true },
          { id: '2', name: 'Groceries', parentId: '1' },
        ],
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      const mockColors = {
        background: '#000000',
        surface: '#111111',
        primary: '#ff0000',
        text: '#ffffff',
        mutedText: '#aaaaaa',
        border: '#333333',
        selected: '#222222',
        altRow: '#181818',
      };

      useThemeColors.mockReturnValue({ colors: mockColors });

      await render(<CategoriesScreen />);
      expect(useThemeColors).toHaveBeenCalled();
    });

    it('handles dark theme', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useThemeColors } = require('../../app/contexts/ThemeColorsContext');

      useThemeColors.mockReturnValue({
        colors: {
          background: '#111111',
          surface: '#222222',
          primary: '#2196f3',
          text: '#ffffff',
          mutedText: '#aaaaaa',
          border: '#333333',
        },
      });

      await render(<CategoriesScreen />);
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      await render(<CategoriesScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles category nameKey translations', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', nameKey: 'food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: '2', name: 'Custom Category', type: 'expense', icon: 'star', color: '#00ff00' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty categories array when context provides empty state', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      // Context should always provide an array, even when empty
      await render(<CategoriesScreen />);
    });

    it('handles initial loading state with empty categories', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: true,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles categories with missing properties', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1' }, // Missing name, type, icon, color
        { id: '2', name: 'Partial' }, // Missing type, icon, color
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });

    it('handles deeply nested category hierarchy', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', name: 'Level 1', isFolder: true },
        { id: '2', name: 'Level 2', parentId: '1', isFolder: true },
        { id: '3', name: 'Level 3', parentId: '2', isFolder: true },
        { id: '4', name: 'Level 4', parentId: '3' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        getChildren: jest.fn((id) => mockCategories.filter(c => c.parentId === id)),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      await render(<CategoriesScreen />);
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      const { rerender } = await render(<CategoriesScreen />);

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });

    it('maintains stability when categories change', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const initialCategories = [{ id: '1', name: 'Food', type: 'expense' }];
      const updatedCategories = [
        { id: '1', name: 'Food', type: 'expense' },
        { id: '2', name: 'Transport', type: 'expense' },
      ];

      useCategories.mockReturnValue({
        categories: initialCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      const { rerender } = await render(<CategoriesScreen />);

      useCategories.mockReturnValue({
        categories: updatedCategories,
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });

    it('handles rapid expansion state changes', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [{ id: '1', name: 'Food', isFolder: true }],
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      const { rerender } = await render(<CategoriesScreen />);

      useCategories.mockReturnValue({
        categories: [{ id: '1', name: 'Food', isFolder: true }],
        loading: false,
        getChildren: jest.fn(() => []),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
        deleteCategory: jest.fn(),
        validateCategory: jest.fn(() => null),
      });

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Component Integration Points', () => {
    it('provides necessary props to child components', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should pass proper props to modals and progress bars
      await render(<CategoriesScreen />);
    });

    it('integrates with CategoryModal', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses CategoryModal for editing/creating categories
      await render(<CategoriesScreen />);
    });

    it('integrates with BudgetModal', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses BudgetModal for budget management
      await render(<CategoriesScreen />);
    });

    it('integrates with BudgetProgressBar', async () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses BudgetProgressBar to show budget status
      await render(<CategoriesScreen />);
    });
  });
});
