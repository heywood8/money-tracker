import AsyncStorage from '@react-native-async-storage/async-storage';
import { idb } from './db.web';
import { createAccount } from './AccountsDB.web';

/**
 * Check if migration has been completed
 * @returns {Promise<boolean>}
 */
export const isMigrationComplete = async () => {
  try {
    const result = await idb.get('app_metadata', 'migration_complete');
    return result && result.value === 'true';
  } catch (error) {
    console.error('Failed to check migration status:', error);
    return false;
  }
};

/**
 * Mark migration as complete
 */
const setMigrationComplete = async () => {
  try {
    await idb.put('app_metadata', {
      key: 'migration_complete',
      value: 'true',
      updated_at: new Date().toISOString(),
    });
    console.log('Migration marked as complete');
  } catch (error) {
    console.error('Failed to mark migration as complete:', error);
    throw error;
  }
};

/**
 * Migrate accounts from AsyncStorage to IndexedDB
 * @returns {Promise<number>} Number of accounts migrated
 */
const migrateAccounts = async () => {
  try {
    const accountsJson = await AsyncStorage.getItem('accounts');
    if (!accountsJson) {
      console.log('No accounts to migrate');
      return 0;
    }

    const accounts = JSON.parse(accountsJson);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.log('No accounts to migrate');
      return 0;
    }

    console.log(`Migrating ${accounts.length} accounts...`);
    let migratedCount = 0;

    for (const account of accounts) {
      try {
        // Validate account data
        if (!account.id || !account.name) {
          console.warn('Skipping invalid account:', account);
          continue;
        }

        await createAccount({
          id: account.id,
          name: account.name,
          balance: account.balance || '0',
          currency: account.currency || 'USD',
        });

        migratedCount++;
      } catch (error) {
        console.error('Failed to migrate account:', account.id, error);
        // Continue with other accounts
      }
    }

    console.log(`Migrated ${migratedCount} of ${accounts.length} accounts`);
    return migratedCount;
  } catch (error) {
    console.error('Failed to migrate accounts:', error);
    throw error;
  }
};

/**
 * Perform full migration from AsyncStorage to IndexedDB
 * @returns {Promise<Object>} Migration results
 */
export const performMigration = async () => {
  try {
    console.log('Starting migration from AsyncStorage to IndexedDB...');

    // Check if already migrated
    const alreadyMigrated = await isMigrationComplete();
    if (alreadyMigrated) {
      console.log('Migration already complete');
      return {
        success: true,
        alreadyMigrated: true,
        accounts: 0,
        categories: 0,
        operations: 0,
      };
    }

    const results = {
      success: false,
      accounts: 0,
      categories: 0,
      operations: 0,
      errors: [],
    };

    // Migrate accounts
    try {
      results.accounts = await migrateAccounts();
    } catch (error) {
      results.errors.push({ stage: 'accounts', error: error.message });
    }

    // Mark migration as complete
    await setMigrationComplete();

    results.success = true;
    console.log('Migration complete:', results);

    return results;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

/**
 * Backup AsyncStorage data before migration
 * @returns {Promise<Object>}
 */
export const backupAsyncStorageData = async () => {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      accounts: null,
      categories: null,
      operations: null,
    };

    const accountsJson = await AsyncStorage.getItem('accounts');
    if (accountsJson) {
      backup.accounts = JSON.parse(accountsJson);
    }

    const categoriesJson = await AsyncStorage.getItem('categories');
    if (categoriesJson) {
      backup.categories = JSON.parse(categoriesJson);
    }

    const operationsJson = await AsyncStorage.getItem('operations');
    if (operationsJson) {
      backup.operations = JSON.parse(operationsJson);
    }

    // Store backup
    await AsyncStorage.setItem('migration_backup', JSON.stringify(backup));
    console.log('AsyncStorage data backed up');

    return backup;
  } catch (error) {
    console.error('Failed to backup AsyncStorage data:', error);
    throw error;
  }
};

/**
 * Restore from backup (in case of migration failure)
 * @returns {Promise<void>}
 */
export const restoreFromBackup = async () => {
  try {
    const backupJson = await AsyncStorage.getItem('migration_backup');
    if (!backupJson) {
      throw new Error('No backup found');
    }

    const backup = JSON.parse(backupJson);

    if (backup.accounts) {
      await AsyncStorage.setItem('accounts', JSON.stringify(backup.accounts));
    }

    if (backup.categories) {
      await AsyncStorage.setItem('categories', JSON.stringify(backup.categories));
    }

    if (backup.operations) {
      await AsyncStorage.setItem('operations', JSON.stringify(backup.operations));
    }

    console.log('Data restored from backup');
  } catch (error) {
    console.error('Failed to restore from backup:', error);
    throw error;
  }
};
