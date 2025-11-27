# Budget Settings Feature - Technical Specification

**Version:** 1.0
**Date:** 2025-11-27
**Author:** Claude
**Status:** Design Phase

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Database Layer](#3-database-layer)
4. [Service Layer](#4-service-layer)
5. [Context Layer](#5-context-layer)
6. [UI Components](#6-ui-components)
7. [Data Flow](#7-data-flow)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Performance Considerations](#9-performance-considerations)
10. [Security & Validation](#10-security--validation)
11. [Testing Strategy](#11-testing-strategy)
12. [Migration Plan](#12-migration-plan)
13. [Implementation Phases](#13-implementation-phases)
14. [Dependencies](#14-dependencies)
15. [Success Metrics](#15-success-metrics)

---

## 1. Overview

### 1.1 Purpose
Enable users to set spending limits (budgets) on categories with weekly, monthly, or yearly periods. Track spending against these budgets and provide visual feedback on budget status.

### 1.2 Goals
- Allow users to set budgets on any category (expense only)
- Support multiple time periods (weekly, monthly, yearly)
- Track spending in real-time as operations are created
- Provide visual indicators of budget status
- Support recurring and one-time budgets
- Handle multiple currencies independently
- Support hierarchical category budgets (aggregate child spending)

### 1.3 Non-Goals (Future Enhancements)
- Budget notifications/push alerts (Phase 4)
- Budget templates and presets (Phase 4)
- Budget forecasting/predictions (Future)
- Cross-currency budget aggregation (Future)
- Shared budgets between users (Future)

### 1.4 User Stories

**US-1:** As a user, I want to set a monthly budget on my "Food" category so I can track my food spending.

**US-2:** As a user, I want to see how much of my budget I've used so I know when to cut back.

**US-3:** As a user, I want to be warned when I'm approaching my budget limit.

**US-4:** As a user, I want my weekly budget to automatically reset each week.

**US-5:** As a user, I want to set a budget on a parent category and have it track all child category spending.

---

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                      App.js                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │          BudgetsProvider (Context)                │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │        UI Components                        │  │  │
│  │  │  • CategoriesScreen (enhanced)              │  │  │
│  │  │  • BudgetModal (new)                        │  │  │
│  │  │  • BudgetProgressBar (new)                  │  │  │
│  │  │  • BudgetsOverviewScreen (new, optional)    │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Service Layer                            │  │
│  │  • BudgetsDB.js (new)                             │  │
│  │  • OperationsDB.js (existing, extend)             │  │
│  │  • CategoriesDB.js (existing)                     │  │
│  │  • Currency.js (existing)                         │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │          SQLite Database (penny.db)               │  │
│  │  • budgets (new table)                            │  │
│  │  • operations (existing)                          │  │
│  │  • categories (existing)                          │  │
│  │  • accounts (existing)                            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | SQLite (expo-sqlite) | Persistent storage |
| State Management | React Context API | Global state |
| UI Framework | React Native + react-native-paper | UI components |
| Date Handling | JavaScript Date API | Period calculations |
| Currency | Custom Currency.js service | Precise arithmetic |
| Icons | @expo/vector-icons (MaterialCommunityIcons) | UI icons |
| i18n | Custom LocalizationContext | Translations |

---

## 3. Database Layer

### 3.1 Schema Definition

#### 3.1.1 Budgets Table

```sql
CREATE TABLE budgets (
  -- Primary Key
  id TEXT PRIMARY KEY,

  -- Budget Configuration
  category_id TEXT NOT NULL,
  amount TEXT NOT NULL,                    -- String for precision (e.g., "500.00")
  currency TEXT NOT NULL,                  -- ISO 4217 code (e.g., "USD")

  -- Period Configuration
  period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'yearly')),
  start_date TEXT NOT NULL,                -- ISO 8601 date (YYYY-MM-DD)
  end_date TEXT,                           -- NULL for recurring budgets

  -- Behavior Flags
  is_recurring INTEGER DEFAULT 1,          -- 1 = recurring, 0 = one-time
  rollover_enabled INTEGER DEFAULT 0,      -- 1 = rollover unused, 0 = reset to 0

  -- Metadata
  created_at TEXT NOT NULL,                -- ISO 8601 timestamp
  updated_at TEXT NOT NULL,                -- ISO 8601 timestamp

  -- Foreign Keys
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Indexes for Performance
CREATE INDEX idx_budgets_category ON budgets(category_id);
CREATE INDEX idx_budgets_period ON budgets(period_type);
CREATE INDEX idx_budgets_dates ON budgets(start_date, end_date);
CREATE INDEX idx_budgets_currency ON budgets(currency);
CREATE INDEX idx_budgets_recurring ON budgets(is_recurring);
```

#### 3.1.2 Field Specifications

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY, UUID v4 | Unique identifier |
| `category_id` | TEXT | NOT NULL, FK → categories(id) | Category this budget applies to |
| `amount` | TEXT | NOT NULL, decimal string | Budget limit (e.g., "1000.50") |
| `currency` | TEXT | NOT NULL, 3-char ISO code | Currency code (USD, EUR, etc.) |
| `period_type` | TEXT | NOT NULL, enum | 'weekly', 'monthly', or 'yearly' |
| `start_date` | TEXT | NOT NULL, ISO date | Budget period start (YYYY-MM-DD) |
| `end_date` | TEXT | NULL or ISO date | Budget end date (NULL = recurring) |
| `is_recurring` | INTEGER | DEFAULT 1, boolean | Whether budget repeats |
| `rollover_enabled` | INTEGER | DEFAULT 0, boolean | Carry unused budget forward |
| `created_at` | TEXT | NOT NULL, ISO timestamp | Record creation time |
| `updated_at` | TEXT | NOT NULL, ISO timestamp | Last modification time |

#### 3.1.3 Constraints & Validations

**Database Level:**
- `period_type` must be one of: 'weekly', 'monthly', 'yearly'
- `category_id` must reference existing category (ON DELETE CASCADE)
- `is_recurring` and `rollover_enabled` are boolean (0 or 1)

**Application Level:**
- `amount` must be positive decimal string
- `currency` must exist in `assets/currencies.json`
- `end_date` must be after `start_date` if specified
- Cannot have multiple active budgets for same category + currency + period_type
- Budget can only be set on expense categories

### 3.2 Database Migration

#### 3.2.1 Migration V7 (New Version)

**File:** `app/services/db.js` (update `DB_VERSION` to 7)

```javascript
const DB_VERSION = 7; // Update from 6 to 7

/**
 * Migrate from V6 to V7 - Add budgets table
 */
const migrateToV7 = async (db) => {
  try {
    console.log('Starting migration to V7: Add budgets table...');

    // Create budgets table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        currency TEXT NOT NULL,
        period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'yearly')),
        start_date TEXT NOT NULL,
        end_date TEXT,
        is_recurring INTEGER DEFAULT 1,
        rollover_enabled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      -- Create indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_type);
      CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_budgets_currency ON budgets(currency);
      CREATE INDEX IF NOT EXISTS idx_budgets_recurring ON budgets(is_recurring);
    `);

    console.log('Migration to V7 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V7:', error);
    throw error;
  }
};

// In initializeDatabase function, add migration check:
if (currentVersion >= 6 && currentVersion < 7) {
  console.log('Migrating database from version', currentVersion, 'to version 7...');
  await migrateToV7(db);
  didMigrate = true;
}
```

#### 3.2.2 Rollback Strategy

If migration fails:
1. SQLite transaction will automatically rollback
2. User data remains intact
3. Error logged to console
4. App continues with previous DB version

**Manual Rollback:**
```sql
DROP TABLE IF EXISTS budgets;
DROP INDEX IF EXISTS idx_budgets_category;
DROP INDEX IF EXISTS idx_budgets_period;
DROP INDEX IF EXISTS idx_budgets_dates;
DROP INDEX IF EXISTS idx_budgets_currency;
DROP INDEX IF EXISTS idx_budgets_recurring;
UPDATE app_metadata SET value = '6' WHERE key = 'db_version';
```

### 3.3 Data Integrity

#### 3.3.1 Foreign Key Constraints
- `category_id` → `categories(id)` ON DELETE CASCADE
  - When category is deleted, all its budgets are automatically deleted
  - Prevents orphaned budget records

#### 3.3.2 Check Constraints
- `period_type` limited to valid enum values
- Prevents invalid period types at database level

#### 3.3.3 Application-Level Integrity
- Prevent duplicate active budgets (same category + currency + period)
- Validate currency exists in supported currencies
- Validate amounts are positive
- Validate date ranges

---

## 4. Service Layer

### 4.1 BudgetsDB Service

**File:** `app/services/BudgetsDB.js`

#### 4.1.1 Core CRUD Operations

```javascript
/**
 * Create a new budget
 * @param {Object} budget - Budget data
 * @param {string} budget.id - UUID
 * @param {string} budget.categoryId - Category ID
 * @param {string} budget.amount - Decimal string (e.g., "500.00")
 * @param {string} budget.currency - ISO currency code
 * @param {string} budget.periodType - 'weekly' | 'monthly' | 'yearly'
 * @param {string} budget.startDate - ISO date string (YYYY-MM-DD)
 * @param {string|null} budget.endDate - ISO date string or null
 * @param {boolean} budget.isRecurring - Default true
 * @param {boolean} budget.rolloverEnabled - Default false
 * @returns {Promise<Object>} Created budget with camelCase fields
 * @throws {Error} If validation fails or database error
 */
export const createBudget = async (budget) => {
  // Implementation details below
};

/**
 * Get budget by ID
 * @param {string} id - Budget ID
 * @returns {Promise<Object|null>} Budget object or null if not found
 */
export const getBudgetById = async (id) => {};

/**
 * Get all budgets
 * @returns {Promise<Array>} Array of all budgets
 */
export const getAllBudgets = async () => {};

/**
 * Get budgets for a specific category
 * @param {string} categoryId - Category ID
 * @returns {Promise<Array>} Array of budgets for the category
 */
export const getBudgetsByCategory = async (categoryId) => {};

/**
 * Get budgets by currency
 * @param {string} currency - ISO currency code
 * @returns {Promise<Array>} Array of budgets in that currency
 */
export const getBudgetsByCurrency = async (currency) => {};

/**
 * Get budgets by period type
 * @param {string} periodType - 'weekly' | 'monthly' | 'yearly'
 * @returns {Promise<Array>} Array of budgets with that period
 */
export const getBudgetsByPeriodType = async (periodType) => {};

/**
 * Update budget
 * @param {string} id - Budget ID
 * @param {Object} updates - Partial budget data to update
 * @returns {Promise<void>}
 */
export const updateBudget = async (id, updates) => {};

/**
 * Delete budget
 * @param {string} id - Budget ID
 * @returns {Promise<void>}
 */
export const deleteBudget = async (id) => {};
```

#### 4.1.2 Budget Query Operations

```javascript
/**
 * Get active budgets for a given date
 * @param {Date} date - Reference date
 * @returns {Promise<Array>} Array of active budgets on that date
 */
export const getActiveBudgets = async (date) => {
  const dateStr = date.toISOString().split('T')[0];

  const budgets = await queryAll(
    `SELECT * FROM budgets
     WHERE start_date <= ?
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY created_at ASC`,
    [dateStr, dateStr]
  );

  return budgets.map(mapBudgetFields);
};

/**
 * Get budget for category in specific period
 * @param {string} categoryId - Category ID
 * @param {string} startDate - Period start (YYYY-MM-DD)
 * @param {string} endDate - Period end (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Budget if found, null otherwise
 */
export const getBudgetForCategoryInPeriod = async (categoryId, startDate, endDate) => {};

/**
 * Check if category has active budget
 * @param {string} categoryId - Category ID
 * @param {Date} date - Reference date
 * @returns {Promise<boolean>} True if active budget exists
 */
export const hasActiveBudget = async (categoryId, date = new Date()) => {};

/**
 * Get all active recurring budgets
 * @returns {Promise<Array>} Array of recurring budgets
 */
export const getRecurringBudgets = async () => {
  const budgets = await queryAll(
    'SELECT * FROM budgets WHERE is_recurring = 1 ORDER BY created_at ASC'
  );
  return budgets.map(mapBudgetFields);
};

/**
 * Check for duplicate budget
 * Prevents multiple active budgets for same category + currency + period_type
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency code
 * @param {string} periodType - Period type
 * @param {string|null} excludeId - Budget ID to exclude from check (for updates)
 * @returns {Promise<Object|null>} Existing budget if duplicate found
 */
export const findDuplicateBudget = async (categoryId, currency, periodType, excludeId = null) => {};
```

#### 4.1.3 Period Calculation Utilities

```javascript
/**
 * Calculate current period dates for a given period type
 * @param {string} periodType - 'weekly' | 'monthly' | 'yearly'
 * @param {Date} referenceDate - Reference date (default: today)
 * @returns {Object} { start: Date, end: Date }
 */
export const getCurrentPeriodDates = (periodType, referenceDate = new Date()) => {
  const start = new Date(referenceDate);
  const end = new Date(referenceDate);

  switch (periodType) {
    case 'weekly':
      // Week starts on Sunday (0) and ends on Saturday (6)
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      end.setDate(start.getDate() + 6);
      break;

    case 'monthly':
      // Month starts on 1st and ends on last day
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // Last day of month
      break;

    case 'yearly':
      // Year starts on Jan 1 and ends on Dec 31
      start.setMonth(0);
      start.setDate(1);
      end.setMonth(11);
      end.setDate(31);
      break;

    default:
      throw new Error(`Invalid period type: ${periodType}`);
  }

  // Set time to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

/**
 * Calculate next period dates
 * @param {string} periodType - Period type
 * @param {Date} currentStart - Current period start date
 * @returns {Object} { start: Date, end: Date }
 */
export const getNextPeriodDates = (periodType, currentStart) => {
  const nextStart = new Date(currentStart);

  switch (periodType) {
    case 'weekly':
      nextStart.setDate(nextStart.getDate() + 7);
      break;
    case 'monthly':
      nextStart.setMonth(nextStart.getMonth() + 1);
      break;
    case 'yearly':
      nextStart.setFullYear(nextStart.getFullYear() + 1);
      break;
  }

  return getCurrentPeriodDates(periodType, nextStart);
};

/**
 * Calculate previous period dates
 * @param {string} periodType - Period type
 * @param {Date} currentStart - Current period start date
 * @returns {Object} { start: Date, end: Date }
 */
export const getPreviousPeriodDates = (periodType, currentStart) => {
  const prevStart = new Date(currentStart);

  switch (periodType) {
    case 'weekly':
      prevStart.setDate(prevStart.getDate() - 7);
      break;
    case 'monthly':
      prevStart.setMonth(prevStart.getMonth() - 1);
      break;
    case 'yearly':
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      break;
  }

  return getCurrentPeriodDates(periodType, prevStart);
};

/**
 * Format period for display
 * @param {string} periodType - Period type
 * @param {Date} startDate - Period start
 * @param {Function} t - Translation function
 * @returns {string} Formatted period (e.g., "November 2025", "Week of Nov 24")
 */
export const formatPeriod = (periodType, startDate, t) => {
  // Implementation uses i18n for month names
};
```

#### 4.1.4 Budget Status Calculations

```javascript
/**
 * Calculate spending for a budget in current period
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency code
 * @param {string} startDate - Period start (YYYY-MM-DD)
 * @param {string} endDate - Period end (YYYY-MM-DD)
 * @param {boolean} includeChildren - Include child category spending (default: true)
 * @returns {Promise<number>} Total spending amount
 */
export const calculateSpendingForBudget = async (
  categoryId,
  currency,
  startDate,
  endDate,
  includeChildren = true
) => {
  try {
    let categoryIds = [categoryId];

    // If including children, get all descendant category IDs
    if (includeChildren) {
      const descendants = await CategoriesDB.getAllDescendants(categoryId);
      categoryIds = [...categoryIds, ...descendants.map(cat => cat.id)];
    }

    // Query operations in date range for these categories and currency
    const placeholders = categoryIds.map(() => '?').join(',');
    const query = `
      SELECT SUM(CAST(o.amount AS REAL)) as total
      FROM operations o
      JOIN accounts a ON o.account_id = a.id
      WHERE o.category_id IN (${placeholders})
        AND o.type = 'expense'
        AND a.currency = ?
        AND o.date >= ?
        AND o.date <= ?
    `;

    const params = [...categoryIds, currency, startDate, endDate];
    const result = await queryFirst(query, params);

    return result && result.total ? parseFloat(result.total) : 0;
  } catch (error) {
    console.error('Failed to calculate spending:', error);
    throw error;
  }
};

/**
 * Calculate budget status for a budget
 * @param {string} budgetId - Budget ID
 * @param {Date} referenceDate - Date to calculate status for (default: today)
 * @returns {Promise<Object>} Budget status object
 *
 * Returns:
 * {
 *   budgetId: string,
 *   amount: string,           // Budget limit
 *   spent: number,            // Amount spent
 *   remaining: number,        // Amount remaining (negative if over)
 *   percentage: number,       // Percentage used (0-100+)
 *   isExceeded: boolean,      // True if over budget
 *   periodStart: string,      // ISO date
 *   periodEnd: string,        // ISO date
 *   status: string            // 'safe' | 'warning' | 'danger' | 'exceeded'
 * }
 */
export const calculateBudgetStatus = async (budgetId, referenceDate = new Date()) => {
  const budget = await getBudgetById(budgetId);
  if (!budget) {
    throw new Error(`Budget ${budgetId} not found`);
  }

  // Calculate current period dates
  const { start, end } = getCurrentPeriodDates(budget.periodType, referenceDate);
  const startDateStr = start.toISOString().split('T')[0];
  const endDateStr = end.toISOString().split('T')[0];

  // Calculate spending
  const spent = await calculateSpendingForBudget(
    budget.categoryId,
    budget.currency,
    startDateStr,
    endDateStr,
    true // Include children
  );

  // Calculate metrics
  const budgetAmount = parseFloat(budget.amount);
  const remaining = budgetAmount - spent;
  const percentage = (spent / budgetAmount) * 100;
  const isExceeded = spent > budgetAmount;

  // Determine status
  let status;
  if (isExceeded) {
    status = 'exceeded';
  } else if (percentage >= 90) {
    status = 'danger';
  } else if (percentage >= 70) {
    status = 'warning';
  } else {
    status = 'safe';
  }

  return {
    budgetId: budget.id,
    amount: budget.amount,
    spent,
    remaining,
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
    isExceeded,
    periodStart: startDateStr,
    periodEnd: endDateStr,
    status,
  };
};

/**
 * Calculate status for all active budgets
 * @param {Date} referenceDate - Reference date
 * @returns {Promise<Map<string, Object>>} Map of budgetId → status
 */
export const calculateAllBudgetStatuses = async (referenceDate = new Date()) => {
  const activeBudgets = await getActiveBudgets(referenceDate);
  const statusMap = new Map();

  for (const budget of activeBudgets) {
    const status = await calculateBudgetStatus(budget.id, referenceDate);
    statusMap.set(budget.id, status);
  }

  return statusMap;
};
```

#### 4.1.5 Helper Functions

```javascript
/**
 * Map database fields to camelCase
 * @param {Object} dbBudget - Budget from database (snake_case)
 * @returns {Object} Budget with camelCase fields
 */
const mapBudgetFields = (dbBudget) => {
  if (!dbBudget) return null;

  return {
    id: dbBudget.id,
    categoryId: dbBudget.category_id,
    amount: dbBudget.amount,
    currency: dbBudget.currency,
    periodType: dbBudget.period_type,
    startDate: dbBudget.start_date,
    endDate: dbBudget.end_date,
    isRecurring: dbBudget.is_recurring === 1,
    rolloverEnabled: dbBudget.rollover_enabled === 1,
    createdAt: dbBudget.created_at,
    updatedAt: dbBudget.updated_at,
  };
};

/**
 * Validate budget data
 * @param {Object} budget - Budget object to validate
 * @returns {string|null} Error message or null if valid
 */
export const validateBudget = (budget) => {
  if (!budget.categoryId) {
    return 'Category is required';
  }

  if (!budget.amount || parseFloat(budget.amount) <= 0) {
    return 'Amount must be greater than zero';
  }

  if (!budget.currency) {
    return 'Currency is required';
  }

  if (!['weekly', 'monthly', 'yearly'].includes(budget.periodType)) {
    return 'Invalid period type';
  }

  if (!budget.startDate) {
    return 'Start date is required';
  }

  if (budget.endDate) {
    const start = new Date(budget.startDate);
    const end = new Date(budget.endDate);
    if (end <= start) {
      return 'End date must be after start date';
    }
  }

  return null;
};
```

### 4.2 Updates to Existing Services

#### 4.2.1 OperationsDB.js Extensions

Add function to get spending with category hierarchy:

```javascript
/**
 * Get spending for category and its children in date range
 * @param {string} categoryId - Category ID
 * @param {string} currency - Currency filter
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<number>} Total spending
 */
export const getSpendingForCategoryTree = async (categoryId, currency, startDate, endDate) => {
  // Get all descendant categories
  const descendants = await CategoriesDB.getAllDescendants(categoryId);
  const categoryIds = [categoryId, ...descendants.map(cat => cat.id)];

  // Build query with placeholders
  const placeholders = categoryIds.map(() => '?').join(',');
  const query = `
    SELECT SUM(CAST(o.amount AS REAL)) as total
    FROM operations o
    JOIN accounts a ON o.account_id = a.id
    WHERE o.category_id IN (${placeholders})
      AND o.type = 'expense'
      AND a.currency = ?
      AND o.date >= ?
      AND o.date <= ?
  `;

  const params = [...categoryIds, currency, startDate, endDate];
  const result = await queryFirst(query, params);

  return result && result.total ? parseFloat(result.total) : 0;
};
```

---

## 5. Context Layer

### 5.1 BudgetsContext

**File:** `app/BudgetsContext.js`

```javascript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import * as BudgetsDB from './services/BudgetsDB';
import { appEvents, EVENTS } from './services/eventEmitter';

const BudgetsContext = createContext();

export const useBudgets = () => {
  const context = useContext(BudgetsContext);
  if (!context) {
    throw new Error('useBudgets must be used within a BudgetsProvider');
  }
  return context;
};

export const BudgetsProvider = ({ children }) => {
  const [budgets, setBudgets] = useState([]);
  const [budgetStatuses, setBudgetStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  /**
   * Load all budgets from database
   */
  const reloadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      const budgetsData = await BudgetsDB.getAllBudgets();
      setBudgets(budgetsData);

      // Refresh statuses for all active budgets
      await refreshBudgetStatuses();

      setSaveError(null);
    } catch (error) {
      console.error('Failed to load budgets:', error);
      setSaveError(error.message);
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refresh budget statuses for all active budgets
   */
  const refreshBudgetStatuses = useCallback(async () => {
    try {
      const statusMap = await BudgetsDB.calculateAllBudgetStatuses();
      setBudgetStatuses(statusMap);
    } catch (error) {
      console.error('Failed to refresh budget statuses:', error);
    }
  }, []);

  /**
   * Load budgets on mount
   */
  useEffect(() => {
    reloadBudgets();
  }, [reloadBudgets]);

  /**
   * Listen for operation changes to refresh statuses
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      console.log('Operation changed, refreshing budget statuses...');
      refreshBudgetStatuses();
    });

    return unsubscribe;
  }, [refreshBudgetStatuses]);

  /**
   * Listen for budget reload events
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading all budgets...');
      reloadBudgets();
    });

    return unsubscribe;
  }, [reloadBudgets]);

  /**
   * Create new budget
   */
  const addBudget = useCallback(async (budget) => {
    try {
      // Validate budget
      const validationError = BudgetsDB.validateBudget(budget);
      if (validationError) {
        throw new Error(validationError);
      }

      // Check for duplicates
      const duplicate = await BudgetsDB.findDuplicateBudget(
        budget.categoryId,
        budget.currency,
        budget.periodType
      );

      if (duplicate) {
        throw new Error(
          'A budget already exists for this category, currency, and period type. ' +
          'Please edit the existing budget or delete it first.'
        );
      }

      // Create budget with UUID
      const newBudget = {
        ...budget,
        id: uuid.v4(),
      };

      await BudgetsDB.createBudget(newBudget);
      setBudgets(prev => [...prev, newBudget]);

      // Refresh statuses
      await refreshBudgetStatuses();

      setSaveError(null);
      return newBudget;
    } catch (error) {
      console.error('Failed to create budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [refreshBudgetStatuses]);

  /**
   * Update existing budget
   */
  const updateBudget = useCallback(async (id, updates) => {
    try {
      // Validate updates
      const existingBudget = budgets.find(b => b.id === id);
      if (!existingBudget) {
        throw new Error('Budget not found');
      }

      const updatedBudget = { ...existingBudget, ...updates };
      const validationError = BudgetsDB.validateBudget(updatedBudget);
      if (validationError) {
        throw new Error(validationError);
      }

      // Check for duplicates (excluding current budget)
      if (updates.categoryId || updates.currency || updates.periodType) {
        const duplicate = await BudgetsDB.findDuplicateBudget(
          updatedBudget.categoryId,
          updatedBudget.currency,
          updatedBudget.periodType,
          id // Exclude this budget from duplicate check
        );

        if (duplicate) {
          throw new Error(
            'A budget already exists for this category, currency, and period type.'
          );
        }
      }

      await BudgetsDB.updateBudget(id, updates);
      setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));

      // Refresh statuses
      await refreshBudgetStatuses();

      setSaveError(null);
    } catch (error) {
      console.error('Failed to update budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [budgets, refreshBudgetStatuses]);

  /**
   * Delete budget
   */
  const deleteBudget = useCallback(async (id) => {
    try {
      await BudgetsDB.deleteBudget(id);
      setBudgets(prev => prev.filter(b => b.id !== id));

      // Remove from status map
      setBudgetStatuses(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });

      setSaveError(null);
    } catch (error) {
      console.error('Failed to delete budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', 'Failed to delete budget. Please try again.', [{ text: 'OK' }]);
      throw error;
    }
  }, []);

  /**
   * Get budget for category
   */
  const getBudgetForCategory = useCallback((categoryId, currency = null, periodType = null) => {
    return budgets.find(b => {
      if (b.categoryId !== categoryId) return false;
      if (currency && b.currency !== currency) return false;
      if (periodType && b.periodType !== periodType) return false;
      return true;
    });
  }, [budgets]);

  /**
   * Get budget status
   */
  const getBudgetStatus = useCallback((budgetId) => {
    return budgetStatuses.get(budgetId) || null;
  }, [budgetStatuses]);

  /**
   * Check if budget is exceeded
   */
  const isBudgetExceeded = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.isExceeded : false;
  }, [budgetStatuses]);

  /**
   * Get budget progress percentage
   */
  const getBudgetProgress = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.percentage : 0;
  }, [budgetStatuses]);

  /**
   * Get remaining budget amount
   */
  const getRemainingBudget = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.remaining : 0;
  }, [budgetStatuses]);

  /**
   * Get budgets by period type
   */
  const getBudgetsByPeriod = useCallback((periodType) => {
    return budgets.filter(b => b.periodType === periodType);
  }, [budgets]);

  /**
   * Check if category has active budget
   */
  const hasActiveBudget = useCallback((categoryId, currency = null) => {
    return budgets.some(b => {
      if (b.categoryId !== categoryId) return false;
      if (currency && b.currency !== currency) return false;

      // Check if budget is active (no end date or end date in future)
      if (!b.endDate) return true;
      const endDate = new Date(b.endDate);
      return endDate >= new Date();
    });
  }, [budgets]);

  const value = useMemo(() => ({
    budgets,
    budgetStatuses,
    loading,
    saveError,
    addBudget,
    updateBudget,
    deleteBudget,
    getBudgetForCategory,
    getBudgetStatus,
    isBudgetExceeded,
    getBudgetProgress,
    getRemainingBudget,
    getBudgetsByPeriod,
    hasActiveBudget,
    reloadBudgets,
    refreshBudgetStatuses,
  }), [
    budgets,
    budgetStatuses,
    loading,
    saveError,
    addBudget,
    updateBudget,
    deleteBudget,
    getBudgetForCategory,
    getBudgetStatus,
    isBudgetExceeded,
    getBudgetProgress,
    getRemainingBudget,
    getBudgetsByPeriod,
    hasActiveBudget,
    reloadBudgets,
    refreshBudgetStatuses,
  ]);

  return (
    <BudgetsContext.Provider value={value}>
      {children}
    </BudgetsContext.Provider>
  );
};
```

### 5.2 Event System Updates

**File:** `app/services/eventEmitter.js`

Add new event type:

```javascript
export const EVENTS = {
  RELOAD_ALL: 'RELOAD_ALL',
  DATABASE_RESET: 'DATABASE_RESET',
  OPERATION_CHANGED: 'OPERATION_CHANGED',  // New event
  BUDGETS_NEED_REFRESH: 'BUDGETS_NEED_REFRESH',  // New event
};
```

Emit events from OperationsContext:

```javascript
// In OperationsContext, after creating/updating/deleting operation:
appEvents.emit(EVENTS.OPERATION_CHANGED);
```

---

## 6. UI Components

### 6.1 BudgetModal Component

**File:** `app/BudgetModal.js`

#### 6.1.1 Component Structure

```javascript
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Switch,
  Portal,
} from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useBudgets } from './BudgetsContext';
import { useAccounts } from './AccountsContext';
import CurrencyPicker from './CurrencyPicker';
import DatePickerModal from './DatePickerModal';

const BudgetModal = ({ visible, onClose, budget, categoryId, categoryName, isNew }) => {
  // Props:
  // - visible: boolean (modal visibility)
  // - onClose: function (callback when closed)
  // - budget: object (existing budget for editing, null for new)
  // - categoryId: string (category to set budget for)
  // - categoryName: string (category name for display)
  // - isNew: boolean (true for create, false for edit)

  // State management here...

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={[styles.modal, { backgroundColor: colors.surface }]}
      >
        {/* Modal content */}
      </Modal>
    </Portal>
  );
};
```

#### 6.1.2 Form Fields

| Field | Type | Component | Validation |
|-------|------|-----------|------------|
| Amount | Number | TextInput (numeric) | Required, > 0 |
| Currency | Select | CurrencyPicker | Required |
| Period Type | Select | Dropdown/Picker | Required (weekly/monthly/yearly) |
| Start Date | Date | DatePickerModal | Required |
| End Date | Date | DatePickerModal | Optional, must be > start |
| Recurring | Boolean | Switch | Default: true |
| Rollover | Boolean | Switch | Default: false |

#### 6.1.3 Form State

```javascript
const [formData, setFormData] = useState({
  amount: '',
  currency: 'USD',
  periodType: 'monthly',
  startDate: new Date(),
  endDate: null,
  isRecurring: true,
  rolloverEnabled: false,
});

const [errors, setErrors] = useState({});
const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
const [showStartDatePicker, setShowStartDatePicker] = useState(false);
const [showEndDatePicker, setShowEndDatePicker] = useState(false);
const [showPeriodPicker, setShowPeriodPicker] = useState(false);
```

#### 6.1.4 Validation Logic

```javascript
const validateForm = () => {
  const newErrors = {};

  // Amount validation
  const amount = parseFloat(formData.amount);
  if (!formData.amount || isNaN(amount) || amount <= 0) {
    newErrors.amount = t('budget_amount_required');
  }

  // Currency validation
  if (!formData.currency) {
    newErrors.currency = t('currency_required');
  }

  // Period type validation
  if (!formData.periodType) {
    newErrors.periodType = t('period_required');
  }

  // Start date validation
  if (!formData.startDate) {
    newErrors.startDate = t('start_date_required');
  }

  // End date validation (if specified)
  if (formData.endDate && formData.startDate) {
    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      newErrors.endDate = t('end_date_must_be_after_start');
    }
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

#### 6.1.5 Save Handler

```javascript
const handleSave = async () => {
  if (!validateForm()) return;

  try {
    const budgetData = {
      categoryId,
      amount: formData.amount,
      currency: formData.currency,
      periodType: formData.periodType,
      startDate: formData.startDate.toISOString().split('T')[0],
      endDate: formData.endDate
        ? formData.endDate.toISOString().split('T')[0]
        : null,
      isRecurring: formData.isRecurring,
      rolloverEnabled: formData.rolloverEnabled,
    };

    if (isNew) {
      await addBudget(budgetData);
    } else {
      await updateBudget(budget.id, budgetData);
    }

    onClose();
  } catch (error) {
    // Error handled in context with Alert
    console.error('Save failed:', error);
  }
};
```

#### 6.1.6 UI Layout

```jsx
<ScrollView style={styles.content}>
  {/* Header */}
  <View style={styles.header}>
    <Text variant="headlineSmall">
      {isNew ? t('set_budget') : t('edit_budget')}
    </Text>
    <Text variant="bodyMedium" style={{ color: colors.mutedText }}>
      {categoryName}
    </Text>
  </View>

  {/* Amount Input */}
  <TextInput
    label={t('budget_amount')}
    value={formData.amount}
    onChangeText={(text) => setFormData(prev => ({ ...prev, amount: text }))}
    keyboardType="decimal-pad"
    error={!!errors.amount}
    style={styles.input}
  />
  {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}

  {/* Currency Picker */}
  <TouchableOpacity
    style={styles.pickerButton}
    onPress={() => setShowCurrencyPicker(true)}
  >
    <Text>{t('currency')}</Text>
    <Text style={{ color: colors.primary }}>{formData.currency}</Text>
  </TouchableOpacity>

  {/* Period Type Picker */}
  <TouchableOpacity
    style={styles.pickerButton}
    onPress={() => setShowPeriodPicker(true)}
  >
    <Text>{t('period_type')}</Text>
    <Text style={{ color: colors.primary }}>{t(formData.periodType)}</Text>
  </TouchableOpacity>

  {/* Date Pickers */}
  <TouchableOpacity
    style={styles.pickerButton}
    onPress={() => setShowStartDatePicker(true)}
  >
    <Text>{t('start_date')}</Text>
    <Text>{formData.startDate.toLocaleDateString()}</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.pickerButton}
    onPress={() => setShowEndDatePicker(true)}
  >
    <Text>{t('end_date')}</Text>
    <Text>{formData.endDate?.toLocaleDateString() || t('never')}</Text>
  </TouchableOpacity>

  {/* Switches */}
  <View style={styles.switchRow}>
    <Text>{t('recurring')}</Text>
    <Switch
      value={formData.isRecurring}
      onValueChange={(value) => setFormData(prev => ({ ...prev, isRecurring: value }))}
    />
  </View>

  <View style={styles.switchRow}>
    <Text>{t('rollover')}</Text>
    <Switch
      value={formData.rolloverEnabled}
      onValueChange={(value) => setFormData(prev => ({ ...prev, rolloverEnabled: value }))}
    />
  </View>

  {/* Action Buttons */}
  <View style={styles.actions}>
    <Button mode="outlined" onPress={onClose}>
      {t('cancel')}
    </Button>
    <Button mode="contained" onPress={handleSave}>
      {t('save')}
    </Button>
  </View>
</ScrollView>
```

### 6.2 BudgetProgressBar Component

**File:** `app/components/BudgetProgressBar.js`

#### 6.2.1 Component Props

```javascript
interface BudgetProgressBarProps {
  budgetId: string;          // Budget ID
  compact?: boolean;         // Compact mode (smaller)
  showDetails?: boolean;     // Show spent/remaining text
  style?: ViewStyle;         // Custom styles
}
```

#### 6.2.2 Implementation

```javascript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTheme } from '../ThemeContext';
import { useLocalization } from '../LocalizationContext';
import { useBudgets } from '../BudgetsContext';

const BudgetProgressBar = ({ budgetId, compact = false, showDetails = true, style }) => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { getBudgetStatus } = useBudgets();

  const status = getBudgetStatus(budgetId);

  if (!status) return null;

  // Determine progress bar color based on status
  const getProgressColor = () => {
    switch (status.status) {
      case 'safe': return colors.success || '#4CAF50';
      case 'warning': return colors.warning || '#FFC107';
      case 'danger': return colors.danger || '#FF9800';
      case 'exceeded': return colors.error || '#F44336';
      default: return colors.primary;
    }
  };

  const progressColor = getProgressColor();
  const progressWidth = Math.min(status.percentage, 100);

  return (
    <View style={[styles.container, style]}>
      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressWidth}%`,
              backgroundColor: progressColor,
            }
          ]}
        />
      </View>

      {/* Details */}
      {showDetails && (
        <View style={styles.details}>
          <Text variant={compact ? 'bodySmall' : 'bodyMedium'}>
            {status.spent.toFixed(2)} / {status.amount}
          </Text>
          <Text
            variant={compact ? 'bodySmall' : 'bodyMedium'}
            style={{ color: status.isExceeded ? colors.error : colors.mutedText }}
          >
            {status.isExceeded
              ? `${t('over_budget_by')} ${Math.abs(status.remaining).toFixed(2)}`
              : `${t('remaining_budget')}: ${status.remaining.toFixed(2)}`
            }
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});

export default BudgetProgressBar;
```

### 6.3 Enhanced CategoriesScreen

**File:** `app/CategoriesScreen.js` (modifications)

#### 6.3.1 Import Budget Components

```javascript
import { useBudgets } from './BudgetsContext';
import BudgetProgressBar from './components/BudgetProgressBar';
import BudgetModal from './BudgetModal';
```

#### 6.3.2 Add Budget State

```javascript
const [budgetModalVisible, setBudgetModalVisible] = useState(false);
const [budgetCategory, setBudgetCategory] = useState(null);
```

#### 6.3.3 Enhanced Category Row Rendering

```javascript
const renderCategory = useCallback(({ item }) => {
  const category = item;
  const depth = item.depth;
  const children = getChildren(category.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const indentWidth = depth * 20;
  const categoryType = category.category_type || category.categoryType || 'expense';
  const rowBackgroundColor = categoryType === 'expense'
    ? colors.expenseBackground
    : colors.incomeBackground;

  // Get budget for this category (if exists)
  const { hasActiveBudget, getBudgetForCategory } = useBudgets();
  const hasBudget = hasActiveBudget(category.id);
  const budget = hasBudget ? getBudgetForCategory(category.id) : null;

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.categoryRow,
          {
            borderBottomColor: colors.border,
            backgroundColor: rowBackgroundColor,
          }
        ]}
        onPress={() => {
          if (hasChildren) {
            toggleExpanded(category.id);
          } else {
            handleEditCategory(category);
          }
        }}
        onLongPress={() => handleCategoryLongPress(category)}
      >
        <View style={[styles.categoryContent, { paddingLeft: 16 + indentWidth }]}>
          {/* Expand/Collapse Icon */}
          {hasChildren ? (
            <TouchableOpacity
              onPress={() => toggleExpanded(category.id)}
              style={styles.expandButton}
            >
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                size={20}
                color={colors.mutedText}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.expandButton} />
          )}

          {/* Category Icon */}
          <Icon
            name={category.icon}
            size={24}
            color={colors.text}
            style={styles.categoryIcon}
          />

          {/* Category Name */}
          <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
            {category.nameKey ? t(category.nameKey) : category.name}
          </Text>

          {/* Budget Indicator */}
          {hasBudget && (
            <Icon
              name="cash-clock"
              size={20}
              color={colors.primary}
              style={styles.budgetIcon}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* Budget Progress Bar (if exists) */}
      {hasBudget && budget && (
        <View style={[styles.budgetProgressContainer, { paddingLeft: 16 + indentWidth }]}>
          <BudgetProgressBar
            budgetId={budget.id}
            compact={true}
            showDetails={true}
          />
        </View>
      )}
    </View>
  );
}, [colors, t, expandedIds, getChildren, toggleExpanded, useBudgets]);
```

#### 6.3.4 Category Long Press Menu

```javascript
const handleCategoryLongPress = (category) => {
  Alert.alert(
    category.nameKey ? t(category.nameKey) : category.name,
    t('select_action'),
    [
      {
        text: t('edit_category'),
        onPress: () => handleEditCategory(category),
      },
      {
        text: hasBudget
          ? t('edit_budget')
          : t('set_budget'),
        onPress: () => handleBudgetPress(category),
      },
      {
        text: t('delete_category'),
        onPress: () => handleDeleteCategory(category.id),
        style: 'destructive',
      },
      {
        text: t('cancel'),
        style: 'cancel',
      },
    ]
  );
};

const handleBudgetPress = (category) => {
  setBudgetCategory(category);
  setBudgetModalVisible(true);
};
```

#### 6.3.5 Add Budget Modal

```jsx
<BudgetModal
  visible={budgetModalVisible}
  onClose={() => setBudgetModalVisible(false)}
  budget={budgetCategory ? getBudgetForCategory(budgetCategory.id) : null}
  categoryId={budgetCategory?.id}
  categoryName={budgetCategory?.nameKey ? t(budgetCategory.nameKey) : budgetCategory?.name}
  isNew={budgetCategory && !hasActiveBudget(budgetCategory.id)}
/>
```

### 6.4 BudgetsOverviewScreen (Optional - Phase 4)

**File:** `app/BudgetsOverviewScreen.js`

This is an optional enhancement showing all budgets in one place. Can be added as:
- Separate tab in SimpleTabs
- Section within GraphsScreen
- Accessible from Settings

```javascript
// Shows summary cards for all active budgets
// Group by period type (weekly/monthly/yearly)
// Display total budgeted vs total spent
// Filter by currency
// Navigate to category details on tap
```

---

## 7. Data Flow

### 7.1 Budget Creation Flow

```
┌──────────────┐
│    User      │
│  Taps "Set   │
│   Budget"    │
└──────┬───────┘
       │
       ↓
┌──────────────────────┐
│   BudgetModal        │
│   - Opens with form  │
│   - User fills data  │
│   - Validates input  │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│  BudgetsContext      │
│  addBudget()         │
│  - Validates         │
│  - Checks duplicates │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│   BudgetsDB          │
│   createBudget()     │
│   - Insert to DB     │
│   - Return result    │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│   SQLite Database    │
│   INSERT INTO        │
│   budgets table      │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│  BudgetsContext      │
│  - Updates state     │
│  - Refreshes status  │
│  - UI re-renders     │
└──────────────────────┘
```

### 7.2 Operation Creation & Budget Update Flow

```
┌──────────────┐
│    User      │
│   Creates    │
│  Operation   │
└──────┬───────┘
       │
       ↓
┌──────────────────────┐
│  OperationsContext   │
│  addOperation()      │
│  - Saves operation   │
│  - Emits event       │
└──────┬───────────────┘
       │
       ↓ OPERATION_CHANGED event
       │
┌──────────────────────┐
│  BudgetsContext      │
│  - Listens to event  │
│  - Calls refresh()   │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│   BudgetsDB          │
│   calculateAllBudget │
│   Statuses()         │
│   - Queries ops DB   │
│   - Calculates sums  │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│  BudgetsContext      │
│  - Updates statusMap │
│  - UI re-renders     │
│  - Shows new progress│
└──────────────────────┘
```

### 7.3 Budget Status Display Flow

```
┌──────────────┐
│ Categories   │
│   Screen     │
│  Renders     │
└──────┬───────┘
       │
       ↓
┌──────────────────────┐
│  renderCategory()    │
│  - Checks if budget  │
│  - Gets budget ID    │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│ BudgetProgressBar    │
│  Component           │
│  - Gets status       │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│  BudgetsContext      │
│  getBudgetStatus()   │
│  - Returns cached    │
│    status object     │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│ BudgetProgressBar    │
│  - Renders bar       │
│  - Shows percentage  │
│  - Color codes       │
└──────────────────────┘
```

---

## 8. Edge Cases & Error Handling

### 8.1 Edge Cases

#### 8.1.1 Multiple Budgets

**Scenario:** User tries to create second budget for same category + currency + period

**Solution:**
- Check for duplicate before saving
- Return error: "Budget already exists for this category, currency, and period"
- Suggest editing existing budget

#### 8.1.2 Category Deletion with Budget

**Scenario:** User deletes category that has an active budget

**Solution:**
- Database CASCADE: Budget automatically deleted
- Context updates state to remove budget
- No orphaned budget records

#### 8.1.3 Budget Period Transitions

**Scenario:** Budget period ends (e.g., month ends, new month begins)

**Solution:**
- Recurring budgets: Automatically calculate for new period
- Non-recurring: Mark as inactive (end_date passed)
- Rollover enabled: Carry unused amount forward (Phase 4)

#### 8.1.4 Multi-Currency Operations

**Scenario:** Category has operations in USD and EUR, budget set for USD

**Solution:**
- Budget only tracks operations matching its currency
- User can create separate budget for EUR
- UI shows both budgets for category

#### 8.1.5 Hierarchical Categories

**Scenario:** Parent category has budget, child categories have operations

**Solution:**
- Budget calculation includes all descendant operations
- Sum spending recursively through category tree
- Display aggregate spending on parent

#### 8.1.6 Date Range Boundary

**Scenario:** Operation date is on period boundary (e.g., end of month)

**Solution:**
- Use inclusive date range (>= start AND <= end)
- Operation on last day of month counts toward that month
- Clear period calculation functions

#### 8.1.7 Zero Budget

**Scenario:** User sets budget amount to 0

**Solution:**
- Validation prevents 0 or negative amounts
- Error message: "Amount must be greater than zero"
- Cannot save budget with 0 amount

#### 8.1.8 Future Budget

**Scenario:** User creates budget with start_date in future

**Solution:**
- Allow future budgets for planning
- Mark as inactive until start_date
- Show in overview but don't calculate status yet

#### 8.1.9 Overlapping Budgets

**Scenario:** User creates budget with date range overlapping existing budget

**Solution:**
- Allow overlapping date ranges for different currencies/periods
- Prevent duplicate: same category + currency + period
- Each period type independent (can have weekly + monthly simultaneously)

### 8.2 Error Handling

#### 8.2.1 Database Errors

```javascript
try {
  await BudgetsDB.createBudget(budget);
} catch (error) {
  if (error.message.includes('UNIQUE constraint')) {
    Alert.alert('Error', 'A budget already exists for this configuration.');
  } else if (error.message.includes('FOREIGN KEY constraint')) {
    Alert.alert('Error', 'Category not found. Please refresh and try again.');
  } else {
    Alert.alert('Error', 'Failed to save budget. Please try again.');
  }
  console.error('Database error:', error);
}
```

#### 8.2.2 Validation Errors

```javascript
const validationError = validateBudget(budget);
if (validationError) {
  Alert.alert('Validation Error', validationError);
  return;
}
```

#### 8.2.3 Network Errors (N/A for SQLite)

No network errors for local SQLite database.

#### 8.2.4 State Sync Errors

```javascript
// If budget context state gets out of sync with database
const handleSyncError = async () => {
  try {
    await reloadBudgets(); // Force reload from database
  } catch (error) {
    Alert.alert('Error', 'Failed to sync budgets. Please restart the app.');
  }
};
```

#### 8.2.5 Calculation Errors

```javascript
try {
  const status = await calculateBudgetStatus(budgetId);
} catch (error) {
  console.error('Failed to calculate budget status:', error);
  // Return safe default instead of crashing
  return {
    budgetId,
    spent: 0,
    remaining: parseFloat(budget.amount),
    percentage: 0,
    isExceeded: false,
    status: 'safe',
  };
}
```

---

## 9. Performance Considerations

### 9.1 Query Optimization

#### 9.1.1 Indexes

All critical queries have indexes:
- `idx_budgets_category` - Fast lookup by category
- `idx_budgets_period` - Filter by period type
- `idx_budgets_dates` - Date range queries
- `idx_budgets_currency` - Currency filtering

#### 9.1.2 Query Efficiency

**Avoid N+1 Queries:**
```javascript
// BAD: Query for each category
for (const category of categories) {
  const budget = await getBudgetsByCategory(category.id);
}

// GOOD: Load all budgets once
const allBudgets = await getAllBudgets();
const budgetsByCategory = new Map();
allBudgets.forEach(b => budgetsByCategory.set(b.categoryId, b));
```

#### 9.1.3 Batch Operations

Calculate all budget statuses in single pass:
```javascript
export const calculateAllBudgetStatuses = async (referenceDate) => {
  const budgets = await getActiveBudgets(referenceDate);
  const statusMap = new Map();

  // Parallel calculation using Promise.all
  const statusPromises = budgets.map(async (budget) => {
    const status = await calculateBudgetStatus(budget.id, referenceDate);
    return [budget.id, status];
  });

  const results = await Promise.all(statusPromises);
  results.forEach(([id, status]) => statusMap.set(id, status));

  return statusMap;
};
```

### 9.2 Caching Strategy

#### 9.2.1 Context-Level Caching

```javascript
// Cache budget statuses in context
const [budgetStatuses, setBudgetStatuses] = useState(new Map());

// Only recalculate when operations change
useEffect(() => {
  const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
    refreshBudgetStatuses();
  });
  return unsubscribe;
}, []);
```

#### 9.2.2 Memoization

```javascript
// Memoize expensive calculations
const budgetProgress = useMemo(() => {
  return calculateProgress(budget, operations);
}, [budget, operations]);
```

### 9.3 Render Optimization

#### 9.3.1 FlatList Optimization

```javascript
<FlatList
  data={categoriesWithBudgets}
  renderItem={renderCategory}
  keyExtractor={item => item.id}
  getItemLayout={getItemLayout}  // Fixed height optimization
  windowSize={10}
  maxToRenderPerBatch={10}
  initialNumToRender={15}
  removeClippedSubviews={true}
