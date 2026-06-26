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

const withNotificationListener = require('../../plugins/withNotificationListener');

describe('withNotificationListener', () => {
  beforeEach(() => {
    manifestCb = undefined;
    dangerousCb = undefined;
  });

  it('adds a notification listener service to the manifest', () => {
    withNotificationListener({});
    const config = { modResults: { manifest: { application: [{ $: {} }] } } };
    const out = manifestCb(config);
    const services = out.modResults.manifest.application[0].service;

    expect(services).toHaveLength(1);
    expect(services[0].$).toMatchObject({
      'android:name': '.PennyNotificationListenerService',
      'android:exported': 'true',
      'android:permission':
        'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
    });
    expect(services[0]['intent-filter'][0].action[0].$['android:name']).toBe(
      'android.service.notification.NotificationListenerService',
    );
  });

  it('is idempotent (does not duplicate the service)', () => {
    withNotificationListener({});
    const config = { modResults: { manifest: { application: [{ $: {} }] } } };
    manifestCb(config);
    manifestCb(config);
    expect(config.modResults.manifest.application[0].service).toHaveLength(1);
  });

  it('throws if there is no <application>', () => {
    withNotificationListener({});
    const config = { modResults: { manifest: {} } };
    expect(() => manifestCb(config)).toThrow(/application/);
  });
});
