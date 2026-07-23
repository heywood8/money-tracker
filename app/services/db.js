import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';
import migrations from '../../drizzle/migrations';
import { normalizeSearchText } from './searchNormalize';

const DB_NAME = 'penny.db';

// Verbose init/migration narration is dev-only. Each console.* is intercepted by
// LogService (entry append + scheduled disk flush + Sentry captureLog), so ~30
// startup log lines add real work on every cold start. Errors/warnings still use
// console.error/console.warn so they remain visible in production and Sentry.
// Bound reference avoids the literal `devLog(` so it survives verbose-log edits.
const rawConsoleLog = console.log.bind(console);
const devLog = (...args) => { if (__DEV__) rawConsoleLog(...args); };

/**
 * Schema fingerprint for the startup fast path.
 *
 * This is the number of migrations this build ships, read straight from the
 * Drizzle journal. It is DERIVED, not hand-maintained, on purpose: adding a
 * migration means adding a journal entry, which increments this value
 * automatically. There is no separate integer to remember to bump.
 *
 * How the fast path uses it (see initializeDatabase):
 *   - After a fully successful init we store this value in `PRAGMA user_version`.
 *   - On the next cold start we read `user_version` (a single SQLite header read,
 *     no table access) and, if it equals SCHEMA_VERSION, skip the expensive
 *     schema-inspection + migration-detection sweep entirely.
 *
 * MIGRATION-SAFETY INVARIANT (do not break): because this value tracks the
 * journal length, ANY new migration raises SCHEMA_VERSION. An existing install
 * carries the OLDER value it was stamped with, so `stored !== SCHEMA_VERSION`
 * and the full migrate path runs — a pending migration can never be skipped by
 * the fast path. This is why the fingerprint is bound to the journal rather than
 * a manually-edited constant. When you add a migration you do NOT touch this
 * line; adding the journal entry is what bumps it.
 *
 * Note: any build predating this feature never wrote `user_version` (defaults to
 * 0), so its first launch after upgrade sees 0 !== SCHEMA_VERSION and runs the
 * full path once, then stamps the fingerprint — identical to today's behavior,
 * just with a fast path unlocked for every subsequent launch.
 */
const SCHEMA_VERSION = migrations.journal.entries.length;

/**
 * Read the persisted schema fingerprint from `PRAGMA user_version`.
 * One SQLite header read — no table access, so it is safe and cheap to call
 * before any schema inspection. Returns 0 on any error or when unset (0 is the
 * SQLite default), which forces the full init path — the safe direction.
 */
const getStoredSchemaVersion = async (rawDb) => {
  try {
    const row = await rawDb.getFirstAsync('PRAGMA user_version');
    // expo-sqlite returns the pragma as a single-column row, e.g. { user_version: 18 }.
    const value = row
      ? (row.user_version ?? row.userVersion ?? Object.values(row)[0])
      : 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  } catch (error) {
    console.warn('[DB] Could not read schema fingerprint (user_version):', error.message);
    return 0;
  }
};

/**
 * Persist the schema fingerprint into `PRAGMA user_version`.
 * NOTE: PRAGMA user_version does not accept bound parameters, so the integer is
 * inlined. `version` is always SCHEMA_VERSION (derived from the journal), never
 * user input, and is coerced to a 32-bit int — no injection surface.
 * Failures are non-fatal: the worst case is the next start re-runs the full path.
 */
const setStoredSchemaVersion = async (rawDb, version) => {
  try {
    await rawDb.runAsync(`PRAGMA user_version = ${Number(version) | 0}`);
  } catch (error) {
    console.warn('[DB] Could not persist schema fingerprint (user_version):', error.message);
  }
};

let dbInstance = null;
let drizzleInstance = null;
let initPromise = null;
let searchNormAvailable = false;

export const isSearchNormAvailable = () => searchNormAvailable;

/**
 * Get or create the database instance
 * @returns {Promise<Object>} Object with both raw and drizzle instances
 */
