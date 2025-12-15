// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_ambitious_meltdown.js';
import m0001 from './0001_modern_lester.js';
import m0002 from './0002_illegal_apocalypse.js';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002
  }
};
