import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';
import defaultCategories from '../defaults/defaultCategories.json';
import enTranslations from '../../assets/i18n/en.json';
import itTranslations from '../../assets/i18n/it.json';
import ruTranslations from '../../assets/i18n/ru.json';
import esTranslations from '../../assets/i18n/es.json';
import frTranslations from '../../assets/i18n/fr.json';
import zhTranslations from '../../assets/i18n/zh.json';
import deTranslations from '../../assets/i18n/de.json';
import hyTranslations from '../../assets/i18n/hy.json';
import jaTranslations from '../../assets/i18n/ja.json';
import koTranslations from '../../assets/i18n/ko.json';
import ptTranslations from '../../assets/i18n/pt.json';

// Map language codes to their translation data
const i18nData = {
  en: enTranslations,
  it: itTranslations,
  ru: ruTranslations,
  es: esTranslations,
  fr: frTranslations,
  zh: zhTranslations,
  de: deTranslations,
  hy: hyTranslations,
  ja: jaTranslations,
  ko: koTranslations,
  pt: ptTranslations,
};

/**
 * Map database field names to camelCase for application use
 * @param {Object} dbCategory - Category object from database with snake_case fields
 * @returns {Object} Category object with camelCase fields
 */
const mapCategoryFields = (dbCategory) => {
  if (!dbCategory) return null;

  return {
    id: dbCategory.id,
    name: dbCategory.name,
    type: dbCategory.type,
    categoryType: dbCategory.category_type,
    parentId: dbCategory.parent_id,
    icon: dbCategory.icon,
    color: dbCategory.color,
    isShadow: dbCategory.is_shadow === 1 || dbCategory.is_shadow === true,
    createdAt: dbCategory.created_at,
    updatedAt: dbCategory.updated_at,
  };
};

/**
 * Initialize default categories in the database with translated names
 * @param {string} language - Language code ('en' or 'ru')
 * @returns {Promise<void>}
 */
export const initializeDefaultCategories = async (language = 'en') => {
  try {
    // Get translations for the specified language
    const translations = i18nData[language] || i18nData['en'];

    // Sort categories to ensure parents are created before children
    const sortedCategories = [...defaultCategories].sort((a, b) => {
      // Categories without parentId (root) should come first
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return 0;
    });

    for (const category of sortedCategories) {
      try {
        // Use translated name if nameKey exists, otherwise use default name
        const translatedName = category.nameKey
          ? (translations[category.nameKey] || category.name)
          : category.name;

        await createCategory({
          id: category.id,
          name: translatedName,
          type: category.type || 'folder',
          category_type: category.category_type,
          parentId: category.parentId || null,
          icon: category.icon || null,
          color: category.color || null,
          isShadow: category.isShadow || false,
        });
      } catch (err) {
        console.error('Failed to create default category:', category.id, err);
        // Continue with other categories
      }
    }

    console.log(`Default categories initialized successfully in ${language}`);
  } catch (error) {
    console.error('Failed to initialize default categories:', error);
    throw error;
  }
};

/**
 * Get all categories (excluding shadow categories by default)
 * @param {boolean} includeShadow - Whether to include shadow categories (default: false)
 * @returns {Promise<Array>}
 */
export const getAllCategories = async (includeShadow = false) => {
  try {
    const query = includeShadow
      ? 'SELECT * FROM categories ORDER BY created_at ASC'
      : 'SELECT * FROM categories WHERE is_shadow = 0 ORDER BY created_at ASC';

    const categories = await queryAll(query);
    return (categories || []).map(mapCategoryFields);
  } catch (error) {
    console.error('Failed to get categories:', error);
    throw error;
  }
};

/**
 * Get shadow categories
 * @returns {Promise<Array>}
 */
export const getShadowCategories = async () => {
  try {
    const categories = await queryAll(
      'SELECT * FROM categories WHERE is_shadow = 1 ORDER BY created_at ASC',
    );
    return (categories || []).map(mapCategoryFields);
  } catch (error) {
    console.error('Failed to get shadow categories:', error);
    throw error;
  }
};

