import sql0031 from '../../drizzle/0031_merchant_rule_skip_category';

// jest.setup.js replaces drizzle/migrations with a stub for every other suite.
// The whole point here is that the real registration is complete, so read the
// actual module.
const migrations = jest.requireActual('../../drizzle/migrations').default;

/**
 * Migration 0031 adds notification_merchant_rules.skip_category, the "don't bind
 * to category" mark. Like every migration it only reaches existing installs when
 * registered everywhere: the journal (which SCHEMA_VERSION is derived from), the
 * migrations map, and db.js's two schema-marker checks.
 */
describe('Migration 0031 — merchant rule "don’t bind to category" flag', () => {
  it('adds the column with a default of 0, so existing rules keep learning', () => {
    expect(sql0031).toContain(
      'ALTER TABLE `notification_merchant_rules` ADD COLUMN `skip_category` integer DEFAULT 0',
    );
  });

  it('touches no data', () => {
    expect(sql0031).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP)\b/i);
  });

  it('is registered in the migrations map', () => {
    expect(migrations.migrations.m0031).toBe(sql0031);
  });

  it('has a journal entry whose tag matches the file', () => {
    const entry = migrations.journal.entries.find(e => e.idx === 31);
    expect(entry).toBeDefined();
    expect(entry.tag).toBe('0031_merchant_rule_skip_category');
  });

  it('sits inside the journal, so SCHEMA_VERSION covers it', () => {
    // SCHEMA_VERSION is the journal length; an entry at idx 31 needs at least 32.
    expect(migrations.journal.entries.length).toBeGreaterThan(31);
  });
});