export const getDatabase = async () => {
  if (dbInstance && drizzleInstance) {
    return { raw: dbInstance, drizzle: drizzleInstance };
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return { raw: dbInstance, drizzle: drizzleInstance };
  }

  // Start initialization
  initPromise = (async () => {
    try {
      devLog('Opening database:', DB_NAME);
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
      devLog('Database opened successfully, instance:', !!dbInstance);

      if (!dbInstance) {
        throw new Error('Database instance is null after opening');
      }

      // Register a search-normalization function — SQLite's built-in LOWER() is ASCII-only,
      // so Cyrillic case-folding (and Russian ё/е equivalence) has to be done in JS. The
      // callback delegates to normalizeSearchText() which is the same normalizer applied
      // to the query on the JS side, so SQL-side and in-memory results stay consistent.
      // expo-sqlite 16.x would use createCustomFunctionAsync(name, callback, options).
      //
      // Current expo-sqlite (SDK 56) exposes no custom-function API, so this feature-detect
      // falls through on a real device. That is expected and not an error: OperationsDB
      // falls back to an inline LOWER()+REPLACE() expression (buildSearchNormSql) that still
      // folds the Cyrillic alphabet and ё/е, so search keeps working. The detection is kept
      // so a future expo-sqlite that adds the API is used automatically for full Unicode
      // folding. Nothing is logged on the not-available path to avoid noise.
      try {
        if (typeof dbInstance.createCustomFunctionAsync === 'function') {
          await dbInstance.createCustomFunctionAsync('SEARCH_NORM', normalizeSearchText, { deterministic: true });
          searchNormAvailable = true;
        } else if (typeof dbInstance.createFunctionAsync === 'function') {
          await dbInstance.createFunctionAsync('SEARCH_NORM', normalizeSearchText, { deterministic: true });
          searchNormAvailable = true;
        }
      } catch (fnError) {
        // Registration unexpectedly threw — the inline fallback still handles Cyrillic search.
        console.warn('SEARCH_NORM registration failed, using inline Cyrillic-folding fallback:', fnError.message);
      }

      drizzleInstance = drizzle(dbInstance, { schema });
      devLog('Drizzle instance created');

      await initializeDatabase(dbInstance, drizzleInstance);
      devLog('Database initialized successfully');
    } catch (error) {
      console.error('Failed to open database:', error);
      console.error('Error details:', error.message, error.stack);
      dbInstance = null;
      drizzleInstance = null;
      initPromise = null;
      searchNormAvailable = false;
      throw error;
    }
  })();

  await initPromise;
  initPromise = null;
  return { raw: dbInstance, drizzle: drizzleInstance };
};

/**
 * Get the Drizzle instance
 * @returns {Promise<drizzle>}
 */
export const getDrizzle = async () => {
  const { drizzle: db } = await getDatabase();
  return db;
};

/**
 * Check if the database schema is already at the latest version.
 * Verifies all expected tables and key columns exist so we can skip migrate().
 */
