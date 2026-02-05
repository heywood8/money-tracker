// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_ambitious_meltdown.js';
import m0001 from './0001_modern_lester.js';
import m0002 from './0002_illegal_apocalypse.js';
import m0003, { postMigration as m0003PostMigration } from './0003_slow_grandmaster.js';
import m0004 from './0004_remove_exclude_from_forecast.js';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
  },
  postMigrationHandlers: {
    m0003: m0003PostMigration,
  },
};
  