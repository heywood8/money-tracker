/**
 * Tests for the per-alert notification icon plugin: the receiver it declares,
 * the native sources it writes, and — the part that silently breaks — the route
 * strings the Kotlin matches on staying in step with the ones JS sends.
 */

let manifestCb;
let dangerousCb;

jest.mock('@expo/config-plugins', () => ({
  withAndroidManifest: (config, cb) => {
    manifestCb = cb;
    return config;
  },
  withDangerousMod: (config, [, cb]) => {
    dangerousCb = cb;
    return config;
  },
}));

// Capture what the dangerous mod writes without touching disk.
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const withNotificationIcons = require('../../plugins/withNotificationIcons');
const {
  ROUTE_PENDING_OPERATIONS,
  ROUTE_ADDED_OPERATIONS,
  NOTIFICATION_ROUTE_KEY,
} = require('../../app/services/notifications/localNotifications');

const runDangerousMod = async () => {
  withNotificationIcons({});
  await dangerousCb({ modRequest: { projectRoot: '/project' } });
  const written = fs.writeFileSync.mock.calls.map(([file, source]) => [
    path.basename(file),
    source,
  ]);
  return Object.fromEntries(written);
};

describe('withNotificationIcons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    manifestCb = undefined;
    dangerousCb = undefined;
  });

  describe('manifest', () => {
    it('declares a receiver for the expo notification event', () => {
      withNotificationIcons({});
      const config = { modResults: { manifest: { application: [{ $: {} }] } } };
      const receivers = manifestCb(config).modResults.manifest.application[0].receiver;

      expect(receivers).toHaveLength(1);
      expect(receivers[0].$).toMatchObject({
        'android:name': '.PennyNotificationsService',
        'android:exported': 'false',
      });
      expect(receivers[0]['intent-filter'][0].action[0].$['android:name']).toBe(
        'expo.modules.notifications.NOTIFICATION_EVENT',
      );
    });

    it('claims a higher priority than the expo receiver it replaces', () => {
      withNotificationIcons({});
      const config = { modResults: { manifest: { application: [{ $: {} }] } } };
      const receiver = manifestCb(config).modResults.manifest.application[0].receiver[0];

      // expo-notifications declares its own receiver at -1 precisely so an app
      // receiver outranks it in queryBroadcastReceivers().
      expect(Number(receiver['intent-filter'][0].$['android:priority'])).toBeGreaterThan(-1);
    });

    it('does not claim boot broadcasts (they reach every matching receiver)', () => {
      withNotificationIcons({});
      const config = { modResults: { manifest: { application: [{ $: {} }] } } };
      const receiver = manifestCb(config).modResults.manifest.application[0].receiver[0];
      const actions = receiver['intent-filter'][0].action.map(
        (action) => action.$['android:name'],
      );

      expect(actions).not.toContain('android.intent.action.BOOT_COMPLETED');
      expect(actions).toHaveLength(1);
    });

    it('is idempotent (does not duplicate the receiver)', () => {
      withNotificationIcons({});
      const config = { modResults: { manifest: { application: [{ $: {} }] } } };
      manifestCb(config);
      manifestCb(config);

      expect(config.modResults.manifest.application[0].receiver).toHaveLength(1);
    });

    it('throws when the manifest has no <application>', () => {
      withNotificationIcons({});
      expect(() => manifestCb({ modResults: { manifest: {} } })).toThrow(
        /<application> not found/,
      );
    });
  });

  describe('native sources', () => {
    it('writes the builder, delegate and service', async () => {
      const sources = await runDangerousMod();

      expect(Object.keys(sources).sort()).toEqual([
        'PennyNotificationBuilder.kt',
        'PennyNotificationsService.kt',
        'PennyPresentationDelegate.kt',
      ]);
    });

    it('copies both vector drawables into res/drawable', async () => {
      await runDangerousMod();
      const destinations = fs.copyFileSync.mock.calls.map(([, to]) => to);

      expect(destinations).toEqual([
        path.join('/project', 'android/app/src/main/res/drawable/notification_icon_pending.xml'),
        path.join('/project', 'android/app/src/main/res/drawable/notification_icon_added.xml'),
      ]);
    });

    it('maps each route to its own drawable, with the default as fallback', async () => {
      const { 'PennyNotificationBuilder.kt': builder } = await runDangerousMod();

      expect(builder).toContain('ROUTE_NOTIFICATION_PROCESSING -> R.drawable.notification_icon_pending');
      expect(builder).toContain('ROUTE_ADDED_OPERATIONS -> R.drawable.notification_icon_added');
      expect(builder).toContain('else -> super.icon');
    });

    it('subclasses the expo builder rather than reimplementing it', async () => {
      const { 'PennyNotificationBuilder.kt': builder } = await runDangerousMod();

      expect(builder).toContain(': ExpoNotificationBuilder(context, notification, store)');
      expect(builder).toContain('override val icon: Int');
    });
  });

  describe('route coupling with the JS alerts', () => {
    // The native icon choice reads the route out of the payload JS puts there.
    // Rename one without the other and notifications keep working — they just
    // quietly lose their icons — so pin them together here.
    it('matches the route values localNotifications sends', () => {
      const routes = withNotificationIcons.ICONS.map((icon) => icon.route);

      expect(routes).toContain(ROUTE_PENDING_OPERATIONS);
      expect(routes).toContain(ROUTE_ADDED_OPERATIONS);
    });

    it('reads the same payload key localNotifications writes', () => {
      expect(withNotificationIcons.ROUTE_KEY).toBe(NOTIFICATION_ROUTE_KEY);
    });

    it('ships a drawable for every route it claims', () => {
      const realFs = jest.requireActual('fs');

      withNotificationIcons.ICONS.forEach(({ drawable }) => {
        const file = path.join(__dirname, '../../assets/android-drawables', `${drawable}.xml`);
        expect(realFs.existsSync(file)).toBe(true);
        expect(realFs.readFileSync(file, 'utf8')).toContain('android:pathData');
      });
    });
  });
});