const isSchemaComplete = async (rawDb) => {
  try {
    // Check all expected tables exist
    const expectedTables = [
      'accounts', 'categories', 'operations', 'budgets',
      'app_metadata', 'accounts_balance_history', 'planned_operations',
      'notification_merchant_rules', 'pending_notifications',
    ];
    const existingTables = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tableNames = new Set((existingTables || []).map(t => t.name));
    for (const table of expectedTables) {
      if (!tableNames.has(table)) return false;
    }

    // Check accounts has integer id (migration 0002)
    const accountsCols = await rawDb.getAllAsync('PRAGMA table_info(accounts)');
    const accountsId = accountsCols.find(c => c.name === 'id');
    if (!accountsId || accountsId.type.toLowerCase() !== 'integer') return false;

    // Check operations has original_balance (migration 0006)
    const opsCols = await rawDb.getAllAsync('PRAGMA table_info(operations)');
    if (!opsCols.some(c => c.name === 'original_balance')) return false;

    // Check operations has BOTH latitude and longitude (migration 0009). Both are
    // checked because applyPendingMigrations runs each ADD COLUMN as a separate
    // statement and continues on failure — a half-applied 0009 (latitude added,
    // longitude not) must not be mistaken for complete, or every INSERT would throw.
    if (!opsCols.some(c => c.name === 'latitude') || !opsCols.some(c => c.name === 'longitude')) return false;

    // Check operations has integer account_id (migration 0002)
    const opsAccountId = opsCols.find(c => c.name === 'account_id');
    if (!opsAccountId || opsAccountId.type.toLowerCase() !== 'integer') return false;

    // Check categories does NOT have exclude_from_forecast (migration 0004)
    const catCols = await rawDb.getAllAsync('PRAGMA table_info(categories)');
    if (catCols.some(c => c.name === 'exclude_from_forecast')) return false;

    // Check operations type enforcement exists (migration 0007)
    // Accept either the new trigger or the old CHECK constraint
    const trigger = await rawDb.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_operations_type_insert'",
    );
    if (!trigger) {
      const opsSchema = await rawDb.getFirstAsync(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'",
      );
      if (!opsSchema?.sql || !/CHECK\s*\(\s*[`"]?type[`"]?\s+IN\s*\(/i.test(opsSchema.sql)) return false;
    }

    // Check accounts has deleted_at column (migration 0008)
    if (!accountsCols.some(c => c.name === 'deleted_at')) return false;

    // Check accounts has card_mask column (migration 0010). The
    // notification_merchant_rules / pending_notifications tables are covered by
    // the expectedTables check above.
    if (!accountsCols.some(c => c.name === 'card_mask')) return false;

    // Check notification_merchant_rules has label_override column (migration 0011).
    const merchantRuleCols = await rawDb.getAllAsync('PRAGMA table_info(notification_merchant_rules)');
    if (!merchantRuleCols.some(c => c.name === 'label_override')) return false;

    // Check accounts has auto_txn_rounding column (migration 0012).
    if (!accountsCols.some(c => c.name === 'auto_txn_rounding')) return false;

    // Check operations has exclude_from_avg column (migration 0013). Without this
    // check, an install complete through 0012 would report "schema complete" and
    // skip migrate(), so 0013 would never add the column for existing users.
    if (!opsCols.some(c => c.name === 'exclude_from_avg')) return false;

    // Check accounts has auto_txn_rounding_mode column (migration 0014). Same
    // reasoning as above: without this check, an install complete through 0013
    // would skip migrate() and never gain the column.
    if (!accountsCols.some(c => c.name === 'auto_txn_rounding_mode')) return false;

    // Check accounts has show_in_main_menu column (migration 0015). Same
    // reasoning: an install complete through 0014 would otherwise skip migrate()
    // and never gain the column.
    if (!accountsCols.some(c => c.name === 'show_in_main_menu')) return false;

    // Check notification_merchant_rules has last_matched_at column (migration 0016).
    // Same reasoning: an install complete through 0015 would otherwise report
    // "schema complete" and skip migrate(), so 0016 would never add the column —
    // and getAllMerchantRules (which ORDER BYs COALESCE(last_matched_at, ...))
    // would throw, wiping the category and name bindings from the UI.
    if (!merchantRuleCols.some(c => c.name === 'last_matched_at')) return false;

    // Check pending_notifications has BOTH latitude and longitude (migration 0017).
    // Both are checked for the same reason as operations' 0009 columns: a
    // half-applied 0017 (latitude only) must not be mistaken for complete. Without
    // this check, an install complete through 0016 would skip migrate() and never
    // gain the columns.
    const pendingCols = await rawDb.getAllAsync('PRAGMA table_info(pending_notifications)');
    if (!pendingCols.some(c => c.name === 'latitude') || !pendingCols.some(c => c.name === 'longitude')) return false;

    return true;
  } catch (error) {
    console.warn('[DB] isSchemaComplete check failed:', error.message);
    return false;
  }
};

/**
 * Ensure __drizzle_migrations has the correct number of records matching
 * the journal entries. If records are missing or have null hashes, rebuild
 * the table so future startups see a consistent state.
 */
const syncMigrationRecords = async (rawDb, migrationsConfig) => {
  try {
    const journalEntries = migrationsConfig.journal.entries;
    const existing = await rawDb.getAllAsync(
      'SELECT * FROM __drizzle_migrations ORDER BY created_at ASC',
    ).catch(() => []);

    const hasNullHashes = existing.some(m => !m.hash);
    const countMismatch = existing.length !== journalEntries.length;

    if (!hasNullHashes && !countMismatch) {
      devLog('[DB] Migration records are consistent');
      return;
    }

    devLog(`[DB] Fixing migration records (${existing.length} records, ${hasNullHashes ? 'has null hashes' : 'count mismatch'})`);

    // Drop and recreate with proper records using migration SQL as hash
    // (this matches what Drizzle's expo-sqlite migrator stores)
    await rawDb.runAsync('DROP TABLE IF EXISTS __drizzle_migrations');
    await rawDb.runAsync(
      'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id integer PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)',
    );

    const migrationKeys = Object.keys(migrationsConfig.migrations);
    for (let i = 0; i < journalEntries.length; i++) {
      const key = migrationKeys[i];
      const migrationSql = migrationsConfig.migrations[key];
      // Drizzle stores the raw SQL content as the hash
      const hash = typeof migrationSql === 'string' ? migrationSql : (migrationSql?.default || String(migrationSql));
      await rawDb.runAsync(
        'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        [hash, journalEntries[i].when],
      );
    }

    devLog(`[DB] Migration records rebuilt: ${journalEntries.length} entries`);
  } catch (error) {
    console.warn('[DB] Failed to sync migration records:', error.message);
    // Non-fatal — schema is already complete, this is just housekeeping
  }
};

/**
 * Apply pending migrations manually, bypassing Drizzle's migrate().
 *
 * WHY: Drizzle's expo-sqlite migrator computes `folderMillis` via formatToMillis()
 * on migration keys like "m0000". Since these aren't date strings, folderMillis = NaN.
 * The comparison `Number(created_at) < NaN` is always false, so if ANY records exist
 * in __drizzle_migrations, Drizzle will never run pending migrations.
 *
 * This function detects which migrations are truly applied (via schema inspection),
 * then executes only the pending ones directly via rawDb, and records them.
 */
export const applyPendingMigrations = async (rawDb, migrationsConfig) => {
  const journalEntries = migrationsConfig.journal.entries;
  const migrationKeys = Object.keys(migrationsConfig.migrations);

  // Determine which migrations have been applied by checking schema markers
  const appliedIndices = await detectAppliedMigrations(rawDb);
  const appliedSet = new Set(appliedIndices);
  devLog(`[DB] Detected ${appliedIndices.length}/${journalEntries.length} migrations as already applied: ${appliedIndices.join(', ')}`);

  const pendingIndices = [];
  for (let i = 0; i < journalEntries.length; i++) {
    if (!appliedSet.has(i)) pendingIndices.push(i);
  }

  if (pendingIndices.length === 0) {
    devLog('[DB] No pending migrations to apply');
    await syncMigrationRecords(rawDb, migrationsConfig);
    return;
  }

  devLog(`[DB] Applying ${pendingIndices.length} pending migrations: ${pendingIndices.map(i => journalEntries[i].tag).join(', ')}`);

  for (const idx of pendingIndices) {
    const key = migrationKeys[idx];
    const migrationSql = migrationsConfig.migrations[key];
    const rawSql = typeof migrationSql === 'string' ? migrationSql : (migrationSql?.default || String(migrationSql));
    const tag = journalEntries[idx].tag;

    // Split on Drizzle's statement breakpoint marker (same logic as Drizzle internals)
    const statements = rawSql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

    devLog(`[DB] Applying migration ${tag} (${statements.length} statements)`);

    for (const stmt of statements) {
      try {
        await rawDb.execAsync(stmt);
      } catch (stmtErr) {
        // Some statements may fail if partially applied (e.g. column already exists)
        // Log but continue — detectAppliedMigrations already confirmed the migration
        // as NOT applied, so most statements should succeed.
        console.warn(`[DB] Statement in ${tag} failed (continuing): ${stmtErr.message}`);
        console.warn(`[DB] Failed SQL: ${stmt.substring(0, 120)}...`);
      }
    }

    devLog(`[DB] Migration ${tag} applied successfully`);
  }

  // Rebuild __drizzle_migrations to reflect all migrations as applied
  await syncMigrationRecords(rawDb, migrationsConfig);
};

/**
 * Detect which migrations have already been applied by inspecting schema state.
 * Returns sorted array of journal indices that are confirmed applied.
 */
const detectAppliedMigrations = async (rawDb) => {
  const applied = [];

  // Helper: check if a table exists
  const tableExists = async (name) => {
    const result = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [name],
    );
    return result && result.length > 0;
  };

  // Helper: get column names for a table
  const getColumns = async (name) => {
    const cols = await rawDb.getAllAsync(`PRAGMA table_info(${name})`).catch(() => []);
    return cols.map(c => ({ name: c.name, type: c.type.toLowerCase() }));
  };

  // Migration 0000: Creates accounts (text id), categories, operations (text id), budgets, app_metadata
  // If accounts table exists at all, 0000 was applied (or superseded by 0002)
  if (await tableExists('accounts')) {
    applied.push(0);
  }

  // Migration 0001: Converts operations.id from text to integer autoincrement
  // Check: operations.id is integer
  if (await tableExists('operations')) {
    const opsCols = await getColumns('operations');
    const opsId = opsCols.find(c => c.name === 'id');
    if (opsId && opsId.type === 'integer') {
      applied.push(1);
    }
  }

  // Migration 0002: Converts accounts.id from text to integer, updates operations.account_id to integer
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    const accId = accCols.find(c => c.name === 'id');
    if (accId && accId.type === 'integer') {
      applied.push(2);
    }
  }

  // Migration 0003: Creates accounts_balance_history table
  if (await tableExists('accounts_balance_history')) {
    applied.push(3);
  }

  // Migration 0004: Removes exclude_from_forecast from categories
  if (await tableExists('categories')) {
    const catCols = await getColumns('categories');
    if (!catCols.some(c => c.name === 'exclude_from_forecast')) {
      applied.push(4);
    }
  }

  // Migration 0005: Creates planned_operations table
  if (await tableExists('planned_operations')) {
    applied.push(5);
  }

  // Migration 0006: Adds original_balance column to operations
  if (await tableExists('operations')) {
    const opsCols = await getColumns('operations');
    if (opsCols.some(c => c.name === 'original_balance')) {
      applied.push(6);
    }
  }

  // Migration 0007: Adds type-enforcement trigger on operations
  const trigger = await rawDb.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_operations_type_insert'",
  ).catch(() => null);
  // Also accept the old CHECK constraint approach (fresh installs before this change)
  if (trigger) {
    applied.push(7);
  } else {
    const opsSchema = await rawDb.getFirstAsync(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'",
    ).catch(() => null);
    if (opsSchema?.sql && /CHECK\s*\(\s*[`"]?type[`"]?\s+IN\s*\(/i.test(opsSchema.sql)) {
      applied.push(7);
    }
  }

  // Migration 0008: Adds deleted_at column to accounts (soft-delete)
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    if (accCols.some(c => c.name === 'deleted_at')) {
      applied.push(8);
    }
  }

  // Migration 0009: Adds latitude/longitude columns to operations.
  // Require BOTH columns — a half-applied 0009 (latitude only) is not "applied",
  // so the pending statements re-run and add the missing longitude column.
  if (await tableExists('operations')) {
    const opsCols = await getColumns('operations');
    if (opsCols.some(c => c.name === 'latitude') && opsCols.some(c => c.name === 'longitude')) {
      applied.push(9);
    }
  }

  // Migration 0010: Adds accounts.card_mask plus the notification_merchant_rules
  // and pending_notifications tables. Require all three markers — a half-applied
  // 0010 must re-run so the missing pieces are created.
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    const hasCardMask = accCols.some(c => c.name === 'card_mask');
    if (
      hasCardMask &&
      (await tableExists('notification_merchant_rules')) &&
      (await tableExists('pending_notifications'))
    ) {
      applied.push(10);
    }
  }

  // Migration 0011: Adds notification_merchant_rules.label_override column.
  if (await tableExists('notification_merchant_rules')) {
    const ruleCols = await getColumns('notification_merchant_rules');
    if (ruleCols.some(c => c.name === 'label_override')) {
      applied.push(11);
    }
  }

  // Migration 0012: Adds accounts.auto_txn_rounding column.
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    if (accCols.some(c => c.name === 'auto_txn_rounding')) {
      applied.push(12);
    }
  }

  // Migration 0013: Adds operations.exclude_from_avg column.
  if (await tableExists('operations')) {
    const opsCols = await getColumns('operations');
    if (opsCols.some(c => c.name === 'exclude_from_avg')) {
      applied.push(13);
    }
  }

  // Migration 0014: Adds accounts.auto_txn_rounding_mode column.
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    if (accCols.some(c => c.name === 'auto_txn_rounding_mode')) {
      applied.push(14);
    }
  }

  // Migration 0015: Adds accounts.show_in_main_menu column.
  if (await tableExists('accounts')) {
    const accCols = await getColumns('accounts');
    if (accCols.some(c => c.name === 'show_in_main_menu')) {
      applied.push(15);
    }
  }

  // Migration 0016: Adds notification_merchant_rules.last_matched_at column.
  if (await tableExists('notification_merchant_rules')) {
    const ruleCols = await getColumns('notification_merchant_rules');
    if (ruleCols.some(c => c.name === 'last_matched_at')) {
      applied.push(16);
    }
  }

  // Migration 0017: Adds latitude/longitude columns to pending_notifications.
  // Require BOTH columns — a half-applied 0017 (latitude only) must re-run so the
  // missing longitude column is added.
  if (await tableExists('pending_notifications')) {
    const pnCols = await getColumns('pending_notifications');
    if (pnCols.some(c => c.name === 'latitude') && pnCols.some(c => c.name === 'longitude')) {
      applied.push(17);
    }
  }

  return applied.sort((a, b) => a - b);
};