/>
```

#### 9.3.2 Component Memoization

```javascript
const BudgetProgressBar = React.memo(({ budgetId, ...props }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Only re-render if budgetId changes
  return prevProps.budgetId === nextProps.budgetId;
});
```

### 9.4 Large Dataset Handling

#### 9.4.1 Pagination (Future Enhancement)

For users with 100+ budgets:
- Implement pagination in budget lists
- Load budgets in batches of 50
- Use offset/limit in SQL queries

#### 9.4.2 Lazy Loading

Load budget statuses on demand:
```javascript
// Only calculate status when category is expanded/visible
const onCategoryExpand = async (categoryId) => {
  if (!budgetStatuses.has(categoryId)) {
    const budget = getBudgetForCategory(categoryId);
    if (budget) {
      const status = await calculateBudgetStatus(budget.id);
      setBudgetStatuses(prev => new Map(prev).set(budget.id, status));
    }
  }
};
```

### 9.5 Memory Management

#### 9.5.1 Cleanup on Unmount

```javascript
useEffect(() => {
  return () => {
    // Clear budget statuses cache
    setBudgetStatuses(new Map());
  };
}, []);
```

#### 9.5.2 Event Listener Cleanup

```javascript
useEffect(() => {
  const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, handler);
  return () => unsubscribe(); // Always cleanup
}, []);
```

---

## 10. Security & Validation

### 10.1 Input Validation

#### 10.1.1 Client-Side Validation

**BudgetModal.js:**
```javascript
const validateAmount = (value) => {
  const amount = parseFloat(value);
  if (isNaN(amount)) return 'Invalid amount';
  if (amount <= 0) return 'Amount must be positive';
  if (amount > 999999999) return 'Amount too large';
  return null;
};

