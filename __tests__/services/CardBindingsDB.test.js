/**
 * Tests for CardBindingsDB.js - Database operations for card bindings using Drizzle ORM
 * These tests ensure CRUD operations work correctly for mapping cards to accounts
 */

import * as CardBindingsDB from '../../app/services/CardBindingsDB';
import * as db from '../../app/services/db';
import { eq, desc } from 'drizzle-orm';

// Mock the database module
jest.mock('../../app/services/db');

describe('CardBindingsDB', () => {
  let mockDrizzle;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a chainable mock Drizzle instance
    mockDrizzle = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(() => Promise.resolve([])),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    // Mock getDrizzle to return our mock instance
    jest.spyOn(db, 'getDrizzle').mockResolvedValue(mockDrizzle);
  });

  describe('getAll', () => {
    it('retrieves all card bindings ordered by last_used', async () => {
      const mockBindings = [
        { id: 1, cardMask: '4083***7027', accountId: 1, bankName: 'ARCA', lastUsed: '2024-02-01', createdAt: '2024-01-01' },
        { id: 2, cardMask: '5321***1234', accountId: 2, bankName: 'ACBA', lastUsed: '2024-01-15', createdAt: '2024-01-01' },
      ];

      mockDrizzle.orderBy.mockResolvedValue(mockBindings);

      const result = await CardBindingsDB.getAll();

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.orderBy).toHaveBeenCalled();
      expect(result).toEqual(mockBindings);
    });

    it('returns empty array when no bindings exist', async () => {
      mockDrizzle.orderBy.mockResolvedValue([]);

      const result = await CardBindingsDB.getAll();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.orderBy.mockRejectedValue(error);

      await expect(CardBindingsDB.getAll()).rejects.toThrow('Database error');
    });
  });

  describe('getByCardMask', () => {
    it('retrieves binding by card mask', async () => {
      const mockBinding = { id: 1, cardMask: '4083***7027', accountId: 1, bankName: 'ARCA', lastUsed: '2024-01-01', createdAt: '2024-01-01' };
      mockDrizzle.limit.mockResolvedValue([mockBinding]);

      const result = await CardBindingsDB.getByCardMask('4083***7027');

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
      expect(mockDrizzle.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockBinding);
    });

    it('returns null when binding does not exist', async () => {
      mockDrizzle.limit.mockResolvedValue([]);

      const result = await CardBindingsDB.getByCardMask('9999***9999');

      expect(result).toBeNull();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.limit.mockRejectedValue(error);

      await expect(CardBindingsDB.getByCardMask('4083***7027')).rejects.toThrow('Database error');
    });
  });

  describe('create', () => {
    it('creates a new card binding with all fields', async () => {
      const cardMask = '4083***7027';
      const accountId = 1;
      const bankName = 'ARCA';

      const expectedResult = {
        id: 1,
        cardMask,
        accountId,
        bankName,
        lastUsed: expect.any(String),
        createdAt: expect.any(String),
      };

      mockDrizzle.returning.mockResolvedValue([expectedResult]);

      const result = await CardBindingsDB.create(cardMask, accountId, bankName);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.insert).toHaveBeenCalled();
      expect(mockDrizzle.values).toHaveBeenCalled();
      expect(mockDrizzle.returning).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('creates card binding without bank name', async () => {
      const cardMask = '4083***7027';
      const accountId = 1;

      const expectedResult = {
        id: 1,
        cardMask,
        accountId,
        bankName: null,
        lastUsed: expect.any(String),
        createdAt: expect.any(String),
      };

      mockDrizzle.returning.mockResolvedValue([expectedResult]);

      const result = await CardBindingsDB.create(cardMask, accountId);

      expect(result.bankName).toBeNull();
    });

    it('throws error when database insert fails', async () => {
      const error = new Error('Unique constraint violation');
      mockDrizzle.returning.mockRejectedValue(error);

      await expect(CardBindingsDB.create('4083***7027', 1, 'ARCA')).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('update', () => {
    it('updates card binding with new account ID', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await CardBindingsDB.update(1, 2);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.update).toHaveBeenCalled();
      expect(mockDrizzle.set).toHaveBeenCalledWith({
        accountId: 2,
        lastUsed: expect.any(String),
      });
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(CardBindingsDB.update(1, 2)).rejects.toThrow('Database error');
    });
  });

  describe('deleteBinding', () => {
    it('deletes card binding by ID', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await CardBindingsDB.deleteBinding(1);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.delete).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when database delete fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(CardBindingsDB.deleteBinding(1)).rejects.toThrow('Database error');
    });
  });

  describe('updateLastUsed', () => {
    it('updates last used timestamp', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await CardBindingsDB.updateLastUsed(1);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.update).toHaveBeenCalled();
      expect(mockDrizzle.set).toHaveBeenCalledWith({
        lastUsed: expect.any(String),
      });
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(CardBindingsDB.updateLastUsed(1)).rejects.toThrow('Database error');
    });
  });
});
