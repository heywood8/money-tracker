/**
 * Utility functions for working with categories
 */

/**
 * Get the display name for a category, including parent name in brackets if applicable
 * @param {string} categoryId - The category ID to get the name for
 * @param {Array} categories - Array of all categories
 * @param {Function} t - Translation function
 * @returns {string} Category name with parent in brackets (e.g., "Groceries (Food)")
 */
export const getCategoryDisplayName = (categoryId, categories, t) => {
  if (!categoryId) return '';

  const category = categories.find(cat => cat.id === categoryId);
  if (!category) return '';

  const categoryName = category.nameKey ? t(category.nameKey) : category.name;

  // If category has a parent, show parent name in brackets
  if (category.parentId) {
    const parentCategory = categories.find(cat => cat.id === category.parentId);
    if (parentCategory) {
      const parentName = parentCategory.nameKey ? t(parentCategory.nameKey) : parentCategory.name;
      return `${categoryName} (${parentName})`;
    }
  }

  return categoryName;
};
