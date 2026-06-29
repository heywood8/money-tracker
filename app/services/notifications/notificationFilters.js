/**
 * App filters for the notification feed.
 *
 * The notification-processing page shows the recent notifications the listener
 * has captured. These helpers let the user curate that feed by app: every app is
 * shown by default, but the user can hide ("filter out") apps they don't care
 * about so noisy sources (system UI, chats, …) stop cluttering the list.
 *
 * Two persisted lists back the feature:
 *   - KNOWN: every package Penny has seen (plus the shipped defaults). The native
 *     listener only keeps a small rolling window, so we accumulate the full set
 *     here to keep the filter list stable even for apps that haven't posted
 *     recently.
 *   - HIDDEN: the packages the user has unchecked. An app is visible iff it is
 *     NOT in this list, so unknown/new apps default to visible.
 *
 * All processing is on-device — package names never leave the phone.
 */

import * as PreferencesDB from '../PreferencesDB';

/**
 * Apps pre-seeded into the filter list so it is never empty on first run. These
 * are common notification sources shipped as examples; all visible by default.
 */
export const DEFAULT_FILTER_PACKAGES = [
  'com.banq.ameriabank',
  'com.android.systemui',
  'org.telegram.messenger',
];

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The packages the user has chosen to hide (filter out) from the feed.
 * @returns {Promise<string[]>}
 */
export const getHiddenPackages = async () => {
  const list = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.NOTIFICATION_FILTER_HIDDEN,
    [],
  );
  return asArray(list);
};

/**
 * Persist the full set of hidden packages (de-duplicated). Propagates the
 * underlying write error so a caller acting on a user toggle can tell the write
 * failed (rather than reporting a change that was never saved).
 * @param {string[]} list
 * @returns {Promise<void>}
 */
export const setHiddenPackages = async (list) => {
  await PreferencesDB.setJsonPreference(
    PreferencesDB.PREF_KEYS.NOTIFICATION_FILTER_HIDDEN,
    Array.from(new Set(asArray(list).filter(Boolean))),
  );
};

/**
 * Flip a single app's visibility based on the CURRENT persisted state rather
 * than a caller-supplied flag. Reading-then-flipping from the source of truth
 * keeps rapid repeated taps from desyncing: a stale "is it hidden?" snapshot in
 * the UI can't make two taps both add (or both remove) the same package.
 * @param {string} packageName
 * @returns {Promise<string[]>} the updated hidden list
 */
export const togglePackageVisibility = async (packageName) => {
  const hidden = new Set(await getHiddenPackages());
  if (!packageName) return Array.from(hidden);
  if (hidden.has(packageName)) {
    hidden.delete(packageName); // was hidden → show it
  } else {
    hidden.add(packageName); // was visible → hide it
  }
  const next = Array.from(hidden);
  await setHiddenPackages(next);
  return next;
};

/**
 * Every package Penny knows about for the filter list: the shipped defaults
 * merged with every package it has seen, sorted for a stable display order.
 * @returns {Promise<string[]>}
 */
export const getKnownPackages = async () => {
  const learned = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.NOTIFICATION_FILTER_KNOWN,
    [],
  );
  const merged = new Set([...DEFAULT_FILTER_PACKAGES, ...asArray(learned)]);
  return Array.from(merged).filter(Boolean).sort();
};

/**
 * Merge newly-seen package names into the persisted known list so the filter
 * list keeps them even after they age out of the native rolling window. Only
 * writes when something new is actually added.
 * @param {string[]} packageNames
 * @returns {Promise<string[]>} the updated known list
 */
export const registerSeenPackages = async (packageNames) => {
  const incoming = asArray(packageNames).filter(Boolean);
  if (incoming.length === 0) return getKnownPackages();
  try {
    const learned = await PreferencesDB.getJsonPreference(
      PreferencesDB.PREF_KEYS.NOTIFICATION_FILTER_KNOWN,
      [],
    );
    const known = new Set(asArray(learned));
    let changed = false;
    incoming.forEach((pkg) => {
      if (!known.has(pkg)) {
        known.add(pkg);
        changed = true;
      }
    });
    if (changed) {
      await PreferencesDB.setJsonPreference(
        PreferencesDB.PREF_KEYS.NOTIFICATION_FILTER_KNOWN,
        Array.from(known),
      );
    }
  } catch (error) {
    console.error('[notificationFilters] Failed to register seen packages:', error);
  }
  return getKnownPackages();
};

/**
 * Whether a package is currently hidden (filtered out).
 * @param {string} packageName
 * @param {string[]} hidden
 * @returns {boolean}
 */
export const isPackageHidden = (packageName, hidden) =>
  asArray(hidden).includes(packageName);

/**
 * Drop notifications whose source app the user has hidden.
 * @param {Array<{ packageName?: string }>} notifications
 * @param {string[]} hidden
 * @returns {Array}
 */
export const filterNotificationsByApp = (notifications, hidden) => {
  const list = asArray(notifications);
  const hiddenList = asArray(hidden);
  if (hiddenList.length === 0) return list;
  const hiddenSet = new Set(hiddenList);
  return list.filter((n) => !hiddenSet.has(n?.packageName));
};
