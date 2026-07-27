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

/**
 * Get the category name and parent name separately
 * @param {string} categoryId - The category ID to get the names for
 * @param {Array} categories - Array of all categories
 * @param {Function} t - Translation function
 * @returns {Object} Object with categoryName and parentName (null if no parent)
 */
export const getCategoryNames = (categoryId, categories, t) => {
  if (!categoryId) {
    return {
      categoryName: '',
      parentName: null,
    };
  }

  const category = categories.find(cat => cat.id === categoryId);
  if (!category) {
    return {
      categoryName: t('unknown_category'),
      parentName: null,
    };
  }

  const categoryName = category.nameKey ? t(category.nameKey) : category.name;

  let parentName = null;
  if (category.parentId) {
    const parentCategory = categories.find(cat => cat.id === category.parentId);
    if (parentCategory) {
      parentName = parentCategory.nameKey
        ? t(parentCategory.nameKey)
        : parentCategory.name;
    }
  }

  return { categoryName, parentName };
};

/**
 * Stable colour slot for a category.
 *
 * A chart never mixes levels — it shows one set of siblings at a time (the root
 * categories, or the children of whatever you drilled into) — so numbering a
 * category by its position among its siblings gives two things at once:
 *
 *  - the slice colours of a given chart come out as consecutive palette slots,
 *    which is the ordering the palette's adjacent-pair separation was validated
 *    on, and
 *  - the slot depends only on the category, never on the period, the amounts,
 *    or which siblings happen to have activity — so a category does not change
 *    colour when you switch months. Colour follows the entity, not its rank.
 *
 * Ordering key is `createdAt` with the id as tie-breaker: both are immutable, so
 * renaming or re-parenting nothing else keeps every sibling's colour put.
 *
 * @param {Object} category - The category to place
 * @param {Array} categories - Array of all categories
 * @returns {number} Zero-based slot index (callers wrap it into their palette)
 */
export const getCategoryColorSlot = (category, categories) => {
  if (!category) return 0;

  const siblings = (categories || []).filter(cat =>
    cat.parentId === category.parentId &&
    cat.categoryType === category.categoryType &&
    !cat.isShadow,
  );

  siblings.sort((a, b) => {
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) return createdA < createdB ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  });

  const index = siblings.findIndex(cat => cat.id === category.id);
  return index === -1 ? 0 : index;
};
