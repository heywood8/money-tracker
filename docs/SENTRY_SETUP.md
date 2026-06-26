# Sentry Crash & Error Reporting

Penny uses [`@sentry/react-native`](https://docs.sentry.io/platforms/react-native/) (the Expo-compatible setup) to capture crashes and unhandled errors in release builds. Reporting is **privacy-protective**: no financial data and no personal identifiers are ever sent (see `docs/PRIVACY_POLICY.md`, Section 2.2).

## What was wired up

| Piece | File | Purpose |
| --- | --- | --- |
| Config plugin | `app.config.js` (`@sentry/react-native/expo`) | Native setup + source-map / ProGuard-mapping upload at build time |
| Metro | `metro.config.js` (`getSentryExpoConfig`) | Injects Debug IDs so uploaded source maps match captured events |
| Init + wrap | `App.js` → `app/services/sentry.js` | `Sentry.init(...)` on startup, `Sentry.wrap(App)` as the root |
| Error reporting | `app/components/ErrorBoundary.js` | Reports caught render errors via `captureException` |
| Log forwarding | `app/services/LogService.js` → `captureLog` | Mirrors each captured log line to Sentry structured logs (redacted) |
| Runtime config | `app.config.js` `extra.sentry` | DSN + environment, read at runtime via `expo-constants` |

When no DSN is configured the entire integration is a **no-op**, so development and tests are unaffected.

## Required configuration

The org/project slugs, region URL, and DSN are **baked into `app.config.js`** — none of them are secret (the DSN ships inside every release APK regardless). The committed values point at this project's Sentry:

| Setting | Value | Where |
| --- | --- | --- |
| Organization | `heywood8` | plugin `organization` |
| Project | `penny` | plugin `project` |
| Region URL | `https://de.sentry.io/` (EU/DE) | plugin `url` |
| DSN | `…@o4510430127980544.ingest.de.sentry.io/4510430145740880` | `extra.sentry.dsn` |

So the **only secret you must provide is the auth token**, which is already configured:

| Name | Secret? | Used for |
| --- | --- | --- |
| `SENTRY_AUTH_TOKEN` | **Yes** | Uploading source maps (already configured) |

Each baked-in value can be overridden at build time via the matching env var (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`, `SENTRY_DSN`) — all are already passed through in both build workflows.

> **EU/DE region note:** because the org is in Sentry's EU data region, source-map
> uploads must target `https://de.sentry.io/` (set via the plugin `url`). The
> default `https://sentry.io/` would fail with authentication errors.

### EAS Cloud builds

`build-release-apk.yml` runs `eas build --local` on the GitHub runner, so its workflow `env:` block (which passes `SENTRY_AUTH_TOKEN`) is sufficient.

For **cloud** EAS builds (`eas-build-android.yml`, plain `eas build`), the auth token must also exist on the EAS build servers. Since the org/project/DSN/region are baked into `app.config.js`, only the token is needed:

```bash
eas env:create --name SENTRY_AUTH_TOKEN --value "sntrys_…" --environment production --visibility secret
```

## Privacy configuration

`app/services/sentry.js` initializes Sentry conservatively:

- `enabled: !__DEV__` — events are sent **only from release builds**, never dev / Expo Go.
- `sendDefaultPii: false` — no IP addresses, cookies, or user identifiers.
- `beforeBreadcrumb` drops **console breadcrumbs** — the app patches `console` via `LogService` and may log transaction/account details; those are never shipped to Sentry as breadcrumbs.
- `tracesSampleRate: 0.2` — only a sample of performance traces is collected.

## Log forwarding (structured logs)

The app's own log lines (everything that flows through `console.*`, captured by
`LogService`) are mirrored to Sentry's **structured logs** so they're viewable
alongside crashes. This is done **without** weakening the privacy posture:

- `enableLogs: true` (also under `_experiments` for cross-version compatibility)
  turns on structured logs. The `Sentry.logger.*` API is used to forward entries.
- `enableAutoConsoleLogs: false` — the SDK's *automatic* `console.*` capture is
  **disabled**. Logs only reach Sentry through our explicit, redacted forwarding
  path (`LogService._addEntry` → `captureLog`), never raw.
- `beforeSendLog` runs `redactText` on every log body and string attribute,
  scrubbing money amounts, long digit runs (balances are stored as integer
  cents), and email/PII addresses. It is **fail-closed**: if redaction throws,
  the log is dropped rather than sent.
- Forwarding is release-only and DSN-gated — with no DSN, or in dev / Expo Go,
  `captureLog` is a complete no-op (same as the rest of the integration).

Redaction is intentionally aggressive (over-redaction is preferred to leaking),
so some non-sensitive numbers in log lines may also appear as `[redacted]`.

## Verifying it works

1. Set the secrets above and produce a release build.
2. Trigger a test error (e.g. temporarily throw inside a screen) and confirm the event appears in your Sentry project.
3. Confirm the stack trace is **symbolicated** (readable file/line) — that proves source-map upload succeeded.

## Disabling

Blank the `dsn` fallback in `app.config.js` (`extra.sentry.dsn`), or set the `SENTRY_DSN` env var to an empty string at build time. With no DSN, `Sentry.init` is skipped and nothing is reported.
