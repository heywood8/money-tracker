import sql0030 from '../../drizzle/0030_operations_transfer_indexes';

// jest.setup.js replaces drizzle/migrations with a stub for every other suite.
// The whole point here is that the real registration is complete, so read the
// actual module.
const migrations = jest.requireActual('../../drizzle/migrations').default;

/**
 * Migration 0030 adds the two indexes that make every "did this account take
 * part" query stop scanning the operations table. A migration is only useful if
 * it is registered everywhere: the journal (which SCHEMA_VERSION is derived
 * from), the migrations map, and db.js's two schema-marker checks. A gap in any
 * of them leaves existing installs on the fast path, skipping migrate() forever.
 */
describe('Migration 0030 — operations transfer/date indexes', () => {
  it('creates both indexes, idempotently', () => {
    expect(sql0030).toContain('CREATE INDEX IF NOT EXISTS `idx_operations_to_account` ON `operations` (`to_account_id`)');
    expect(sql0030).toContain('CREATE INDEX IF NOT EXISTS `idx_operations_account_date` ON `operations` (`account_id`,`date`)');
  });

  it('touches no data and adds no column', () => {
    expect(sql0030).not.toMatch(/\b(ALTER|INSERT|UPDATE|DELETE|DROP)\b/i);
  });

  it('is registered in the migrations map', () => {
    expect(migrations.migrations.m0030).toBe(sql0030);
  });

  it('has a journal entry whose tag matches the file', () => {
    const entry = migrations.journal.entries.find(e => e.idx === 30);
    expect(entry).toBeDefined();
    expect(entry.tag).toBe('0030_operations_transfer_indexes');
  });

  it('is the last journal entry, so SCHEMA_VERSION covers it', () => {
    const last = migrations.journal.entries[migrations.journal.entries.length - 1];
    expect(last.idx).toBe(30);
  });
});