const validateCurrency = (value) => {
  const validCurrencies = currencies.map(c => c.code);
  if (!validCurrencies.includes(value)) {
    return 'Invalid currency';
  }
  return null;
};

const validateDateRange = (startDate, endDate) => {
  if (!startDate) return 'Start date required';
  if (endDate && new Date(endDate) <= new Date(startDate)) {
    return 'End date must be after start date';
  }
  return null;
};
```

#### 10.1.2 Service-Level Validation

**BudgetsDB.js:**
```javascript
export const validateBudget = (budget) => {
  // Required fields
  if (!budget.categoryId) return 'Category ID required';
  if (!budget.amount) return 'Amount required';
  if (!budget.currency) return 'Currency required';
  if (!budget.periodType) return 'Period type required';
  if (!budget.startDate) return 'Start date required';

  // Type validation
  if (typeof budget.amount !== 'string') return 'Amount must be string';
  if (parseFloat(budget.amount) <= 0) return 'Amount must be positive';

  // Enum validation
  const validPeriods = ['weekly', 'monthly', 'yearly'];
  if (!validPeriods.includes(budget.periodType)) {
    return 'Invalid period type';
  }

  // Date validation
  if (budget.endDate) {
    const start = new Date(budget.startDate);
    const end = new Date(budget.endDate);
    if (isNaN(start.getTime())) return 'Invalid start date';
    if (isNaN(end.getTime())) return 'Invalid end date';
    if (end <= start) return 'End date must be after start';
  }

  return null;
};
```

### 10.2 SQL Injection Prevention

#### 10.2.1 Parameterized Queries

Always use parameterized queries, never string concatenation:

```javascript
// GOOD: Parameterized
const budget = await queryFirst(
  'SELECT * FROM budgets WHERE id = ?',
  [budgetId]
);

