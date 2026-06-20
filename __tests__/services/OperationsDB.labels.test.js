/**
 * Tests for getDistinctLabels — label autocomplete/aggregation in OperationsDB.
 */

import { getDistinctLabels } from '../../app/services/OperationsDB';
import { queryAll } from '../../app/services/db';

jest.mock('../../app/services/db');
jest.mock('../../app/services/currency');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/defaults/defaultOperations');

describe('OperationsDB.getDistinctLabels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryAll.mockResolvedValue([]);
  });

  it('parses labels out of descriptions and orders by frequency', async () => {
    queryAll.mockResolvedValue([
      { description: 'work | food', category_id: 'c1', cnt: 3 },
      { description: 'food | lunch', category_id: 'c2', cnt: 2 },
      { description: 'work', category_id: 'c1', cnt: 1 },
    ]);

    const labels = await getDistinctLabels(10);
    // food: 3+2=5, work: 3+1=4, lunch: 2
    expect(labels).toEqual(['food', 'work', 'lunch']);
  });

  it('de-duplicates labels case-insensitively', async () => {
    queryAll.mockResolvedValue([
      { description: 'Work', category_id: 'c1', cnt: 1 },
      { description: 'work', category_id: 'c2', cnt: 1 },
    ]);
    const labels = await getDistinctLabels(10);
    expect(labels).toHaveLength(1);
    expect(labels[0].toLowerCase()).toBe('work');
  });

  it('surfaces labels used in the given category first', async () => {
    queryAll.mockResolvedValue([
      { description: 'popular', category_id: 'other', cnt: 50 },
      { description: 'incat', category_id: 'target', cnt: 1 },
    ]);
    const labels = await getDistinctLabels(10, 'target');
    expect(labels[0]).toBe('incat');
  });

  it('respects the limit', async () => {
    queryAll.mockResolvedValue([
      { description: 'a | b | c | d | e', category_id: 'c1', cnt: 1 },
    ]);
    const labels = await getDistinctLabels(3);
    expect(labels).toHaveLength(3);
  });

  it('excludes nothing extra when there are no rows', async () => {
    queryAll.mockResolvedValue([]);
    expect(await getDistinctLabels(10)).toEqual([]);
  });

  it('parses real labels out of legacy [MoneyOK] descriptions but hides the marker', async () => {
    queryAll.mockResolvedValue([
      { description: '[MoneyOK] | groceries', category_id: 'c1', cnt: 5 },
      { description: 'real', category_id: 'c1', cnt: 1 },
    ]);
    const labels = await getDistinctLabels(10);
    expect(labels).toEqual(expect.arrayContaining(['groceries', 'real']));
    expect(labels).not.toContain('[MoneyOK]');
  });

  it('excludes imported metadata labels and the [MoneyOK] marker from suggestions', async () => {
    queryAll.mockResolvedValue([
      { description: '[MoneyOK] | Account: Cash | Category: Food | Category group: Expenses | Date: 2025.11.03 | Amount: 1172300 AMD | groceries', category_id: 'c1', cnt: 5 },
    ]);
    const labels = await getDistinctLabels(10);
    expect(labels).toEqual(['groceries']);
  });
});