/**
 * Get category by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getCategoryById = async (id) => {
  try {
    const category = await queryFirst(
      'SELECT * FROM categories WHERE id = ?',
      [id],
    );
    return mapCategoryFields(category);
  } catch (error) {
    console.error('Failed to get category:', error);
    throw error;
  }
};

/**
 * Get categories by category_type (expense or income)
 * @param {string} categoryType - 'expense' or 'income'
 * @param {boolean} includeShadow - Whether to include shadow categories (default: false)
 * @returns {Promise<Array>}
 */
export const getCategoriesByCategoryType = async (categoryType, includeShadow = false) => {
  try {
    const query = includeShadow
      ? 'SELECT * FROM categories WHERE category_type = ? ORDER BY created_at ASC'
      : 'SELECT * FROM categories WHERE category_type = ? AND is_shadow = 0 ORDER BY created_at ASC';

    const categories = await queryAll(query, [categoryType]);
    return (categories || []).map(mapCategoryFields);
  } catch (error) {
    console.error('Failed to get categories by category_type:', error);
    throw error;
  }
};

/**
 * Get child categories of a parent
 * @param {string|null} parentId - Parent category ID or null for root categories
 * @returns {Promise<Array>}
 */
export const getChildCategories = async (parentId) => {
  try {
    let categories;
    if (parentId === null) {
      categories = await queryAll(
        'SELECT * FROM categories WHERE parent_id IS NULL ORDER BY created_at ASC',
      );
    } else {
      categories = await queryAll(
        'SELECT * FROM categories WHERE parent_id = ? ORDER BY created_at ASC',
        [parentId],
      );
    }
    return (categories || []).map(mapCategoryFields);
  } catch (error) {
    console.error('Failed to get child categories:', error);
    throw error;
  }
};

/**
 * Create a new category
 * @param {Object} category - Category data
 * @returns {Promise<Object>}
 */
export const createCategory = async (category) => {
  try {
    const now = new Date().toISOString();
    const categoryData = {
      id: category.id,
      name: category.name,
      type: category.type || 'folder',
      category_type: category.category_type || category.categoryType || 'expense',
      parent_id: category.parentId || category.parent_id || null,
      icon: category.icon || null,
      color: category.color || null,
      is_shadow: category.isShadow || category.is_shadow ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      'INSERT INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        categoryData.id,
        categoryData.name,
        categoryData.type,
        categoryData.category_type,
        categoryData.parent_id,
        categoryData.icon,
        categoryData.color,
        categoryData.is_shadow,
        categoryData.created_at,
        categoryData.updated_at,
      ],
    );

    // Return mapped fields for consistency
    return mapCategoryFields(categoryData);
  } catch (error) {
    console.error('Failed to create category:', error);
    throw error;
  }
};

/**
 * Update an existing category
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export const updateCategory = async (id, updates) => {
  try {
    const updatedAt = new Date().toISOString();
    const fields = [];
    const values = [];

    // Build dynamic UPDATE query based on provided fields
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.category_type !== undefined || updates.categoryType !== undefined) {
      fields.push('category_type = ?');
      values.push(updates.category_type || updates.categoryType);
    }
    if (updates.parentId !== undefined) {
      // Guard against parent cycles: re-parenting onto itself or one of its own
      // descendants would detach the subtree and hang every descendant walk.
      if (updates.parentId) {
        if (updates.parentId === id) {
          throw new Error('Cannot set a category as its own parent');
        }
        const descendants = await getAllDescendants(id);
        if (descendants.some(d => d.id === updates.parentId)) {
          throw new Error('Cannot move a category into one of its own subcategories');
        }
      }
      fields.push('parent_id = ?');
      values.push(updates.parentId || null);
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon || null);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color || null);
    }
    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = ?');
    values.push(updatedAt);
    values.push(id); // Add ID at the end for WHERE clause

    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);
  } catch (error) {
    console.error('Failed to update category:', error);
    throw error;
  }
};

/**
 * Delete a category
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {Error} If category has child categories or associated operations
 */
