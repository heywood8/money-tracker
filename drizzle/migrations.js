// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_ambitious_meltdown.sql';
import m0001 from './0001_modern_lester.sql';
import m0002 from './0002_illegal_apocalypse.sql';
import m0003 from './0003_slow_grandmaster.sql';
import m0004 from './0004_notification_bindings.sql';
import m0005 from './0005_big_scalphunter.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  