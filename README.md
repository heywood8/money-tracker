# Penny (React Native + Expo)

![Coverage: Statements](./coverage/badge-statements.svg)
![Coverage: Branches](./coverage/badge-branches.svg)
![Coverage: Functions](./coverage/badge-functions.svg)
![Coverage: Lines](./coverage/badge-lines.svg)

This is a minimal Expo (React Native) scaffold for a personal finance tracking mobile app. All core features will be added iteratively.

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

This will run all Jest tests and automatically update the coverage badges displayed at the top of this README. The badges show real-time metrics for:
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

For detailed guidelines, see [Commit Message Guidelines](docs/COMMIT_MESSAGE_GUIDELINES.md).

## Project Structure
- `App.js`: Main entry point
- `assets/`: Images and static assets
- `docs/`: Documentation including build setup guides

## Documentation

- **[Database Architecture](docs/DATABASE.md)** - Complete guide to the SQLite/Drizzle ORM database implementation, schema design, and development workflow
- **[EAS Credentials Setup](docs/EAS_CREDENTIALS_SETUP.md)** - Guide for setting up Android signing credentials for EAS builds
- **[Commit Message Guidelines](docs/COMMIT_MESSAGE_GUIDELINES.md)** - Guide for writing conventional commits that work with release-please
- **[Privacy Policy](https://heywood8.github.io/money-tracker/PRIVACY_POLICY)** - App privacy policy and data handling practices

## Building with EAS

This project uses EAS Build for creating production and preview builds.

### First-Time Setup

Before running builds in CI/CD or non-interactive mode, you need to set up Android signing credentials. See the detailed guide:

📖 **[EAS Credentials Setup Guide](docs/EAS_CREDENTIALS_SETUP.md)**

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

## Next Steps
- Add features iteratively with LLM assistance.
