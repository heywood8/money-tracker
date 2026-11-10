import sql0032 from '../../drizzle/0032_merchant_rule_secondary_labels';

// jest.setup.js replaces drizzle/migrations with a stub for every other suite.
// The whole point here is that the real registration is complete, so read the
// actual module.
const migrations = jest.requireActual('../../drizzle/migrations').default;

/**
 * Migration 0032 adds notification_merchant_rules.secondary_labels, the labels a
 * merchant's operations carry after its name. Like every migration it only
 * reaches existing installs when registered everywhere: the journal (which
 * SCHEMA_VERSION is derived from), the migrations map, and db.js's two
 * schema-marker checks.
 */
describe('Migration 0032 — merchant rule secondary labels', () => {
  it('adds a nullable text column, so existing rules read as having none', () => {
    expect(sql0032).toContain(
      'ALTER TABLE `notification_merchant_rules` ADD COLUMN `secondary_labels` text',
    );
    expect(sql0032).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it('touches no data', () => {
    expect(sql0032).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP)\b/i);
  });

  it('is registered in the migrations map', () => {
    expect(migrations.migrations.m0032).toBe(sql0032);
  });

  it('has a journal entry whose tag matches the file', () => {
    const entry = migrations.journal.entries.find(e => e.idx === 32);
    expect(entry).toBeDefined();
    expect(entry.tag).toBe('0032_merchant_rule_secondary_labels');
  });

  it('sits inside the journal, so SCHEMA_VERSION covers it', () => {
    // SCHEMA_VERSION is the journal length; an entry at idx 32 needs at least 33.
    expect(migrations.journal.entries.length).toBeGreaterThan(32);
  });
});