// BAD: String concatenation (vulnerable to injection)
const budget = await queryFirst(
  `SELECT * FROM budgets WHERE id = '${budgetId}'`
);
```

#### 10.2.2 Input Sanitization

```javascript
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, ''); // Remove potential XSS characters
};
```

### 10.3 Data Integrity

#### 10.3.1 Foreign Key Enforcement

```sql
PRAGMA foreign_keys = ON; -- Always enabled in db.js
```

#### 10.3.2 Transaction Integrity

```javascript
// Use transactions for multi-step operations
await executeTransaction(async (db) => {
  await db.runAsync('UPDATE budgets SET amount = ? WHERE id = ?', [newAmount, id]);
  await db.runAsync('INSERT INTO budget_history ...', [...]);
  // Both succeed or both rollback
});
```

#### 10.3.3 Referential Integrity

```sql
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
-- Ensures no orphaned budgets
```

### 10.4 Data Privacy

#### 10.4.1 Local Storage Only

- All budget data stored locally in SQLite
- No cloud sync (unless explicitly implemented)
- No third-party data sharing

#### 10.4.2 Sensitive Data Handling

Budget amounts are financial data:
- Stored locally only
- Not logged to console in production
- Sanitized in error messages

```javascript
// Don't log sensitive data
console.log('Budget created:', budget); // BAD

