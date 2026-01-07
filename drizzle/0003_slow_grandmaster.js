/**
 * Migration 0003: Add balance history tracking
 * 
 * SQL: Creates accounts_balance_history table
 * Custom handler: Populates current month history after table creation
 */

const sql = `CREATE TABLE \`accounts_balance_history\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`account_id\` integer NOT NULL,
	\`date\` text NOT NULL,
	\`balance\` text NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`idx_balance_history_account_date\` ON \`accounts_balance_history\` (\`account_id\`,\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_balance_history_date\` ON \`accounts_balance_history\` (\`date\`);--> statement-breakpoint
CREATE UNIQUE INDEX \`accounts_balance_history_account_id_date_unique\` ON \`accounts_balance_history\` (\`account_id\`,\`date\`)`;

/**
 * Custom post-migration handler to populate balance history
 * @param {Object} db - Raw SQLite database instance
 */
const postMigration = async (db) => {
  console.log('Running post-migration: Populating current month balance history...');
  
  const Currency = require('../app/services/currency');
  
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const calculateBalanceOnDate = async (accountId, targetDate) => {
    // Get current balance
    const accountResult = await db.getAllAsync(
      'SELECT * FROM accounts WHERE id = ? LIMIT 1',
      [accountId],
    );
    const account = accountResult && accountResult.length > 0 ? accountResult[0] : null;
    if (!account) return '0';

    let currentBalance = account.balance;

    // Get all operations after target date
    const operations = await db.getAllAsync(
      `SELECT * FROM operations
       WHERE (account_id = ? OR to_account_id = ?)
         AND date > ?
       ORDER BY date DESC, created_at DESC`,
      [accountId, accountId, targetDate],
    );

    // Reverse each operation
    for (const op of operations) {
      if (op.type === 'expense' && op.account_id === accountId) {
        currentBalance = Currency.add(currentBalance, op.amount);
      } else if (op.type === 'income' && op.account_id === accountId) {
        currentBalance = Currency.subtract(currentBalance, op.amount);
      } else if (op.type === 'transfer') {
        if (op.account_id === accountId) {
          currentBalance = Currency.add(currentBalance, op.amount);
        } else if (op.to_account_id === accountId) {
          const creditAmount = op.destination_amount || op.amount;
          currentBalance = Currency.subtract(currentBalance, creditAmount);
        }
      }
    }

    return currentBalance;
  };

  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = formatDate(now);

    // Get all accounts
    const accounts = await db.getAllAsync('SELECT * FROM accounts ORDER BY display_order ASC, created_at DESC');

    for (const account of accounts) {
      const accountCreatedDate = account.created_at ? new Date(account.created_at) : firstDayOfMonth;
      const currentDate = new Date(now);

      let lastSnapshotBalance = null;

      while (currentDate >= firstDayOfMonth && currentDate >= accountCreatedDate) {
        const dateStr = formatDate(currentDate);
        if (dateStr < todayStr) { // Don't snapshot today
          const balanceOnDate = await calculateBalanceOnDate(account.id, dateStr);

          // Only create snapshot if balance changed
          if (lastSnapshotBalance === null || lastSnapshotBalance !== balanceOnDate) {
            await db.runAsync(
              'INSERT OR IGNORE INTO accounts_balance_history (account_id, date, balance, created_at) VALUES (?, ?, ?, ?)',
              [account.id, dateStr, balanceOnDate, new Date().toISOString()],
            );
            lastSnapshotBalance = balanceOnDate;
          }
        }
        currentDate.setDate(currentDate.getDate() - 1);
      }
    }

    console.log('Current month balance history populated successfully');
  } catch (error) {
    console.error('Failed to populate balance history during migration:', error);
    // Don't throw - allow app to continue
  }
};

export default sql;
export { postMigration };
