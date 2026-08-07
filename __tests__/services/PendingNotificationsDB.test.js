/**
 * Tests for PendingNotificationsDB.js — the review queue store.
 */

import * as PendingNotificationsDB from '../../app/services/PendingNotificationsDB';
import * as db from '../../app/services/db';

jest.mock('../../app/services/db');

describe('PendingNotificationsDB', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      queryAll: jest.fn(),
      queryFirst: jest.fn(),
      executeQuery: jest.fn(),
    };
    jest.spyOn(db, 'queryAll').mockImplementation(mockDb.queryAll);
    jest.spyOn(db, 'queryFirst').mockImplementation(mockDb.queryFirst);
    jest.spyOn(db, 'executeQuery').mockImplementation(mockDb.executeQuery);
  });

  describe('addPendingNotification', () => {
    it('inserts the descriptor and returns mapped fields', async () => {
      const item = {
        kind: 'PURCHASE',
        type: 'expense',
        amount: '3900.00',
        currency: 'AMD',
        cardMask: '4083***7027',
        merchant: 'NAREK MEHRABYAN',
        country: 'AM',
        date: '2026-06-28',
        time: '10:15',
        accountId: 5,
        categoryId: null,
        packageName: 'am.bank',
        raw: 'PURCHASE | 3,900.00 AMD | ...',
      };
      const result = await PendingNotificationsDB.addPendingNotification(item);

      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO pending_notifications'),
        expect.arrayContaining(['PURCHASE', 'expense', '3900.00', 'AMD', '4083***7027', 'NAREK MEHRABYAN']),
      );
      expect(result).toMatchObject({
        kind: 'PURCHASE',
        amount: '3900.00',
        cardMask: '4083***7027',
        accountId: 5,
        categoryId: null,
      });
      expect(result.id).toBeTruthy();
    });

    it('coerces missing optional fields to null', async () => {
      const result = await PendingNotificationsDB.addPendingNotification({
        kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD',
      });
      expect(result.cardMask).toBeNull();
      expect(result.merchant).toBeNull();
      expect(result.accountId).toBeNull();
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    });

    it('persists the ingestion-time coordinates', async () => {
      const result = await PendingNotificationsDB.addPendingNotification({
        kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD',
        latitude: '40.1', longitude: '44.2',
      });
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('latitude, longitude'),
        expect.arrayContaining(['40.1', '44.2']),
      );
      expect(result).toMatchObject({ latitude: '40.1', longitude: '44.2' });
    });

    it('defaults force_added to 0 for a pipeline-queued item', async () => {
      const result = await PendingNotificationsDB.addPendingNotification({
        kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD',
      });
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('force_added'),
        expect.arrayContaining([0]),
      );
      expect(result.forceAdded).toBe(false);
    });

    it('persists force_added for an explicit user re-add', async () => {
      const result = await PendingNotificationsDB.addPendingNotification({
        kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD', forceAdded: true,
      });
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('force_added'),
        expect.arrayContaining([1]),
      );
      expect(result.forceAdded).toBe(true);
    });

    it('preserves a 0.0 coordinate (does not coerce to null)', async () => {
      const result = await PendingNotificationsDB.addPendingNotification({
        kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD',
        latitude: '0.0', longitude: '0.0',
      });
      expect(result).toMatchObject({ latitude: '0.0', longitude: '0.0' });
    });
  });

  describe('getPendingNotifications', () => {
    it('maps snake_case rows to camelCase', async () => {
      mockDb.queryAll.mockResolvedValue([
        {
          id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
          card_mask: '4083***7027', merchant: 'NAREK MEHRABYAN', country: 'AM',
          date: '2026-06-28', time: '10:15', account_id: 5, category_id: null,
          package_name: 'am.bank', raw: 'raw', created_at: '2026-06-28T10:15:00.000Z',
        },
      ]);
      const list = await PendingNotificationsDB.getPendingNotifications();
      expect(list[0]).toMatchObject({
        id: 'p1', cardMask: '4083***7027', merchant: 'NAREK MEHRABYAN', accountId: 5,
        categoryId: null, packageName: 'am.bank',
      });
    });

    it('reads force_added as a boolean, defaulting a pre-migration row to false', async () => {
      mockDb.queryAll.mockResolvedValue([
        { id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD', force_added: 1, created_at: 'x' },
        { id: 'p2', kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD', force_added: 0, created_at: 'x' },
        // A row written before migration 0027 has no column at all.
        { id: 'p3', kind: 'PURCHASE', type: 'expense', amount: '10', currency: 'AMD', created_at: 'x' },
      ]);
      const list = await PendingNotificationsDB.getPendingNotifications();
      expect(list.map((p) => p.forceAdded)).toEqual([true, false, false]);
    });
  });

  describe('getPendingCount', () => {
    it('returns the count', async () => {
      mockDb.queryFirst.mockResolvedValue({ count: 3 });
      expect(await PendingNotificationsDB.getPendingCount()).toBe(3);
    });
    it('returns 0 on error path', async () => {
      mockDb.queryFirst.mockRejectedValue(new Error('boom'));
      expect(await PendingNotificationsDB.getPendingCount()).toBe(0);
    });
  });

  describe('deletePendingNotification', () => {
    it('deletes by id', async () => {
      await PendingNotificationsDB.deletePendingNotification('p1');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM pending_notifications WHERE id = ?',
        ['p1'],
      );
    });
  });
});
