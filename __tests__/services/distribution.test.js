/**
 * The channel gate that keeps the in-app updater out of the Google Play build.
 *
 * Play's Device and Network Abuse policy forbids an app updating itself by any
 * route other than Play, so getting this wrong is not a cosmetic bug: it is a
 * binary that gets pulled from the store. The default matters as much as the
 * Play case — a build whose extra config never arrives must behave like the
 * GitHub APK it almost certainly is, not silently lose its updater.
 */

const loadModule = (extra) => {
  let mod;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: extra === undefined ? null : { extra } },
    }));
    mod = require('../../app/services/distribution');
  });
  return mod;
};

describe('distribution', () => {
  afterEach(() => {
    jest.dontMock('expo-constants');
    jest.clearAllMocks();
  });

  describe('getDistributionChannel', () => {
    it('reads the channel baked in by app.config.js', () => {
      expect(loadModule({ distributionChannel: 'play' }).getDistributionChannel()).toBe('play');
      expect(loadModule({ distributionChannel: 'github' }).getDistributionChannel()).toBe('github');
    });

    it('falls back to github when the channel is missing', () => {
      expect(loadModule({}).getDistributionChannel()).toBe('github');
    });

    it('falls back to github when there is no expoConfig at all', () => {
      expect(loadModule(undefined).getDistributionChannel()).toBe('github');
    });

    it('falls back to github for a non-string or empty channel', () => {
      expect(loadModule({ distributionChannel: '' }).getDistributionChannel()).toBe('github');
      expect(loadModule({ distributionChannel: 42 }).getDistributionChannel()).toBe('github');
    });
  });

  describe('isPlayBuild / supportsInAppUpdates', () => {
    it('disables in-app updates only on the Play build', () => {
      const play = loadModule({ distributionChannel: 'play' });
      expect(play.isPlayBuild()).toBe(true);
      expect(play.supportsInAppUpdates()).toBe(false);

      const github = loadModule({ distributionChannel: 'github' });
      expect(github.isPlayBuild()).toBe(false);
      expect(github.supportsInAppUpdates()).toBe(true);
    });

    it('keeps in-app updates on for an unrecognised channel', () => {
      // A typo in a build profile must not quietly strip the updater from the
      // APK we self-distribute; only an explicit 'play' does that.
      const mod = loadModule({ distributionChannel: 'preview' });
      expect(mod.supportsInAppUpdates()).toBe(true);
    });
  });

  describe('openStoreListing', () => {
    const { Linking } = require('react-native');

    it('opens the Play app through the market scheme', async () => {
      const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      const mod = loadModule({ distributionChannel: 'play' });

      await expect(mod.openStoreListing()).resolves.toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('market://details?id=com.heywood8.monkeep');
      spy.mockRestore();
    });

    it('falls back to the web listing when the market scheme is unhandled', async () => {
      const spy = jest.spyOn(Linking, 'openURL')
        .mockRejectedValueOnce(new Error('No Activity found to handle Intent'))
        .mockResolvedValueOnce(undefined);
      const mod = loadModule({ distributionChannel: 'play' });

      await expect(mod.openStoreListing()).resolves.toBe(true);
      expect(spy).toHaveBeenNthCalledWith(2, 'https://play.google.com/store/apps/details?id=com.heywood8.monkeep');
      spy.mockRestore();
    });

    it('reports failure rather than throwing when neither URL opens', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nope'));
      const mod = loadModule({ distributionChannel: 'play' });

      await expect(mod.openStoreListing()).resolves.toBe(false);
      spy.mockRestore();
      warn.mockRestore();
    });
  });
});
