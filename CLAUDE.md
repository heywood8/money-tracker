# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Penny is a React Native mobile app built with Expo for tracking personal finances. The app now supports only Android, with features for managing accounts, operations, categories, and viewing graphs. It includes internationalization (English/Russian) and theme support (light/dark/system).

## Development Commands

### Starting Development
**IMPORTANT**: Never run `npm start`, `npm run android`, or similar commands. The developer manages the development server locally.

### Testing
```bash
npm test               # Run Jest tests (if configured)
```

### Architecture

### Folder Structure

The app follows a feature-based organization under the `app/` directory:

- **contexts/** (7 files) - React Context providers for global state management
  - `AccountsContext.js`, `BudgetsContext.js`, `CategoriesContext.js`, `DialogContext.js`
  - `LocalizationContext.js`, `OperationsContext.js`, `ThemeContext.js`

- **screens/** (6 files) - Full-screen components for main navigation
  - `AccountsScreen.js`, `AppInitializer.js`, `CategoriesScreen.js`
  - `GraphsScreen.js`, `LanguageSelectionScreen.js`, `OperationsScreen.js`

- **modals/** (4 files) - Modal dialog components for data entry
  - `BudgetModal.js`, `CategoryModal.js`, `OperationModal.js`, `SettingsModal.js`

- **components/** (8 files) - Reusable UI components
  - `BudgetProgressBar.js`, `Calculator.js`, `ErrorBoundary.js`, `Header.js`
  - `IconPicker.js`, `MaterialDialog.js`, `SimplePicker.js`, `SimpleTabs.js`

- **hooks/** (1 file) - Custom React hooks
  - `useMaterialTheme.js` - Bridges ThemeContext with React Native Paper

- **types/** (1 file) - Type definitions
  - `Account.js` - Account object type definition

- **services/** (9 files) - Business logic and data access layer
  - Database: `AccountsDB.js`, `BudgetsDB.js`, `CategoriesDB.js`, `OperationsDB.js`
  - Utilities: `BackupRestore.js`, `currency.js`, `db.js`, `eventEmitter.js`, `LastAccount.js`

- **db/** (3 files) - Database configuration and schema
  - `schema.js` (replaces `client.js` and `migrate.js` for database operations)

- **defaults/** (2 files) - Default/seed data
  - `defaultAccounts.js`, `defaultCategories.json`

- **utils/** (1 file) - Utility functions
  - `resetDatabase.js`

### Context-Based State Management

The app uses React Context API for global state, with primary contexts that wrap the entire application in App.js:

1. **LocalizationContext** (`app/contexts/LocalizationContext.js`)
   - Manages app language (English/Russian)
   - Loads translations from `assets/i18n.json`
   - Persists language preference to AsyncStorage
   - Provides `t(key)` function for translations

2. **ThemeContext** (`app/contexts/ThemeContext.js`)
   - Manages theme selection: 'light', 'dark', or 'system'
   - Listens to OS appearance changes via `Appearance` API
   - Provides color palette through `colors` object
   - Persists theme preference to AsyncStorage
   - Both themes define colors for: background, surface, primary, text, mutedText, border, selected, altRow, etc.

3. **AccountsContext** (`app/contexts/AccountsContext.js`)
   - Manages financial accounts (CRUD operations)
   - Persists accounts to AsyncStorage with key 'accounts'
   - Each account has: id (uuid), name, balance (string), currency
   - Provides validation function `validateAccount()`
   - Exposes currencies from `assets/currencies.json`

### Navigation Structure

Uses custom tab-based navigation (`app/components/SimpleTabs.js`) instead of react-navigation:
- **Operations**: Financial transactions screen
- **Accounts**: Account management with full CRUD
- **Categories**: Transaction categories screen
- **Graphs**: Financial visualizations screen

Bottom tab bar height is set to 80px with 24px bottom padding.

### Key Components

- **SimpleTabs** (`app/components/SimpleTabs.js`): Main navigation container with custom tab bar
- **Header** (`app/components/Header.js`): Top header with settings icon
- **SettingsModal** (`app/modals/SettingsModal.js`): Modal for theme and language preferences
- **AccountsScreen** (`app/screens/AccountsScreen.js`): Full-featured account management with add/edit/delete

### Data Persistence

**Database Layer** (SQLite):
- SQLite database (`penny.db`)
- Database modules: `db.js`, `AccountsDB.js`, `OperationsDB.js`, `CategoriesDB.js`
- Uses Drizzle ORM for schema management and migrations

**Application Preferences** (AsyncStorage):
- Theme: key `'theme_preference'`
- Language: key `'app_language'`

**Database Services**:
- `app/services/db.js` - SQLite wrapper with transaction support
- `app/services/currency.js` - Precise currency calculations (avoids floating-point errors)

**Data Integrity**:
- Atomic transactions for all multi-step operations
- Foreign key constraints with deletion safeguards
- Precise currency arithmetic using integer cents internally

### Styling Patterns

- Uses `StyleSheet.create` for performance
- Dynamic colors from ThemeContext (`colors` object)
- Platform-specific adjustments via `Platform.OS` (Android only)
- Alternating row colors using `altRow` from theme
- Accessibility props included (accessibilityRole, accessibilityLabel, etc.)

### Assets Structure

- `assets/i18n.json`: Translation strings for en/ru
- `assets/currencies.json`: Currency list for accounts
- `assets/*.png`: App icons and splash screens

### Build Configuration

- Expo managed workflow with EAS
- Bundle identifier: `com.heywood8.monkeep`
- App name: "Penny"
- New Architecture enabled (`newArchEnabled: true`)
- EAS project ID: `89372eb2-93f5-475a-a630-9caa827d8406`

## Development Guidelines (from .github/copilot-instructions.md)

### Code Organization
- Use modular structure separating components, screens, services, contexts
- Keep reusable components in `components/` directory (not yet created)
- Organize assets in `assets/` folder
- Use functional components and React hooks

### State Management
- Use React Context API for global state (already implemented)
- Avoid prop drilling by leveraging contexts

### Styling
- Use `StyleSheet.create` for consistent and performant styles
- Ensure responsive design using `Dimensions`, `PixelRatio`
- Android-only focus: no platform-specific files needed

### Performance
- Use `useMemo` and `useCallback` to optimize re-renders (already used in AccountsContext)
- Avoid anonymous functions in render methods
- Use FlatList for rendering large lists efficiently

### Accessibility
- Include accessibility props (accessibilityRole, accessibilityLabel, accessibilityHint)
- Test with screen readers (TalkBack for Android)

### Security
- Avoid storing sensitive data in plain text
- Use secure storage libraries like `react-native-keychain` for sensitive data
- Validate user inputs to prevent injection attacks

### Testing

The app uses Jest with React Native Testing Library for unit, integration, and regression testing.

**Testing Framework:**
- Jest (`jest`) - Test runner and assertion library
- React Native Testing Library (`@testing-library/react-native`) - Component testing utilities
- `jest-expo` - Expo-specific Jest preset
- `react-test-renderer` - React component rendering for tests

**Test Organization:**
- Tests located in `__tests__/` directory
- Directory structure mirrors app structure: `contexts/`, `services/`, `integration/`, `components/`
- Test files use `.test.js` naming convention
- Setup file at `jest.setup.js` for global mocks and configuration

**Running Tests:**
```bash
npm test                  # Run all tests
npm test -- --watch      # Run in watch mode
npm test -- <pattern>    # Run specific test files matching pattern
```

**Testing Patterns:**

1. **Context Testing** (see `__tests__/contexts/ThemeContext.test.js`):
   - Use `renderHook` from `@testing-library/react-native` to test custom hooks
   - Wrap hooks with their Provider component using `wrapper` pattern
   - Test initialization, state changes, persistence, and cleanup
   - Group related tests with `describe` blocks (Initialization, Behavior, Edge Cases)
   - Use `waitFor` for async state updates
   - Use `act` wrapper for state-changing operations
   - Mock dependencies (AsyncStorage, Appearance API, etc.)
   - Clear mocks and AsyncStorage in `beforeEach`

2. **Service/Utility Testing** (see `__tests__/services/currency.test.js`):
   - Test pure functions with various inputs
   - Include edge cases: zero, negative, empty, invalid inputs
   - Test precision and floating-point accuracy (critical for currency)
   - Add regression tests for known bugs or critical accuracy requirements
   - Group tests by function with `describe` blocks
   - Use descriptive test names explaining what is being tested

3. **Integration Testing** (see `__tests__/integration/AccountManagement.test.js`):
   - Test complete workflows (CRUD cycles, multi-step operations)
   - Mock database layer and track state changes
   - Test concurrent operations and race conditions
   - Verify data integrity across multiple operations
   - Test error handling and recovery
   - Include regression tests for bugs and edge cases

4. **Component Testing** (future - when UI components are tested):
   - Use `render` from `@testing-library/react-native`
   - Test user interactions with `fireEvent` or `userEvent`
   - Verify rendered output with queries: `getByText`, `getByTestId`, etc.
   - Mock contexts using wrapper pattern
   - Test accessibility props and behavior

**Mocking Patterns:**

- **AsyncStorage**: Mocked globally in `jest.setup.js`
- **expo-sqlite**: Mocked with spy functions for DB operations
- **react-native APIs**: Mock Appearance, DateTimePicker, etc. in `jest.setup.js`
- **Third-party libraries**: Mock chart-kit, SVG, gesture-handler in setup file
- **Database services**: Mock in integration tests to control DB behavior
- **UUIDs**: Mock `react-native-uuid` for predictable test IDs

**Best Practices:**

- Clear all mocks in `beforeEach` to ensure test isolation
- Use `waitFor` for async operations, not arbitrary timeouts
- Wrap state updates in `act` to avoid warnings
- Test both happy paths and error cases
- Add regression tests when fixing bugs
- Use descriptive test names: "should do X when Y"
- Group related tests with `describe` blocks
- Test state persistence (AsyncStorage/SQLite operations)
- Mock external dependencies, test internal logic
- Verify cleanup (listeners removed, resources freed)
- Test data type consistency (strings vs numbers, especially for currency)
- For financial calculations, verify precision and avoid floating-point errors

**Common Test Structure:**
```javascript
describe('ComponentOrService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Additional setup
  });

  describe('Feature Group', () => {
    it('does something specific', async () => {
      // Arrange: Set up test data and mocks

      // Act: Perform the operation

      // Assert: Verify the result
    });
  });

  describe('Regression Tests', () => {
    it('handles edge case that caused bug #123', () => {
      // Test specific regression
    });
  });
});
```

**What to Test:**

- Context providers: initialization, state management, persistence
- Services: business logic, calculations, data transformations
- Database operations: CRUD, transactions, error handling
- Integration flows: multi-step user workflows
- Validation functions: all edge cases and error conditions
- Error handling: graceful degradation, error messages
- Concurrent operations: race conditions, state consistency
- Cleanup: resource disposal, listener removal

**What NOT to Test:**

- Implementation details (internal state, private methods)
- External library behavior (assume they work correctly)
- Exact styling or visual appearance (use snapshot tests sparingly)
- Complex integration with native modules (use E2E tests instead)

## Current Implementation Status

**Completed:**
- ✅ Basic app scaffold with Expo
- ✅ Custom tab navigation
- ✅ Theme system (light/dark/system)
- ✅ Internationalization (en/ru)
- ✅ Account management (full CRUD)
- ✅ AsyncStorage persistence
- ✅ Header with settings modal

**Stub/Placeholder Screens:**
- Operations (OperationsScreen.js)
- Categories (CategoriesScreen.js)
- Graphs (GraphsScreen.js)

These screens currently only display the translated screen title and need implementation.
