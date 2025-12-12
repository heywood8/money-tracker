# App Folder Structure

This document explains the organization of the `app/` directory and where different types of files should be placed.

## Folder Overview

```
app/
├── contexts/     # React Context providers for global state
├── screens/      # Full-screen components for main navigation
├── modals/       # Modal dialog components for data entry
├── navigation/   # Navigation components and routing
├── components/   # Reusable UI components
├── hooks/        # Custom React hooks
├── services/     # Business logic and data access layer
├── db/           # Database configuration and schema
├── defaults/     # Default/seed data
└── utils/        # Utility functions
```

## Directory Details

### contexts/ (7 files)

**Purpose:** React Context providers for global state management

**What goes here:**
- Context providers that wrap the app or large sections
- Custom hooks that consume these contexts (e.g., `useTheme`, `useAccounts`)
- State management for cross-cutting concerns

**Files:**
- `AccountsContext.js` - Financial accounts state
- `BudgetsContext.js` - Budget management state
- `CategoriesContext.js` - Transaction categories state
- `DialogContext.js` - Global dialog/alert management
- `LocalizationContext.js` - i18n and language state
- `OperationsContext.js` - Financial operations/transactions state
- `ThemeContext.js` - Theme (light/dark/system) state

**Guidelines:**
- Each context should export a Provider component and a custom hook (e.g., `useAccounts`)
- Keep contexts focused on a single domain
- Handle data persistence (AsyncStorage, SQLite) within contexts
- Use services/ for complex business logic

---

### screens/ (6 files)

**Purpose:** Full-screen components that represent main navigation destinations

**What goes here:**
- Screen components rendered by navigation
- Top-level views shown in tabs or stack navigation
- Initialization and setup screens

**Files:**
- `AccountsScreen.js` - Account management screen
- `AppInitializer.js` - App initialization and first-run setup
- `CategoriesScreen.js` - Category management screen
- `GraphsScreen.js` - Financial visualizations/charts screen
- `LanguageSelectionScreen.js` - Language selection during onboarding
- `OperationsScreen.js` - Financial operations/transactions screen

**Guidelines:**
- One file per screen
- Screens should use contexts for state, not manage complex state locally
- Break complex screens into smaller components/ if needed
- Keep business logic in services/, not in screens

---

### modals/ (4 files)

**Purpose:** Modal dialog components for data entry and editing

**What goes here:**
- Full-screen or overlay modals
- Forms for creating/editing entities
- Modal-based user interactions

**Files:**
- `BudgetModal.js` - Add/edit budget modal
- `CategoryModal.js` - Add/edit category modal
- `OperationModal.js` - Add/edit financial operation modal
- `SettingsModal.js` - App settings modal (theme, language, backup/restore)

**Guidelines:**
- Accept `visible` and `onClose` props
- Handle their own form state
- Use contexts to persist data
- Can be reused across multiple screens

---

### navigation/ (1 file)

**Purpose:** Navigation components and routing logic

**What goes here:**
- Tab navigation containers
- Stack navigators
- Navigation configuration
- Route definitions

**Files:**
- `SimpleTabs.js` - Main tab navigation container

**Guidelines:**
- Navigation components may import screens (this is expected)
- Keep navigation logic separate from reusable UI components
- Follow React Navigation patterns where applicable
- Document tab/route configurations clearly

**Architectural Note:**
SimpleTabs was moved here from `components/` to resolve a circular dependency. Navigation components are architecturally special - they need to know about screens, which is a backwards dependency for regular components but expected for navigation.

---

### components/ (7 files)

**Purpose:** Reusable UI components used across the app

**What goes here:**
- Shared/reusable components used in multiple places
- Complex UI widgets
- Generic form components
- Presentational components

**Files:**
- `BudgetProgressBar.js` - Budget progress visualization
- `Calculator.js` - Calculator widget for amount entry
- `ErrorBoundary.js` - React error boundary wrapper
- `Header.js` - Top header with settings icon
- `IconPicker.js` - Icon selection component
- `MaterialDialog.js` - Material Design dialog/alert component
- `SimplePicker.js` - Custom picker component

**Guidelines:**
- Components should be pure/presentational when possible
- Accept data via props, not contexts (unless truly needed everywhere)
- Components should NOT import screens (use navigation/ for that)
- Use TypeScript-style prop documentation
- Keep components small and focused

---

### hooks/ (1 file)

**Purpose:** Custom React hooks that don't belong to a specific context

**What goes here:**
- Reusable custom hooks
- Utility hooks that compose other hooks
- Side-effect management hooks

**Files:**
- `useMaterialTheme.js` - Bridges ThemeContext with React Native Paper theme

**Guidelines:**
- Hooks should be pure functions
- Name hooks with `use` prefix
- Document hook parameters and return values
- Avoid complex business logic (use services/ instead)

---

### services/ (10 files)

**Purpose:** Business logic and data access layer

**What goes here:**
- Database operations (CRUD)
- Business logic and calculations
- API calls (if any)
- Complex data transformations
- Utility services