/**
 * Dump all user tables to a JSON file before a destructive schema reset.
 * Uses a dynamic import so expo-file-system is never loaded during normal startup.
 * Returns the saved file path on success, null on failure.
 */
const saveEmergencyBackup = async (rawDb) => {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const tables = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const data = {};
    for (const { name } of tables) {
      try {
        data[name] = await rawDb.getAllAsync(`SELECT * FROM "${name}"`);
      } catch {
        data[name] = null;
      }
    }
    const filename = `penny_emergency_backup_${Date.now()}.json`;
    const path = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify({ timestamp: new Date().toISOString(), data }));
    return path;
  } catch (err) {
    console.error('[DB] Emergency backup failed:', err);
    return null;
  }
};

/**
 * Check if database is in a corrupted migration state
 */
const isDatabaseCorrupted = async (rawDb) => {
  try {
    // Check if accounts table exists
    const accountsTable = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'",
    );

    if (accountsTable.length === 0) {
      return false; // No accounts table, fresh database
    }

    // Check the actual schema of accounts table
    const accountsSchema = await rawDb.getAllAsync('PRAGMA table_info(accounts)');
    const idColumn = accountsSchema.find(col => col.name === 'id');

    if (!idColumn) {
      console.warn('Accounts table exists but has no id column - corrupted');
      return true;
    }

    // Check if we have the right schema (integer id with autoincrement)
    // If id is 'text' type, we're in the old schema and migration failed
    if (idColumn.type.toLowerCase() === 'text') {
      console.warn('Accounts table has text id - migration 0002 was not applied');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking database corruption:', error);
    return false;
  }
};

