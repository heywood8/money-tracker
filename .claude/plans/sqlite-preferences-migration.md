# SQLite Preferences Migration Plan

## Overview
Migrate all app preferences from AsyncStorage to SQLite to create a single source of truth and eliminate type conversion issues.

## Current State

### AsyncStorage (Preferences)
- Theme preference: `'theme_preference'` (values: 'light', 'dark', 'system')
- Language preference: `'app_language'` (values: 'en', 'ru')
- Last accessed account: `'last_accessed_account_id'` (stored as string, but is an integer)
- Operations filters: `'operations_active_filters'` (JSON object)

### SQLite (Business Data)
- Accounts, Operations, Categories, Budgets
- Balance History
- App Metadata (for migration tracking)

## Problems with Current Approach
1. **Type inconsistency**: Account IDs stored as strings in AsyncStorage but integers in SQLite
2. **Two storage systems**: More complexity to maintain
3. **Split data**: Preferences and data are separated
4. **No transactional integrity**: Can't update preferences atomically with data changes
5. **Backup complexity**: Need to handle two storage systems for export/import

## Goals
1. Single source of truth for all app data
2. Proper typing for all data (integers stay integers)
3. Simplified storage layer
4. All data participates in transactions
5. Unified backup/restore process

## Benefits
- ✅ Eliminates type conversion confusion
- ✅ One less dependency to manage (AsyncStorage for app data)
- ✅ Transactional integrity across all data
- ✅ Simpler backup/restore implementation
- ✅ All preferences participate in database migrations
- ✅ Better testability (single storage mock)

## Implementation Plan

### Phase 1: Schema Changes

#### 1.1 Update Schema (app/db/schema.js)
The `app_metadata` table already exists and can be used for preferences:
```javascript
export const appMetadata = sqliteTable('app_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

This table can store all preferences as key-value pairs (JSON for complex objects).

Alternatively, create a dedicated preferences table:
```javascript
export const appPreferences = sqliteTable('app_preferences', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON-stringified for complex types
  type: text('type').notNull(), // 'string', 'number', 'boolean', 'json'
  updatedAt: text('updated_at').notNull(),
});
```

**Decision**: Use existing `app_metadata` table to avoid additional migration complexity.

#### 1.2 Create Migration
Create `0004_migrate_preferences.js` to:
1. Read current values from AsyncStorage
2. Insert them into `app_metadata` table
3. Set migration flag

### Phase 2: Create Preferences Service

#### 2.1 Create app/services/PreferencesDB.js
```javascript
import { queryFirst, executeQuery } from './db';

// Preference keys
export const PREF_KEYS = {
  THEME: 'theme_preference',
  LANGUAGE: 'app_language',
  LAST_ACCOUNT: 'last_accessed_account_id',
  OPERATIONS_FILTERS: 'operations_active_filters',
};

// Get preference
export const getPreference = async (key, defaultValue = null) => {
  const result = await queryFirst(
    'SELECT value FROM app_metadata WHERE key = ?',
    [key]
  );
  return result ? result.value : defaultValue;
};

// Set preference
export const setPreference = async (key, value) => {
  const now = new Date().toISOString();
  await executeQuery(
    `INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
     VALUES (?, ?, ?)`,
    [key, value, now]
  );
};

// Get typed preference (for integers)
export const getNumberPreference = async (key, defaultValue = null) => {
  const value = await getPreference(key);
  return value !== null ? Number(value) : defaultValue;
};

// Get JSON preference (for objects)
export const getJsonPreference = async (key, defaultValue = null) => {
  const value = await getPreference(key);
  return value !== null ? JSON.parse(value) : defaultValue;
};

