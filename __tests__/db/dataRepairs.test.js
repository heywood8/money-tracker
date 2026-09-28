/**
 * One-off repair of operations.date values that carry a timestamp (#773).
 */
import { normalizeOperationDates, renameMotorcycleIcon } from '../../drizzle/dataRepairs';

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

// The icon picker offered "motorcycle", which MaterialCommunityIcons does not
// have; categories saved with it rendered the missing-glyph box everywhere.
describe('renameMotorcycleIcon', () => {
  it('moves categories to the glyph that exists and records completion', async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) };

    await renameMotorcycleIcon(db);

    expect(db.runAsync.mock.calls[0][0]).toBe("UPDATE categories SET icon = 'motorbike' WHERE icon = 'motorcycle'");
    expect(db.runAsync.mock.calls[1][0]).toContain('post_migration_renameMotorcycleIcon_completed');
  });

  it('leaves the completion flag unset when the update fails, so it is retried', async () => {
    const db = { runAsync: jest.fn(async () => { throw new Error('locked'); }) };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await renameMotorcycleIcon(db);

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('is registered with a migration every install has', () => {
    const migrations = jest.requireActual('../../drizzle/migrations').default;
    expect(migrations.postMigrationHandlers.renameMotorcycleIcon).toBe(renameMotorcycleIcon);
    const tag = migrations.postMigrationTags.renameMotorcycleIcon;
    expect(migrations.journal.entries.some(entry => entry.tag === tag)).toBe(true);
  });

  it('writes the completion flag the runner looks up for its registration key', async () => {
    // The runner checks post_migration_<key>_completed; a flag spelled any other
    // way would re-run the repair on every launch.
    const migrations = jest.requireActual('../../drizzle/migrations').default;
    const [key] = Object.entries(migrations.postMigrationHandlers)
      .find(([, handler]) => handler === renameMotorcycleIcon);
    const db = { runAsync: jest.fn(async () => ({ changes: 0 })) };

    await renameMotorcycleIcon(db);

    expect(db.runAsync.mock.calls[1][0]).toContain(`'post_migration_${key}_completed'`);
  });
});
