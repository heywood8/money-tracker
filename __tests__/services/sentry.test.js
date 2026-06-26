/**
 * Tests for the Sentry service wrapper.
 *
 * The DSN is read from expo-constants at call time, so each test loads the
 * module in isolation with a specific `expoConfig.extra.sentry` value.
 */

const DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

function loadWith(sentryExtra) {
  let mod;
  let Sentry;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: sentryExtra ? { sentry: sentryExtra } : {} } },
    }));
    Sentry = require('@sentry/react-native');
    mod = require('../../app/services/sentry');
  });
  return { mod, Sentry };
}

describe('services/sentry', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('when no DSN is configured', () => {
    it('reports Sentry as disabled', () => {
      const { mod } = loadWith(null);
      expect(mod.isSentryEnabled()).toBe(false);
    });

    it('initSentry does not initialize Sentry and returns false', () => {
      const { mod, Sentry } = loadWith(null);
      expect(mod.initSentry()).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('captureException is a no-op', () => {
      const { mod, Sentry } = loadWith(null);
      mod.captureException(new Error('boom'));
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('when a DSN is configured', () => {
    it('reports Sentry as enabled', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.isSentryEnabled()).toBe(true);
    });

    it('initSentry initializes Sentry with privacy-safe options', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      expect(mod.initSentry()).toBe(true);
      expect(Sentry.init).toHaveBeenCalledTimes(1);
      const options = Sentry.init.mock.calls[0][0];
      expect(options.dsn).toBe(DSN);
      // Privacy: never attach IP/cookies/user identifiers.
      expect(options.sendDefaultPii).toBe(false);
    });

    it('enables structured logs but never auto-captures the console', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      mod.initSentry();
      const options = Sentry.init.mock.calls[0][0];
      expect(options.enableLogs).toBe(true);
      expect(options._experiments).toEqual({ enableLogs: true });
      // Auto console capture would bypass our redaction; it must be off.
      expect(options.enableAutoConsoleLogs).toBe(false);
      expect(typeof options.beforeSendLog).toBe('function');
    });

    it('initSentry is idempotent', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      expect(mod.initSentry()).toBe(true);
      expect(mod.initSentry()).toBe(false);
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });

    it('honors a custom environment from config', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN, environment: 'preview' });
      mod.initSentry();
      expect(Sentry.init.mock.calls[0][0].environment).toBe('preview');
    });

    it('drops console breadcrumbs but keeps other breadcrumbs', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      mod.initSentry();
      const { beforeBreadcrumb } = Sentry.init.mock.calls[0][0];
      // Console logs may contain financial data and must never be transmitted.
      expect(beforeBreadcrumb({ category: 'console', message: '500 USD' })).toBeNull();
      // Low-risk breadcrumbs are preserved.
      const nav = { category: 'navigation', message: 'Accounts' };
      expect(beforeBreadcrumb(nav)).toBe(nav);
    });

    it('captureException forwards the error and context to Sentry', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      const error = new Error('boom');
      const context = { contexts: { react: { componentStack: 'stack' } } };
      mod.captureException(error, context);
      expect(Sentry.captureException).toHaveBeenCalledWith(error, context);
    });

    it('captureException never throws even if Sentry throws', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      Sentry.captureException.mockImplementation(() => {
        throw new Error('sentry down');
      });
      expect(() => mod.captureException(new Error('boom'))).not.toThrow();
    });

    it('captureLog forwards each level to the matching Sentry.logger method', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      mod.captureLog('info', 'hello');
      mod.captureLog('warn', 'careful');
      mod.captureLog('error', 'oops');
      mod.captureLog('debug', 'details');
      expect(Sentry.logger.info).toHaveBeenCalledWith('hello');
      expect(Sentry.logger.warn).toHaveBeenCalledWith('careful');
      expect(Sentry.logger.error).toHaveBeenCalledWith('oops');
      expect(Sentry.logger.debug).toHaveBeenCalledWith('details');
    });

    it('captureLog falls back to info for unknown levels', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      mod.captureLog('verbose', 'mystery');
      expect(Sentry.logger.info).toHaveBeenCalledWith('mystery');
    });

    it('captureLog never throws even if the logger throws', () => {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      Sentry.logger.info.mockImplementation(() => {
        throw new Error('logger down');
      });
      expect(() => mod.captureLog('info', 'boom')).not.toThrow();
    });
  });

  describe('when no DSN is configured (logging)', () => {
    it('captureLog is a no-op', () => {
      const { mod, Sentry } = loadWith(null);
      mod.captureLog('error', 'should not send');
      expect(Sentry.logger.error).not.toHaveBeenCalled();
    });
  });

  describe('redactText', () => {
    it('scrubs monetary amounts', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.redactText('Balance is 1,234.56 after sync')).toBe(
        'Balance is [redacted] after sync',
      );
      expect(mod.redactText('delta -12.5')).toBe('delta [redacted]');
    });

    it('scrubs long digit runs (balances stored as cents / ids)', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.redactText('cents=123456')).toBe('cents=[redacted]');
    });

    it('scrubs email / PII addresses', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.redactText('user jane.doe@example.com failed')).toBe(
        'user [redacted] failed',
      );
    });

    it('leaves short numbers and plain text intact', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.redactText('Failed to delete account: 3 ops')).toBe(
        'Failed to delete account: 3 ops',
      );
    });

    it('returns non-string input unchanged', () => {
      const { mod } = loadWith({ dsn: DSN });
      expect(mod.redactText(undefined)).toBeUndefined();
      expect(mod.redactText(42)).toBe(42);
    });
  });

  describe('beforeSendLog redaction hook', () => {
    function getHook() {
      const { mod, Sentry } = loadWith({ dsn: DSN });
      mod.initSentry();
      return Sentry.init.mock.calls[0][0].beforeSendLog;
    }

    it('redacts the log message before sending', () => {
      const beforeSendLog = getHook();
      const out = beforeSendLog({ level: 'info', message: 'paid 99.99 to acct 555000' });
      expect(out.message).toBe('paid [redacted] to acct [redacted]');
    });

    it('redacts string attribute values', () => {
      const beforeSendLog = getHook();
      const out = beforeSendLog({
        level: 'info',
        message: 'x',
        attributes: { note: 'amount 50.00', wrapped: { value: 'id 778899', type: 'string' } },
      });
      expect(out.attributes.note).toBe('amount [redacted]');
      expect(out.attributes.wrapped.value).toBe('id [redacted]');
    });
  });
});
