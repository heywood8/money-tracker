import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite/next';
import * as schema from './schema';

const DB_NAME = 'penny.db';

// Open SQLite database
const expoDb = openDatabaseSync(DB_NAME);

// Create Drizzle instance
export const db = drizzle(expoDb, { schema });

// Export the raw expo database for direct SQL operations when needed
export const rawDb = expoDb;

// Export schema for use in queries
export { schema };
