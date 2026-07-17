# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Conventions for Git

**Write all git commit messages and pull request descriptions in English only.** Never use Russian (or any other language) in commit messages or PR titles/descriptions, regardless of the language used in conversation.

## Project Overview

Penny is a React Native mobile app built with Expo for tracking personal finances. The app targets Android, with features for managing accounts, operations, categories, planned operations, budgets, and viewing graphs. It includes internationalization (11 languages: English, Italian, Russian, Spanish, French, Chinese, German, Armenian, Japanese, Korean, Portuguese) and theme support (light/dark/system). Supports backup/restore (JSON, CSV, SQLite) and Google Sheets export via native Google Sign-In.

## Documentation Verification with context7

Before proposing any approach that involves a third-party library, Expo API, or React Native module, **use context7 to verify the approach against current documentation**:

1. Call `mcp__plugin_context7_context7__resolve-library-id` with the library name and a query describing what you're trying to do
2. Call `mcp__plugin_context7_context7__query-docs` with the returned library ID and a specific question
3. Let the docs inform your design — training data goes stale, docs don't

This applies especially to: Expo SDK APIs, navigation libraries, auth libraries, database drivers, and any library with a track record of breaking changes between major versions.

## Development Commands

### Testing
```bash
npm test               # Run Jest tests (if configured)
```

### Architecture

### Folder Structure

The app follows a feature-based organization under the `app/` directory:

