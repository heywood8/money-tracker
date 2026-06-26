# Sentry Crash & Error Reporting

Penny uses [`@sentry/react-native`](https://docs.sentry.io/platforms/react-native/) (the Expo-compatible setup) to capture crashes and unhandled errors in release builds. Reporting is **privacy-protective**: no financial data and no personal identifiers are ever sent (see `docs/PRIVACY_POLICY.md`, Section 2.2).

## What was wired up

| Piece | File | Purpose |
| --- | --- | --- |
| Config plugin | `app.config.js` (`@sentry/react-native/expo`) | Native setup + source-map / ProGuard-mapping upload at build time |
| Metro | `metro.config.js` (`getSentryExpoConfig`) | Injects Debug IDs so uploaded source maps match captured events |
| Init + wrap | `App.js` → `app/services/sentry.js` | `Sentry.init(...)` on startup, `Sentry.wrap(App)` as the root |
| Error reporting | `app/components/ErrorBoundary.js` | Reports caught render errors via `captureException` |
| Runtime config | `app.config.js` `extra.sentry` | DSN + environment, read at runtime via `expo-constants` |

When no DSN is configured the entire integration is a **no-op**, so development and tests are unaffected.

## Required configuration

The only secret is the **auth token** (used to upload source maps). The DSN, org, and project slugs are **not secret** — the DSN is embedded in every distributed build by design.

Set these as **GitHub Actions secrets** (used by `.github/workflows/build-release-apk.yml` and `eas-build-android.yml`):

| Name | Secret? | Example | Used for |
| --- | --- | --- | --- |
| `SENTRY_AUTH_TOKEN` | **Yes** | `sntrys_…` | Uploading source maps (already configured) |
| `SENTRY_ORG` | No | `my-org` | Source-map upload target |
| `SENTRY_PROJECT` | No | `penny` | Source-map upload target |
| `SENTRY_DSN` | No | `https://abc123@o0.ingest.sentry.io/0` | Where the app sends events |

> Prefer not to manage env vars for the non-secret values? You can hardcode them
> directly instead: put the `dsn` string in `app.config.js` (`extra.sentry.dsn`)
> and the `organization` / `project` in the `@sentry/react-native/expo` plugin
> options. They are safe to commit.

### EAS Cloud builds

`build-release-apk.yml` runs `eas build --local` on the GitHub runner, so the workflow `env:` block above is sufficient.

For **cloud** EAS builds (`eas-build-android.yml`, plain `eas build`), the variables must also exist on the EAS build servers. Add them as EAS environment variables:

```bash
eas env:create --name SENTRY_DSN --value "https://…" --environment production --visibility plaintext
eas env:create --name SENTRY_ORG --value "my-org" --environment production --visibility plaintext
eas env:create --name SENTRY_PROJECT --value "penny" --environment production --visibility plaintext
eas env:create --name SENTRY_AUTH_TOKEN --value "sntrys_…" --environment production --visibility secret
```

## Privacy configuration

`app/services/sentry.js` initializes Sentry conservatively:

- `enabled: !__DEV__` — events are sent **only from release builds**, never dev / Expo Go.
- `sendDefaultPii: false` — no IP addresses, cookies, or user identifiers.
- `beforeBreadcrumb` drops **console breadcrumbs** — the app patches `console` via `LogService` and may log transaction/account details; those are never shipped to Sentry.
- `tracesSampleRate: 0.2` — only a sample of performance traces is collected.

## Verifying it works

1. Set the secrets above and produce a release build.
2. Trigger a test error (e.g. temporarily throw inside a screen) and confirm the event appears in your Sentry project.
3. Confirm the stack trace is **symbolicated** (readable file/line) — that proves source-map upload succeeded.

## Disabling

Remove (or blank) `SENTRY_DSN`. With no DSN, `Sentry.init` is skipped and nothing is reported.
