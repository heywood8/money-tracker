import { generateSeedData } from '../../app/defaults/seedData';

describe('generateSeedData', () => {
  const today = new Date('2026-06-13');
  let data;

  beforeEach(() => {
    data = generateSeedData(today);
  });

  it('returns 3 account templates with zero balance', () => {
    expect(data.accountTemplates).toHaveLength(3);
    expect(data.accountTemplates[0].name).toBe('Checking');
    expect(data.accountTemplates[1].name).toBe('Savings');
    expect(data.accountTemplates[2].name).toBe('Cash');
    data.accountTemplates.forEach(a => expect(a.balance).toBe('0.00'));
  });

  it('returns 10 category objects with required fields', () => {
    expect(data.categories).toHaveLength(10);
    data.categories.forEach(c => {
      expect(c.id).toMatch(/^seed-cat-/);
      expect(typeof c.name).toBe('string');
      expect(['entry', 'folder']).toContain(c.type);
      expect(['expense', 'income']).toContain(c.categoryType);
      expect(typeof c.icon).toBe('string');
      expect(c.isShadow).toBe(0);
    });
  });

  it('operations use categoryId strings not indices', () => {
    const nonTransfers = data.operationTemplates.filter(op => op.type !== 'transfer');
    nonTransfers.forEach(op => {
      expect(typeof op.categoryId).toBe('string');
      expect(op.categoryId).toMatch(/^seed-cat-/);
    });
  });

  it('returns 2 budgets with required fields', () => {
    expect(data.budgets).toHaveLength(2);
    data.budgets.forEach(b => {
      expect(b.id).toMatch(/^seed-bgt-/);
      expect(b.categoryId).toMatch(/^seed-cat-/);
      expect(b.periodType).toBe('monthly');
    });
  });

  it('returns 2 planned operations with required fields', () => {
    expect(data.plannedOperations).toHaveLength(2);
    data.plannedOperations.forEach(p => {
      expect(p.id).toMatch(/^seed-pln-/);
      expect(typeof p.name).toBe('string');
      expect(['income', 'expense', 'transfer']).toContain(p.type);
    });
  });

  it('returns 60 operation templates', () => {
    expect(data.operationTemplates).toHaveLength(60);
  });

  it('all operation dates are within the last 61 days', () => {
    const todayStr = today.toISOString().slice(0, 10);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 61);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    data.operationTemplates.forEach(op => {
      expect(op.date <= todayStr).toBe(true);
      expect(op.date >= cutoffStr).toBe(true);
    });
  });

  it('all operation account indices are 0, 1, or 2', () => {
    data.operationTemplates.forEach(op => {
      expect([0, 1, 2]).toContain(op.accountIndex);
    });
  });

  it('transfer operations have toAccountIndex', () => {
    const transfers = data.operationTemplates.filter(op => op.type === 'transfer');
    transfers.forEach(op => {
      expect(typeof op.toAccountIndex).toBe('number');
    });
  });

  it('produces same output for same today', () => {
    const data2 = generateSeedData(today);
    expect(data.operationTemplates).toEqual(data2.operationTemplates);
  });
});