- **contexts/** (19 files) - React Context providers for global state management
  - Theme: `ThemeContext.js`, `ThemeColorsContext.js`, `ThemeConfigContext.js`
  - Accounts: `AccountsContext.js`, `AccountsDataContext.js`, `AccountsActionsContext.js`
  - Operations: `OperationsContext.js`, `OperationsDataContext.js`, `OperationsActionsContext.js`
  - Other: `BudgetsContext.js`, `CategoriesContext.js`, `DialogContext.js`, `LocalizationContext.js`
  - `PlannedOperationsContext.js`, `SearchContext.js`, `DisplaySettingsContext.js`
  - `AppBlurContext.js`, `ImportProgressContext.js`, `UpdateDownloadContext.js`

- **screens/** (7 files) - Full-screen components for main navigation
  - `AccountsScreen.js`, `AppInitializer.js`, `CategoriesScreen.js`
  - `GraphsScreen.js`, `LanguageSelectionScreen.js`, `OperationsScreen.js`
  - `PlannedOperationsScreen.js`

- **modals/** (6 files) - Modal dialog components for data entry
  - `BudgetModal.js`, `CategoryModal.js`, `OperationModal.js`, `SettingsModal.js`
  - `PlannedOperationModal.js`, `ImportProgressModal.js`

- **components/** (40+ files across subdirectories) - Reusable UI components
  - Root: `BudgetProgressBar.js`, `Calculator.js`, `ErrorBoundary.js`, `Header.js`
  - Root: `IconPicker.js`, `MaterialDialog.js`, `SimplePicker.js`, `FormInput.js`
  - Root: `AddFAB.js`, `DescriptionAutocomplete.js`, `EmptyState.js`, `ListCard.js`
  - Root: `LoadingView.js`, `ModalBlurOverlay.js`, `ModalHeader.js`
  - **components/operations/**: `OperationsList.js`, `OperationListItem.js`, `OperationFormFields.js`
    - `QuickAddForm.js`, `SplitOperationModal.js`, `PickerModal.js`, `DateSeparator.js`, `DescriptionSuggestionRow.js`
  - **components/search/**: `SearchBar.js`, `SearchOverlay.js`, `ExpandableFilters.js`, `FilterBadge.js`, `FilterChipStrip.js`
  - **components/graphs/**: `ExpenseSummaryCard.js`, `IncomeSummaryCard.js`, `ExpensePieChart.js`, `IncomePieChart.js`
    - `CategorySpendingCard.js`, `SpendingPredictionCard.js`, `BalanceHistoryCard.js`, `BalanceHistoryModal.js`
    - `ChartModal.js`, `CustomLegend.js`
  - **components/modals/**: `MultiCurrencyFields.js`
  - **components/accounts/**: account-specific components

- **navigation/** (1 file) - Navigation container
  - `SimpleTabs.js` - Custom tab-based navigation

- **hooks/** (10 files) - Custom React hooks
  - `useMaterialTheme.js`, `useOperationForm.js`, `useOperationPicker.js`
  - `useQuickAddForm.js`, `useMultiCurrencyTransfer.js`, `useExpenseData.js`
  - `useIncomeData.js`, `useBalanceHistory.js`, `useCategoryMonthlySpending.js`
  - `useLogEntries.js`

- **services/** (18 files) - Business logic and data access layer
  - Database: `AccountsDB.js`, `BudgetsDB.js`, `CategoriesDB.js`, `OperationsDB.js`
  - Database: `PlannedOperationsDB.js`, `BalanceHistoryDB.js`, `PreferencesDB.js`
  - Utilities: `BackupRestore.js`, `currency.js`, `db.js`, `eventEmitter.js`, `LastAccount.js`
  - Features: `GoogleSheetsService.js`, `DailyBackupService.js`, `AppUpdateService.js`
  - Logging: `LogService.js`, `LogsFile.js`
  - Monitoring: `sentry.js` - Privacy-protective crash/error reporting (Sentry)

- **db/** (1 file) - Database schema
  - `schema.js` - Drizzle ORM schema (tables: accounts, categories, operations, budgets, plannedOperations, balanceHistory, appMetadata)

- **defaults/** (2 files) - Default/seed data
  - `defaultAccounts.js`, `defaultOperations.js`

- **utils/** (4 files) - Utility functions
  - `resetDatabase.js`, `emergencyReset.js`, `categoryUtils.js`, `calculatorUtils.js`

- **styles/** (2 files) - Shared style definitions
  - `designTokens.js`, `layout.js`

### Context-Based State Management

The app uses React Context API for global state, with primary contexts that wrap the entire application in App.js:

1. **LocalizationContext** (`app/contexts/LocalizationContext.js`)
   - Manages app language (11 supported languages: en, it, ru, es, fr, zh, de, hy, ja, ko, pt)
   - Loads translations from separate files in `assets/i18n/` directory (one file per language)
   - Persists language preference to database (PreferencesDB)
   - Provides `t(key)` function for translations

2. **ThemeContext / ThemeColorsContext / ThemeConfigContext** (split across 3 files)
   - `ThemeContext.js` - Manages theme selection: 'light', 'dark', or 'system'
   - `ThemeColorsContext.js` - Provides the resolved color palette
   - `ThemeConfigContext.js` - Configuration and persistence (AsyncStorage)
   - Listens to OS appearance changes via `Appearance` API
   - Colors include: background, surface, primary, text, mutedText, border, selected, altRow, etc.

3. **AccountsContext / AccountsDataContext / AccountsActionsContext** (split across 3 files)
   - Manages financial accounts with CRUD operations
   - Each account has: id (uuid), name, balance (string), currency
   - Provides validation via `validateAccount()`
   - Exposes currencies from `assets/currencies.json`

4. **OperationsContext / OperationsDataContext / OperationsActionsContext** (split across 3 files)
   - Manages financial transactions with full CRUD and filtering
   - `SearchContext.js` provides search/filter state across operations

5. **Other Contexts**
   - `BudgetsContext.js` - Budget management
   - `CategoriesContext.js` - Category management
   - `PlannedOperationsContext.js` - Recurring/planned transactions
   - `DialogContext.js` - Global dialog/alert system
   - `DisplaySettingsContext.js` - UI preferences (e.g., hide balances)
   - `AppBlurContext.js` - Blur overlay state for security
   - `ImportProgressContext.js` - Import progress tracking
   - `UpdateDownloadContext.js` - App update download state

### Navigation Structure

Uses custom tab-based navigation (`app/navigation/SimpleTabs.js`) instead of react-navigation:
- **Operations**: Financial transactions with search, filtering, quick-add, split operations
- **Accounts**: Account management with full CRUD and multi-currency transfers
- **Categories**: Transaction categories screen
- **Graphs**: Financial visualizations (expense/income pie charts, balance history, spending prediction)
- **Planned**: Planned/recurring operations screen

Bottom tab bar height is set to 80px with 24px bottom padding.

### Key Components

- **SimpleTabs** (`app/navigation/SimpleTabs.js`): Main navigation container with custom tab bar
- **Header** (`app/components/Header.js`): Top header with settings icon and search integration
- **SettingsModal** (`app/modals/SettingsModal.js`): Settings hub - theme, language, backup/restore, Google Sheets export, logs, app updates
- **AccountsScreen** (`app/screens/AccountsScreen.js`): Full-featured account management with add/edit/delete
- **OperationsScreen** (`app/screens/OperationsScreen.js`): Full transaction management with search, filters, quick-add
- **GraphsScreen** (`app/screens/GraphsScreen.js`): Financial visualizations with multiple chart types

### Data Persistence

**Database Layer** (SQLite via Drizzle ORM):
- SQLite database (`penny.db`)
- Schema defined in `app/db/schema.js` - tables: accounts, categories, operations, budgets, plannedOperations, balanceHistory, appMetadata
- Migrations managed by Drizzle Kit in `drizzle/` directory
- DB modules: `AccountsDB.js`, `BudgetsDB.js`, `CategoriesDB.js`, `OperationsDB.js`, `PlannedOperationsDB.js`, `BalanceHistoryDB.js`, `PreferencesDB.js`

**Application Preferences** (PreferencesDB via SQLite):
- Language, theme, Google Sheets spreadsheet ID, and other preferences are stored in the `appMetadata` table via `PreferencesDB.js`
- Theme also persists to AsyncStorage as a fast-read fallback

**Database Services**:
- `app/services/db.js` - SQLite wrapper with transaction support
- `app/services/currency.js` - Precise currency calculations using `decimal.js` (avoids floating-point errors)
- `app/services/GoogleSheetsService.js` - Google Sheets export via native `@react-native-google-signin/google-signin` and Sheets REST API
- `app/services/DailyBackupService.js` - Automatic daily/weekly backup management
- `app/services/BackupRestore.js` - Import/export in JSON, CSV, SQLite formats

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

- `assets/i18n/`: Translation files, one per language (en.json, it.json, ru.json, es.json, fr.json, zh.json, de.json, hy.json, ja.json, ko.json, pt.json)
- `assets/currencies.json`: Currency list for accounts
- `assets/*.png`: App icons and splash screens

### Build Configuration

- Expo managed workflow with EAS
- Bundle identifier: `com.heywood8.monkeep`
- App name: "Penny"
- New Architecture enabled (`newArchEnabled: true`)
- EAS project ID: `89372eb2-93f5-475a-a630-9caa827d8406`

#### EAS Build & CI/CD

**Gradle Properties Configuration:**

The project uses an Expo config plugin (`plugins/withR8Config.js`) to configure Gradle properties for both local and CI/CD builds. The `android/` folder is gitignored (managed workflow), so **all Gradle configuration must be done through config plugins**.

**Important:** Do NOT create or use `eas-build-gradle.properties` or similar files - they are not part of the EAS Build process. The proper way to configure Gradle is through:

1. **Expo Config Plugin** - `plugins/withR8Config.js` (using `withGradleProperties`)
2. **expo-build-properties** plugin (for SDK-level settings)

**Memory Configuration:**

The `withR8Config.js` plugin sets Gradle JVM memory limits optimized for GitHub Actions runners:

```javascript
'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -XX:+UseG1GC'
```

- **4GB heap + 1GB Metaspace = 5GB total**
- GitHub Actions runners have 7GB RAM, leaving 2GB for OS, Node.js, and EAS CLI
- Previous configuration (6GB+2GB=8GB) caused builds to hang due to memory pressure

**Build Workflows:**

- `.github/workflows/build-release-apk.yml` - Local APK builds with EAS (`--local`)
- `.github/workflows/eas-build-android.yml` - Cloud builds with EAS

**Local Builds on CI:**

When using `eas build --local` in CI:
- ✅ DO wait for build completion (no `--no-wait` flag)
- ✅ DO set appropriate memory limits for the runner
- ❌ DO NOT use `--no-wait` with `--local` (meaningless for synchronous local builds)

**Troubleshooting Build Hangs:**

If builds hang on GitHub Actions:
1. Check Gradle memory settings in `plugins/withR8Config.js`
2. Verify runner has enough RAM (GitHub Actions standard: 7GB)
3. Look for OOM errors in build logs
4. Consider reducing parallel builds or caching if memory-constrained

**Reference Documentation:**
- See `docs/R8_CICD_SETUP.md` for complete R8/ProGuard configuration
- [EAS Build Local Builds](https://docs.expo.dev/build-reference/local-builds/)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)

## Development Guidelines (from .github/copilot-instructions.md)

### Code Organization
- Use modular structure separating components, screens, services, contexts
- Keep reusable components in `components/` directory, organized into feature subdirectories (operations/, search/, graphs/, accounts/, modals/)
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

### Modal Sub-Navigation: Subpanel Pattern

**Rule: never open a new modal for secondary views inside an existing modal. Use the subpanel pattern instead.**

`SettingsModal` is the reference implementation. When a settings row leads to a secondary view (language picker, export options, confirmation, logs, etc.), that view slides in over the main settings list within the same modal — no `showDialog`, no nested `Modal`, no extra screen.

**Core pattern:**

```javascript
// State
const [activeSubPanel, setActiveSubPanel] = useState(null); // null | 'language' | 'export' | ...
const settingsAnim = useRef(new Animated.Value(0)).current;  // main list: 0=visible, 1=dimmed/shifted
const subPanelAnim = useRef(new Animated.Value(0)).current;  // subpanel: 0=hidden, 1=visible

const openSubPanel = useCallback((panel) => {
  setActiveSubPanel(panel);
  Animated.parallel([
    Animated.timing(settingsAnim, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    Animated.timing(subPanelAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
  ]).start();
}, [settingsAnim, subPanelAnim]);

const closeSubPanel = useCallback(() => {
  Animated.parallel([
    Animated.timing(subPanelAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    Animated.timing(settingsAnim, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
  ]).start(() => setActiveSubPanel(null));
}, [settingsAnim, subPanelAnim]);

// JSX — single Animated.View, conditionally mounted
{activeSubPanel && (
  <Animated.View style={[styles.subPanelContent, { transform: [{ translateX: subPanelTranslateX }], opacity: subPanelOpacity }]}>
    {/* header with back arrow */}
    {activeSubPanel === 'language' && <LanguageContent />}
    {activeSubPanel === 'export' && <ExportContent />}
    {/* ... */}
  </Animated.View>
)}
```

**Easing conventions:**
- Exit (main list fades/slides away): `Easing.in(Easing.quad)`, 200ms
- Entry (subpanel slides in): `Easing.out(Easing.cubic)`, 260ms
- Reverse on close: 180ms exit for subpanel, 240ms entry for main list

**Critical: never use `Animated.delay` or `Animated.sequence` with `useNativeDriver: true`.** The delay node does not propagate `useNativeDriver`, breaking native-thread transform animations. Use asymmetric durations inside `Animated.parallel` to achieve visual stagger without a delay node.

**Conditional mount vs always-in-tree:** Mount the `Animated.View` only when `activeSubPanel !== null`. An always-mounted view with `opacity: 0` conflicts with the animated value and causes the panel to appear without sliding.

**Confirmation flows (destructive actions):** Use a centered layout inside the subpanel — warning icon + message text + destructive button. The back arrow serves as cancel; no separate cancel button needed.

**Long async operations (e.g. Google Sheets export):** Keep the subpanel open during the async work. Show an `ActivityIndicator` inline on the triggering row. On success, show inline feedback (green checkmark, "Open" button) on the same row. On error, show inline error text. Never close the subpanel silently while work is in-flight.

**Share-sheet exports (Expo `Sharing.shareAsync`):** Do not show a success dialog — the share sheet is the user feedback. `shareAsync` resolves when the sheet is dismissed with no cancel signal, so you cannot distinguish cancel from success.

**Log/chat-style lists:** Use `FlatList` with `inverted={true}` and `data={entries.slice().reverse()}`. Newest entry is always item[0], shown at the bottom automatically — no `scrollToEnd` calls needed, and no mount cost from rendering all entries at once.

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

**IMPORTANT: When running tests as an AI agent, always use the silent/quiet mode to reduce token usage:**
```bash
npm test -- --silent     # Only show test failures, not passing tests
```
This minimizes output and focuses on what needs attention.

**CRITICAL: Test Quality Requirements**

**All tests must be 100% passing before any code changes are committed or considered complete.**

When working on this codebase, you MUST:

1. **Run tests before making changes** - Verify the test suite is passing before you begin
2. **Run tests during development** - Test frequently as you make changes to catch issues early
3. **Run tests before committing** - All tests must pass before creating any commit
4. **Fix broken tests immediately** - If your changes break existing tests, fix them before proceeding
5. **Add tests for new functionality** - New features and bug fixes should include appropriate test coverage
6. **Never commit failing tests** - Under no circumstances should code be committed with failing tests
7. **Investigate test failures thoroughly** - Understand why a test failed; don't skip or disable tests without excellent reason

**Test failures are blockers.** If tests are failing:
- Stop and investigate the root cause
- Fix the underlying issue (don't modify tests to pass without fixing the actual problem)
- Only proceed when all tests pass
- If a test is genuinely incorrect, fix the test AND document why in your commit message

**Before pushing to remote:**
```bash
npm test  # Must show all tests passing (0 failed)
```

If tests fail, DO NOT push. Fix the failures first.

### Code Review Before a Pull Request

**After implementing a feature and passing tests, run a code review of the change before opening the pull request.** Invoke the `/code-review` skill on the working diff (default effort, or `high`/`max` for larger or riskier changes), address the findings it surfaces (fix them, or consciously decide they're not worth acting on), then open the PR. This is a required step in the feature workflow: implement → tests green → `/code-review` → PR. Do not skip it for non-trivial feature work.

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

4. **Component Testing** (see `__tests__/components/`):
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
- ✅ Custom tab navigation (5 tabs: Operations, Accounts, Categories, Graphs, Planned)
- ✅ Theme system (light/dark/system)
- ✅ Internationalization (11 languages)
- ✅ Account management (full CRUD, multi-currency transfers)
- ✅ Operations management (full CRUD, search, filtering, quick-add, split operations)
- ✅ Categories management (full CRUD)
- ✅ Budgets (budget tracking with progress bars)
- ✅ Planned/recurring operations
- ✅ Graphs (expense/income pie charts, balance history, spending prediction, category spending)
- ✅ Backup/restore (JSON, CSV, SQLite formats)
- ✅ Google Sheets export (via native Google Sign-In)
- ✅ Daily/weekly automatic backups
- ✅ App update checking and download
- ✅ Display settings (hide balances)
- ✅ Developer tools (logs viewer, emergency reset)
- ✅ SQLite persistence via Drizzle ORM
- ✅ Comprehensive test suite (80+ test files)
