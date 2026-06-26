/* global __DEV__ */
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

/**
 * Centralized Sentry crash/error reporting.
 *
 * Configuration is read from `expo.extra.sentry` in app.config.js (which in turn
 * sources values from build-time env vars). When no DSN is configured Sentry is a
 * complete no-op, so the app behaves identically in development, tests, and any
 * build where Sentry has not been set up.
 *
 * Privacy: `sendDefaultPii` is disabled so no IP addresses, cookies, or user
 * identifiers are attached. The app never sends raw financial data to Sentry —
 * only error/crash metadata, stack traces, and redacted log lines (see
 * `redactText` / `beforeSendLog` below).
 */

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Best-effort redaction applied to every log line before it leaves the device.
 * Logs flow through `console.*` (patched by LogService) and may incidentally
 * contain monetary amounts, balances, or addresses. We scrub anything that
 * looks like a money amount, a long digit run (balances are stored as integer
 * cents), or an email/PII address. Over-redaction is acceptable — leaking is
 * not.
 */
const REDACTION_PATTERNS = [
  // Emails / address-like tokens.
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Decimal amounts: 1234.56, 1,234.56, -12.5
  /-?\d[\d,]*\.\d+/g,
  // Long integer runs — balances/cents and most numeric ids.
  /\b\d{4,}\b/g,
];

/** Scrub financial / PII patterns from a string. Returns input unchanged if not a string. */
export function redactText(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const re of REDACTION_PATTERNS) {
    out = out.replace(re, '[redacted]');
  }
  return out;
}

/**
 * `beforeSendLog` hook: redact the log body and any string attributes in place.
 * Fail-closed — if redaction throws for any reason we drop the log rather than
 * risk shipping unredacted content.
 */
function redactLog(log) {
  try {
    if (log && typeof log.message === 'string') {
      log.message = redactText(log.message);
    }
    // Some SDK versions carry the text under `body` instead of `message`.
    if (log && typeof log.body === 'string') {
      log.body = redactText(log.body);
    }
    if (log && log.attributes && typeof log.attributes === 'object') {
      for (const key of Object.keys(log.attributes)) {
        const value = log.attributes[key];
        if (typeof value === 'string') {
          log.attributes[key] = redactText(value);
        } else if (value && typeof value === 'object' && typeof value.value === 'string') {
          // Attributes may be wrapped as { value, type }.
          value.value = redactText(value.value);
        }
      }
    }
    return log;
  } catch {
    return null;
  }
}

// Maps LogService levels to Sentry structured-log methods.
const LOGGER_METHOD = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function readConfig() {
  const extra =
    (Constants.expoConfig &&
      Constants.expoConfig.extra &&
      Constants.expoConfig.extra.sentry) ||
    {};
  return {
    dsn: extra.dsn || '',
    environment: extra.environment || (isDev ? 'development' : 'production'),
    tracesSampleRate:
      typeof extra.tracesSampleRate === 'number' ? extra.tracesSampleRate : 0.2,
  };
}

let initialized = false;

/** Whether a DSN is configured (and therefore reporting is possible). */
export function isSentryEnabled() {
  return Boolean(readConfig().dsn);
}

/**
 * Initialize Sentry. Safe to call multiple times (subsequent calls are ignored).
 * Returns true if Sentry was actually initialized.
 */
export function initSentry() {
  if (initialized) return false;
  const { dsn, environment, tracesSampleRate } = readConfig();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment,
    // Only transmit events from release builds, never from dev / Expo Go.
    enabled: !isDev,
    // Privacy: do not attach IP addresses, cookies, or user identifiers.
    sendDefaultPii: false,
    tracesSampleRate,
    attachStacktrace: true,
    // Structured logs: forward the app's own log lines (captured by LogService)
    // to Sentry. The flag is set both top-level and under `_experiments` so the
    // feature works across the 7.x line, where it migrated from experimental to
    // stable. See `captureLog` for how entries are forwarded.
    enableLogs: true,
    _experiments: { enableLogs: true },
    // We forward LogService entries explicitly (already redacted via
    // `beforeSendLog`). Disable the SDK's automatic `console.*` capture so logs
    // are not double-sent, and so nothing bypasses our forwarding path.
    enableAutoConsoleLogs: false,
    // Privacy: every log line is scrubbed of money amounts / PII before send.
    // Fail-closed (drops the log) if redaction errors.
    beforeSendLog: redactLog,
    // Privacy: drop console breadcrumbs. The app patches console via LogService
    // and may log transaction/account details; we must never ship those to
    // Sentry. Other low-risk breadcrumbs (navigation, lifecycle) are kept.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb && breadcrumb.category === 'console') {
        return null;
      }
      return breadcrumb;
    },
  });

  initialized = true;
  return true;
}

/**
 * Report an error to Sentry. No-op when Sentry is not configured. Never throws —
 * telemetry must not be able to crash the app.
 */
export function captureException(error, context) {
  if (!isSentryEnabled()) return;
  try {
    Sentry.captureException(error, context);
  } catch {
    // Intentionally silent — reporting failures must not surface to the user.
  }
}

/**
 * Forward a single app log line to Sentry's structured logs. No-op when Sentry
 * is not configured. The message is redacted centrally in `beforeSendLog`, so
 * callers may pass the raw line. Never throws — telemetry must not crash the
 * app, and must never call `console.*` (LogService patches it, which would
 * recurse).
 */
export function captureLog(level, message) {
  if (!isSentryEnabled()) return;
  try {
    const logger = Sentry.logger;
    if (!logger) return;
    const method = LOGGER_METHOD[level] || 'info';
    if (typeof logger[method] === 'function') {
      logger[method](typeof message === 'string' ? message : String(message));
    }
  } catch {
    // Intentionally silent.
  }
}

export { Sentry };