// Only log IDs
console.log('Budget created:', budget.id); // GOOD
```

### 10.5 Access Control

#### 10.5.1 Context Access

```javascript
// Validate context usage
export const useBudgets = () => {
  const context = useContext(BudgetsContext);
  if (!context) {
    throw new Error('useBudgets must be used within BudgetsProvider');
  }
  return context;
};
```

#### 10.5.2 Operation Permissions

All users have full CRUD access to their own budgets (single-user app).

---

## 11. Testing Strategy

### 11.1 Unit Tests

#### 11.1.1 Service Layer Tests

**BudgetsDB.test.js:**

```javascript
describe('BudgetsDB', () => {
  beforeEach(async () => {
    await dropAllTables();
    await getDatabase(); // Re-initialize
  });

  describe('createBudget', () => {
    it('should create budget successfully', async () => {
      const budget = {
        id: 'test-budget-1',
        categoryId: 'category-1',
        amount: '500.00',
        currency: 'USD',
        periodType: 'monthly',
        startDate: '2025-12-01',
        endDate: null,
        isRecurring: true,
        rolloverEnabled: false,
      };

      const result = await createBudget(budget);
      expect(result).toBeDefined();
      expect(result.id).toBe('test-budget-1');
    });

    it('should reject invalid amount', async () => {
      const budget = { ...validBudget, amount: '-100' };
      await expect(createBudget(budget)).rejects.toThrow();
    });
  });

  describe('calculateBudgetStatus', () => {
    it('should calculate status correctly', async () => {
      // Create budget
      await createBudget(testBudget);

      // Create operations
      await createOperation(testOperation);

      // Calculate status
      const status = await calculateBudgetStatus(testBudget.id);

      expect(status.spent).toBe(100);
      expect(status.remaining).toBe(400);
      expect(status.percentage).toBe(20);
      expect(status.status).toBe('safe');
    });
  });

  describe('getCurrentPeriodDates', () => {
    it('should calculate weekly period correctly', () => {
      const date = new Date('2025-12-15'); // Monday
      const { start, end } = getCurrentPeriodDates('weekly', date);

      expect(start.getDay()).toBe(0); // Sunday
      expect(end.getDay()).toBe(6);   // Saturday
    });

    it('should calculate monthly period correctly', () => {
      const date = new Date('2025-12-15');
      const { start, end } = getCurrentPeriodDates('monthly', date);

      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(11); // December (0-indexed)
    });
  });
});
```

#### 11.1.2 Context Tests

**BudgetsContext.test.js:**

```javascript
describe('BudgetsContext', () => {
  it('should provide budget methods', () => {
    const { result } = renderHook(() => useBudgets(), {
      wrapper: BudgetsProvider,
    });

    expect(result.current.addBudget).toBeDefined();
    expect(result.current.updateBudget).toBeDefined();
    expect(result.current.deleteBudget).toBeDefined();
  });

  it('should add budget successfully', async () => {
    const { result } = renderHook(() => useBudgets(), {
      wrapper: BudgetsProvider,
    });

    await act(async () => {
      await result.current.addBudget(testBudget);
    });

    expect(result.current.budgets).toHaveLength(1);
  });
});
```

### 11.2 Integration Tests

#### 11.2.1 Budget Creation Flow

```javascript
describe('Budget Creation Flow', () => {
  it('should create budget and update UI', async () => {
    const { getByText, getByLabelText } = render(<App />);

    // Navigate to Categories
    fireEvent.press(getByText('Categories'));

    // Long press category
    const category = getByText('Food');
    fireEvent(category, 'longPress');

    // Select "Set Budget"
    fireEvent.press(getByText('Set Budget'));

    // Fill form
    fireEvent.changeText(getByLabelText('Budget Amount'), '500');

    // Save
    fireEvent.press(getByText('Save'));

    // Verify budget appears
    await waitFor(() => {
      expect(getByText('0.00 / 500.00')).toBeTruthy();
    });
  });
});
```

#### 11.2.2 Budget Status Calculation

```javascript
describe('Budget Status Calculation', () => {
  it('should update status after operation', async () => {
    // Create budget
    await createBudget({
      categoryId: 'food',
      amount: '500',
      periodType: 'monthly',
      ...
    });

    // Create operation
    await createOperation({
      categoryId: 'food',
      amount: '100',
      type: 'expense',
      ...
    });

    // Emit event
    appEvents.emit(EVENTS.OPERATION_CHANGED);

    // Wait for status refresh
    await waitFor(() => {
      const status = getBudgetStatus(budgetId);
      expect(status.spent).toBe(100);
    });
  });
});
```

### 11.3 UI Component Tests

#### 11.3.1 BudgetModal Tests

```javascript
describe('BudgetModal', () => {
  it('should render form fields', () => {
    const { getByLabelText } = render(
      <BudgetModal
        visible={true}
        onClose={jest.fn()}
        categoryId="test"
        categoryName="Food"
        isNew={true}
      />
    );

    expect(getByLabelText('Budget Amount')).toBeTruthy();
    expect(getByLabelText('Currency')).toBeTruthy();
    expect(getByLabelText('Period Type')).toBeTruthy();
  });

  it('should validate amount', async () => {
    const { getByLabelText, getByText } = render(<BudgetModal ... />);

    const amountInput = getByLabelText('Budget Amount');
    fireEvent.changeText(amountInput, '-100');

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(getByText('Amount must be positive')).toBeTruthy();
    });
  });
});
```

#### 11.3.2 BudgetProgressBar Tests

```javascript
describe('BudgetProgressBar', () => {
  it('should render progress correctly', () => {
    const mockStatus = {
      budgetId: '1',
      spent: 250,
      amount: '500',
      remaining: 250,
      percentage: 50,
      status: 'safe',
    };

    jest.spyOn(useBudgets, 'getBudgetStatus').mockReturnValue(mockStatus);

    const { getByText } = render(<BudgetProgressBar budgetId="1" />);

    expect(getByText('250.00 / 500.00')).toBeTruthy();
    expect(getByText('Remaining: 250.00')).toBeTruthy();
  });

  it('should show exceeded status', () => {
    const mockStatus = {
      spent: 600,
      amount: '500',
      remaining: -100,
      percentage: 120,
      status: 'exceeded',
      isExceeded: true,
    };

    jest.spyOn(useBudgets, 'getBudgetStatus').mockReturnValue(mockStatus);

    const { getByText } = render(<BudgetProgressBar budgetId="1" />);

    expect(getByText(/Over budget by 100.00/)).toBeTruthy();
  });
});
```

### 11.4 Performance Tests

#### 11.4.1 Query Performance

```javascript
describe('Query Performance', () => {
  it('should calculate 100 budget statuses in < 1s', async () => {
    // Create 100 budgets
    const budgets = Array.from({ length: 100 }, (_, i) => ({
      id: `budget-${i}`,
      categoryId: `category-${i}`,
      amount: '500',
      periodType: 'monthly',
      ...
    }));

    for (const budget of budgets) {
      await createBudget(budget);
    }

    const startTime = Date.now();
    const statuses = await calculateAllBudgetStatuses();
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(1000);
    expect(statuses.size).toBe(100);
  });
});
```

### 11.5 Manual Testing Checklist

#### 11.5.1 Functional Testing

- [ ] Create budget with all field combinations
- [ ] Edit existing budget
- [ ] Delete budget
- [ ] Budget appears on category row
- [ ] Progress bar updates after operation
- [ ] Multiple budgets on different categories
- [ ] Weekly budget resets correctly
- [ ] Monthly budget resets correctly
- [ ] Recurring budget continues next period
- [ ] One-time budget expires
- [ ] Category deletion removes budget
- [ ] Currency filtering works
- [ ] Hierarchical categories aggregate spending
- [ ] Exceeded budget shows red
- [ ] Safe budget shows green

#### 11.5.2 Edge Case Testing

- [ ] Create operation on last day of month
- [ ] Create operation at midnight
- [ ] Budget with future start date
- [ ] Budget with past end date
- [ ] Zero operations (budget status: 0%)
- [ ] Operations exactly matching budget
- [ ] Operations exceeding budget by 1 cent
- [ ] Multiple currencies on same category
- [ ] Very large budget amounts (999999999)
- [ ] Very small amounts (0.01)

#### 11.5.3 UI/UX Testing

- [ ] Modal animations smooth
- [ ] Form validation shows errors
- [ ] Loading states display
- [ ] Error alerts appear
- [ ] Progress bars animate
- [ ] Colors match theme
- [ ] Dark mode works
- [ ] Text translations correct (EN/RU)
- [ ] Accessibility labels present
- [ ] Touch targets adequate size (44x44)

---

## 12. Migration Plan

### 12.1 Database Migration

#### 12.1.1 Pre-Migration Checks

```javascript
const checkMigrationReady = async () => {
  const db = await getDatabase();

  // Check current version
  const version = await db.getFirstAsync(
    'SELECT value FROM app_metadata WHERE key = ?',
    ['db_version']
  );

  if (version && parseInt(version.value) >= 7) {
    console.log('Migration already applied');
    return false;
  }

  // Check for data integrity
  const categoriesCount = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM categories'
  );

  console.log(`Found ${categoriesCount.count} categories`);

  return true;
};
```

#### 12.1.2 Migration Execution

See Section 3.2 for full migration code.

#### 12.1.3 Post-Migration Verification

```javascript
const verifyMigration = async () => {
  const db = await getDatabase();

  // Verify budgets table exists
  const tableExists = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'"
  );

  if (!tableExists) {
    throw new Error('Budgets table not created');
  }

  // Verify indexes exist
  const indexes = await db.getAllAsync(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='budgets'"
  );

  const expectedIndexes = [
    'idx_budgets_category',
    'idx_budgets_period',
    'idx_budgets_dates',
    'idx_budgets_currency',
    'idx_budgets_recurring',
  ];

  const indexNames = indexes.map(idx => idx.name);
  for (const expectedIndex of expectedIndexes) {
    if (!indexNames.includes(expectedIndex)) {
      throw new Error(`Index ${expectedIndex} not created`);
    }
  }

  // Verify version updated
  const version = await db.getFirstAsync(
    'SELECT value FROM app_metadata WHERE key = ?',
    ['db_version']
  );

  if (version.value !== '7') {
    throw new Error('Version not updated');
  }

  console.log('Migration verified successfully');
  return true;
};
```

### 12.2 App Updates

#### 12.2.1 Context Provider Integration

**File:** `App.js`

```javascript
import { BudgetsProvider } from './app/BudgetsContext';

