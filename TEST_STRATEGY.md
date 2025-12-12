# Test Strategy for Penny

This document outlines the comprehensive testing strategy for the Penny application, designed to prevent regressions and ensure critical functionality remains stable across changes.

## Testing Philosophy

Our testing approach prioritizes:
1. **Financial Accuracy** - Currency calculations must be precise and reliable
2. **Data Integrity** - Database operations must be atomic and consistent
3. **User Experience** - Core workflows must function correctly
4. **Stability** - Prevent regressions in existing features

## Test Coverage

### 1. Currency Service Tests (`__tests__/services/currency.test.js`)

**Priority: CRITICAL**

The currency service is the foundation of all financial calculations in the app. These tests ensure:

- **Conversion Accuracy**: `toCents()` and `fromCents()` convert amounts correctly
- **Arithmetic Precision**: `add()`, `subtract()`, `multiply()`, `divide()` avoid floating-point errors
- **Edge Cases**: Zero, negative numbers, and very large amounts
- **Comparison Operations**: Accurate comparison of currency values
- **Input Parsing**: Handling various input formats and invalid data

**Why Critical**: Financial applications cannot tolerate precision errors. A single floating-point error could corrupt balances across the entire app.

**Regression Protection**:
- Prevents accumulation of rounding errors through repeated operations
- Ensures large transaction amounts remain precise
- Maintains precision through complex multi-step calculations

### 2. AccountsDB Tests (`__tests__/services/AccountsDB.test.js`)

**Priority: HIGH**

Database operations must be reliable and maintain data integrity. These tests ensure:

- **CRUD Operations**: Create, read, update, and delete accounts work correctly
- **Atomic Operations**: Balance updates are atomic and use transactions
- **Data Validation**: Invalid data is rejected appropriately
- **Foreign Key Protection**: Cannot delete accounts with associated operations
- **Batch Operations**: Multiple balance updates execute atomically
- **Error Handling**: Database errors are caught and handled gracefully

**Why Important**: Data corruption in the database layer could lead to lost financial records or incorrect balances.

**Regression Protection**:
- Prevents deletion of accounts with existing transactions
- Ensures balance precision through atomic updates
- Maintains timestamp accuracy on updates

### 3. AccountsContext Tests (`__tests__/contexts/AccountsContext.test.js`)

**Priority: HIGH**

The AccountsContext manages the global state for accounts. These tests ensure:

- **Initialization**: Context loads data correctly on startup
- **CRUD Operations**: All context methods work as expected
- **Migration**: First-time data migration executes successfully
- **Default Accounts**: Created when no accounts exist
- **Validation**: Account validation logic catches errors
- **Error Handling**: Alerts shown on errors, operations fail gracefully
- **State Consistency**: State remains consistent across operations

**Why Important**: This context is the primary interface for account management throughout the app.

**Regression Protection**:
- Ensures balance always stored as string (prevents type errors)
- Maintains immutability of state arrays
- Preserves account IDs across updates

### 4. ThemeContext Tests (`__tests__/contexts/ThemeContext.test.js`)

**Priority: MEDIUM**

Theme management affects the entire app's appearance. These tests ensure:

- **Theme Switching**: Light, dark, and system themes work correctly
- **Persistence**: Theme preferences saved to AsyncStorage
- **OS Integration**: System theme follows OS color scheme
- **Color Consistency**: All required color keys present in themes
- **Listener Cleanup**: No memory leaks from OS listeners

**Why Important**: Theme issues could make the app unusable or cause visual glitches.

**Regression Protection**:
- Handles missing OS color scheme gracefully
- Maintains theme consistency after multiple changes
- Prevents memory leaks from appearance listeners

### 5. LocalizationContext Tests (`__tests__/contexts/LocalizationContext.test.js`)

**Priority: MEDIUM**

Internationalization support for English and Russian. These tests ensure:

- **Language Switching**: Users can switch between languages
- **Translation Loading**: Translations load correctly from i18n.json
- **Persistence**: Language preference saved to AsyncStorage
- **Missing Keys**: Gracefully handles missing translations
- **Key Parity**: Same keys exist in all languages

**Why Important**: Broken translations could confuse users or make features unusable.

**Regression Protection**:
- Translations update immediately after language change
- Handles invalid language codes gracefully
- Maintains consistency across rapid language switches

### 6. Integration Tests (`__tests__/integration/AccountManagement.test.js`)

**Priority: HIGH**

End-to-end tests for critical user workflows. These tests ensure:

