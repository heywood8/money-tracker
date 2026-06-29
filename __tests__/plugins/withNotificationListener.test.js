let manifestCb;
let dangerousCb;
let mainAppCb;

jest.mock('@expo/config-plugins', () => ({
  withAndroidManifest: (config, cb) => {
    manifestCb = cb;
    return config;
  },
  withDangerousMod: (config, [, cb]) => {
    dangerousCb = cb;
    return config;
  },
  withMainApplication: (config, cb) => {
    mainAppCb = cb;
    return config;
  },
}));

// Capture the native sources the dangerous mod writes without touching disk.
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const withNotificationListener = require('../../plugins/withNotificationListener');

describe('withNotificationListener', () => {
  beforeEach(() => {
    manifestCb = undefined;
    dangerousCb = undefined;
    mainAppCb = undefined;
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

  it('registers the native package in a modern apply-block MainApplication', () => {
    withNotificationListener({});
    const config = {
      modResults: {
        language: 'kt',
        contents: [
          'override fun getPackages(): List<ReactPackage> =',
          '    PackageList(this).packages.apply {',
          '      // add(MyReactNativePackage())',
          '    }',
        ].join('\n'),
      },
    };
    const out = mainAppCb(config);
    expect(out.modResults.contents).toContain('add(PennyNotificationsPackage())');
  });

  it('registers the native package in an older val-based MainApplication', () => {
    withNotificationListener({});
    const config = {
      modResults: {
        language: 'kt',
        contents: [
          'override fun getPackages(): List<ReactPackage> {',
          '    val packages = PackageList(this).packages',
          '    return packages',
          '}',
        ].join('\n'),
      },
    };
    const out = mainAppCb(config);
    expect(out.modResults.contents).toContain(
      'packages.add(PennyNotificationsPackage())',
    );
  });

  it('does not register the native package twice', () => {
    withNotificationListener({});
    const config = {
      modResults: {
        language: 'kt',
        contents: [
          '    val packages = PackageList(this).packages',
          '    packages.add(PennyNotificationsPackage())',
          '    return packages',
        ].join('\n'),
      },
    };
    const out = mainAppCb(config);
    const occurrences = out.modResults.contents.split(
      'packages.add(PennyNotificationsPackage())',
    ).length - 1;
    expect(occurrences).toBe(1);
  });

  it('throws if the package list anchor is missing in MainApplication', () => {
    withNotificationListener({});
    const config = { modResults: { language: 'kt', contents: 'class MainApplication' } };
    expect(() => mainAppCb(config)).toThrow(/package list/);
  });

  it('records the latest 20 notifications in the listener service', async () => {
    const fs = require('fs');
    fs.writeFileSync.mockClear();
    withNotificationListener({});
    await dangerousCb({ modRequest: { projectRoot: '/proj' } });

    const serviceWrite = fs.writeFileSync.mock.calls.find(
      ([filePath]) =>
        typeof filePath === 'string' && filePath.endsWith('PennyNotificationListenerService.kt'),
    );
    expect(serviceWrite).toBeTruthy();
    expect(serviceWrite[1]).toContain('const val MAX_STORED = 20');
  });
});
