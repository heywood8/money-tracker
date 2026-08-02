/**
 * User-defined parse templates — the cache the parser reads from.
 *
 * `parseBankNotification` is synchronous by necessity: the notification feed
 * parses every card while it renders, and the ingestion loop parses inside a
 * tight pass over a batch. Templates live in SQLite, which is not. So the
 * templates are held in a module-level cache that async code refreshes and sync
 * code reads.
 *
 * That makes "is the cache loaded?" a correctness question, not a performance
 * one — an empty cache doesn't fail loudly, it silently parses nothing, which
 * would look exactly like "my template doesn't work". Two things keep that from
 * happening:
 *
 *   1. Every entry point that can lead to a parse awaits
 *      `ensureCustomTemplatesLoaded()` first — the ingestion pipeline (which the
 *      background task also drives) and the processing panel. It is a no-op
 *      after the first call, so calling it defensively costs nothing.
 *   2. Every write goes through this module rather than the DB module directly,
 *      so a saved/deleted/toggled template refreshes the cache as part of the
 *      same call and a caller cannot forget to.
 *
 * A failed load leaves the previous cache in place and lets the *next* call
 * retry, rather than caching an empty list: a transient DB error at startup must
 * not disable every custom template until the app restarts.
 *
 * ## Why custom templates are tried before the built-in parsers
 *
 * A user only writes a template for something the shipped parsers get wrong or
 * don't handle. If a template and a built-in parser both claim a notification,
 * the one the user wrote by hand for that exact message is the one they meant.
 *
 * ## Why a template can't produce a transfer
 *
 * Transfers need a target account, and the only target binding that exists is
 * the single "ATM cash account" preference that the built-in ATM CASH kind owns.
 * Letting a custom template book transfers would have it either share that
 * binding (so an unrelated template would silently re-point the user's ATM
 * account) or need a per-template binding that the review queue has no way to
 * carry. Templates are therefore expense/income; ATM withdrawals stay with the
 * built-in parsers.
 */

import * as NotificationTemplatesDB from '../NotificationTemplatesDB';
import { matchTemplate } from './templateEngine';

/** Templates currently loaded, in evaluation order. */
let cache = [];

/** Whether a successful load has happened at least once. */
let loaded = false;

/** In-flight load, so concurrent callers share one query. */
let loading = null;

/**
 * The cached templates. Synchronous — safe to call from a render.
 * @returns {Array} loaded templates (empty before the first load)
 */
export const getCachedTemplates = () => cache;

/**
 * Whether the cache holds a real load (as opposed to "nothing yet").
 * Used by the UI to tell "no templates" from "not loaded yet".
 * @returns {boolean}
 */
export const areCustomTemplatesLoaded = () => loaded;

/**
 * Re-read every template from the database into the cache.
 *
 * @returns {Promise<Array>} the freshly-loaded templates
 */
export const reloadCustomTemplates = async () => {
  try {
    const templates = await NotificationTemplatesDB.getAllTemplates();
    cache = Array.isArray(templates) ? templates : [];
    loaded = true;
  } catch (error) {
    // Keep whatever we had; `loaded` stays false on a first-load failure so the
    // next ensure() retries instead of treating an empty cache as authoritative.
    console.error('[customTemplates] Failed to load templates:', error);
  }
  return cache;
};

/**
 * Load the templates once. A no-op once loaded; concurrent callers share the
 * same in-flight query.
 * @returns {Promise<Array>}
 */
export const ensureCustomTemplatesLoaded = async () => {
  if (loaded) return cache;
  if (!loading) {
    loading = reloadCustomTemplates().finally(() => { loading = null; });
  }
  return loading;
};

/**
 * Save a template and refresh the cache so it takes effect immediately.
 * @param {Object} template - editor draft
 * @returns {Promise<Object>} the stored template
 */
export const saveCustomTemplate = async (template) => {
  const saved = await NotificationTemplatesDB.saveTemplate(template);
  await reloadCustomTemplates();
  return saved;
};

/**
 * Delete a template and refresh the cache.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteCustomTemplate = async (id) => {
  await NotificationTemplatesDB.deleteTemplate(id);
  await reloadCustomTemplates();
};

/**
 * Enable/disable a template and refresh the cache.
 * @param {string} id
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export const setCustomTemplateEnabled = async (id, enabled) => {
  await NotificationTemplatesDB.setTemplateEnabled(id, enabled);
  await reloadCustomTemplates();
};

/**
 * Parse a notification with the user's templates.
 *
 * Templates are tried in cache order (per-app priority, then oldest first) and
 * the first one that yields a descriptor wins.
 *
 * @param {{ title?: string, text?: string, packageName?: string }} notification
 * @returns {Object|null} descriptor, or null when no template claims it
 */
export const parseWithCustomTemplates = (notification) => {
  for (const template of cache) {
    if (template.enabled === false) continue;
    const descriptor = matchTemplate(template, notification);
    if (descriptor) return descriptor;
  }
  return null;
};

/**
 * The cached template whose name matches a descriptor/pending row's `kind` for
 * a given app, or null.
 *
 * Pending rows store the template's name as their `kind` (it is what the review
 * queue displays), so this is how the per-kind helpers find their way back to
 * the template that produced a queued item.
 *
 * @param {string} kind
 * @param {string} [packageName]
 * @returns {Object|null}
 */
export const findTemplateByKind = (kind, packageName) => {
  const key = String(kind || '').trim().toLowerCase();
  if (!key) return null;
  return cache.find((template) => {
    if (packageName && template.packageName && template.packageName !== packageName) return false;
    return String(template.name || '').trim().toLowerCase() === key;
  }) || null;
};

/**
 * Reset the cache. Test-only seam — the app never un-loads its templates.
 * @returns {void}
 */
export const __resetCustomTemplatesCache = () => {
  cache = [];
  loaded = false;
  loading = null;
};
