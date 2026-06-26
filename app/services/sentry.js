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
 * identifiers are attached. The app never sends financial data to Sentry — only
 * error/crash metadata and stack traces.
 */

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

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

export { Sentry };
