# Development Guide

## Getting Started

1. Install dependencies:

```sh
cd app
npm install
```

2. Start the development server:

```sh
npm start
```

3. Run on your device or emulator:
- For Android: `npm run android`

**Note:** This project now supports only Android. iOS and Web support have been removed.

## Testing

Run tests with coverage:

```sh
npm run test:coverage
```

This will run all Jest tests and automatically update the coverage badges in the README. The badges show real-time metrics for:
- **Statements**: Percentage of statements executed
- **Branches**: Percentage of conditional branches tested
- **Functions**: Percentage of functions called
- **Lines**: Percentage of lines executed

Current test suite: **568 tests** across 16 test suites covering contexts, services, components, and integration scenarios.

## Git Hooks

This project uses a pre-commit hook to validate commit messages. All commits must follow the [conventional commits](https://www.conventionalcommits.org/) format, which is used by [release-please](https://github.com/googleapis/release-please) for automated versioning and changelog generation.

### Commit Message Format

```
<type>(<scope>): <subject>
```

**Valid types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

**Examples:**
- `feat: add dark mode support`
- `fix(auth): resolve login timeout issue`
- `docs: update README`
- `feat!: breaking change in API`

For detailed guidelines, see [Commit Message Guidelines](COMMIT_MESSAGE_GUIDELINES.md).

## Project Structure

- `App.js`: Main entry point
- `app/`: Feature-based source code
  - `contexts/`: React Context providers for global state
  - `screens/`: Full-screen components
  - `modals/`: Modal dialog components
  - `components/`: Reusable UI components
  - `services/`: Business logic and data access
  - `hooks/`: Custom React hooks
  - `db/`: Database configuration and schema
- `assets/`: Images, icons, translations, and currencies
- `docs/`: Documentation

## Building with EAS

This project uses EAS Build for creating production and preview builds.

### First-Time Setup

Before running builds in CI/CD or non-interactive mode, you need to set up Android signing credentials. See the detailed guide:

📖 **[EAS Credentials Setup Guide](EAS_CREDENTIALS_SETUP.md)**

### Build Commands

```sh
# Preview build (APK for internal testing)
npx eas-cli build --platform android --profile preview

# Production build (AAB for Google Play)
npx eas-cli build --platform android --profile production

# Development build
npx eas-cli build --platform android --profile development
```

### Build Profiles

- **preview**: Creates APK files for internal distribution and testing
- **production**: Creates AAB files for Google Play Store
- **development**: Creates development builds with Expo Dev Client

## Further Reading

- **[Database Architecture](DATABASE.md)** - SQLite/Drizzle ORM implementation, schema design, and workflow
- **[EAS Credentials Setup](EAS_CREDENTIALS_SETUP.md)** - Android signing credentials for EAS builds
- **[Commit Message Guidelines](COMMIT_MESSAGE_GUIDELINES.md)** - Conventional commits guide
- **[R8/CI-CD Setup](R8_CICD_SETUP.md)** - R8/ProGuard configuration for CI builds
