import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db, rawDb } from './client';

/**
 * Run Drizzle migrations
 * This function applies all pending migrations from the drizzle folder
 */
export const runMigrations = async () => {
  try {
    console.log('Running Drizzle migrations...');

    // Enable foreign keys
    rawDb.execSync('PRAGMA foreign_keys = ON');

    // Run migrations
    await migrate(db, { migrationsFolder: 'drizzle' });

    console.log('Drizzle migrations completed successfully');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
};

/**
 * Initialize database with Drizzle migrations
 */
export const initializeDatabase = async () => {
  try {
    await runMigrations();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};