/**
 * Initialize database with Drizzle migrations
 */
const initializeDatabase = async (rawDb, db) => {
  try {
    // FAST PATH: read the stored schema fingerprint first (one header read, no
    // table access). If it equals the schema this build ships, the database was
    // already brought fully up to date by a previous successful init — the
    // fingerprint is ONLY ever written at the very end of that init — so we can
    // skip the whole inspection/migration-detection sweep (isSchemaComplete's
    // ~10 PRAGMA queries, the __drizzle_migrations SELECTs, the corruption
    // re-scan). This is the up-to-date cold-start path that gates first paint.
    //
    // The `SCHEMA_VERSION > 0` guard keeps the fast path inert in the unit-test
    // environment (empty migrations journal → SCHEMA_VERSION 0), where the full
    // path is exercised. In production there is always ≥1 migration.
    //
    // Corruption safety: the only corruption isDatabaseCorrupted() detects is a
    // text-typed accounts.id (migration 0002 never applied). That state is
    // impossible when user_version === SCHEMA_VERSION, because that value is only
    // stamped after a run in which 0002 (and every later migration) completed. So
    // the fast path cannot bypass a corruption this codebase can actually detect.
    const storedVersion = await getStoredSchemaVersion(rawDb);
    if (SCHEMA_VERSION > 0 && storedVersion === SCHEMA_VERSION) {
      devLog(`[DB] Schema fingerprint matches (user_version=${SCHEMA_VERSION}) — fast startup, skipping inspection`);
      // Per-connection PRAGMAs are connection-scoped, NOT schema state — they must
      // run on every open regardless of the fast path.
      await rawDb.runAsync('PRAGMA foreign_keys = ON');
      await rawDb.runAsync('PRAGMA journal_mode = WAL');
      return;
    }

    devLog('Running Drizzle migrations...');
    devLog('Available migrations:', migrations.journal.entries.map(e => e.tag).join(', '));

    // Check existing tables
    const existingTables = await rawDb.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" ORDER BY name',
    );
    devLog('Existing tables:', (existingTables || []).map(t => t.name).join(', '));

    // Check for corrupted migration state
    const isCorrupted = await isDatabaseCorrupted(rawDb);
    if (isCorrupted) {
      console.warn('[DB] Corrupted schema detected (text account IDs — migration 0002 not applied)');
      console.warn('[DB] Saving emergency backup before schema reset...');

      const backupPath = await saveEmergencyBackup(rawDb);
      if (backupPath) {
        console.warn(`[DB] Emergency backup saved: ${backupPath}`);
        console.warn('[DB] To recover data: Settings → Import → Restore from file');
      } else {
        console.warn('[DB] Emergency backup could not be saved — data will be lost after reset');
      }

      // Drop all tables and start fresh
      await rawDb.runAsync('PRAGMA foreign_keys = OFF');
      const tables = await rawDb.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      for (const table of tables) {
        await rawDb.runAsync(`DROP TABLE IF EXISTS "${table.name}"`);
      }
      await rawDb.runAsync('PRAGMA foreign_keys = ON');
      devLog('[DB] Schema reset complete');
    }

    // Check current migration state before running
    const drizzleMigrations = await rawDb.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" AND name="__drizzle_migrations"',
    );

    if (drizzleMigrations && drizzleMigrations.length > 0) {
      const appliedMigrations = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
      const hashList = (appliedMigrations || []).map(m => m.hash || 'null').join(', ');
      devLog('Previously applied migrations:', hashList || 'none');
    } else {
      devLog('No migrations table found - database will be migrated from scratch');
    }

    // Get migrations before applying
    const migrationsBefore = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC').catch(() => []);
    const appliedHashesBefore = new Set((migrationsBefore || []).map(m => m.hash));

    // SCHEMA COMPLETENESS CHECK: if the database already has the final schema,
    // skip migrate() entirely. This handles imported backups whose __drizzle_migrations
    // table has null hashes or incomplete records — running migrate() against an
    // already-complete schema is wasteful and can produce confusing logs.
    const schemaAlreadyComplete = await isSchemaComplete(rawDb);
    if (schemaAlreadyComplete) {
      devLog('[DB] Schema is already at latest version — skipping migrate()');

      // Fix __drizzle_migrations if it has wrong count or null hashes so future
      // startups are even faster (no need to re-check schema).
      await syncMigrationRecords(rawDb, migrations);
    } else {
      // Schema is NOT complete — apply pending migrations manually.
      // We bypass Drizzle's migrate() because its expo-sqlite migrator has a fatal bug:
      // it computes folderMillis via formatToMillis() on keys like "m0000" → NaN,
      // so the comparison `Number(created_at) < NaN` is always false, meaning
      // pending migrations are never executed when any records exist.
      await applyPendingMigrations(rawDb, migrations);

      // Log final state
      const finalMigrations = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC').catch(() => []);
      devLog(`Total migrations applied: ${(finalMigrations || []).length}/${migrations.journal.entries.length}`);

      // Run post-migration handlers for newly applied migrations
      if (migrations.postMigrationHandlers) {
        const appliedHashesAfter = new Set((finalMigrations || []).map(m => m.hash));

        for (const [key, handler] of Object.entries(migrations.postMigrationHandlers)) {
          const tag = migrations.postMigrationTags?.[key];
          const migrationEntry = tag
            ? migrations.journal.entries.find(e => e.tag === tag)
            : null;

          if (migrationEntry && appliedHashesAfter.has(migrationEntry.hash) && !appliedHashesBefore.has(migrationEntry.hash)) {
            devLog(`Running post-migration handler for ${key}...`);
            try {
              await handler(rawDb);
            } catch (handlerError) {
              console.error(`Post-migration handler ${key} failed:`, handlerError);
            }
          }
        }

        // Retry any post-migration handlers that previously failed (completion flag not set)
        for (const [key, handler] of Object.entries(migrations.postMigrationHandlers)) {
          const tag = migrations.postMigrationTags?.[key];
          const migrationEntry = tag
            ? migrations.journal.entries.find(e => e.tag === tag)
            : null;

          if (migrationEntry && appliedHashesAfter.has(migrationEntry.hash)) {
            const completionKey = `post_migration_${key}_completed`;
            const completionRow = await rawDb.getFirstAsync(
              'SELECT value FROM app_metadata WHERE key = ?',
              [completionKey],
            ).catch(() => null);

            if (!completionRow) {
              devLog(`Retrying incomplete post-migration handler for ${key}...`);
              try {
                await handler(rawDb);
              } catch (retryError) {
                console.error(`Post-migration handler ${key} retry failed:`, retryError);
              }
            }
          }
        }
      }

    } // end of else (schema not yet complete)

    // Enable foreign keys and WAL mode (always, regardless of migration path)
    await rawDb.runAsync('PRAGMA foreign_keys = ON');
    await rawDb.runAsync('PRAGMA journal_mode = WAL');

    // Stamp the schema fingerprint ONLY if the schema is actually complete.
    // applyPendingMigrations() swallows per-statement errors and does not throw
    // (an ADD COLUMN can fail transiently on a locked DB / disk pressure), so
    // "init did not throw" is NOT proof the schema is whole. Verifying
    // completeness here means a half-applied migration leaves user_version
    // unstamped, so the next launch takes the full path and self-heals — instead
    // of the fast path locking in a broken schema forever ("no such column" on
    // every launch). This check runs only on the slow path (the fast path
    // returns early above), so it adds no cost to warm cold starts.
    if (await isSchemaComplete(rawDb)) {
      await setStoredSchemaVersion(rawDb, SCHEMA_VERSION);
      devLog('Database migrations completed successfully');
    } else {
      console.warn('[DB] Schema incomplete after init — not stamping the fast-path fingerprint; next launch will re-verify and heal');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);    console.error('Error details:', {
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });
    
    // Log current database state for debugging
    try {
      const tables = await rawDb.getAllAsync('SELECT name FROM sqlite_master WHERE type="table"');
      console.error('Current tables in database:', tables.map(t => t.name).join(', '));
      
      const migrationsCheck = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations').catch(() => []);
      console.error('Current migration records:', migrationsCheck.length);
    } catch (debugError) {
      console.error('Could not retrieve debug info:', debugError.message);
    }
    throw error;
  }
};

