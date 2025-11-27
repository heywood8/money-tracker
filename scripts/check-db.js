#!/usr/bin/env node

/**
 * Database diagnostic script
 * Checks database version and table structure
 */

const SQLite = require('expo-sqlite');
const path = require('path');

async function checkDatabase() {
  try {
    console.log('Opening database...');
    const db = await SQLite.openDatabaseAsync('penny.db');

    // Check current version
    console.log('\n=== Database Version ===');
    const versionResult = await db.getAllAsync(
      'SELECT value FROM app_metadata WHERE key = ?',
      ['db_version']
    );

    if (versionResult && versionResult.length > 0) {
      console.log('Current database version:', versionResult[0].value);
    } else {
      console.log('Database version not found in app_metadata');
    }

    // List all tables
    console.log('\n=== Tables ===');
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    console.log('Existing tables:', tables.map(t => t.name).join(', '));

    // Check if budgets table exists
    const budgetsTable = tables.find(t => t.name === 'budgets');
    if (budgetsTable) {
      console.log('\n✓ budgets table exists');

      // Show budgets table structure
      const budgetsSchema = await db.getAllAsync('PRAGMA table_info(budgets)');
      console.log('\nBudgets table schema:');
      budgetsSchema.forEach(col => {
        console.log(`  - ${col.name}: ${col.type}`);
      });
    } else {
      console.log('\n✗ budgets table does NOT exist');
    }

    await db.closeAsync();
  } catch (error) {
    console.error('Error checking database:', error);
    process.exit(1);
  }
}

checkDatabase();
