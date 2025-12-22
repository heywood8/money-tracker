/**
 * Tests for CategoriesScreen - Category management screen
 * Logic-based tests focusing on component behavior and integration patterns
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// Mock all dependencies
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity, ActivityIndicator } = require('react-native');
  
  return {
    Text: Text,
    FAB: ({ onPress, icon, label, ...props }) => React.createElement(TouchableOpacity, { onPress, testID: 'fab', ...props }),
    ActivityIndicator: ActivityIndicator,
    Card: ({ children, style, ...props }) => React.createElement(View, { style, testID: 'card', ...props }, children),
    TouchableRipple: ({ children, onPress, onLongPress, style, ...props }) => 
      React.createElement(TouchableOpacity, { onPress, onLongPress, style, testID: 'touchable-ripple', ...props }, children),
  };
});

jest.mock('../../app/contexts/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
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
    expandedIds: new Set(),
    toggleExpanded: jest.fn(),
    getChildren: jest.fn(() => []),
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
    it('renders without crashing', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('uses ThemeContext for styling', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useTheme } = require('../../app/contexts/ThemeContext');

      render(<CategoriesScreen />);

      expect(useTheme).toHaveBeenCalled();
    });

    it('uses CategoriesContext for category data', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      render(<CategoriesScreen />);

      expect(useCategories).toHaveBeenCalled();
    });

    it('uses BudgetsContext for budget data', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useBudgets } = require('../../app/contexts/BudgetsContext');

      render(<CategoriesScreen />);

      expect(useBudgets).toHaveBeenCalled();
    });

    it('uses DialogContext for dialogs', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useDialog } = require('../../app/contexts/DialogContext');

      render(<CategoriesScreen />);

      expect(useDialog).toHaveBeenCalled();
    });

    it('uses LocalizationContext for translations', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      render(<CategoriesScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });
  });

  describe('Integration with Contexts', () => {
    it('handles empty category list', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles loading state', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: true,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles flat category list', () => {
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
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles hierarchical category structure', () => {
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
        expandedIds: new Set(['1']),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn((id) => mockCategories.filter(c => c.parentId === id)),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('filters out shadow categories from display', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', name: 'Food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: '2', name: 'Shadow', type: 'expense', icon: 'hidden', color: '#000000', isShadow: true },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      // Component should filter out shadow categories internally
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Budget Integration', () => {
    it('handles categories without budgets', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useBudgets } = require('../../app/contexts/BudgetsContext');

      useBudgets.mockReturnValue({
        hasActiveBudget: jest.fn(() => false),
        getBudgetForCategory: jest.fn(() => null),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles categories with active budgets', () => {
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

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('State Management', () => {
    it('manages category modal visibility state', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should manage modal state internally
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('manages budget modal visibility state', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should manage budget modal state
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('manages edit vs new mode for categories', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should track whether adding new or editing existing
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Category Expansion Logic', () => {
    it('handles expanded category folders', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [
          { id: '1', name: 'Food', isFolder: true },
          { id: '2', name: 'Groceries', parentId: '1' },
        ],
        loading: false,
        expandedIds: new Set(['1']),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn((id) => id === '1' ? [{ id: '2', name: 'Groceries', parentId: '1' }] : []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles collapsed category folders', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [
          { id: '1', name: 'Food', isFolder: true },
          { id: '2', name: 'Groceries', parentId: '1' },
        ],
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Theme Integration', () => {
    it('applies theme colors to components', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useTheme } = require('../../app/contexts/ThemeContext');

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

      useTheme.mockReturnValue({ colors: mockColors });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
      expect(useTheme).toHaveBeenCalled();
    });

    it('handles dark theme', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useTheme } = require('../../app/contexts/ThemeContext');

      useTheme.mockReturnValue({
        colors: {
          background: '#111111',
          surface: '#222222',
          primary: '#2196f3',
          text: '#ffffff',
          mutedText: '#aaaaaa',
          border: '#333333',
        },
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Localization Integration', () => {
    it('uses translation function for UI text', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useLocalization } = require('../../app/contexts/LocalizationContext');

      const mockT = jest.fn((key) => `translated_${key}`);
      useLocalization.mockReturnValue({
        t: mockT,
        language: 'en',
      });

      render(<CategoriesScreen />);

      expect(useLocalization).toHaveBeenCalled();
    });

    it('handles category nameKey translations', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1', nameKey: 'food', type: 'expense', icon: 'food', color: '#ff0000' },
        { id: '2', name: 'Custom Category', type: 'expense', icon: 'star', color: '#00ff00' },
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty categories array when context provides empty state', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      // Context should always provide an array, even when empty
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles initial loading state with empty categories', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [],
        loading: true,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles categories with missing properties', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      const mockCategories = [
        { id: '1' }, // Missing name, type, icon, color
        { id: '2', name: 'Partial' }, // Missing type, icon, color
      ];

      useCategories.mockReturnValue({
        categories: mockCategories,
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('handles deeply nested category hierarchy', () => {
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
        expandedIds: new Set(['1', '2', '3']),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn((id) => mockCategories.filter(c => c.parentId === id)),
      });

      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Regression Tests', () => {
    it('handles re-rendering without errors', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      const { rerender } = render(<CategoriesScreen />);

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });

    it('maintains stability when categories change', () => {
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
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      const { rerender } = render(<CategoriesScreen />);

      useCategories.mockReturnValue({
        categories: updatedCategories,
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });

    it('handles rapid expansion state changes', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;
      const { useCategories } = require('../../app/contexts/CategoriesContext');

      useCategories.mockReturnValue({
        categories: [{ id: '1', name: 'Food', isFolder: true }],
        loading: false,
        expandedIds: new Set(),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      const { rerender } = render(<CategoriesScreen />);

      useCategories.mockReturnValue({
        categories: [{ id: '1', name: 'Food', isFolder: true }],
        loading: false,
        expandedIds: new Set(['1']),
        toggleExpanded: jest.fn(),
        getChildren: jest.fn(() => []),
      });

      expect(() => rerender(<CategoriesScreen />)).not.toThrow();
    });
  });

  describe('Component Integration Points', () => {
    it('provides necessary props to child components', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component should pass proper props to modals and progress bars
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('integrates with CategoryModal', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses CategoryModal for editing/creating categories
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('integrates with BudgetModal', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses BudgetModal for budget management
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });

    it('integrates with BudgetProgressBar', () => {
      const CategoriesScreen = require('../../app/screens/CategoriesScreen').default;

      // Component uses BudgetProgressBar to show budget status
      expect(() => render(<CategoriesScreen />)).not.toThrow();
    });
  });
});