// Set JSON preference
export const setJsonPreference = async (key, value) => {
  await setPreference(key, JSON.stringify(value));
};
```

### Phase 3: Migrate Contexts

#### 3.1 ThemeContext (app/contexts/ThemeContext.js)
- Replace `AsyncStorage.getItem('theme_preference')` with `getPreference(PREF_KEYS.THEME)`
- Replace `AsyncStorage.setItem('theme_preference', ...)` with `setPreference(PREF_KEYS.THEME, ...)`

#### 3.2 LocalizationContext (app/contexts/LocalizationContext.js)
- Replace `AsyncStorage.getItem('app_language')` with `getPreference(PREF_KEYS.LANGUAGE)`
- Replace `AsyncStorage.setItem('app_language', ...)` with `setPreference(PREF_KEYS.LANGUAGE, ...)`

#### 3.3 OperationsContext (app/contexts/OperationsContext.js)
- Replace filters storage with `getJsonPreference(PREF_KEYS.OPERATIONS_FILTERS)`
- Replace filters save with `setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, ...)`

#### 3.4 LastAccount Service (app/services/LastAccount.js)
- Replace with direct calls to PreferencesDB
- Use `getNumberPreference` to get integer account ID
- Use `setPreference` with `String(accountId)` to store

### Phase 4: Migration Strategy

#### 4.1 Migration 0004 Implementation
```javascript
// db/migrations/0004_migrate_preferences.js
export default async function migrate0004(db) {
  console.log('Running migration 0004: Migrate preferences to SQLite');

  // Read from AsyncStorage and migrate
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;

  const prefsToMigrate = [
    'theme_preference',
    'app_language',
    'last_accessed_account_id',
    'operations_active_filters',
  ];

  const now = new Date().toISOString();

  for (const key of prefsToMigrate) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        await db.runAsync(
          `INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
           VALUES (?, ?, ?)`,
          [key, value, now]
        );
        console.log(`Migrated preference: ${key}`);
      }
    } catch (error) {
      console.warn(`Failed to migrate preference ${key}:`, error);
      // Continue with other preferences
    }
  }

  console.log('Preferences migration complete');
}
```

#### 4.2 Backward Compatibility
Keep AsyncStorage reads as fallback during transition:
```javascript
export const getPreference = async (key, defaultValue = null) => {
  // Try SQLite first
  let result = await queryFirst(
    'SELECT value FROM app_metadata WHERE key = ?',
    [key]
  );

  if (result) return result.value;

  // Fallback to AsyncStorage (for backward compatibility during migration)
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const value = await AsyncStorage.getItem(key);
    if (value !== null) {
      // Migrate to SQLite
      await setPreference(key, value);
      return value;
    }
  } catch (error) {
    console.warn('AsyncStorage fallback failed:', error);
  }

  return defaultValue;
};
```

### Phase 5: Update Backup/Restore

#### 5.1 BackupRestore Service (app/services/BackupRestore.js)
- Preferences are now automatically included in database export
- Remove AsyncStorage handling from backup/restore
- Update import to include `app_metadata` table

### Phase 6: Testing

#### 6.1 Test Migration
- Test on fresh install (no AsyncStorage data)
- Test with existing AsyncStorage data
- Verify all preferences migrate correctly
- Test backward compatibility fallback

#### 6.2 Test Contexts
- Theme switching persists correctly
- Language switching persists correctly
- Last account selection persists correctly
- Operation filters persist correctly

#### 6.3 Test Types
- Verify account ID is stored and retrieved as number
- Verify filters object is correctly JSON serialized/deserialized
- Verify string preferences work correctly

#### 6.4 Test Backup/Restore
- Export database includes preferences
- Import restores all preferences
- Old backups (without preferences) still import correctly

### Phase 7: Cleanup

#### 7.1 Remove AsyncStorage Usage
After migration is stable (1-2 releases):
- Remove AsyncStorage fallback code
- Remove AsyncStorage imports from contexts
- Update package.json (AsyncStorage may still be needed by Expo modules)

#### 7.2 Documentation
- Update CLAUDE.md to document preference storage in SQLite
- Update migration guide if needed
- Document preference keys in PreferencesDB.js

## Migration Risks

### Low Risk
- Schema already supports key-value storage (app_metadata)
- Migration is one-way (AsyncStorage → SQLite)
- Can keep AsyncStorage as fallback temporarily

### Medium Risk
- Users on old versions won't have preferences after reinstalling
- Need to handle migration timing (before contexts initialize)

### Mitigation
- Keep AsyncStorage fallback for 2-3 releases
- Clear migration logging to debug issues
- Test thoroughly on multiple devices

## File Changes Summary

### New Files
- `db/migrations/0004_migrate_preferences.js`
- `app/services/PreferencesDB.js`

### Modified Files
- `app/contexts/ThemeContext.js`
- `app/contexts/LocalizationContext.js`
- `app/contexts/OperationsContext.js`
- `app/services/LastAccount.js`
- `app/services/BackupRestore.js`
- `app/db/schema.js` (documentation update only, no schema changes needed)

### Deleted Files
- None (LastAccount.js can be kept as wrapper or removed later)

## Timeline Estimate
- Phase 1-2: 2 hours (schema, service creation)
- Phase 3: 3 hours (migrate all contexts)
- Phase 4: 2 hours (migration implementation)
- Phase 5: 1 hour (backup/restore updates)
- Phase 6: 3 hours (comprehensive testing)
- Phase 7: 1 hour (cleanup)

**Total: ~12 hours**

## Success Criteria
- [ ] All preferences stored in SQLite
- [ ] No type conversion warnings in console
- [ ] Theme/language/filters persist correctly across app restarts
- [ ] Last account selection works correctly
- [ ] Backup/restore includes preferences
- [ ] Migration from AsyncStorage works on upgrade
- [ ] All tests pass
- [ ] Documentation updated

## Notes
- AsyncStorage dependency may still be required by Expo modules (can't remove from package.json)
- Consider adding preference caching layer if performance is a concern (unlikely)
- This change makes the app fully functional offline with a single data source
