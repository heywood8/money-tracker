import uuid from 'react-native-uuid';
import { executeQuery, queryAll, queryFirst } from './db';
import { TEMPLATE_FIELDS, TEMPLATE_TYPES } from './notifications/templateEngine';
import { DATE_ORDERS } from './notifications/valueFormat';

/**
 * User-defined notification parse templates.
 *
 * Storage for the templates the user builds by marking fields in a captured
 * notification (see notifications/templateEngine.js for what a template *is*,
 * and notifications/customTemplates.js for the cache the parser reads).
 *
 * `fields` and `triggers` are JSON columns. Everything crossing this boundary is
 * validated on the way in and defensively parsed on the way out: a template is
 * evaluated inside a synchronous render on every notification card, so a row
 * that got corrupted (a hand-edited DB, a truncated restore) must degrade to
 * "this template matches nothing" rather than throw where nobody can catch it.
 */

/** Longest a template name may be — it is shown in one line in the list. */
const MAX_NAME_LENGTH = 60;

/** Cap on stored triggers/sample so a pathological row can't bloat the table. */
const MAX_TRIGGERS = 8;
const MAX_SAMPLE_LENGTH = 4000;

/**
 * Parse a JSON column, falling back rather than throwing.
 * @param {string|null} value
 * @param {*} fallback
 * @returns {*}
 */
const parseJson = (value, fallback) => {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch (error) {
    console.warn('[NotificationTemplatesDB] Ignoring unparseable JSON column');
    return fallback;
  }
};

/**
 * Keep only well-formed field rules. An unknown field name, or a rule missing
 * the parts compileFieldRule needs, is dropped — a template with a bad amount
 * rule then fails validation instead of silently matching the wrong number.
 * @param {*} raw
 * @returns {Object}
 */
const sanitizeFields = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const fields = {};
  TEMPLATE_FIELDS.forEach((name) => {
    const rule = raw[name];
    if (!rule || typeof rule !== 'object') return;
    if (typeof rule.before !== 'string' && typeof rule.after !== 'string') return;
    fields[name] = {
      source: rule.source === 'title' ? 'title' : 'text',
      kind: name,
      before: typeof rule.before === 'string' ? rule.before : '',
      after: typeof rule.after === 'string' ? rule.after : '',
      value: typeof rule.value === 'string' ? rule.value : '',
      occurrence: Number.isInteger(rule.occurrence) && rule.occurrence >= 0 ? rule.occurrence : 0,
    };
  });
  return fields;
};

/**
 * Normalize the trigger list: non-empty trimmed strings, de-duplicated, capped.
 * @param {*} raw
 * @returns {string[]}
 */
const sanitizeTriggers = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((entry) => {
    const value = String(entry == null ? '' : entry).trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (out.length < MAX_TRIGGERS) out.push(value);
  });
  return out;
};

const clampSample = (value) =>
  (typeof value === 'string' && value ? value.slice(0, MAX_SAMPLE_LENGTH) : null);

