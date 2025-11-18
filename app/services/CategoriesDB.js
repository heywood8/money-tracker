import { executeQuery, queryAll, queryFirst, executeTransaction } from './db';

/**
 * Get all categories
 * @returns {Promise<Array>}
 */
export const getAllCategories = async () => {
  try {
    const categories = await queryAll(
      'SELECT * FROM categories ORDER BY created_at ASC'
    );
    return categories || [];
  } catch (error) {
    console.error('Failed to get categories:', error);
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
      [id]
    );
    return category;
  } catch (error) {
    console.error('Failed to get category:', error);
    throw error;
  }
};

/**
 * Get categories by type
 * @param {string} type - 'expense', 'income', or 'folder'
 * @returns {Promise<Array>}
 */
export const getCategoriesByType = async (type) => {
  try {
    const categories = await queryAll(
      'SELECT * FROM categories WHERE type = ? ORDER BY created_at ASC',
      [type]
    );
    return categories || [];
  } catch (error) {
    console.error('Failed to get categories by type:', error);
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
    if (parentId === null) {
      const categories = await queryAll(
        'SELECT * FROM categories WHERE parent_id IS NULL ORDER BY created_at ASC'
      );
      return categories || [];
    } else {
      const categories = await queryAll(
        'SELECT * FROM categories WHERE parent_id = ? ORDER BY created_at ASC',
        [parentId]
      );
      return categories || [];
    }
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
      type: category.type,
      parent_id: category.parentId || null,
      icon: category.icon || null,
      color: category.color || null,
      created_at: now,
      updated_at: now,
    };

    await executeQuery(
      'INSERT INTO categories (id, name, type, parent_id, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        categoryData.id,
        categoryData.name,
        categoryData.type,
        categoryData.parent_id,
        categoryData.icon,
        categoryData.color,
        categoryData.created_at,
        categoryData.updated_at,
      ]
    );

    return categoryData;
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
    if (updates.parentId !== undefined) {
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
    // Check if category has child categories
    const childCheck = await queryFirst(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?',
      [id]
    );

    if (childCheck && childCheck.count > 0) {
      throw new Error(
        `Cannot delete category: ${childCheck.count} subcategory(ies) exist. Please delete or reassign the subcategories first.`
      );
    }

    // Check if category is used in any operations
    const operationCheck = await queryFirst(
      'SELECT COUNT(*) as count FROM operations WHERE category_id = ?',
      [id]
    );

    if (operationCheck && operationCheck.count > 0) {
      throw new Error(
        `Cannot delete category: ${operationCheck.count} transaction(s) use this category. Please reassign or delete the transactions first.`
      );
    }

    // Safe to delete - no child categories or operations are linked
    await executeQuery('DELETE FROM categories WHERE id = ?', [id]);
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
      [id]
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

    while (currentId) {
      const category = await getCategoryById(currentId);
      if (!category) break;

      path.unshift(category);
      currentId = category.parent_id;
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

    while (queue.length > 0) {
      const currentId = queue.shift();
      const children = await getChildCategories(currentId);

      for (const child of children) {
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
      [id]
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
      [id]
    );
    return result ? result.count : 0;
  } catch (error) {
    console.error('Failed to count category usage:', error);
    throw error;
  }
};
