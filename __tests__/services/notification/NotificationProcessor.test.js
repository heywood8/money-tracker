/**
 * Tests for NotificationProcessor.js
 * Tests the notification processing flow and operation creation logic
 */

import { notificationProcessor, ProcessingStatus } from '../../../app/services/notification/NotificationProcessor';
import * as CardBindingsDB from '../../../app/services/CardBindingsDB';
import * as MerchantBindingsDB from '../../../app/services/MerchantBindingsDB';
import * as OperationsDB from '../../../app/services/OperationsDB';
import { appEvents, EVENTS } from '../../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../../app/services/CardBindingsDB');
jest.mock('../../../app/services/MerchantBindingsDB');
jest.mock('../../../app/services/OperationsDB');
jest.mock('../../../app/services/eventEmitter', () => ({
  appEvents: {
    emit: jest.fn(),
  },
  EVENTS: {
    OPERATION_CHANGED: 'operation:changed',
  },
}));

describe('NotificationProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear duplicate cache before each test
    notificationProcessor.clearDuplicateCache();
  });

  describe('Validation', () => {
    it('rejects notification with missing amount', async () => {
      const parsed = {
        type: 'expense',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('amount');
    });

    it('rejects notification with invalid amount', async () => {
      const parsed = {
        type: 'expense',
        amount: '-100',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('amount');
    });

    it('rejects notification with missing currency', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('currency');
    });

    it('rejects notification with missing date', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('date');
    });

    it('rejects expense notification without merchant name', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('merchant');
    });

    it('rejects notification with invalid type', async () => {
      const parsed = {
        type: 'invalid',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.INVALID_DATA);
      expect(result.message).toContain('type');
    });

    it('accepts valid expense notification', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      // Mock no bindings found
      CardBindingsDB.getByCardMask.mockResolvedValue(null);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.MISSING_BOTH_BINDINGS);
    });
  });

  describe('Duplicate Detection', () => {
    it('detects duplicate notifications', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1, ...parsed });

      // First processing
      const result1 = await notificationProcessor.processNotification(parsed);
      expect(result1.status).toBe(ProcessingStatus.SUCCESS);

      // Second processing (duplicate)
      const result2 = await notificationProcessor.processNotification(parsed);
      expect(result2.status).toBe(ProcessingStatus.DUPLICATE);
    });

    it('does not flag similar but different notifications as duplicates', async () => {
      const parsed1 = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const parsed2 = {
        type: 'expense',
        amount: '2000', // Different amount
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });

      const result1 = await notificationProcessor.processNotification(parsed1);
      const result2 = await notificationProcessor.processNotification(parsed2);

      expect(result1.status).toBe(ProcessingStatus.SUCCESS);
      expect(result2.status).toBe(ProcessingStatus.SUCCESS);
    });

    it('allows retry of duplicate after clearing cache', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });

      // First processing
      const result1 = await notificationProcessor.processNotification(parsed);
      expect(result1.status).toBe(ProcessingStatus.SUCCESS);

      // Clear cache
      notificationProcessor.clearDuplicateCache();

      // Second processing (should succeed)
      const result2 = await notificationProcessor.processNotification(parsed);
      expect(result2.status).toBe(ProcessingStatus.SUCCESS);
    });
  });

  describe('Binding Checks', () => {
    it('identifies missing card binding', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue(null);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.MISSING_CARD_BINDING);
      expect(result.message).toContain('4083***7027');
    });

    it('identifies missing merchant binding', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.MISSING_MERCHANT_BINDING);
      expect(result.message).toContain('Test Merchant');
    });

    it('identifies missing both bindings', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue(null);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.MISSING_BOTH_BINDINGS);
    });

    it('returns bindings in result when found', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const cardBinding = { id: 1, accountId: 1, cardMask: '4083***7027' };
      const merchantBinding = { id: 2, categoryId: 'cat1', merchantName: 'Test Merchant' };

      CardBindingsDB.getByCardMask.mockResolvedValue(cardBinding);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(merchantBinding);
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.cardBinding).toEqual(cardBinding);
      expect(result.merchantBinding).toEqual(merchantBinding);
    });
  });

  describe('Operation Creation', () => {
    it('creates operation when all bindings exist', async () => {
      const parsed = {
        type: 'expense',
        amount: '1300.00',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'YANDEX.GO',
      };

      const cardBinding = { id: 1, accountId: 1 };
      const merchantBinding = { id: 1, categoryId: 'transport' };

      CardBindingsDB.getByCardMask.mockResolvedValue(cardBinding);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(merchantBinding);
      OperationsDB.createOperation.mockResolvedValue({ id: 123, ...parsed });
      CardBindingsDB.updateLastUsed.mockResolvedValue();
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.SUCCESS);
      expect(result.operation).toBeDefined();
      expect(result.operation.id).toBe(123);

      // Verify operation was created with correct data
      expect(OperationsDB.createOperation).toHaveBeenCalledWith({
        type: 'expense',
        amount: '1300.00',
        accountId: 1,
        categoryId: 'transport',
        date: '2024-12-18',
        description: 'YANDEX.GO',
      });
    });

    it('updates last used timestamps for bindings', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      const cardBinding = { id: 5, accountId: 1 };
      const merchantBinding = { id: 10, categoryId: 'cat1' };

      CardBindingsDB.getByCardMask.mockResolvedValue(cardBinding);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(merchantBinding);
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockResolvedValue();
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      await notificationProcessor.processNotification(parsed);

      expect(CardBindingsDB.updateLastUsed).toHaveBeenCalledWith(5);
      expect(MerchantBindingsDB.updateLastUsed).toHaveBeenCalledWith(10);
    });

    it('emits OPERATION_CHANGED event after creating operation', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockResolvedValue();
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      await notificationProcessor.processNotification(parsed);

      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.OPERATION_CHANGED);
    });

    it('handles operation creation error', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockRejectedValue(new Error('Database error'));

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.OPERATION_ERROR);
      expect(result.message).toContain('Database error');
    });

    it('handles error when updating binding timestamps', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockRejectedValue(new Error('Update failed'));
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      // Should still succeed even if timestamp update fails
      const result = await notificationProcessor.processNotification(parsed);
      expect(result.status).toBe(ProcessingStatus.SUCCESS);
    });
  });

  describe('Retry Processing', () => {
    it('allows retry after bindings are created', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      // First attempt - no bindings
      CardBindingsDB.getByCardMask.mockResolvedValue(null);
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result1 = await notificationProcessor.processNotification(parsed);
      expect(result1.status).toBe(ProcessingStatus.MISSING_BOTH_BINDINGS);

      // Second attempt - bindings now exist
      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockResolvedValue();
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      const result2 = await notificationProcessor.retryProcessing(parsed);
      expect(result2.status).toBe(ProcessingStatus.SUCCESS);
    });

    it('clears duplicate cache on retry', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      MerchantBindingsDB.getByMerchantName.mockResolvedValue({ id: 1, categoryId: 'cat1' });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockResolvedValue();
      MerchantBindingsDB.updateLastUsed.mockResolvedValue();

      // First processing
      const result1 = await notificationProcessor.processNotification(parsed);
      expect(result1.status).toBe(ProcessingStatus.SUCCESS);

      // Retry (should not be flagged as duplicate)
      const result2 = await notificationProcessor.retryProcessing(parsed);
      expect(result2.status).toBe(ProcessingStatus.SUCCESS);
      expect(result2.status).not.toBe(ProcessingStatus.DUPLICATE);
    });
  });

  describe('Edge Cases', () => {
    it('handles notification without card mask', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        merchantName: 'Test Merchant',
        // No cardMask
      };

      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result = await notificationProcessor.processNotification(parsed);

      expect(result.status).toBe(ProcessingStatus.MISSING_MERCHANT_BINDING);
      expect(CardBindingsDB.getByCardMask).not.toHaveBeenCalled();
    });

    it('uses raw text as description when merchant name not available', async () => {
      const parsed = {
        type: 'income',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        rawText: 'Some raw notification text here',
      };

      CardBindingsDB.getByCardMask.mockResolvedValue({ id: 1, accountId: 1 });
      OperationsDB.createOperation.mockResolvedValue({ id: 1 });
      CardBindingsDB.updateLastUsed.mockResolvedValue();

      await notificationProcessor.processNotification(parsed);

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Some raw notification text here',
        })
      );
    });

    it('handles binding lookup errors gracefully', async () => {
      const parsed = {
        type: 'expense',
        amount: '1000',
        currency: 'AMD',
        date: '2024-12-18',
        cardMask: '4083***7027',
        merchantName: 'Test Merchant',
      };

      CardBindingsDB.getByCardMask.mockRejectedValue(new Error('DB error'));
      MerchantBindingsDB.getByMerchantName.mockResolvedValue(null);

      const result = await notificationProcessor.processNotification(parsed);

      // Should treat as missing bindings
      expect(result.status).toBe(ProcessingStatus.MISSING_BOTH_BINDINGS);
    });
  });
});