export const deleteCategory = async (id) => {
  try {
    await executeTransaction(async (db) => {
      const childCheck = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?',
        [id],
      );

      if (childCheck && childCheck.count > 0) {
        // Attach a structured code + count so the UI can build a localized,
        // actionable message without parsing this English string (QoL-4).
        const err = new Error(
          `Cannot delete category: ${childCheck.count} subcategory(ies) exist. Please delete or reassign the subcategories first.`,
        );
        err.code = 'CATEGORY_HAS_CHILDREN';
        err.count = childCheck.count;
        throw err;
      }

      const operationCheck = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM operations WHERE category_id = ?',
        [id],
      );

      if (operationCheck && operationCheck.count > 0) {
        const err = new Error(
          `Cannot delete category: ${operationCheck.count} transaction(s) use this category. Please reassign or delete the transactions first.`,
        );
        err.code = 'CATEGORY_HAS_OPERATIONS';
        err.count = operationCheck.count;
        throw err;
      }

      await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
    });
  } catch (error) {
    console.error('Failed to delete category:', error);
    throw error;
  }
};

/**
 * Check if category has children
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const hasChildCategories = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1',
      [id],
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check child categories:', error);
    throw error;
  }
};

/**
 * Get category hierarchy path
 * @param {string} id
 * @returns {Promise<Array>} Array of categories from root to the specified category
 */
export const getCategoryPath = async (id) => {
  try {
    const path = [];
    let currentId = id;
    const visited = new Set();

    while (currentId) {
      if (visited.has(currentId)) throw new Error('Cycle detected in category parents at id: ' + currentId);
      visited.add(currentId);
      const category = await getCategoryById(currentId);
      if (!category) break;

      path.unshift(category);
      currentId = category.parentId;
    }

    return path;
  } catch (error) {
    console.error('Failed to get category path:', error);
    throw error;
  }
};

/**
 * Move category to a new parent
 * @param {string} id
 * @param {string|null} newParentId
 * @returns {Promise<void>}
 */
export const moveCategory = async (id, newParentId) => {
  try {
    // Validate that we're not creating a circular reference
    if (newParentId) {
      const path = await getCategoryPath(newParentId);
      if (path.some(cat => cat.id === id)) {
        throw new Error('Cannot move category to its own descendant');
      }
    }

    await updateCategory(id, { parentId: newParentId });
  } catch (error) {
    console.error('Failed to move category:', error);
    throw error;
  }
};

/**
 * Get all descendants of a category (recursive)
 * @param {string} id
 * @returns {Promise<Array>}
 */
export const getAllDescendants = async (id) => {
  try {
    const descendants = [];
    const queue = [id];
    // Track visited ids so a corrupted parent cycle in existing data degrades
    // to a bounded walk instead of an infinite loop.
    const visited = new Set([id]);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const children = await getChildCategories(currentId);

      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  } catch (error) {
    console.error('Failed to get descendants:', error);
    throw error;
  }
};

/**
 * Check if category exists
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const categoryExists = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT 1 FROM categories WHERE id = ? LIMIT 1',
      [id],
    );
    return !!result;
  } catch (error) {
    console.error('Failed to check category existence:', error);
    throw error;
  }
};

/**
 * Count operations using this category
 * @param {string} id
 * @returns {Promise<number>}
 */
export const countCategoryUsage = async (id) => {
  try {
    const result = await queryFirst(
      'SELECT COUNT(*) as count FROM operations WHERE category_id = ?',
      [id],
    );
    return result ? result.count : 0;
  } catch (error) {
    console.error('Failed to count category usage:', error);
    throw error;
  }
};
