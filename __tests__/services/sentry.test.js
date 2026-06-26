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
  });
});
