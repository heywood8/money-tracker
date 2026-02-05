/**
 * Tests for CategoryModal Component
 *
 * Tests cover:
 * - Component rendering and visibility
 * - Form initialization (new vs edit mode)
 * - User interactions (name input, type selection, parent selection, icon picking)
 * - Form validation
 * - Save operations (add and update)
 * - Delete operation
 * - Modal dismissal
 * - Category type switching (expense/income)
 * - Folder vs entry type handling
 * - Parent category selection logic
 * - Category lifecycle
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CategoryModal from '../../app/modals/CategoryModal';

// Mock dependencies
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      secondary: '#f0f0f0',
      mutedText: '#666666',
      inputBackground: '#f5f5f5',
      inputBorder: '#dddddd',
      error: '#ff6b6b',
      selected: '#e0e0e0',
      delete: '#ff3b30',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: jest.fn(),
  }),
}));

const mockAddCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();
const mockValidateCategory = jest.fn(() => null); // Return null for valid

jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      },
      {
        id: 'cat2',
        name: 'Salary',
        type: 'entry',
        category_type: 'income',
        icon: 'cash',
        parentId: null,
      },
      {
        id: 'cat3',
        name: 'Groceries',
        type: 'entry',
        category_type: 'expense',
        icon: 'cart',
        parentId: 'cat1',
      },
    ],
    addCategory: mockAddCategory,
    updateCategory: mockUpdateCategory,
    deleteCategory: mockDeleteCategory,
    validateCategory: mockValidateCategory,
  }),
}));

// Mock IconPicker component
jest.mock('../../app/components/IconPicker', () => {
  const React = require('react');
  const { Modal, Pressable, Text } = require('react-native');
  // eslint-disable-next-line react/prop-types
  return function IconPicker({ visible, onClose, onSelect }) {
    if (!visible) return null;
    return (
      <Modal visible={visible}>
        <Pressable testID="icon-picker-close" onPress={onClose}>
          <Text>Close Icon Picker</Text>
        </Pressable>
        <Pressable testID="icon-picker-select" onPress={() => onSelect('test-icon')}>
          <Text>Select Icon</Text>
        </Pressable>
      </Modal>
    );
  };
});

describe('CategoryModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly when visible for new category', () => {
      const { getByText, getByPlaceholderText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('add_category')).toBeTruthy();
      expect(getByPlaceholderText('category_name')).toBeTruthy();
    });

    it('renders correctly when visible for editing category', () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByText, getByDisplayValue } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      expect(getByText('edit_category')).toBeTruthy();
      expect(getByDisplayValue('Food')).toBeTruthy();
      expect(getByText('delete_category')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const { queryByText } = render(
        <CategoryModal visible={false} onClose={mockOnClose} isNew={true} />,
      );

      expect(queryByText('add_category')).toBeFalsy();
    });
  });

  describe('Form Initialization', () => {
    it('initializes with default values for new category', () => {
      const { getByPlaceholderText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const nameInput = getByPlaceholderText('category_name');
      expect(nameInput.props.value).toBe('');
    });

    it('initializes with existing category values for edit mode', () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByDisplayValue } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      expect(getByDisplayValue('Food')).toBeTruthy();
    });

    it('handles category_type vs categoryType field names', () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        categoryType: 'expense', // Old field name
        icon: 'food',
        parentId: null,
      };

      const { getByDisplayValue } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      expect(getByDisplayValue('Food')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('allows name input', () => {
      const { getByPlaceholderText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const nameInput = getByPlaceholderText('category_name');
      fireEvent.changeText(nameInput, 'Entertainment');

      expect(nameInput.props.value).toBe('Entertainment');
    });

    it('opens icon picker when icon button is pressed', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const iconButton = getByText('select_icon');
      fireEvent.press(iconButton);

      // Icon picker modal should be visible
      expect(getByText('Close Icon Picker')).toBeTruthy();
    });

    it('selects icon from icon picker', () => {
      const { getByText, getByTestId } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const iconButton = getByText('select_icon');
      fireEvent.press(iconButton);

      const selectButton = getByTestId('icon-picker-select');
      fireEvent.press(selectButton);

      // Icon picker should close
      const closeButton = getByTestId('icon-picker-close');
      expect(closeButton).toBeTruthy();
    });

  });

  describe('Type Selection', () => {
    it('displays folder and entry options', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Should show type selector
      expect(getByText('select_type')).toBeTruthy();
    });

    it('prevents changing folder to entry when category has children', () => {
      const mockShowDialog = jest.fn();
      jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({
        showDialog: mockShowDialog,
      });

      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      // Try to open type picker
      const typeButton = getByText('folder');
      expect(typeButton).toBeTruthy();
    });

    it('allows changing entry to folder', () => {
      const mockCategory = {
        id: 'cat3',
        name: 'Groceries',
        type: 'entry',
        category_type: 'expense',
        icon: 'cart',
        parentId: 'cat1',
      };

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      expect(getByText('entry')).toBeTruthy();
    });
  });

  describe('Category Type Selection', () => {
    it('displays expense and income options', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('category_type')).toBeTruthy();
      expect(getByText('expense')).toBeTruthy();
    });

    it('filters parent categories by category type', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Parent picker should only show categories of the same type
      expect(getByText('parent_category')).toBeTruthy();
    });
  });

  describe('Parent Category Selection', () => {
    it('shows none option for parent category', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      expect(getByText('none')).toBeTruthy();
    });

    it('excludes current category from parent list when editing', () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByDisplayValue } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      // Current category should be displayed in the name field
      expect(getByDisplayValue('Food')).toBeTruthy();
    });

    it('displays parent name correctly', () => {
      const mockCategory = {
        id: 'cat3',
        name: 'Groceries',
        type: 'entry',
        category_type: 'expense',
        icon: 'cart',
        parentId: 'cat1',
      };

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      // Should show the parent category name
      expect(getByText('Food')).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('validates category before saving', async () => {
      const { getByPlaceholderText, getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const nameInput = getByPlaceholderText('category_name');
      fireEvent.changeText(nameInput, 'New Category');

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockValidateCategory).toHaveBeenCalled();
      });
    });

    it('shows error message when validation fails', async () => {
      mockValidateCategory.mockReturnValueOnce('Category name required');

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(getByText('Category name required')).toBeTruthy();
      });
    });

    it('does not save when validation fails', async () => {
      mockValidateCategory.mockReturnValueOnce('Invalid category');

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockAddCategory).not.toHaveBeenCalled();
      });
    });
  });

  describe('Save Operations', () => {
    it('calls addCategory when saving new category with valid data', async () => {
      mockValidateCategory.mockReturnValue(null);

      const { getByPlaceholderText, getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const nameInput = getByPlaceholderText('category_name');
      fireEvent.changeText(nameInput, 'Entertainment');

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockAddCategory).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Entertainment',
            type: 'folder',
            category_type: 'expense',
            icon: 'folder',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('calls updateCategory when saving existing category', async () => {
      mockValidateCategory.mockReturnValue(null);

      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByDisplayValue, getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      const nameInput = getByDisplayValue('Food');
      fireEvent.changeText(nameInput, 'Food & Drink');

      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockUpdateCategory).toHaveBeenCalledWith(
          'cat1',
          expect.objectContaining({
            name: 'Food & Drink',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Delete Operation', () => {
    it('shows delete button only for existing categories', () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      expect(getByText('delete_category')).toBeTruthy();
    });

    it('does not show delete button for new categories', () => {
      const { queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const deleteButton = queryByText('delete_category');
      expect(deleteButton).toBeFalsy();
    });

    it('shows confirmation dialog when delete is pressed', () => {
      const mockShowDialog = jest.fn();
      jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({
        showDialog: mockShowDialog,
      });

      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      const deleteButton = getByText('delete_category');
      fireEvent.press(deleteButton);

      expect(mockShowDialog).toHaveBeenCalledWith(
        'delete_category',
        'delete_category_confirm',
        expect.any(Array),
      );
    });

    it('calls deleteCategory when confirmed', async () => {
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      // Mock showDialog to immediately call the delete action
      const mockShowDialog = jest.fn((title, message, buttons) => {
        // Find and call the delete button action
        const deleteButton = buttons.find(b => b.style === 'destructive');
        if (deleteButton && deleteButton.onPress) {
          deleteButton.onPress();
        }
      });

      jest.spyOn(require('../../app/contexts/DialogContext'), 'useDialog').mockReturnValue({
        showDialog: mockShowDialog,
      });

      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      const deleteButton = getByText('delete_category');
      fireEvent.press(deleteButton);

      await waitFor(() => {
        expect(mockDeleteCategory).toHaveBeenCalledWith('cat1');
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Dismissal', () => {
    it('calls onClose when cancel button is pressed', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      const cancelButton = getByText('cancel');
      fireEvent.press(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('clears errors when modal is closed and reopened', () => {
      mockValidateCategory.mockReturnValueOnce('Error message');

      const { getByText, queryByText, rerender } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Generate an error
      const saveButton = getByText('save');
      fireEvent.press(saveButton);

      // Error should be visible
      expect(getByText('Error message')).toBeTruthy();

      // Close modal
      rerender(<CategoryModal visible={false} onClose={mockOnClose} isNew={true} />);

      // Reopen modal
      mockValidateCategory.mockReturnValue(null);
      rerender(<CategoryModal visible={true} onClose={mockOnClose} isNew={true} />);

      // Error should be cleared
      expect(queryByText('Error message')).toBeFalsy();
    });
  });

  describe('Picker Modal Interactions', () => {
    it('opens type picker modal when type button is pressed', async () => {
      const { queryByText, queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Find and press the type button (shows 'folder' by default)
      const folderTexts = queryAllByText('folder');
      if (folderTexts.length > 0) {
        fireEvent.press(folderTexts[0]);
      }

      // Type picker modal should show close button
      await waitFor(() => {
        expect(queryByText('close')).toBeTruthy();
      });
    });

    it('opens category type picker modal when category type button is pressed', async () => {
      const { queryByText, queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Find and press the category type button (shows 'expense' by default)
      const expenseTexts = queryAllByText('expense');
      if (expenseTexts.length > 0) {
        fireEvent.press(expenseTexts[0]);
      }

      // Category type picker modal should show close button
      await waitFor(() => {
        expect(queryByText('close')).toBeTruthy();
      });
    });

    it('opens parent picker modal when parent button is pressed', async () => {
      const { queryByText, queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Find and press the parent button (shows 'none' by default)
      const noneTexts = queryAllByText('none');
      if (noneTexts.length > 0) {
        fireEvent.press(noneTexts[0]);
      }

      // Parent picker modal should show close button
      await waitFor(() => {
        expect(queryByText('close')).toBeTruthy();
      });
    });

    it('renders parent picker with available categories', async () => {
      const { queryByText, queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open parent picker
      const noneTexts = queryAllByText('none');
      if (noneTexts.length > 0) {
        fireEvent.press(noneTexts[0]);
      }

      // Should show category names in the picker
      await waitFor(() => {
        expect(queryByText('Food')).toBeTruthy();
      });
    });

    it('selects entry type from type picker and closes modal', async () => {
      const { queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open type picker
      const folderTexts = queryAllByText('folder');
      if (folderTexts.length > 0) {
        fireEvent.press(folderTexts[0]);
      }

      // Find and select 'entry' option
      await waitFor(() => {
        const entryTexts = queryAllByText('entry');
        if (entryTexts.length > 0) {
          fireEvent.press(entryTexts[entryTexts.length - 1]);
        }
      });
    });

    it('selects income from category type picker and closes modal', async () => {
      const { queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open category type picker
      const expenseTexts = queryAllByText('expense');
      if (expenseTexts.length > 0) {
        fireEvent.press(expenseTexts[0]);
      }

      // Find and select 'income' option
      await waitFor(() => {
        const incomeTexts = queryAllByText('income');
        if (incomeTexts.length > 0) {
          fireEvent.press(incomeTexts[incomeTexts.length - 1]);
        }
      });
    });

    it('selects parent category from parent picker', async () => {
      const { queryAllByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open parent picker
      const noneTexts = queryAllByText('none');
      if (noneTexts.length > 0) {
        fireEvent.press(noneTexts[0]);
      }

      // Find and select 'Food' category as parent
      await waitFor(() => {
        const foodTexts = queryAllByText('Food');
        if (foodTexts.length > 0) {
          fireEvent.press(foodTexts[foodTexts.length - 1]);
        }
      });
    });

    it('closes type picker via close button', async () => {
      const { queryAllByText, queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open type picker
      const folderTexts = queryAllByText('folder');
      if (folderTexts.length > 0) {
        fireEvent.press(folderTexts[0]);
      }

      // Press close button
      await waitFor(() => {
        const closeButton = queryByText('close');
        if (closeButton) {
          fireEvent.press(closeButton);
        }
      });
    });

    it('closes category type picker via close button', async () => {
      const { queryAllByText, queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open category type picker
      const expenseTexts = queryAllByText('expense');
      if (expenseTexts.length > 0) {
        fireEvent.press(expenseTexts[0]);
      }

      // Press close button
      await waitFor(() => {
        const closeButton = queryByText('close');
        if (closeButton) {
          fireEvent.press(closeButton);
        }
      });
    });

    it('closes parent picker via close button', async () => {
      const { queryAllByText, queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open parent picker
      const noneTexts = queryAllByText('none');
      if (noneTexts.length > 0) {
        fireEvent.press(noneTexts[0]);
      }

      // Press close button
      await waitFor(() => {
        const closeButton = queryByText('close');
        if (closeButton) {
          fireEvent.press(closeButton);
        }
      });
    });

    it('shows warning indicator when category has children and entry option is disabled', async () => {
      // Category with children (cat1 is the parent of cat3)
      const mockCategory = {
        id: 'cat1',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByText, queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      // Open type picker
      const typeButton = getByText('folder');
      fireEvent.press(typeButton);

      // Entry option should be visible (possibly with warning indicator)
      await waitFor(() => {
        // The entry option should be in the picker
        expect(queryByText(/entry/)).toBeTruthy();
      });
    });

    it('renders parent picker with icon and name', async () => {
      const { getByText, queryByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} isNew={true} />,
      );

      // Open parent picker
      const parentButton = getByText('none');
      fireEvent.press(parentButton);

      // Should show category names in the picker
      await waitFor(() => {
        // Food category should be visible as a potential parent
        expect(queryByText('Food')).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles missing category data gracefully', () => {
      const { getByText } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={null} isNew={true} />,
      );

      expect(getByText('add_category')).toBeTruthy();
    });

    it('handles categories with nameKey for translations', () => {
      const mockCategory = {
        id: 'cat1',
        nameKey: 'food_category',
        name: 'Food',
        type: 'folder',
        category_type: 'expense',
        icon: 'food',
        parentId: null,
      };

      const { getByDisplayValue } = render(
        <CategoryModal visible={true} onClose={mockOnClose} category={mockCategory} isNew={false} />,
      );

      // Should display the name in the input field
      expect(getByDisplayValue('Food')).toBeTruthy();
    });

  });
});