/**
 * Execute a query with parameters (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const executeQuery = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.runAsync(sqlStr, params);
  } catch (error) {
    console.error('Query execution failed:', error.message, error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return all results (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<Array>}
 */
export const queryAll = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.getAllAsync(sqlStr, params) || [];
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return first result (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const queryFirst = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.getFirstAsync(sqlStr, params);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

// Serializes executeTransaction calls so their async statements cannot interleave
// on the shared SQLite connection. withTransactionAsync is used (same connection,
// no new native open) to avoid the startup crash caused by withExclusiveTransactionAsync
// opening a second connection during initialization.
let _lastTransaction = Promise.resolve();

/**
 * Execute multiple statements in a transaction (legacy compatibility)
 * @param {Function} callback - Async function that receives the db instance
 * @returns {Promise<any>}
 *
 * JS-level serialization ensures only one executeTransaction callback runs at a
 * time, preventing async interleaving without the new-connection overhead of
 * withExclusiveTransactionAsync (which caused startup crashes on Android).
 */
export const executeTransaction = async (callback) => {
  const { raw } = await getDatabase();

  // _lastTransaction is always resolved (tail .catch keeps it that way), so
  // chaining with .then is safe and prevents concurrent callbacks from interleaving.
  const txPromise = _lastTransaction.then(async () => {
    let callbackResult;
    await raw.withTransactionAsync(async () => {
      callbackResult = await callback(raw);
    });
    return callbackResult;
  });

  // Keep the chain always-resolved so the next queued transaction can start,
  // but log and re-throw the error so callers can handle it.
  _lastTransaction = txPromise.catch((err) => {
    console.error('[DB] Transaction failed:', err);
  });
  return txPromise;
};

/**
 * Close the database connection
 */
export const closeDatabase = async () => {
  if (dbInstance) {
    devLog('Closing database connection...');
    try {
      await dbInstance.closeAsync();
      devLog('Database closed successfully');
    } catch (error) {
      console.error('Error closing database:', error);
    } finally {
      dbInstance = null;
      drizzleInstance = null;
      searchNormAvailable = false;
    }
  }
};

/**
 * Get the current database version based on applied migrations
 * @returns {Promise<string>} Database version (e.g., "2" for 2 migrations applied)
 */
export const getDatabaseVersion = async () => {
  try {
    const { raw } = await getDatabase();

    // Check if migrations table exists
    const tableExists = await raw.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" AND name="__drizzle_migrations"',
    );

    if (tableExists.length === 0) {
      return '0';
    }

    // Get all applied migrations
    const appliedMigrations = await raw.getAllAsync(
      'SELECT * FROM __drizzle_migrations ORDER BY created_at ASC',
    );

    // Return the count of applied migrations (this represents the version)
    return String(appliedMigrations.length);
  } catch (error) {
    console.error('Failed to get database version:', error);
    return '?';
  }
};