export default function App() {
  return (
    <LocalizationProvider>
      <ThemeProvider>
        <AccountsProvider>
          <CategoriesProvider>
            <OperationsProvider>
              <BudgetsProvider>  {/* Add this */}
                {/* Rest of app */}
              </BudgetsProvider>
            </OperationsProvider>
          </CategoriesProvider>
        </AccountsProvider>
      </ThemeProvider>
    </LocalizationProvider>
  );
}
```

#### 12.2.2 Event Emitter Updates

**File:** `app/services/eventEmitter.js`

Add new events:
```javascript
export const EVENTS = {
  RELOAD_ALL: 'RELOAD_ALL',
  DATABASE_RESET: 'DATABASE_RESET',
  OPERATION_CHANGED: 'OPERATION_CHANGED',  // Add
  BUDGETS_NEED_REFRESH: 'BUDGETS_NEED_REFRESH',  // Add
};
```

**File:** `app/OperationsContext.js`

Emit events after operations:
```javascript
import { appEvents, EVENTS } from './services/eventEmitter';

const addOperation = async (operation) => {
  // ... existing code ...
  await OperationsDB.createOperation(operation);

  // Emit event for budget refresh
  appEvents.emit(EVENTS.OPERATION_CHANGED);

  // ... rest of code ...
};
```

### 12.3 Rollout Strategy

#### 12.3.1 Phased Rollout

**Phase 1 (Week 1-2):** Core Infrastructure
- Deploy database migration
- Deploy service layer
- Deploy context layer
- Internal testing

**Phase 2 (Week 3):** Basic UI
- Deploy BudgetModal
- Deploy enhanced CategoriesScreen
- Limited beta testing (10-20 users)

**Phase 3 (Week 4):** Polish & Feedback
- Fix bugs from beta
- Deploy BudgetProgressBar
- UI refinements
- Expanded beta (50-100 users)

**Phase 4 (Week 5+):** General Release
- Deploy to all users
- Monitor for issues
- Iterate based on feedback

#### 12.3.2 Feature Flags (Optional)

```javascript
const FEATURE_FLAGS = {
  budgets_enabled: true,  // Master switch
  budgets_rollover: false, // Phase 4 feature
  budgets_notifications: false, // Phase 4 feature
};

