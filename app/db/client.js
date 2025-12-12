/**
 * Database client exports
 * These instances are set by the main db.js after initialization
 * This module exists to avoid circular dependencies during migration
 */

const dbInstances = {
  raw: null,
  drizzle: null,
};

/**
 * Set the database instances (called from app/services/db.js after initialization)
 */
export const setDatabaseInstances = (rawDbInstance, drizzleInstance) => {
  dbInstances.raw = rawDbInstance;
  dbInstances.drizzle = drizzleInstance;
};

/**
 * Get raw database instance
 * @returns {Object} SQLite database instance
 */
export const getRawDb = () => {
  if (!dbInstances.raw) {
    throw new Error('Database not initialized. Call setDatabaseInstances first.');
  }
  return dbInstances.raw;
};

/**
 * Get Drizzle ORM instance
 * @returns {Object} Drizzle instance
 */
export const getDb = () => {
  if (!dbInstances.drizzle) {
    throw new Error('Database not initialized. Call setDatabaseInstances first.');
  }
  return dbInstances.drizzle;
};

// Export as named exports for backward compatibility
export const rawDb = {
  get instance() {
    return getRawDb();
  }
};

export const db = {
  get instance() {
    return getDb();
  }
};