- **Complete CRUD Workflow**: Full account lifecycle works correctly
- **Data Integrity**: State remains consistent through multiple operations
- **Validation**: Input validation prevents invalid data
- **Error Handling**: Graceful degradation on errors
- **Concurrent Operations**: Multiple operations can execute simultaneously
- **Reload Functionality**: Data can be reloaded from database
- **State Consistency**: Correct ordering and IDs maintained

**Why Important**: Integration tests catch issues that unit tests might miss by testing the full system.

**Regression Protection**:
- Prevents duplicate account IDs
- Ensures balance type consistency
- Maintains correct account ordering after deletions

## Test Organization

```
__tests__/
├── App.test.js                           # Basic app rendering test
├── services/
│   ├── currency.test.js                  # Currency calculations (CRITICAL)
│   └── AccountsDB.test.js                # Database operations
├── contexts/
│   ├── AccountsContext.test.js           # Account state management
│   ├── ThemeContext.test.js              # Theme management
│   └── LocalizationContext.test.js       # Internationalization
└── integration/
    └── AccountManagement.test.js         # Full workflow tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- currency.test.js

# Run with coverage
npm test -- --coverage
```

## Test Infrastructure

### Mocks (configured in `jest.setup.js`)
- **AsyncStorage**: Mocked for persistence testing
- **expo-sqlite**: Mocked for database operations
- **Appearance API**: Controlled theme testing
- **Alert**: Captured for error testing
- **Note**: IDs use autoincrement integers (no UUID generation in current codebase)

### Testing Libraries
- **Jest**: Test runner and assertion library
- **@testing-library/react-native**: Component and hook testing
- **jest-expo**: Expo-specific Jest configuration

## Coverage Goals

### Current Coverage by Priority

**CRITICAL (Must be 100%)**:
- ✅ Currency service - All arithmetic operations
- ✅ AccountsDB - All CRUD and atomic operations

**HIGH (Target: 90%+)**:
- ✅ AccountsContext - State management and lifecycle
- ✅ Integration tests - Core user workflows

**MEDIUM (Target: 80%+)**:
- ✅ ThemeContext - Theme switching and persistence
- ✅ LocalizationContext - Language switching and translations

**Future Coverage**:
- OperationsDB - Transaction database operations
- CategoriesDB - Category database operations
- Migration service - Data migration logic
- UI Components - AccountsScreen, SettingsModal, etc.

## Regression Test Guidelines

When adding new features or making changes:

1. **Before Changes**: Run full test suite to establish baseline
2. **After Changes**: Verify all existing tests still pass
3. **Add New Tests**: Write tests for new functionality
4. **Update Tests**: Modify tests if intentional behavior changes
5. **Document Changes**: Update this file if test strategy changes

## Known Gaps and Future Improvements

### High Priority
- [ ] Migration service tests (data migration logic)
- [ ] OperationsDB tests (transaction operations)
- [ ] CategoriesDB tests (category operations)

### Medium Priority
- [ ] OperationsContext tests (transaction state management)
- [ ] CategoriesContext tests (category state management)
- [ ] Database layer tests (both SQLite and IndexedDB variants)

### Low Priority
- [ ] Component snapshot tests (AccountsScreen, etc.)
- [ ] UI interaction tests (button clicks, form submissions)
- [ ] Navigation tests (tab switching, screen transitions)
- [ ] E2E tests (full user journeys across multiple screens)

## Debugging Failed Tests

### Common Issues

1. **AsyncStorage not cleared**: Tests may fail if previous test data persists
   - Solution: Ensure `AsyncStorage.clear()` in `beforeEach`

2. **Mock not reset**: Mocks retain state between tests
   - Solution: Call `jest.clearAllMocks()` in `beforeEach`

3. **Async timing issues**: State updates may not complete
   - Solution: Use `waitFor()` from testing-library

4. **UUID collisions**: Predictable UUIDs may collide
   - Solution: Reset UUID counter in `beforeEach`

### Debugging Commands

```bash
# Run single test with verbose output
npm test -- currency.test.js --verbose

# Run with debug info
npm test -- --debug

# Update snapshots
npm test -- -u
```

## CI/CD Integration

Tests run automatically on:
- Pull requests to main branch
- Commits to main branch
- Manual workflow dispatch

**GitHub Actions Workflow**: `.github/workflows/test.yml`

## Contributing

When adding tests:
1. Follow existing test structure and naming conventions
2. Include descriptive test names that explain what is being tested
3. Group related tests using `describe` blocks
4. Add regression tests for any bugs discovered
5. Update this document if adding new test categories

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Testing Best Practices](https://testingjavascript.com/)
