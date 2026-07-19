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
import m0009 from './0009_add_operation_location.js';
import m0010 from './0010_bank_notifications.js';
import m0011 from './0011_merchant_label_override.js';
import m0012 from './0012_account_auto_txn_rounding.js';
import m0013 from './0013_operation_exclude_from_avg.js';
import m0014 from './0014_account_rounding_mode.js';
import m0015 from './0015_account_show_in_main_menu.js';
import m0016 from './0016_merchant_rule_last_matched.js';
import m0017 from './0017_add_pending_notification_location.js';

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
    m0009,
    m0010,
    m0011,
    m0012,
    m0013,
    m0014,
    m0015,
    m0016,
    m0017,
  },
  postMigrationHandlers: {
    m0003: m0003PostMigration,
  },
  // Explicit tag mapping for post-migration handlers to avoid fragile substring matching
  postMigrationTags: {
    m0003: '0003_slow_grandmaster',
  },
};
  