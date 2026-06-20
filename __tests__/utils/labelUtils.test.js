import {
  LABEL_DELIMITER,
  LABEL_JOIN,
  MAX_LABELS,
  MAX_LABEL_LENGTH,
  normalizeLabel,
  sanitizeLabel,
  parseLabels,
  serializeLabels,
  hasLabel,
  addLabel,
  removeLabel,
  matchesAllLabels,
  isSystemLabel,
  visibleListLabels,
  isProtectedOperation,
} from '../../app/utils/labelUtils';

describe('labelUtils', () => {
  describe('sanitizeLabel', () => {
    it('trims and collapses internal whitespace', () => {
      expect(sanitizeLabel('  work   trip ')).toBe('work trip');
    });

    it('strips the delimiter from inside a label', () => {
      expect(sanitizeLabel('a|b')).toBe('a b');
    });

    it('returns empty string for non-strings', () => {
      expect(sanitizeLabel(null)).toBe('');
      expect(sanitizeLabel(undefined)).toBe('');
      expect(sanitizeLabel(42)).toBe('');
      expect(sanitizeLabel({})).toBe('');
    });

    it('clamps to MAX_LABEL_LENGTH', () => {
      const long = 'x'.repeat(MAX_LABEL_LENGTH + 20);
      expect(sanitizeLabel(long)).toHaveLength(MAX_LABEL_LENGTH);
    });

    it('returns empty string for whitespace-only input', () => {
      expect(sanitizeLabel('   ')).toBe('');
    });
  });

  describe('normalizeLabel', () => {
    it('trims, collapses whitespace and strips the delimiter without clamping length', () => {
      expect(normalizeLabel('  work   trip ')).toBe('work trip');
      expect(normalizeLabel('a|b')).toBe('a b');
    });

    it('preserves labels longer than MAX_LABEL_LENGTH (unlike sanitizeLabel)', () => {
      const long = 'x'.repeat(MAX_LABEL_LENGTH + 20);
      expect(normalizeLabel(long)).toHaveLength(MAX_LABEL_LENGTH + 20);
    });

    it('returns empty string for non-strings', () => {
      expect(normalizeLabel(null)).toBe('');
      expect(normalizeLabel(42)).toBe('');
    });
  });

  // Guard: a pre-existing (legacy) free-text description longer than the cap must
  // round-trip without being silently truncated. The length cap applies only to
  // newly entered labels (addLabel / sanitizeLabel), never to stored data.
  describe('non-destructive round-trip of legacy descriptions', () => {
    const longNote = 'Dinner with the whole team at the Italian place near the office downtown';

    it('parseLabels does not truncate a long legacy description', () => {
      expect(parseLabels(longNote)).toEqual([longNote]);
    });

    it('serializeLabels does not truncate already-stored long labels', () => {
      expect(serializeLabels([longNote])).toBe(longNote);
      expect(parseLabels(serializeLabels([longNote]))).toEqual([longNote]);
    });

    it('still caps a newly typed long label via addLabel', () => {
      const long = 'y'.repeat(MAX_LABEL_LENGTH + 20);
      expect(addLabel([], long)[0]).toHaveLength(MAX_LABEL_LENGTH);
    });

    it('matches a long legacy label in the filter without truncation mismatch', () => {
      expect(matchesAllLabels(longNote, [longNote])).toBe(true);
    });
  });

  describe('parseLabels', () => {
    it('splits on the delimiter and trims', () => {
      expect(parseLabels('work | food | lunch')).toEqual(['work', 'food', 'lunch']);
    });

    it('treats a plain free-text description as a single label (backward compatible)', () => {
      expect(parseLabels('Coffee at the airport')).toEqual(['Coffee at the airport']);
    });

    it('returns [] for empty, null, or non-string', () => {
      expect(parseLabels('')).toEqual([]);
      expect(parseLabels(null)).toEqual([]);
      expect(parseLabels(undefined)).toEqual([]);
      expect(parseLabels(99)).toEqual([]);
    });

    it('drops empty segments from leading/trailing/double delimiters', () => {
      expect(parseLabels('| work || food |')).toEqual(['work', 'food']);
    });

    it('de-duplicates case-insensitively, keeping first casing', () => {
      expect(parseLabels('Work | work | WORK | food')).toEqual(['Work', 'food']);
    });

    it('treats legacy [MoneyOK] segments as ordinary labels', () => {
      expect(parseLabels('[MoneyOK] | groceries | food')).toEqual(['[MoneyOK]', 'groceries', 'food']);
    });

    it('caps at MAX_LABELS', () => {
      const many = Array.from({ length: MAX_LABELS + 10 }, (_, i) => `l${i}`).join(LABEL_DELIMITER);
      expect(parseLabels(many)).toHaveLength(MAX_LABELS);
    });
  });

  describe('serializeLabels', () => {
    it('joins with the readable delimiter', () => {
      expect(serializeLabels(['work', 'food'])).toBe(`work${LABEL_JOIN}food`);
    });

    it('round-trips with parseLabels', () => {
      const labels = ['work', 'food', 'lunch'];
      expect(parseLabels(serializeLabels(labels))).toEqual(labels);
    });

    it('sanitises, de-dupes and drops empties', () => {
      expect(serializeLabels(['  work ', 'work', '', 'a|b', null])).toBe(`work${LABEL_JOIN}a b`);
    });

    it('returns empty string for non-arrays or empty input', () => {
      expect(serializeLabels(null)).toBe('');
      expect(serializeLabels([])).toBe('');
      expect(serializeLabels(['  ', ''])).toBe('');
    });
  });

  describe('hasLabel', () => {
    it('is case-insensitive', () => {
      expect(hasLabel(['Work', 'Food'], 'work')).toBe(true);
      expect(hasLabel(['Work'], 'rest')).toBe(false);
    });
    it('handles bad input', () => {
      expect(hasLabel(null, 'x')).toBe(false);
      expect(hasLabel(['a'], '')).toBe(false);
    });
  });

  describe('addLabel', () => {
    it('appends a sanitised label without mutating the source', () => {
      const src = ['work'];
      const out = addLabel(src, ' food ');
      expect(out).toEqual(['work', 'food']);
      expect(src).toEqual(['work']);
    });

    it('ignores duplicates (case-insensitive)', () => {
      expect(addLabel(['Work'], 'work')).toEqual(['Work']);
    });

    it('ignores empty labels', () => {
      expect(addLabel(['work'], '   ')).toEqual(['work']);
    });

    it('does not exceed the cap', () => {
      const full = Array.from({ length: MAX_LABELS }, (_, i) => `l${i}`);
      expect(addLabel(full, 'extra')).toHaveLength(MAX_LABELS);
    });

    it('treats a non-array base as empty', () => {
      expect(addLabel(null, 'work')).toEqual(['work']);
    });
  });

  describe('removeLabel', () => {
    it('removes case-insensitively without mutating', () => {
      const src = ['Work', 'Food'];
      const out = removeLabel(src, 'work');
      expect(out).toEqual(['Food']);
      expect(src).toEqual(['Work', 'Food']);
    });
    it('returns a copy when target is empty', () => {
      expect(removeLabel(['a'], '')).toEqual(['a']);
    });
    it('handles non-array input', () => {
      expect(removeLabel(null, 'x')).toEqual([]);
    });
  });

  describe('matchesAllLabels', () => {
    it('matches when all filter labels are present (AND)', () => {
      expect(matchesAllLabels('work | food | lunch', ['work', 'food'])).toBe(true);
    });
    it('does not match when any filter label is missing', () => {
      expect(matchesAllLabels('work | food', ['work', 'rest'])).toBe(false);
    });
    it('is case-insensitive', () => {
      expect(matchesAllLabels('Work | Food', ['WORK'])).toBe(true);
    });
    it('matches everything for an empty filter', () => {
      expect(matchesAllLabels('work', [])).toBe(true);
      expect(matchesAllLabels(null, [])).toBe(true);
    });
    it('does not match an operation with no labels against a non-empty filter', () => {
      expect(matchesAllLabels('', ['work'])).toBe(false);
    });
    it('matches a legacy [MoneyOK] segment as a filterable label', () => {
      expect(matchesAllLabels('[MoneyOK] | groceries', ['[MoneyOK]'])).toBe(true);
      expect(matchesAllLabels('[MoneyOK] | groceries', ['groceries'])).toBe(true);
    });
  });

  describe('isSystemLabel', () => {
    it('flags Account:/Category:/Category group: labels (case-insensitive)', () => {
      expect(isSystemLabel('Account: Cash')).toBe(true);
      expect(isSystemLabel('Category: Food')).toBe(true);
      expect(isSystemLabel('Category group: Expenses')).toBe(true);
      expect(isSystemLabel('account: cash')).toBe(true);
      expect(isSystemLabel('  Category group:  Income ')).toBe(true);
    });

    it('does not flag ordinary labels or the [MoneyOK] marker', () => {
      expect(isSystemLabel('groceries')).toBe(false);
      expect(isSystemLabel('[MoneyOK]')).toBe(false);
      expect(isSystemLabel('Accountant')).toBe(false);
      expect(isSystemLabel('My Category')).toBe(false);
    });

    it('returns false for empty or non-string input', () => {
      expect(isSystemLabel('')).toBe(false);
      expect(isSystemLabel(null)).toBe(false);
      expect(isSystemLabel(undefined)).toBe(false);
      expect(isSystemLabel(42)).toBe(false);
    });
  });

  describe('visibleListLabels', () => {
    it('drops system labels but keeps ordinary ones and [MoneyOK]', () => {
      const labels = parseLabels('[MoneyOK] | Account: Cash | groceries | Category: Food | Category group: Expenses');
      expect(visibleListLabels(labels)).toEqual(['[MoneyOK]', 'groceries']);
    });

    it('returns all labels when none are system labels', () => {
      expect(visibleListLabels(['work', 'food'])).toEqual(['work', 'food']);
    });

    it('returns [] for non-arrays', () => {
      expect(visibleListLabels(null)).toEqual([]);
      expect(visibleListLabels(undefined)).toEqual([]);
    });

    it('does not mutate the input array', () => {
      const input = ['Account: Cash', 'food'];
      const result = visibleListLabels(input);
      expect(input).toEqual(['Account: Cash', 'food']);
      expect(result).toEqual(['food']);
    });
  });

  describe('isProtectedOperation', () => {
    it('protects operations carrying a system metadata label', () => {
      expect(isProtectedOperation('Account: Cash | groceries')).toBe(true);
      expect(isProtectedOperation('Category: Food')).toBe(true);
      expect(isProtectedOperation('Category group: Expenses | rent')).toBe(true);
    });

    it('protects operations carrying the [MoneyOK] marker', () => {
      expect(isProtectedOperation('[MoneyOK] | groceries')).toBe(true);
      expect(isProtectedOperation('[moneyok]')).toBe(true);
    });

    it('does not protect ordinary operations', () => {
      expect(isProtectedOperation('groceries | food')).toBe(false);
      expect(isProtectedOperation('Coffee at the airport')).toBe(false);
    });

    it('returns false for empty or non-string input', () => {
      expect(isProtectedOperation('')).toBe(false);
      expect(isProtectedOperation(null)).toBe(false);
      expect(isProtectedOperation(undefined)).toBe(false);
    });
  });
});