const mapTemplateFields = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    packageName: row.package_name ?? null,
    type: TEMPLATE_TYPES.includes(row.type) ? row.type : 'expense',
    // SQLite has no boolean; anything other than an explicit 0 is enabled, so a
    // NULL from a partially-restored row fails open (the user's template works)
    // rather than silently doing nothing.
    enabled: row.enabled !== 0,
    priority: Number.isFinite(row.priority) ? row.priority : 0,
    categoryId: row.category_id ?? null,
    currency: row.currency ?? null,
    dateOrder: DATE_ORDERS.includes(row.date_order) ? row.date_order : 'dmy',
    fields: sanitizeFields(parseJson(row.fields, {})),
    triggers: sanitizeTriggers(parseJson(row.triggers, [])),
    sample: { title: row.sample_title ?? '', text: row.sample_text ?? '' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Every template, in the order the parser should try them: by app, then by the
 * user's priority, then oldest first so the order is stable across edits.
 * @returns {Promise<Array>}
 */
export const getAllTemplates = async () => {
  try {
    const rows = await queryAll(
      'SELECT * FROM notification_templates ORDER BY priority ASC, created_at ASC',
    );
    return (rows || []).map(mapTemplateFields).filter(Boolean);
  } catch (error) {
    console.error('Failed to get notification templates:', error);
    throw error;
  }
};

/**
 * One template by id, or null.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export const getTemplateById = async (id) => {
  if (!id) return null;
  try {
    const row = await queryFirst('SELECT * FROM notification_templates WHERE id = ?', [id]);
    return mapTemplateFields(row);
  } catch (error) {
    console.error('Failed to get notification template:', error);
    throw error;
  }
};

/**
 * Create or update a template.
 *
 * Takes the editor's draft shape and writes the storage shape. An `id` that
 * already exists is updated in place (keeping its created_at and priority), so
 * the editor's save path is the same whether it is a new template or an edit.
 *
 * @param {Object} template - { id?, name, packageName, type, categoryId?,
 *   currency?, dateOrder?, fields, triggers?, sample?, enabled?, priority? }
 * @returns {Promise<Object>} the stored template
 */
export const saveTemplate = async (template) => {
  if (!template) throw new Error('Cannot save an empty notification template');
  const name = String(template.name || '').trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error('Cannot save a notification template without a name');

  const fields = sanitizeFields(template.fields);
  if (!fields.amount) {
    throw new Error('Cannot save a notification template without an amount field');
  }

  const now = new Date().toISOString();
  const existing = template.id ? await getTemplateById(template.id) : null;
  const row = {
    id: existing ? existing.id : (template.id || uuid.v4()),
    name,
    package_name: template.packageName || null,
    type: TEMPLATE_TYPES.includes(template.type) ? template.type : 'expense',
    enabled: template.enabled === false ? 0 : 1,
    priority: Number.isInteger(template.priority)
      ? template.priority
      : (existing ? existing.priority : 0),
    category_id: template.categoryId || null,
    currency: template.currency || null,
    date_order: DATE_ORDERS.includes(template.dateOrder) ? template.dateOrder : 'dmy',
    fields: JSON.stringify(fields),
    triggers: JSON.stringify(sanitizeTriggers(template.triggers)),
    sample_title: clampSample(template.sample ? template.sample.title : null),
    sample_text: clampSample(template.sample ? template.sample.text : null),
    created_at: existing ? existing.createdAt : now,
    updated_at: now,
  };

  try {
    if (existing) {
      await executeQuery(
        `UPDATE notification_templates SET name = ?, package_name = ?, type = ?, enabled = ?,
         priority = ?, category_id = ?, currency = ?, date_order = ?, fields = ?, triggers = ?,
         sample_title = ?, sample_text = ?, updated_at = ? WHERE id = ?`,
        [
          row.name, row.package_name, row.type, row.enabled, row.priority, row.category_id,
          row.currency, row.date_order, row.fields, row.triggers, row.sample_title,
          row.sample_text, row.updated_at, row.id,
        ],
      );
    } else {
      await executeQuery(
        `INSERT INTO notification_templates (id, name, package_name, type, enabled, priority,
         category_id, currency, date_order, fields, triggers, sample_title, sample_text,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id, row.name, row.package_name, row.type, row.enabled, row.priority,
          row.category_id, row.currency, row.date_order, row.fields, row.triggers,
          row.sample_title, row.sample_text, row.created_at, row.updated_at,
        ],
      );
    }
    return mapTemplateFields(row);
  } catch (error) {
    console.error('Failed to save notification template:', error);
    throw error;
  }
};

/**
 * Enable/disable a template without touching the rest of it.
 * @param {string} id
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export const setTemplateEnabled = async (id, enabled) => {
  if (!id) return;
  try {
    await executeQuery(
      'UPDATE notification_templates SET enabled = ?, updated_at = ? WHERE id = ?',
      [enabled ? 1 : 0, new Date().toISOString(), id],
    );
  } catch (error) {
    console.error('Failed to toggle notification template:', error);
    throw error;
  }
};

/**
 * Delete a template by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteTemplate = async (id) => {
  if (!id) return;
  try {
    await executeQuery('DELETE FROM notification_templates WHERE id = ?', [id]);
  } catch (error) {
    console.error('Failed to delete notification template:', error);
    throw error;
  }
};
