// app/defaults/seedData.js

const ACCOUNT_TEMPLATES = [
  { name: 'Checking', balance: '0.00', currency: 'USD' },
  { name: 'Savings',  balance: '0.00', currency: 'USD' },
  { name: 'Cash',     balance: '0.00', currency: 'USD' },
];

// accountIndex: 0=Checking, 1=Savings, 2=Cash
const OPERATION_TEMPLATES = [
  // --- Month 1: days 60-31 ago ---
  { daysAgo: 60, type: 'income',   amount: '3500.00', description: 'Monthly salary',    accountIndex: 0, categoryId: 'seed-cat-salary',        toAccountIndex: null },
  { daysAgo: 59, type: 'expense',  amount: '1200.00', description: 'Rent',              accountIndex: 0, categoryId: 'seed-cat-rent',          toAccountIndex: null },
  { daysAgo: 57, type: 'expense',  amount: '89.50',   description: 'Weekly groceries',  accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 56, type: 'expense',  amount: '42.00',   description: 'Gas station',       accountIndex: 0, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo: 54, type: 'expense',  amount: '28.50',   description: 'Restaurant',        accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 53, type: 'expense',  amount: '15.99',   description: 'Netflix',           accountIndex: 0, categoryId: 'seed-cat-entertainment', toAccountIndex: null },
  { daysAgo: 52, type: 'expense',  amount: '23.00',   description: 'Pharmacy',          accountIndex: 2, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 51, type: 'expense',  amount: '6.50',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 50, type: 'transfer', amount: '300.00',  description: 'ATM withdrawal',    accountIndex: 0, categoryId: null,                     toAccountIndex: 2    },
  { daysAgo: 49, type: 'expense',  amount: '76.30',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 48, type: 'expense',  amount: '45.00',   description: 'Monthly bus pass',  accountIndex: 0, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo: 47, type: 'expense',  amount: '30.00',   description: 'Gym membership',    accountIndex: 0, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 46, type: 'expense',  amount: '52.00',   description: 'Dinner out',        accountIndex: 0, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 45, type: 'expense',  amount: '67.99',   description: 'Amazon order',      accountIndex: 0, categoryId: 'seed-cat-shopping',      toAccountIndex: null },
  { daysAgo: 44, type: 'expense',  amount: '85.00',   description: 'Electricity bill',  accountIndex: 0, categoryId: 'seed-cat-utilities',     toAccountIndex: null },
  { daysAgo: 43, type: 'income',   amount: '800.00',  description: 'Freelance project', accountIndex: 0, categoryId: 'seed-cat-freelance',     toAccountIndex: null },
  { daysAgo: 42, type: 'expense',  amount: '5.50',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 41, type: 'expense',  amount: '93.20',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 40, type: 'expense',  amount: '150.00',  description: 'Dentist',           accountIndex: 0, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 39, type: 'expense',  amount: '38.50',   description: 'Restaurant',        accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 38, type: 'expense',  amount: '45.00',   description: 'Phone bill',        accountIndex: 0, categoryId: 'seed-cat-utilities',     toAccountIndex: null },
  { daysAgo: 37, type: 'expense',  amount: '29.99',   description: 'Bookstore',         accountIndex: 0, categoryId: 'seed-cat-shopping',      toAccountIndex: null },
  { daysAgo: 36, type: 'expense',  amount: '7.00',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 35, type: 'expense',  amount: '81.70',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 34, type: 'expense',  amount: '48.00',   description: 'Gas station',       accountIndex: 0, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo: 33, type: 'expense',  amount: '24.00',   description: 'Movie tickets',     accountIndex: 0, categoryId: 'seed-cat-entertainment', toAccountIndex: null },
  { daysAgo: 32, type: 'transfer', amount: '200.00',  description: 'Savings transfer',  accountIndex: 0, categoryId: null,                     toAccountIndex: 1    },
  { daysAgo: 31, type: 'expense',  amount: '44.00',   description: 'Restaurant',        accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  // --- Month 2: days 30-0 ago ---
  { daysAgo: 30, type: 'income',   amount: '3500.00', description: 'Monthly salary',    accountIndex: 0, categoryId: 'seed-cat-salary',        toAccountIndex: null },
  { daysAgo: 29, type: 'expense',  amount: '1200.00', description: 'Rent',              accountIndex: 0, categoryId: 'seed-cat-rent',          toAccountIndex: null },
  { daysAgo: 28, type: 'expense',  amount: '59.99',   description: 'Internet bill',     accountIndex: 0, categoryId: 'seed-cat-utilities',     toAccountIndex: null },
  { daysAgo: 27, type: 'expense',  amount: '88.40',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 26, type: 'expense',  amount: '5.00',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 25, type: 'expense',  amount: '39.00',   description: 'Gas station',       accountIndex: 0, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo: 24, type: 'expense',  amount: '62.00',   description: 'Dinner',            accountIndex: 0, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 23, type: 'expense',  amount: '35.00',   description: 'Haircut',           accountIndex: 2, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 22, type: 'expense',  amount: '30.00',   description: 'Gym membership',    accountIndex: 0, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 21, type: 'expense',  amount: '125.00',  description: 'Clothes shopping',  accountIndex: 0, categoryId: 'seed-cat-shopping',      toAccountIndex: null },
  { daysAgo: 20, type: 'expense',  amount: '71.90',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 19, type: 'expense',  amount: '6.00',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 18, type: 'expense',  amount: '18.00',   description: 'Cinema',            accountIndex: 0, categoryId: 'seed-cat-entertainment', toAccountIndex: null },
  { daysAgo: 17, type: 'expense',  amount: '15.50',   description: 'Pharmacy',          accountIndex: 2, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo: 16, type: 'transfer', amount: '500.00',  description: 'Savings transfer',  accountIndex: 0, categoryId: null,                     toAccountIndex: 1    },
  { daysAgo: 15, type: 'expense',  amount: '48.50',   description: 'Restaurant',        accountIndex: 0, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 14, type: 'expense',  amount: '95.60',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo: 13, type: 'income',   amount: '450.00',  description: 'Freelance payment', accountIndex: 0, categoryId: 'seed-cat-freelance',     toAccountIndex: null },
  { daysAgo: 12, type: 'expense',  amount: '3.50',    description: 'Bus ticket',        accountIndex: 2, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo: 11, type: 'expense',  amount: '5.50',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo: 10, type: 'expense',  amount: '199.99',  description: 'Headphones',        accountIndex: 0, categoryId: 'seed-cat-shopping',      toAccountIndex: null },
  { daysAgo:  9, type: 'expense',  amount: '33.00',   description: 'Restaurant',        accountIndex: 0, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo:  8, type: 'expense',  amount: '82.30',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo:  7, type: 'expense',  amount: '51.00',   description: 'Gas station',       accountIndex: 0, categoryId: 'seed-cat-transport',     toAccountIndex: null },
  { daysAgo:  6, type: 'expense',  amount: '4.50',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo:  5, type: 'expense',  amount: '120.00',  description: 'Car insurance',     accountIndex: 0, categoryId: 'seed-cat-utilities',     toAccountIndex: null },
  { daysAgo:  4, type: 'expense',  amount: '29.00',   description: 'Restaurant',        accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo:  3, type: 'expense',  amount: '66.20',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo:  2, type: 'expense',  amount: '6.00',    description: 'Coffee',            accountIndex: 2, categoryId: 'seed-cat-dining',        toAccountIndex: null },
  { daysAgo:  1, type: 'expense',  amount: '12.00',   description: 'Pharmacy',          accountIndex: 2, categoryId: 'seed-cat-health',        toAccountIndex: null },
  { daysAgo:  0, type: 'expense',  amount: '44.80',   description: 'Groceries',         accountIndex: 0, categoryId: 'seed-cat-groceries',     toAccountIndex: null },
  { daysAgo:  0, type: 'income',   amount: '250.00',  description: 'Side project',      accountIndex: 0, categoryId: 'seed-cat-freelance',     toAccountIndex: null },
];

export function generateSeedData(today) {
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const ts = today.toISOString();

  const categories = [
    { id: 'seed-cat-groceries',     name: 'Groceries',    type: 'entry', categoryType: 'expense', icon: 'cart',                  isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-dining',        name: 'Dining',        type: 'entry', categoryType: 'expense', icon: 'silverware-fork-knife', isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-transport',     name: 'Transport',     type: 'entry', categoryType: 'expense', icon: 'car',                   isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-utilities',     name: 'Utilities',     type: 'entry', categoryType: 'expense', icon: 'lightning-bolt',        isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-entertainment', name: 'Entertainment', type: 'entry', categoryType: 'expense', icon: 'movie',                 isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-health',        name: 'Health',        type: 'entry', categoryType: 'expense', icon: 'heart-pulse',           isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-shopping',      name: 'Shopping',      type: 'entry', categoryType: 'expense', icon: 'shopping',              isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-rent',          name: 'Rent',          type: 'entry', categoryType: 'expense', icon: 'home',                  isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-salary',        name: 'Salary',        type: 'entry', categoryType: 'income',  icon: 'cash',                  isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
    { id: 'seed-cat-freelance',     name: 'Freelance',     type: 'entry', categoryType: 'income',  icon: 'laptop',                isShadow: 0, parentId: null, createdAt: ts, updatedAt: ts },
  ];

  const operationTemplates = OPERATION_TEMPLATES.map(t => ({
    ...t,
    date: daysAgo(t.daysAgo),
    createdAt: ts,
  }));

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const budgets = [
    { id: 'seed-bgt-groceries', categoryId: 'seed-cat-groceries', amount: '400.00', currency: 'USD', periodType: 'monthly', startDate: startOfMonth, endDate: null, isRecurring: 1, rolloverEnabled: 0, createdAt: ts, updatedAt: ts },
    { id: 'seed-bgt-dining',    categoryId: 'seed-cat-dining',    amount: '200.00', currency: 'USD', periodType: 'monthly', startDate: startOfMonth, endDate: null, isRecurring: 1, rolloverEnabled: 0, createdAt: ts, updatedAt: ts },
  ];

  const plannedOperations = [
    { id: 'seed-pln-salary', name: 'Monthly salary', type: 'income',  amount: '3500.00', accountIndex: 0, categoryId: 'seed-cat-salary', toAccountIndex: null, description: 'Regular monthly income', isRecurring: 1, createdAt: ts, updatedAt: ts },
    { id: 'seed-pln-rent',   name: 'Rent',           type: 'expense', amount: '1200.00', accountIndex: 0, categoryId: 'seed-cat-rent',   toAccountIndex: null, description: 'Monthly rent payment',  isRecurring: 1, createdAt: ts, updatedAt: ts },
  ];

  return {
    accountTemplates: ACCOUNT_TEMPLATES,
    categories,
    operationTemplates,
    budgets,
    plannedOperations,
  };
}
