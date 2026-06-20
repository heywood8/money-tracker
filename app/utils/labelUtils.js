/**
 * labelUtils — single source of truth for operation "labels".
 *
 * Labels are stored inside the existing `description` text column of an operation
 * (and planned operation). The whole description field is a delimited list of
 * labels — there is no free-text portion. Labels are separated by a vertical bar
 * ("|"); a space is added around the delimiter on serialization for readability,
 * but parsing tolerates any surrounding whitespace.
 *
 * Storing labels in `description` keeps the feature backward compatible: an
 * existing free-text description (e.g. "Coffee at the airport") is simply read
 * back as a single label, and backup/restore, CSV and Google Sheets export all
 * keep working with no schema migration.
 */

export const LABEL_DELIMITER = '|';

// Joined form written back to the description column. Spaces around the bar make
// the raw value readable in exports and in any UI that shows the raw string.
export const LABEL_JOIN = ' | ';

// Guard-rails so a single operation can never store a pathological description.
export const MAX_LABELS = 30;
export const MAX_LABEL_LENGTH = 60;

/**
 * Normalise a single label WITHOUT enforcing the length cap: drop the delimiter,
 * collapse internal whitespace, and trim. Returns '' for anything unusable.
 *
 * This is used when parsing/serialising values that are already stored, so a
 * pre-existing (legacy) free-text description longer than MAX_LABEL_LENGTH is
 * preserved intact on read/round-trip instead of being silently truncated. The
 * length cap is only applied to NEWLY entered labels (see sanitizeLabel).
 * @param {*} label
 * @returns {string}
 */
export const normalizeLabel = (label) => {
  if (typeof label !== 'string') return '';
  return label
    .split(LABEL_DELIMITER).join(' ') // a label can never contain the delimiter
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Normalise a single label AND clamp it to MAX_LABEL_LENGTH. Used at input time
 * (typing / addLabel) so a freshly created label can never be pathologically
 * long, while leaving already-stored labels untouched. Returns '' for unusable input.
 * @param {*} label
 * @returns {string}
 */
export const sanitizeLabel = (label) => normalizeLabel(label).slice(0, MAX_LABEL_LENGTH).trim();

/**
 * Parse a description string into an ordered, de-duplicated list of labels.
 * De-duplication is case-insensitive; the first occurrence's casing is kept.
 * Every delimiter-separated segment becomes a label, including legacy markers
 * such as "[MoneyOK]" from imported data.
 * @param {*} description
 * @returns {string[]}
 */
export const parseLabels = (description) => {
  if (typeof description !== 'string' || description === '') return [];

  const seen = new Set();
  const result = [];
  for (const piece of description.split(LABEL_DELIMITER)) {
    const clean = normalizeLabel(piece);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_LABELS) break;
  }
  return result;
};

/**
 * Serialise a list of labels back into a description string suitable for storage.
 * Sanitises, de-duplicates (case-insensitive) and caps the count. Returns '' when
 * there are no usable labels so callers can persist null.
 * @param {*} labels
 * @returns {string}
 */
export const serializeLabels = (labels) => {
  if (!Array.isArray(labels)) return '';
  const seen = new Set();
  const result = [];
  for (const raw of labels) {
    const clean = normalizeLabel(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_LABELS) break;
  }
  return result.join(LABEL_JOIN);
};

/**
 * Case-insensitive membership test.
 * @param {string[]} labels
 * @param {string} target
 * @returns {boolean}
 */
export const hasLabel = (labels, target) => {
  const clean = normalizeLabel(target).toLowerCase();
  if (!clean || !Array.isArray(labels)) return false;
  return labels.some((l) => normalizeLabel(l).toLowerCase() === clean);
};

/**
 * Return a new array with `newLabel` appended, unless it is empty, a duplicate
 * (case-insensitive), or the list is already at the cap. Never mutates the input.
 * @param {string[]} labels
 * @param {string} newLabel
 * @returns {string[]}
 */
export const addLabel = (labels, newLabel) => {
  const base = Array.isArray(labels) ? labels : [];
  const clean = sanitizeLabel(newLabel);
  if (!clean) return base.slice();
  if (hasLabel(base, clean)) return base.slice();
  if (base.length >= MAX_LABELS) return base.slice();
  return [...base, clean];
};

/**
 * Return a new array with every case-insensitive match of `target` removed.
 * Never mutates the input.
 * @param {string[]} labels
 * @param {string} target
 * @returns {string[]}
 */
export const removeLabel = (labels, target) => {
  if (!Array.isArray(labels)) return [];
  const clean = normalizeLabel(target).toLowerCase();
  if (!clean) return labels.slice();
  return labels.filter((l) => normalizeLabel(l).toLowerCase() !== clean);
};

/**
 * Whether `opDescription` contains every label in `filterLabels` (AND semantics).
 * Used by the label filter. An empty filter matches everything.
 * @param {*} opDescription
 * @param {string[]} filterLabels
 * @returns {boolean}
 */
export const matchesAllLabels = (opDescription, filterLabels) => {
  if (!Array.isArray(filterLabels) || filterLabels.length === 0) return true;
  const opLabels = parseLabels(opDescription).map((l) => l.toLowerCase());
  if (opLabels.length === 0) return false;
  const opSet = new Set(opLabels);
  return filterLabels.every((l) => opSet.has(normalizeLabel(l).toLowerCase()));
};
