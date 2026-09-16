/**
 * app.config.js is where the Play build and the GitHub build actually diverge.
 *
 * Both halves are load-bearing and neither is visible from the app code:
 * REQUEST_INSTALL_PACKAGES must not reach the App Bundle (Play restricts the
 * permission to app-installer-shaped apps and forbids self-updating outright),
 * and `extra.distributionChannel` is the only thing that tells the running
 * binary which of the two it is.
 */

const loadConfig = (env) => {
  const previous = { ...process.env };
  delete process.env.APP_VARIANT;
  delete process.env.DISTRIBUTION_CHANNEL;
  Object.entries(env).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
  let config;
  jest.isolateModules(() => {
    config = require('../app.config').expo;
  });
  process.env = previous;
  return config;
};

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';

describe('app.config.js distribution variants', () => {
  describe('the Play build', () => {
    const config = loadConfig({ APP_VARIANT: 'production', DISTRIBUTION_CHANNEL: 'play' });

    it('does not declare the self-install permission', () => {
      expect(config.android.permissions).not.toContain(INSTALL_PERMISSION);
    });

    it('marks the binary as a Play build', () => {
      expect(config.extra.distributionChannel).toBe('play');
    });

    it('keeps the location permissions the feature needs', () => {
      expect(config.android.permissions).toEqual(
        expect.arrayContaining([
          'android.permission.ACCESS_COARSE_LOCATION',
          'android.permission.ACCESS_FINE_LOCATION',
        ]),
      );
    });
  });

  // Every one of these ships on GitHub Releases, `production` included: the
  // emulator-screenshots workflow prebuilds with APP_VARIANT=production and is not a
  // store build, which is exactly why the Play flag is its own variable.
  describe.each(['preview', 'emulator', 'x86', 'production', undefined])('APP_VARIANT=%s', (variant) => {
    const config = loadConfig({ APP_VARIANT: variant });

    it('declares the self-install permission the in-app updater needs', () => {
      expect(config.android.permissions).toContain(INSTALL_PERMISSION);
    });

    it('marks the binary as a GitHub build', () => {
      expect(config.extra.distributionChannel).toBe('github');
    });
  });
});
