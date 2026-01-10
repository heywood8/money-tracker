import { useState, useCallback } from 'react';
import { Keyboard } from 'react-native';

/**
 * Custom hook for managing picker state and category folder navigation
 * Handles hierarchical category selection with breadcrumb navigation
 */
const useOperationPicker = (t) => {
  const [pickerState, setPickerState] = useState({
    visible: false,
    type: null,
    data: [],
    allCategories: [], // Store all available categories for navigation
  });

  // Category navigation state (for hierarchical folder navigation)
  const [categoryNavigation, setCategoryNavigation] = useState({
    currentFolderId: null, // null means showing root folders
    breadcrumb: [], // Array of {id, name} for navigation history
  });

  // Open picker with data
  const openPicker = useCallback((type, data) => {
    Keyboard.dismiss();
    if (type === 'category') {
      // For categories, show root folders and root entry categories
      // Root folders have type='folder' and no parentId
      // Root entries have type='entry' and no parentId (like income categories)
      const rootItems = data.filter(cat => !cat.parentId);
      setPickerState({ visible: true, type, data: rootItems, allCategories: data });
      setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
    } else {
      setPickerState({ visible: true, type, data, allCategories: [] });
    }
  }, []);

  // Close picker
  const closePicker = useCallback(() => {
    setPickerState({ visible: false, type: null, data: [], allCategories: [] });
    setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
  }, []);

  // Navigate into a category folder
  const navigateIntoFolder = useCallback((folder) => {
    setPickerState(prev => {
      const folderName = folder.nameKey ? t(folder.nameKey) : folder.name;
      const children = prev.allCategories.filter(cat => cat.parentId === folder.id);

      setCategoryNavigation(prevNav => ({
        currentFolderId: folder.id,
        breadcrumb: [...prevNav.breadcrumb, { id: folder.id, name: folderName }],
      }));

      return { ...prev, data: children };
    });
  }, [t]);

  // Navigate back to previous folder level
  const navigateBack = useCallback(() => {
    setPickerState(prev => {
      const newBreadcrumb = categoryNavigation.breadcrumb.slice(0, -1);
      const newFolderId = newBreadcrumb.length > 0
        ? newBreadcrumb[newBreadcrumb.length - 1].id
        : null;

      // Get the appropriate categories for this level
      let newData;
      if (newFolderId === null) {
        // Back to root - show all root items (folders and entries without parentId)
        newData = prev.allCategories.filter(cat => !cat.parentId);
      } else {
        // Back to parent folder - show its children
        newData = prev.allCategories.filter(cat => cat.parentId === newFolderId);
      }

      setCategoryNavigation({
        currentFolderId: newFolderId,
        breadcrumb: newBreadcrumb,
      });

      return { ...prev, data: newData };
    });
  }, [categoryNavigation.breadcrumb]);

  return {
    pickerState,
    categoryNavigation,
    openPicker,
    closePicker,
    navigateIntoFolder,
    navigateBack,
  };
};

export default useOperationPicker;
