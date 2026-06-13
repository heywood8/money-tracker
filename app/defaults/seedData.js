/**
 * generateSeedData — pure function that produces demo data templates.
 *
 * Returns account templates, category IDs, and operation templates
 * relative to a given reference date. All output is deterministic for
 * the same input so tests can rely on stable snapshots.
 *
 * @param {Date} today - Reference date (default: current date)
 * @returns {{ accountTemplates: object[], categories: string[], operationTemplates: object[] }}
 */
export function generateSeedData(today = new Date()) {
  const accountTemplates = [
    { name: 'Checking', balance: '2400.00', currency: 'USD' },
    { name: 'Savings',  balance: '8500.00', currency: 'USD' },
    { name: 'Cash',     balance: '150.00',  currency: 'USD' },
  ];

  const categories = [
    'expense-food-groceries',
    'expense-food-restaurants',
    'expense-food-coffee-cafe',
    'expense-transportation-public-transport',
    'expense-transportation-taxi',
    'expense-monthly-rent',
    'expense-monthly-subscriptions',
    'expense-entertainment-movies',
    'expense-shopping-clothing',
    'income-salary',
  ];

  // Build a date helper: offset days from today (0 = today, -1 = yesterday …)
  const dateStr = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  // 60 operation templates spread across the last ~60 days.
  // Each entry: { type, amount, accountIndex, categoryIndex|null, date, description, [toAccountIndex] }
  const operationTemplates = [
    // --- month-ago block (days -57 to -45) ---
    { type: 'income',   amount: '3200.00', accountIndex: 0, categoryIndex: 9,    date: dateStr(-57), description: 'Monthly salary' },
    { type: 'expense',  amount: '1100.00', accountIndex: 0, categoryIndex: 5,    date: dateStr(-56), description: 'Rent' },
    { type: 'expense',  amount: '62.40',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-55), description: 'Grocery run' },
    { type: 'expense',  amount: '4.80',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-54), description: 'Morning coffee' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-53), description: 'Weekly transit pass' },
    { type: 'transfer', amount: '500.00',  accountIndex: 0, categoryIndex: null, date: dateStr(-52), description: 'Move to savings', toAccountIndex: 1 },
    { type: 'expense',  amount: '28.50',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-51), description: 'Dinner out' },
    { type: 'expense',  amount: '9.99',    accountIndex: 0, categoryIndex: 6,    date: dateStr(-50), description: 'Streaming subscription' },
    { type: 'expense',  amount: '23.00',   accountIndex: 2, categoryIndex: 0,    date: dateStr(-49), description: 'Farmers market' },
    { type: 'expense',  amount: '18.50',   accountIndex: 0, categoryIndex: 4,    date: dateStr(-48), description: 'Taxi to airport' },
    { type: 'expense',  amount: '11.00',   accountIndex: 0, categoryIndex: 7,    date: dateStr(-47), description: 'Cinema ticket' },
    { type: 'expense',  amount: '3.50',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-46), description: 'Espresso' },
    { type: 'expense',  amount: '79.90',   accountIndex: 0, categoryIndex: 8,    date: dateStr(-45), description: 'Jeans' },

    // --- three weeks ago block (days -44 to -30) ---
    { type: 'expense',  amount: '4.20',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-44), description: 'Coffee' },
    { type: 'expense',  amount: '55.30',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-43), description: 'Weekly groceries' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-42), description: 'Bus pass' },
    { type: 'expense',  amount: '32.00',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-41), description: 'Lunch with team' },
    { type: 'expense',  amount: '9.99',    accountIndex: 0, categoryIndex: 6,    date: dateStr(-40), description: 'Music service' },
    { type: 'income',   amount: '250.00',  accountIndex: 1, categoryIndex: 9,    date: dateStr(-39), description: 'Freelance payment' },
    { type: 'expense',  amount: '7.50',    accountIndex: 0, categoryIndex: 4,    date: dateStr(-38), description: 'Taxi' },
    { type: 'expense',  amount: '3.80',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-37), description: 'Flat white' },
    { type: 'expense',  amount: '22.00',   accountIndex: 0, categoryIndex: 7,    date: dateStr(-36), description: 'Theatre tickets' },
    { type: 'expense',  amount: '46.00',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-35), description: 'Supermarket' },
    { type: 'transfer', amount: '200.00',  accountIndex: 0, categoryIndex: null, date: dateStr(-34), description: 'Top up cash wallet', toAccountIndex: 2 },
    { type: 'expense',  amount: '5.00',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-33), description: 'Coffee shop' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-32), description: 'Monthly transit' },
    { type: 'expense',  amount: '38.90',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-31), description: 'Restaurant dinner' },
    { type: 'expense',  amount: '120.00',  accountIndex: 0, categoryIndex: 8,    date: dateStr(-30), description: 'Winter jacket' },

    // --- two weeks ago block (days -29 to -15) ---
    { type: 'income',   amount: '3200.00', accountIndex: 0, categoryIndex: 9,    date: dateStr(-29), description: 'Salary' },
    { type: 'expense',  amount: '1100.00', accountIndex: 0, categoryIndex: 5,    date: dateStr(-28), description: 'Rent payment' },
    { type: 'transfer', amount: '600.00',  accountIndex: 0, categoryIndex: null, date: dateStr(-27), description: 'Monthly savings transfer', toAccountIndex: 1 },
    { type: 'expense',  amount: '58.20',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-26), description: 'Groceries' },
    { type: 'expense',  amount: '4.50',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-25), description: 'Morning coffee' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-24), description: 'Transit pass' },
    { type: 'expense',  amount: '9.99',    accountIndex: 0, categoryIndex: 6,    date: dateStr(-23), description: 'Video streaming' },
    { type: 'expense',  amount: '26.00',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-22), description: 'Pizza night' },
    { type: 'expense',  amount: '12.00',   accountIndex: 0, categoryIndex: 7,    date: dateStr(-21), description: 'Concert ticket' },
    { type: 'expense',  amount: '44.70',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-20), description: 'Weekly shop' },
    { type: 'expense',  amount: '3.60',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-19), description: 'Takeaway coffee' },
    { type: 'expense',  amount: '8.00',    accountIndex: 0, categoryIndex: 4,    date: dateStr(-18), description: 'Rideshare' },
    { type: 'expense',  amount: '34.00',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-17), description: 'Sushi dinner' },
    { type: 'income',   amount: '180.00',  accountIndex: 1, categoryIndex: 9,    date: dateStr(-16), description: 'Side project' },
    { type: 'expense',  amount: '95.00',   accountIndex: 0, categoryIndex: 8,    date: dateStr(-15), description: 'Sneakers' },

    // --- last two weeks (days -14 to 0) ---
    { type: 'expense',  amount: '52.10',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-14), description: 'Grocery haul' },
    { type: 'expense',  amount: '4.80',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-13), description: 'Coffee' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-12), description: 'Bus pass' },
    { type: 'expense',  amount: '9.99',    accountIndex: 0, categoryIndex: 6,    date: dateStr(-11), description: 'Podcast subscription' },
    { type: 'expense',  amount: '19.50',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-10), description: 'Ramen lunch' },
    { type: 'transfer', amount: '100.00',  accountIndex: 0, categoryIndex: null, date: dateStr(-9),  description: 'Cash top-up', toAccountIndex: 2 },
    { type: 'expense',  amount: '40.30',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-8),  description: 'Supermarket' },
    { type: 'expense',  amount: '3.90',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-7),  description: 'Espresso' },
    { type: 'expense',  amount: '11.00',   accountIndex: 0, categoryIndex: 7,    date: dateStr(-6),  description: 'Movie night' },
    { type: 'expense',  amount: '6.50',    accountIndex: 0, categoryIndex: 4,    date: dateStr(-5),  description: 'Taxi home' },
    { type: 'expense',  amount: '29.90',   accountIndex: 0, categoryIndex: 1,    date: dateStr(-4),  description: 'Brunch' },
    { type: 'expense',  amount: '48.60',   accountIndex: 0, categoryIndex: 0,    date: dateStr(-3),  description: 'Weekly groceries' },
    { type: 'expense',  amount: '4.20',    accountIndex: 2, categoryIndex: 2,    date: dateStr(-2),  description: 'Morning coffee' },
    { type: 'expense',  amount: '14.00',   accountIndex: 0, categoryIndex: 3,    date: dateStr(-1),  description: 'Transit card' },
    { type: 'income',   amount: '3200.00', accountIndex: 0, categoryIndex: 9,    date: dateStr(0),   description: 'Salary deposit' },
    { type: 'expense',  amount: '1100.00', accountIndex: 0, categoryIndex: 5,    date: dateStr(0),   description: 'Rent' },
    { type: 'transfer', amount: '400.00',  accountIndex: 0, categoryIndex: null, date: dateStr(0),   description: 'Savings deposit', toAccountIndex: 1 },
  ];

  return { accountTemplates, categories, operationTemplates };
}