/**
 * Drop all tables in the database
 * WARNING: This will delete all data!
 */
export const dropAllTables = async () => {
  try {
    let raw;
    let openedNewConnection = false;

    // Try to get existing database connection, or open a new one
    try {
      if (dbInstance) {
        raw = dbInstance;
      } else {
        devLog('Opening database for table drop...');
        raw = await SQLite.openDatabaseAsync(DB_NAME);
        openedNewConnection = true;
      }
    } catch (openError) {
      console.error('Failed to open database for dropping tables:', openError);
      throw openError;
    }

    // Disable foreign keys temporarily
    await raw.runAsync('PRAGMA foreign_keys = OFF');

    // Get all table names
    const tables = await raw.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );

    devLog('Tables to drop:', tables.map(t => t.name).join(', '));

    // Drop each table (including migrations)
    for (const table of tables) {
      await raw.runAsync(`DROP TABLE IF EXISTS "${table.name}"`);
      devLog(`Dropped table: ${table.name}`);
    }

    // Re-enable foreign keys
    await raw.runAsync('PRAGMA foreign_keys = ON');

    // CRITICAL: clear the schema fingerprint. user_version is a DB-header value
    // that survives table drops, so leaving it at its stamped SCHEMA_VERSION
    // would make the next getDatabase() take the startup fast path and skip
    // recreating the tables we just dropped — bricking the install with
    // "no such table" until reinstall. Zeroing it forces the full init path
    // (fresh-install branch) on the next open, which recreates the schema.
    await raw.runAsync('PRAGMA user_version = 0');

    devLog('All tables dropped successfully');

    // Close the database connection properly before resetting instances
    // This ensures the native connection is released
    try {
      await raw.closeAsync();
      devLog('Database connection closed after dropping tables');
    } catch (closeError) {
      console.error('Error closing database after dropping tables:', closeError);
    }

    // Reset the instances to null so it reinitializes on next getDatabase call
    dbInstance = null;
    drizzleInstance = null;
    initPromise = null;
  } catch (error) {
    console.error('Failed to drop tables:', error);
    throw error;
  }
};

/**
 * Reset database (for testing/debugging only)
 * WARNING: This will delete all data!
 */
export const resetDatabase = async () => {
  console.warn('Resetting database - all data will be lost!');

  // Close existing connection
  await closeDatabase();

  // Delete the database file
  const dbPath = `${SQLite.documentDirectory}SQLite/${DB_NAME}`;
  try {
    const FileSystem = require('expo-file-system/legacy');
    await FileSystem.deleteAsync(dbPath, { idempotent: true });
    devLog('Database file deleted');
  } catch (error) {
    console.error('Failed to delete database file:', error);
  }

  // Reopen and initialize
  return await getDatabase();
};