// In components:
if (FEATURE_FLAGS.budgets_enabled) {
  // Show budget UI
}
```

### 12.4 Rollback Plan

#### 12.4.1 Immediate Rollback (< 24 hours)

If critical bugs found:
1. Disable feature flag: `budgets_enabled: false`
2. Hide budget UI components
3. Data remains in database (safe)
4. Fix issues and re-enable

#### 12.4.2 Database Rollback (if needed)

```javascript
const rollbackToV6 = async () => {
  const db = await getDatabase();

  await db.execAsync(`
    DROP TABLE IF EXISTS budgets;
    DROP INDEX IF EXISTS idx_budgets_category;
    DROP INDEX IF EXISTS idx_budgets_period;
    DROP INDEX IF EXISTS idx_budgets_dates;
    DROP INDEX IF EXISTS idx_budgets_currency;
    DROP INDEX IF EXISTS idx_budgets_recurring;

    UPDATE app_metadata
    SET value = '6', updated_at = '${new Date().toISOString()}'
    WHERE key = 'db_version';
  `);

  console.log('Rolled back to V6');
};
```

---

## 13. Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

**Deliverables:**
- [x] Database migration to V7
- [x] `BudgetsDB.js` service layer
- [x] `BudgetsContext.js` provider
- [x] i18n translations
- [x] Unit tests for services

**Tasks:**
1. Update `app/services/db.js`:
   - Increment `DB_VERSION` to 7
   - Add `migrateToV7` function
   - Add migration check in `initializeDatabase`
2. Create `app/services/BudgetsDB.js`:
   - Implement all CRUD functions
   - Implement period calculation utilities
   - Implement budget status calculations
   - Add validation functions
3. Create `app/BudgetsContext.js`:
   - Implement provider with all methods
   - Add event listeners
   - Implement status caching
4. Update `assets/i18n.json`:
   - Add all budget-related translations (EN/RU)
5. Update `app/services/eventEmitter.js`:
   - Add new event types
6. Write unit tests:
   - Test all BudgetsDB functions
   - Test period calculations
   - Test budget status logic

**Success Criteria:**
- Migration runs without errors
- All service functions tested
- Context provides all methods
- No impact on existing features

---

### Phase 2: Basic Budget Management (Week 3)

**Deliverables:**
- [x] `BudgetModal.js` component
- [x] Enhanced `CategoriesScreen.js`
- [x] Budget CRUD functionality
- [x] Form validation

**Tasks:**
1. Create `app/BudgetModal.js`:
   - Build form UI with all fields
   - Implement validation
   - Connect to BudgetsContext
   - Add date/currency pickers
2. Update `app/CategoriesScreen.js`:
   - Add budget menu options
   - Add modal state management
   - Connect to BudgetsContext
   - Add budget indicator icon
3. Update `App.js`:
   - Wrap with BudgetsProvider
4. Update `app/OperationsContext.js`:
   - Emit `OPERATION_CHANGED` events
5. Write component tests:
   - Test BudgetModal rendering
   - Test form validation
   - Test CRUD operations

**Success Criteria:**
- Users can create budgets
- Users can edit budgets
- Users can delete budgets
- Form validation works
- No crashes or data loss

---

### Phase 3: Budget Visualization (Week 4)

**Deliverables:**
- [x] `BudgetProgressBar.js` component
- [x] Enhanced category rows with progress bars
- [x] Budget status indicators
- [x] Real-time status updates

**Tasks:**
1. Create `app/components/BudgetProgressBar.js`:
   - Build progress bar UI
   - Implement color coding
   - Add status text
   - Optimize performance
2. Update `app/CategoriesScreen.js`:
   - Add progress bars to category rows
   - Show budget status
   - Add budget icons
   - Implement compact mode
3. Style integration:
   - Match existing theme
   - Support dark mode
   - Responsive sizing
4. Write UI tests:
   - Test progress bar rendering
   - Test color coding
   - Test status updates

**Success Criteria:**
- Progress bars display correctly
- Colors update based on status
- Performance is smooth
- Updates happen real-time
- Dark mode works

---

### Phase 4: Advanced Features (Week 5+)

**Deliverables:**
- [ ] Rollover functionality
- [ ] Budget notifications
- [ ] Budgets overview screen
- [ ] Budget analytics

**Tasks:**
1. Implement rollover logic:
   - Calculate unused amount at period end
   - Add to next period budget
   - Update UI to show rollover
2. Add notifications (optional):
   - 80% budget threshold alert
   - 100% budget exceeded alert
   - Local notifications
3. Create `app/BudgetsOverviewScreen.js`:
   - List all active budgets
   - Show aggregate statistics
   - Filter by period/currency
   - Add to navigation
4. Add budget analytics:
   - Historical budget adherence
   - Month-over-month trends
   - Category spending patterns
5. Write integration tests:
   - Test rollover calculations
   - Test notification triggers
   - Test overview screen

**Success Criteria:**
- Rollover works correctly
- Notifications fire appropriately
- Overview screen useful
- Analytics accurate

---

## 14. Dependencies

### 14.1 Required Dependencies

All dependencies already present in project:

| Package | Version | Purpose |
|---------|---------|---------|
| expo-sqlite | Latest | SQLite database |
| react-native-paper | Latest | UI components |
| @expo/vector-icons | Latest | Icons |
| react-native-uuid | Latest | UUID generation |
| react | Latest | Core framework |
| react-native | Latest | Mobile framework |

### 14.2 Optional Dependencies

For Phase 4 enhancements:

| Package | Version | Purpose |
|---------|---------|---------|
| expo-notifications | Latest | Push notifications |
| react-native-chart-kit | Latest | Budget charts |
| date-fns | Latest | Advanced date handling |

### 14.3 No New Dependencies Required

Phase 1-3 implementation requires **zero new dependencies**.

---

## 15. Success Metrics

### 15.1 Technical Metrics

#### 15.1.1 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Budget creation time | < 500ms | Time from save tap to UI update |
| Status calculation time | < 100ms per budget | Time to calculate single budget status |
| All statuses refresh | < 2s for 50 budgets | Time to recalculate all active budgets |
| Progress bar render | < 16ms (60fps) | Time to render progress bar component |
| Database query time | < 50ms | Average time for budget queries |

#### 15.1.2 Stability Metrics

| Metric | Target |
|--------|--------|
| Crash rate | < 0.1% of sessions |
| Database migration success | > 99.9% |
| Data integrity | 100% (no data loss) |
| Test coverage | > 80% |

### 15.2 User Metrics

#### 15.2.1 Adoption Metrics

| Metric | Target (Month 1) | Target (Month 3) |
|--------|------------------|------------------|
| Users with ≥1 budget | > 30% | > 50% |
| Budgets per user | > 2 | > 3 |
| Budget checks per week | > 5 | > 10 |

#### 15.2.2 Engagement Metrics

| Metric | Target |
|--------|--------|
| Budget edit rate | > 20% of budgets edited monthly |
| Budget adherence | > 60% of users stay under budget |
| Feature retention | > 70% still using after 1 month |

### 15.3 Quality Metrics

#### 15.3.1 Bug Metrics

| Metric | Target |
|--------|--------|
| Critical bugs | 0 in production |
| High priority bugs | < 2 open at any time |
| Bug resolution time | < 48 hours for critical |
| User-reported issues | < 1% of active users report issues |

#### 15.3.2 User Satisfaction

| Metric | Target |
|--------|--------|
| App Store rating | Maintain ≥ 4.5 stars |
| Budget feature rating | ≥ 4.0 stars (if tracked) |
| Support tickets | < 5% of users contact support |

### 15.4 Monitoring & Alerts

#### 15.4.1 Application Monitoring

```javascript
// Log key events for analytics
const logBudgetEvent = (eventName, properties) => {
  // Analytics implementation
  console.log('Analytics:', eventName, properties);
};

