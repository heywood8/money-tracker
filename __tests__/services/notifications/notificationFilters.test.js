import * as PreferencesDB from '../../../app/services/PreferencesDB';
import {
  DEFAULT_FILTER_PACKAGES,
  getHiddenPackages,
  setHiddenPackages,
  togglePackageVisibility,
  hidePackage,
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

  describe('togglePackageVisibility', () => {
    it('hides a visible app by adding it to the hidden set', async () => {
      const next = await togglePackageVisibility('com.chat');
      expect(next).toContain('com.chat');
      expect(store.hidden).toContain('com.chat');
    });

    it('shows a hidden app by removing it from the hidden set', async () => {
      store.hidden = ['com.chat'];
      const next = await togglePackageVisibility('com.chat');
      expect(next).not.toContain('com.chat');
      expect(store.hidden).not.toContain('com.chat');
    });

    it('flips based on the persisted state, not a caller flag (double toggle returns to start)', async () => {
      const after1 = await togglePackageVisibility('com.chat'); // visible -> hidden
      expect(after1).toContain('com.chat');
      const after2 = await togglePackageVisibility('com.chat'); // hidden -> visible
      expect(after2).not.toContain('com.chat');
    });

    it('is a no-op for an empty package name and does not persist', async () => {
      store.hidden = ['a'];
      const next = await togglePackageVisibility('');
      expect(next).toEqual(['a']);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });

    it('propagates a persistence failure to the caller', async () => {
      PreferencesDB.setJsonPreference.mockRejectedValueOnce(new Error('disk full'));
      await expect(togglePackageVisibility('com.chat')).rejects.toThrow('disk full');
    });
  });

  describe('hidePackage', () => {
    it('hides a visible app by adding it to the hidden set', async () => {
      const next = await hidePackage('com.chat');
      expect(next).toContain('com.chat');
      expect(store.hidden).toContain('com.chat');
    });

    it('is idempotent for an already-hidden app and does not re-persist', async () => {
      store.hidden = ['com.chat'];
      const next = await hidePackage('com.chat');
      expect(next).toEqual(['com.chat']);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });

    it('is a no-op for an empty package name and does not persist', async () => {
      store.hidden = ['a'];
      const next = await hidePackage('');
      expect(next).toEqual(['a']);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });

    it('serializes concurrent hides so neither write is lost (race regression)', async () => {
      // Fired together, the two read-modify-writes would race and drop one under a
      // naive last-write-wins; the serialized chain must persist both.
      await Promise.all([hidePackage('com.a'), hidePackage('com.b')]);
      expect(store.hidden).toContain('com.a');
      expect(store.hidden).toContain('com.b');
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
