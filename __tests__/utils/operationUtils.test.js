/**
 * operationUtils Tests
 *
 * Covers buildRepeatedOperation — the QoL-7 "Repeat" payload builder that
 * duplicates an existing operation onto a new date.
 */

import { buildRepeatedOperation } from '../../app/utils/operationUtils';

const TODAY = '2026-07-19';

describe('buildRepeatedOperation', () => {
  it('re-stamps the date and copies money-bearing fields of an expense', () => {
    const source = {
      id: 'op-1',
      type: 'expense',
      amount: '12.50',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      toAccountId: null,
      date: '2026-01-01',
      description: 'Coffee',
      excludeFromAvg: false,
      createdAt: '2026-01-01T08:00:00.000Z',
    };

    const result = buildRepeatedOperation(source, TODAY);

    expect(result).toEqual({
      type: 'expense',
      amount: '12.50',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      toAccountId: null,
      date: TODAY,
      description: 'Coffee',
      exchangeRate: undefined,
      destinationAmount: undefined,
      sourceCurrency: undefined,
      destinationCurrency: undefined,
      excludeFromAvg: false,
    });
  });

  it('drops volatile per-event context (id, createdAt, coordinates)', () => {
    const source = {
      id: 'op-1',
      type: 'income',
      amount: '100.00',
      accountId: 'acc-1',
      categoryId: 'cat-2',
      date: '2026-01-01',
      createdAt: '2026-01-01T08:00:00.000Z',
      latitude: 55.75,
      longitude: 37.61,
      excludeFromAvg: true,
    };

    const result = buildRepeatedOperation(source, TODAY);

    expect(result.id).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
    // excludeFromAvg must survive so a repeated non-spending entry stays excluded.
    expect(result.excludeFromAvg).toBe(true);
  });

  it('preserves the multi-currency transfer metadata', () => {
    const source = {
      id: 'op-3',
      type: 'transfer',
      amount: '100.00',
      accountId: 'acc-usd',
      categoryId: null,
      toAccountId: 'acc-eur',
      date: '2026-01-01',
      exchangeRate: '0.92',
      destinationAmount: '92.00',
      sourceCurrency: 'USD',
      destinationCurrency: 'EUR',
    };

    const result = buildRepeatedOperation(source, TODAY);

    expect(result).toMatchObject({
      type: 'transfer',
      accountId: 'acc-usd',
      toAccountId: 'acc-eur',
      date: TODAY,
      exchangeRate: '0.92',
      destinationAmount: '92.00',
      sourceCurrency: 'USD',
      destinationCurrency: 'EUR',
    });
  });
});
