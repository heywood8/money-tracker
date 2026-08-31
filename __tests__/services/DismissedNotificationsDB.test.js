/**
 * Tests for DismissedNotificationsDB.js — the rejection log that stops a
 * dismissed bank notification from being re-queued on the next ingestion pass.
 */

import * as DismissedNotificationsDB from '../../app/services/DismissedNotificationsDB';
import * as db from '../../app/services/db';

jest.mock('../../app/services/db');

const RAW = 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD';
const PURCHASE = {
  packageName: 'com.banqr.ameriabank',
  kind: 'PURCHASE',
  type: 'expense',
  amount: '3900.00',
  currency: 'AMD',
  cardMask: '4083***7027',
  merchant: 'NAREK MEHRABYAN',
  date: '2026-06-28',
  time: '10:15',
  raw: RAW,
};
const DAY_MS = 24 * 60 * 60 * 1000;

describe('DismissedNotificationsDB', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      queryAll: jest.fn().mockResolvedValue([]),
      executeQuery: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(db, 'queryAll').mockImplementation(mockDb.queryAll);
    jest.spyOn(db, 'executeQuery').mockImplementation(mockDb.executeQuery);
  });

  describe('notificationFingerprint', () => {
    it('is identical for the parsed descriptor and the pending row it became', () => {
      // The pending row is written by spreading the descriptor, so the two carry
      // the same fields plus the row's own bookkeeping — which must not change
      // the identity, or a dismissal would never match its own notification.
      const descriptor = { ...PURCHASE };
      const row = {
        ...PURCHASE,
        id: 'p1',
        accountId: 7,
        categoryId: 'cat-food',
        country: 'AM',
        forceAdded: false,
        createdAt: '2026-06-28T10:16:00.000Z',
      };
      expect(DismissedNotificationsDB.notificationFingerprint(row))
        .toBe(DismissedNotificationsDB.notificationFingerprint(descriptor));
    });

    it('ignores case and surrounding whitespace', () => {
      expect(DismissedNotificationsDB.notificationFingerprint({ ...PURCHASE, merchant: '  narek mehrabyan ' }))
        .toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
    });

    it('treats a missing field the same as an empty one', () => {
      const withNull = { ...PURCHASE, cardMask: null };
      const without = { ...PURCHASE };
      delete without.cardMask;
      expect(DismissedNotificationsDB.notificationFingerprint(withNull))
        .toBe(DismissedNotificationsDB.notificationFingerprint(without));
    });

    it('ignores the date the item would be booked with', () => {
      // That date is derived from the notification's post time when the bank sent
      // none — and a changed post time is exactly why a notification gets read a
      // second time. Keying on it would miss the re-post this log exists to catch,
      // most of all one landing either side of UTC midnight.
      expect(DismissedNotificationsDB.notificationFingerprint({ ...PURCHASE, date: '2026-06-29', time: null }))
        .toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
    });

    it('distinguishes transactions that differ only in the bank text', () => {
      // Two charges of the same amount at the same shop are still told apart by
      // the time and balance the bank spells out.
      expect(DismissedNotificationsDB.notificationFingerprint({ ...PURCHASE, raw: RAW.replace('10:15', '18:40') }))
        .not.toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
    });

    it.each([
      ['amount', { amount: '3901.00' }],
      ['currency', { currency: 'USD' }],
      ['merchant', { merchant: 'SOMEONE ELSE' }],
      ['card', { cardMask: '4083***9999' }],
      ['source app', { packageName: 'com.other.bank' }],
      ['kind', { kind: 'ATM CASH' }],
    ])('distinguishes transactions that differ by %s', (_label, patch) => {
      expect(DismissedNotificationsDB.notificationFingerprint({ ...PURCHASE, ...patch }))
        .not.toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
    });
  });

  describe('rememberDismissedNotification', () => {
    it('stores the rejection and returns its fingerprint', async () => {
      const fingerprint = await DismissedNotificationsDB.rememberDismissedNotification(PURCHASE);

      expect(fingerprint).toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
      const [sql, params] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO dismissed_notifications');
      expect(params).toEqual(expect.arrayContaining([fingerprint, '3900.00', 'AMD']));
    });

    it('refreshes an existing rejection instead of failing on the unique fingerprint', async () => {
      // Re-dismissing restarts the retention window rather than leaving the row
      // to expire on the first rejection's clock.
      await DismissedNotificationsDB.rememberDismissedNotification(PURCHASE);
      const [sql] = mockDb.executeQuery.mock.calls[0];
      expect(sql).toContain('ON CONFLICT(fingerprint) DO UPDATE');
      expect(sql).toContain('dismissed_at = excluded.dismissed_at');
    });

    it('prunes rejections older than the retention window', async () => {
      await DismissedNotificationsDB.rememberDismissedNotification(PURCHASE);

      const prune = mockDb.executeQuery.mock.calls.find(
        ([sql]) => sql.startsWith('DELETE FROM dismissed_notifications WHERE dismissed_at'),
      );
      expect(prune).toBeDefined();
      // ~14 days back: past the reach of both rolling windows that can re-present
      // a notification, short of a monthly billing cycle.
      const cutoff = new Date(prune[1][0]).getTime();
      expect(Math.abs(cutoff - (Date.now() - 14 * DAY_MS))).toBeLessThan(60 * 1000);
    });

    it('still reports the rejection as stored when the prune fails', async () => {
      mockDb.executeQuery.mockImplementation(async (sql) => {
        if (sql.startsWith('DELETE')) throw new Error('db busy');
      });

      await expect(DismissedNotificationsDB.rememberDismissedNotification(PURCHASE))
        .resolves.toBe(DismissedNotificationsDB.notificationFingerprint(PURCHASE));
    });

    it('returns null rather than throwing when the insert fails', async () => {
      mockDb.executeQuery.mockRejectedValue(new Error('db down'));
      await expect(DismissedNotificationsDB.rememberDismissedNotification(PURCHASE)).resolves.toBeNull();
    });

    it('is a no-op for a missing item', async () => {
      await expect(DismissedNotificationsDB.rememberDismissedNotification(null)).resolves.toBeNull();
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('loadDismissedFingerprints', () => {
    it('returns every stored fingerprint as a set', async () => {
      mockDb.queryAll.mockResolvedValue([{ fingerprint: 'a' }, { fingerprint: 'b' }]);
      await expect(DismissedNotificationsDB.loadDismissedFingerprints())
        .resolves.toEqual(new Set(['a', 'b']));
    });

    it('excludes expired rejections at read time, not just on the prune', async () => {
      // Pruning only runs on a write, so a user who stops dismissing would keep
      // enforcing every old rejection forever if the read did not filter too.
      await DismissedNotificationsDB.loadDismissedFingerprints();
      const [sql, params] = mockDb.queryAll.mock.calls[0];
      expect(sql).toContain('WHERE dismissed_at >= ?');
      expect(Math.abs(new Date(params[0]).getTime() - (Date.now() - 14 * DAY_MS))).toBeLessThan(60 * 1000);
    });

    it('degrades to an empty set on failure, so ingestion is never blocked', async () => {
      // An unremembered rejection is recoverable (dismiss it again); a swallowed
      // notification is not.
      mockDb.queryAll.mockRejectedValue(new Error('db down'));
      await expect(DismissedNotificationsDB.loadDismissedFingerprints()).resolves.toEqual(new Set());
    });
  });

  describe('forgetDismissedNotification', () => {
    it('deletes the rejection by fingerprint', async () => {
      await DismissedNotificationsDB.forgetDismissedNotification(PURCHASE);
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM dismissed_notifications WHERE fingerprint = ?',
        [DismissedNotificationsDB.notificationFingerprint(PURCHASE)],
      );
    });

    it('swallows a delete failure', async () => {
      mockDb.executeQuery.mockRejectedValue(new Error('db down'));
      await expect(DismissedNotificationsDB.forgetDismissedNotification(PURCHASE)).resolves.toBeUndefined();
    });
  });
});
