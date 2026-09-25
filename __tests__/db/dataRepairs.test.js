/**
 * One-off repair of operations.date values that carry a timestamp (#773).
 */
import { normalizeOperationDates } from '../../drizzle/dataRepairs';

describe('normalizeOperationDates', () => {
  it('trims timestamped dates to their day and records completion', async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) };

    await normalizeOperationDates(db);

    const [updateSql] = db.runAsync.mock.calls[0];
    expect(updateSql).toContain('UPDATE operations SET date = substr(date, 1, 10)');
    expect(updateSql).toContain('length(date) > 10');
    expect(db.runAsync.mock.calls[1][0]).toContain('post_migration_normalizeOperationDates_completed');
  });

  it('leaves the completion flag unset when the update fails, so it is retried', async () => {
    const db = { runAsync: jest.fn(async () => { throw new Error('locked'); }) };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await normalizeOperationDates(db);

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('is registered with a migration every install has', () => {
    // The setup file stubs the migrations module; this reads the real one.
    const migrations = jest.requireActual('../../drizzle/migrations').default;
    expect(migrations.postMigrationHandlers.normalizeOperationDates).toBe(normalizeOperationDates);
    const tag = migrations.postMigrationTags.normalizeOperationDates;
    expect(migrations.journal.entries.some(entry => entry.tag === tag)).toBe(true);
  });
});
