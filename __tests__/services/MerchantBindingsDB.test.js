/**
 * Tests for MerchantBindingsDB.js - Database operations for merchant bindings using Drizzle ORM
 * These tests ensure CRUD operations work correctly for mapping merchants to categories
 */

import * as MerchantBindingsDB from '../../app/services/MerchantBindingsDB';
import * as db from '../../app/services/db';
import { eq, desc } from 'drizzle-orm';

// Mock the database module
jest.mock('../../app/services/db');

describe('MerchantBindingsDB', () => {
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
    it('retrieves all merchant bindings ordered by last_used', async () => {
      const mockBindings = [
        { id: 1, merchantName: 'YANDEX.GO, AM', categoryId: 'transport', lastUsed: '2024-02-01', createdAt: '2024-01-01' },
        { id: 2, merchantName: 'STARBUCKS', categoryId: 'cafe', lastUsed: '2024-01-15', createdAt: '2024-01-01' },
      ];

      mockDrizzle.orderBy.mockResolvedValue(mockBindings);

      const result = await MerchantBindingsDB.getAll();

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.orderBy).toHaveBeenCalled();
      expect(result).toEqual(mockBindings);
    });

    it('returns empty array when no bindings exist', async () => {
      mockDrizzle.orderBy.mockResolvedValue([]);

      const result = await MerchantBindingsDB.getAll();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.orderBy.mockRejectedValue(error);

      await expect(MerchantBindingsDB.getAll()).rejects.toThrow('Database error');
    });
  });

  describe('getByMerchantName', () => {
    it('retrieves binding by merchant name', async () => {
      const mockBinding = { id: 1, merchantName: 'YANDEX.GO, AM', categoryId: 'transport', lastUsed: '2024-01-01', createdAt: '2024-01-01' };
      mockDrizzle.limit.mockResolvedValue([mockBinding]);

      const result = await MerchantBindingsDB.getByMerchantName('YANDEX.GO, AM');

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
      expect(mockDrizzle.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockBinding);
    });

    it('returns null when binding does not exist', async () => {
      mockDrizzle.limit.mockResolvedValue([]);

      const result = await MerchantBindingsDB.getByMerchantName('UNKNOWN MERCHANT');

      expect(result).toBeNull();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.limit.mockRejectedValue(error);

      await expect(MerchantBindingsDB.getByMerchantName('YANDEX.GO, AM')).rejects.toThrow('Database error');
    });
  });

  describe('create', () => {
    it('creates a new merchant binding', async () => {
      const merchantName = 'YANDEX.GO, AM';
      const categoryId = 'transport';

      const expectedResult = {
        id: 1,
        merchantName,
        categoryId,
        lastUsed: expect.any(String),
        createdAt: expect.any(String),
      };

      mockDrizzle.returning.mockResolvedValue([expectedResult]);

      const result = await MerchantBindingsDB.create(merchantName, categoryId);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.insert).toHaveBeenCalled();
      expect(mockDrizzle.values).toHaveBeenCalled();
      expect(mockDrizzle.returning).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('throws error when database insert fails', async () => {
      const error = new Error('Unique constraint violation');
      mockDrizzle.returning.mockRejectedValue(error);

      await expect(MerchantBindingsDB.create('YANDEX.GO, AM', 'transport')).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('update', () => {
    it('updates merchant binding with new category ID', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await MerchantBindingsDB.update(1, 'new-category');

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.update).toHaveBeenCalled();
      expect(mockDrizzle.set).toHaveBeenCalledWith({
        categoryId: 'new-category',
        lastUsed: expect.any(String),
      });
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(MerchantBindingsDB.update(1, 'new-category')).rejects.toThrow('Database error');
    });
  });

  describe('deleteBinding', () => {
    it('deletes merchant binding by ID', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await MerchantBindingsDB.deleteBinding(1);

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.delete).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when database delete fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(MerchantBindingsDB.deleteBinding(1)).rejects.toThrow('Database error');
    });
  });

  describe('updateLastUsed', () => {
    it('updates last used timestamp', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await MerchantBindingsDB.updateLastUsed(1);

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

      await expect(MerchantBindingsDB.updateLastUsed(1)).rejects.toThrow('Database error');
    });
  });
});
