import * as PreferencesDB from '../../../app/services/PreferencesDB';
import {
  DEFAULT_FILTER_PACKAGES,
  getHiddenPackages,
  setHiddenPackages,
  setPackageVisible,
  getKnownPackages,
  registerSeenPackages,
  isPackageHidden,
  filterNotificationsByApp,
} from '../../../app/services/notifications/notificationFilters';

jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: {
    NOTIFICATION_FILTER_KNOWN: 'known',
    NOTIFICATION_FILTER_HIDDEN: 'hidden',
  },
  getJsonPreference: jest.fn(),
  setJsonPreference: jest.fn(),
}));

describe('notificationFilters', () => {
  let store;

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    PreferencesDB.getJsonPreference.mockImplementation(async (key, def) =>
      key in store ? store[key] : def,
    );
    PreferencesDB.setJsonPreference.mockImplementation(async (key, value) => {
      store[key] = value;
    });
  });

  describe('getKnownPackages', () => {
    it('always includes the shipped defaults, sorted', async () => {
      const known = await getKnownPackages();
      DEFAULT_FILTER_PACKAGES.forEach((pkg) => expect(known).toContain(pkg));
      expect(known).toEqual([...known].sort());
    });

    it('merges learned packages with the defaults without duplicates', async () => {
      store.known = ['com.foo.bar', 'com.android.systemui'];
      const known = await getKnownPackages();
      // defaults + learned, de-duplicated (systemui is also a default)
      expect(known).toContain('com.foo.bar');
      expect(known.filter((p) => p === 'com.android.systemui')).toHaveLength(1);
    });
  });

  describe('getHiddenPackages / setHiddenPackages', () => {
    it('defaults to an empty list (all apps visible)', async () => {
      expect(await getHiddenPackages()).toEqual([]);
    });

    it('persists a de-duplicated set', async () => {
      await setHiddenPackages(['a', 'a', 'b', null]);
      expect(store.hidden.sort()).toEqual(['a', 'b']);
    });
  });

  describe('setPackageVisible', () => {
    it('hides an app by adding it to the hidden set', async () => {
      const next = await setPackageVisible('com.chat', false);
      expect(next).toContain('com.chat');
      expect(store.hidden).toContain('com.chat');
    });

    it('shows an app by removing it from the hidden set', async () => {
      store.hidden = ['com.chat'];
      const next = await setPackageVisible('com.chat', true);
      expect(next).not.toContain('com.chat');
    });

    it('is a no-op for an empty package name', async () => {
      const next = await setPackageVisible('', false);
      expect(next).toEqual([]);
    });
  });

  describe('registerSeenPackages', () => {
    it('adds newly-seen packages to the known list', async () => {
      const known = await registerSeenPackages(['com.new.app']);
      expect(known).toContain('com.new.app');
      expect(store.known).toContain('com.new.app');
    });

    it('does not write when nothing new is seen', async () => {
      store.known = ['com.new.app'];
      await registerSeenPackages(['com.new.app']);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });

    it('ignores empty / falsy package names', async () => {
      await registerSeenPackages(['', null, undefined]);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });
  });

  describe('isPackageHidden', () => {
    it('reflects membership in the hidden list', () => {
      expect(isPackageHidden('a', ['a', 'b'])).toBe(true);
      expect(isPackageHidden('c', ['a', 'b'])).toBe(false);
      expect(isPackageHidden('a', undefined)).toBe(false);
    });
  });

  describe('filterNotificationsByApp', () => {
    const notifications = [
      { packageName: 'com.bank', text: 'a' },
      { packageName: 'com.chat', text: 'b' },
      { packageName: 'com.sys', text: 'c' },
    ];

    it('returns everything when nothing is hidden', () => {
      expect(filterNotificationsByApp(notifications, [])).toHaveLength(3);
    });

    it('drops notifications from hidden apps', () => {
      const out = filterNotificationsByApp(notifications, ['com.chat']);
      expect(out.map((n) => n.packageName)).toEqual(['com.bank', 'com.sys']);
    });

    it('handles non-array inputs defensively', () => {
      expect(filterNotificationsByApp(null, ['x'])).toEqual([]);
      expect(filterNotificationsByApp(notifications, null)).toHaveLength(3);
    });
  });
});
