# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Penny is a React Native mobile app built with Expo for tracking personal finances. The app supports iOS and Android platforms with features for managing accounts, operations, categories, and viewing graphs. It includes internationalization (English/Russian) and theme support (light/dark/system).

## Development Commands

### Starting Development
```bash
npm start              # Start Expo development server
npm run android        # Run on Android emulator/device
npm run ios            # Run on iOS simulator/device
```

### Testing
```bash
npm test               # Run Jest tests (if configured)
```

## Architecture

### Context-Based State Management

The app uses React Context API for global state, with three primary contexts that wrap the entire application in App.js:

1. **LocalizationContext** (`app/LocalizationContext.js`)
   - Manages app language (English/Russian)
   - Loads translations from `assets/i18n.json`
   - Persists language preference to AsyncStorage
   - Provides `t(key)` function for translations

2. **ThemeContext** (`app/ThemeContext.js`)
   - Manages theme selection: 'light', 'dark', or 'system'
   - Listens to OS appearance changes via `Appearance` API
   - Provides color palette through `colors` object
   - Persists theme preference to AsyncStorage
   - Both themes define colors for: background, surface, primary, text, mutedText, border, selected, altRow, etc.

3. **AccountsContext** (`app/AccountsContext.js`)
   - Manages financial accounts (CRUD operations)
   - Persists accounts to AsyncStorage with key 'accounts'
   - Each account has: id (uuid), name, balance (string), currency
   - Provides validation function `validateAccount()`
   - Exposes currencies from `assets/currencies.json`

### Navigation Structure

Uses custom tab-based navigation (SimpleTabs.js) instead of react-navigation:
- **Operations**: Financial transactions (stub screen)
- **Accounts**: Account management with full CRUD
- **Categories**: Transaction categories (stub screen)
- **Graphs**: Financial visualizations (stub screen)

Bottom tab bar height is set to 80px with 24px bottom padding.

### Key Components

- **SimpleTabs** (`app/SimpleTabs.js`): Main navigation container with custom tab bar
- **Header** (`app/Header.js`): Top header with settings icon
- **SettingsModal** (`app/SettingsModal.js`): Modal for theme and language preferences
- **AccountsScreen** (`app/AccountsScreen.js`): Full-featured account management with add/edit/delete
- **Account** (`app/Account.js`): Individual account list item component

### Data Persistence

**Database Layer** (SQLite):
- SQLite database (`penny.db`)
- Database modules: `db.js`, `AccountsDB.js`, `OperationsDB.js`, `CategoriesDB.js`
- Automatic migration from AsyncStorage on first run

**Application Preferences** (AsyncStorage):
- Theme: key `'theme_preference'`
- Language: key `'app_language'`
- Migration backup: key `'migration_backup'`

**Database Services**:
- `app/services/db.js` - SQLite wrapper with transaction support
- `app/services/currency.js` - Precise currency calculations (avoids floating-point errors)
- `app/services/migration.js` - AsyncStorage to SQLite migration with rollback support

**Data Integrity**:
- Atomic transactions for all multi-step operations
- Foreign key constraints with deletion safeguards
- Precise currency arithmetic using integer cents internally
- Automatic migration rollback on failure

### Styling Patterns

- Uses `StyleSheet.create` for performance
- Dynamic colors from ThemeContext (`colors` object)
- Platform-specific adjustments via `Platform.OS`
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
- Keep platform-specific styles in separate files when needed (e.g., `Component.ios.js`)

### Performance
- Use `useMemo` and `useCallback` to optimize re-renders (already used in AccountsContext)
- Avoid anonymous functions in render methods
- Use FlatList for rendering large lists efficiently

### Accessibility
- Include accessibility props (accessibilityRole, accessibilityLabel, accessibilityHint)
- Test with screen readers (VoiceOver for iOS, TalkBack for Android)

### Security
- Avoid storing sensitive data in plain text
- Use secure storage libraries like `react-native-keychain` for sensitive data
- Validate user inputs to prevent injection attacks

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
