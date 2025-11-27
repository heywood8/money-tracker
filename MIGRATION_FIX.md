# Database Migration Fix Guide

## Issue

You're seeing this error:
```
ERROR  Query failed: no such table: budgets
```

This occurred because the budgets table wasn't being created for existing databases at version 6.

## What Was Fixed

The budgets table is now created in all scenarios:
- ✅ New databases (version 0)
- ✅ Existing databases (via migration from V6 to V7)
- ✅ Database updates (via CREATE TABLE IF NOT EXISTS)

## How to Fix Your Current Database

### Option 1: Restart the App (Recommended)

The simplest solution:

1. **Stop the app** completely (close the Expo dev server)
2. **Restart the app**:
   ```bash
   npm start
   ```
3. The database will automatically create the missing budgets table

The app will detect the missing table and create it using `CREATE TABLE IF NOT EXISTS`.

### Option 2: Clear App Data (Android)

If Option 1 doesn't work:

1. Open **Settings** on your Android device
2. Go to **Apps** → **Expo Go** (or your app name)
3. Tap **Storage** → **Clear Data**
4. Restart the app

This will:
- Delete the old database
- Create a fresh database with all tables including budgets
- ⚠️ **Warning**: This deletes all your data!

### Option 3: Clear App Data (iOS Simulator)

1. In Xcode Simulator menu: **Device** → **Erase All Content and Settings**
2. Or manually: Long-press app icon → **Remove App**
3. Reinstall and restart

### Option 4: Use Reset Utility (Developers)

For development, use the built-in reset utility:

```javascript
import { resetDatabase } from './app/utils/resetDatabase';

// In your code (e.g., SettingsModal or a debug screen):
await resetDatabase();
```

This will:
- Drop all tables
- Reinitialize the database
- Emit events to reload all contexts
- ⚠️ **Warning**: This deletes all data!

## Verify the Fix

After restarting, you should see:
```
✓ Database migrated successfully (v6 → v7)
```

Or for new databases:
```
✓ Database created successfully (v7)
```

And **no errors** about missing budgets table.

## Debug Commands

Check database version:
```javascript
import { getDatabaseVersion } from './app/utils/resetDatabase';
const version = await getDatabaseVersion();
console.log('Database version:', version); // Should be 7
```

Check if budgets table exists:
```javascript
import { checkBudgetsTableExists } from './app/utils/resetDatabase';
const exists = await checkBudgetsTableExists();
console.log('Budgets table exists:', exists); // Should be true
```

## Need Help?

If the issue persists:
1. Check the console logs for migration messages
2. Verify database version is 7
3. Verify budgets table exists
4. Open an issue with the error logs

---

**Fixed in commit**: `64c52e4 - fix(db): ensure budgets table is created for all database states`