**Files:**

**Database Services:**
- `AccountsDB.js` - Account database operations
- `BudgetsDB.js` - Budget database operations
- `CategoriesDB.js` - Category database operations
- `OperationsDB.js` - Operation database operations
- `db.js` - SQLite database wrapper

**Utility Services:**
- `BackupRestore.js` - Backup and restore functionality
- `currency.js` - Currency formatting and calculations
- `eventEmitter.js` - Event system for cross-component communication
- `LastAccount.js` - Tracks last accessed account

**Guidelines:**
- Keep services focused on a single domain
- Export functions, not classes (prefer functional style)
- Handle errors gracefully
- Use transactions for multi-step database operations
- Document function parameters and return values

---

### db/ (2 files)

**Purpose:** Database configuration, schema, and Drizzle ORM setup

**What goes here:**
- Database schema definitions using Drizzle ORM
- Drizzle migration utilities
- Database configuration

**Files:**
- `client.js` - Database client initialization
- `migrate.js` - Drizzle migration utilities
- `schema.js` - Drizzle table definitions

**Guidelines:**
- Keep schema definitions centralized
- Use Drizzle migrations for schema changes
- Document table structures
- Follow Drizzle ORM best practices

**Note:** Database client initialization is handled in `services/db.js`

---

### defaults/ (2 files)

**Purpose:** Default/seed data for initial app setup

**What goes here:**
- Default data loaded on first run
- Seed data for development/testing
- Initial configuration

**Files:**
- `defaultAccounts.js` - Default account seed data
- `defaultCategories.json` - Default category definitions

**Guidelines:**
- Use JSON for static data
- Use JS for data that needs computation
- Keep seed data minimal
- Document default values

---

### utils/ (1 file)

**Purpose:** Utility functions and helpers

**What goes here:**
- General-purpose utility functions
- Helpers that don't fit other categories
- Pure functions for common tasks

**Files:**
- `resetDatabase.js` - Database reset utility

**Guidelines:**
- Keep utilities pure and stateless
- One utility per file (or group related utilities)
- Document function purpose and parameters
- Write unit tests for utilities

---

## File Naming Conventions

- **PascalCase** for components, screens, modals, contexts: `AccountsScreen.js`, `ThemeContext.js`
- **camelCase** for services, utilities, hooks: `currency.js`, `useMaterialTheme.js`
- **kebab-case** for config files: `default-categories.json`

## Import Guidelines

### Importing from Same Folder
```javascript
import Something from './Something';
```

### Importing from Sibling Folders
```javascript
import { useTheme } from '../contexts/ThemeContext';
import AccountModal from '../modals/AccountModal';
import SimpleTabs from '../navigation/SimpleTabs';
import { formatCurrency } from '../services/currency';
```

### Importing from Assets
```javascript
// From screens/, modals/, contexts/ - need extra ../
import currencies from '../../assets/currencies.json';
```

## When to Create a New File

### Create a new **component** when:
- A piece of UI is used in multiple screens/modals
- A component becomes too complex (>200 lines)
- You need to test a UI element in isolation

### Create a new **screen** when:
- Adding a new navigation destination
- Adding a new tab or stack screen
- Creating a new full-screen view

### Create a new **modal** when:
- Creating a form for data entry/editing
- Adding an overlay or popup
- Creating a settings/configuration dialog

### Create a new **context** when:
- Adding a new global state domain
- Managing app-wide configuration
- Sharing state between unrelated components

### Create a new **service** when:
- Adding a new data entity (with CRUD operations)
- Implementing complex business logic
- Creating reusable data transformations

### Create a new **hook** when:
- Composing multiple hooks into one
- Creating reusable side-effect logic
- Abstracting common patterns

## Common Patterns

### Context + Service Pattern
```javascript
// contexts/ThingsContext.js
import * as ThingsDB from '../services/ThingsDB';

export const ThingsProvider = ({ children }) => {
  const [things, setThings] = useState([]);

  const addThing = async (thing) => {
    await ThingsDB.createThing(thing);
    setThings(await ThingsDB.getAllThings());
  };

  return (
    <ThingsContext.Provider value={{ things, addThing }}>
      {children}
    </ThingsContext.Provider>
  );
};
```

### Screen + Modal Pattern
```javascript
// screens/ThingsScreen.js
import ThingModal from '../modals/ThingModal';
import { useThings } from '../contexts/ThingsContext';

export default function ThingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { things } = useThings();

  return (
    <>
      <FlatList data={things} />
      <ThingModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}
```

## Migration Notes

This folder structure was created in December 2024 to improve code organization. Previously, all files were in the `app/` root directory. The reorganization:

- ✅ Moved 25 files to organized folders
- ✅ Deleted 2 legacy files
- ✅ Updated 100+ import statements
- ✅ Preserved git history using `git mv`
- ✅ All tests pass (184 tests)

For the complete refactoring details, see the git history starting from commit `78fd845`.
