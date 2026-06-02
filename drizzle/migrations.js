// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_ambitious_meltdown.js';
import m0001 from './0001_modern_lester.js';
import m0002 from './0002_illegal_apocalypse.js';
import m0003, { postMigration as m0003PostMigration } from './0003_slow_grandmaster.js';
import m0004 from './0004_remove_exclude_from_forecast.js';
import m0005 from './0005_planned_operations.js';
import m0006 from './0006_add_original_balance.js';
import m0007 from './0007_add_enum_check_constraints.js';
import m0008 from './0008_soft_delete_accounts.js';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
  },
  postMigrationHandlers: {
    m0003: m0003PostMigration,
  },
  // Explicit tag mapping for post-migration handlers to avoid fragile substring matching
  postMigrationTags: {
    m0003: '0003_slow_grandmaster',
  },
};
  