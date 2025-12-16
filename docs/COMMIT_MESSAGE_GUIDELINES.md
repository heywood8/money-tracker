# Commit Message Guidelines

This project uses **conventional commits** format, which is automatically validated by a pre-commit hook. This ensures consistent commit messages that work with [release-please](https://github.com/googleapis/release-please) for automated versioning and changelog generation.

## Format

```
<type>(<scope>): <subject>
```

Or without scope:

```
<type>: <subject>
```

## Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, missing semicolons, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Code change that improves performance
- **test**: Adding missing tests or updating tests
- **chore**: Changes to build process, dependencies, or other non-code changes
- **ci**: Changes to CI/CD configuration
- **build**: Changes to build system or external dependencies
- **revert**: Revert a previous commit

## Scope

Optional. A scope may be provided after the type to specify what part of the codebase is affected.

Examples:
- `fix(auth)` - fix in authentication module
- `feat(database)` - feature in database module
- `docs(readme)` - documentation changes to README

## Subject

A brief description of the change:

- Use imperative, present tense: "add" not "added" or "adds"
- Don't capitalize the first letter
- No period (.) at the end

## Breaking Changes

Add an exclamation mark (!) before the colon to indicate a breaking change:

```
feat!: restructure API endpoints
feat(api)!: change authentication method
```

Breaking changes trigger a major version bump in semantic versioning.

## Examples

### Valid Commits

```
feat: add dark mode support
fix: resolve memory leak in account balance calculation
docs: update installation guide
refactor(database): optimize query performance
feat(ui): add transaction filters and improve UX
fix(android)!: remove deprecated API usage
test: add tests for currency conversion
chore: update dependencies
```

### Invalid Commits ❌

```
Added new feature              # Missing type
fixed bug                      # Wrong format
Fix: a bug                     # Type not lowercase
feat: Added authentication     # Capitalized subject
docs:update README             # Missing space after colon
```

## Pre-Commit Hook

A git hook automatically validates your commit messages. If your message doesn't follow the format, the commit will be rejected with helpful guidance.

To manually check a message:
```bash
.git/hooks/commit-msg <(echo "your commit message")
```

## Release Notes

Release-please automatically generates:
- **CHANGELOG.md** entries
- Semantic version bumps (major.minor.patch)
- Release notes

Based on your commits:
- `feat:` → Minor version bump, included in changelog
- `fix:` → Patch version bump, included in changelog
- `feat!:` → Major version bump (breaking change)
- `docs:`, `chore:`, etc. → Not included in release notes (but tracked internally)

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)