// Track budget creation
logBudgetEvent('budget_created', {
  periodType: budget.periodType,
  currency: budget.currency,
  isRecurring: budget.isRecurring,
});

// Track budget status
logBudgetEvent('budget_exceeded', {
  budgetId: budget.id,
  overBy: Math.abs(status.remaining),
});
```

#### 15.4.2 Error Tracking

```javascript
const logError = (error, context) => {
  console.error('Error:', error.message, context);
  // Send to error tracking service (e.g., Sentry)
};

try {
  await createBudget(budget);
} catch (error) {
  logError(error, { action: 'create_budget', budgetData: budget });
  throw error;
}
```

---

## Appendix

### A. Database Schema Diagram

```
┌──────────────────────────┐
│       categories         │
├──────────────────────────┤
│ id (PK)                  │
│ name                     │
│ type                     │
│ category_type            │
│ parent_id (FK)           │
│ icon                     │
│ color                    │
│ is_shadow                │
│ created_at               │
│ updated_at               │
└──────────┬───────────────┘
           │
           │ 1:N
           │
┌──────────▼───────────────┐
│        budgets           │
├──────────────────────────┤
│ id (PK)                  │
│ category_id (FK) ────────┘
│ amount                   │
│ currency                 │
│ period_type              │
│ start_date               │
│ end_date                 │
│ is_recurring             │
│ rollover_enabled         │
│ created_at               │
│ updated_at               │
└──────────────────────────┘
```

### B. API Reference

See Section 4 for complete API documentation.

### C. i18n Translation Keys

See Section 6 for complete translation list.

### D. Component Props Reference

See Section 6 for component prop interfaces.

### E. Glossary

| Term | Definition |
|------|------------|
| Budget | Spending limit for a category over a time period |
| Period Type | Time span for budget (weekly, monthly, yearly) |
| Recurring | Budget that automatically continues each period |
| Rollover | Carrying unused budget amount to next period |
| Budget Status | Current state of spending vs. budget limit |
| Shadow Category | Hidden category used for system operations |
| Hierarchical Budget | Budget on parent that tracks child spending |

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-27 | Initial technical specification | Claude |

---

**End of Technical Specification**
