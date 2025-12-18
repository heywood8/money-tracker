/**
 * Tests for NotificationParser.js - Main notification parsing service
 * These tests ensure notifications are correctly routed to appropriate parsers
 */

import * as NotificationParser from '../../../app/services/notification/NotificationParser';

describe('NotificationParser', () => {
  describe('parseNotification', () => {
    it('parses ARCA notification correctly', () => {
      const title = 'ARCA transactions';
      const body = 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD';

      const result = NotificationParser.parseNotification(title, body);

      expect(result).not.toBeNull();
      expect(result.bankName).toBe('ARCA');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe('1300.00');
      expect(result.currency).toBe('AMD');
      expect(result.cardMask).toBe('4083***7027');
      expect(result.merchantName).toBe('YANDEX.GO, AM');
      expect(result.date).toBe('2025-12-11');
    });

    it('returns null for empty title and body', () => {
      const result = NotificationParser.parseNotification('', '');

      expect(result).toBeNull();
    });

    it('returns null for unknown bank notification', () => {
      const title = 'Unknown Bank';
      const body = 'Some transaction notification';

      const result = NotificationParser.parseNotification(title, body);

      expect(result).toBeNull();
    });

    it('returns null when parser fails', () => {
      const title = 'ARCA transactions';
      const body = 'Invalid format';

      const result = NotificationParser.parseNotification(title, body);

      expect(result).toBeNull();
    });

    it('validates required fields are present', () => {
      const title = 'ARCA transactions';
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE | 11.12.2025 12:09';

      const result = NotificationParser.parseNotification(title, body);

      expect(result).not.toBeNull();
      expect(result.amount).toBeDefined();
      expect(result.currency).toBeDefined();
      expect(result.date).toBeDefined();
    });

    it('handles notification with only body (no title)', () => {
      const body = 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD';

      const result = NotificationParser.parseNotification('', body);

      // Will fail because canParse looks for "arca" in title or body
      // But body doesn't contain "arca" - this is expected behavior
      expect(result).toBeNull();
    });

    it('handles notification with ARCA in body', () => {
      const title = 'Bank Notification';
      const body = 'ARCA PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD';

      const result = NotificationParser.parseNotification(title, body);

      // This should work because "ARCA" is in the body
      expect(result).not.toBeNull();
      expect(result.bankName).toBe('ARCA');
    });
  });

  describe('canParseNotification', () => {
    it('returns true for ARCA notifications', () => {
      const result = NotificationParser.canParseNotification('ARCA transactions', 'Some body');

      expect(result).toBe(true);
    });

    it('returns false for unknown bank notifications', () => {
      const result = NotificationParser.canParseNotification('Unknown Bank', 'Some body');

      expect(result).toBe(false);
    });

    it('returns false for empty notifications', () => {
      const result = NotificationParser.canParseNotification('', '');

      expect(result).toBe(false);
    });
  });

  describe('getBankName', () => {
    it('returns bank name for ARCA notification', () => {
      const title = 'ARCA transactions';
      const body = 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD';

      const result = NotificationParser.getBankName(title, body);

      expect(result).toBe('ARCA');
    });

    it('returns null for unknown bank', () => {
      const result = NotificationParser.getBankName('Unknown Bank', 'Some notification');

      expect(result).toBeNull();
    });

    it('returns null when parsing fails', () => {
      const title = 'ARCA transactions';
      const body = 'Invalid format';

      const result = NotificationParser.getBankName(title, body);

      expect(result).toBeNull();
    });
  });

  describe('Integration Tests', () => {
    it('handles complete ARCA transaction flow', () => {
      const title = 'ARCA transactions';
      const body = 'PURCHASE | 2,500.50 AMD | 4083***7027, | ZARA YEREVAN | 17.12.2025 15:45 | BALANCE: 473,259.54 AMD';

      // Check if we can parse it
      expect(NotificationParser.canParseNotification(title, body)).toBe(true);

      // Get bank name
      const bankName = NotificationParser.getBankName(title, body);
      expect(bankName).toBe('ARCA');

      // Parse the notification
      const parsed = NotificationParser.parseNotification(title, body);
      expect(parsed).not.toBeNull();
      expect(parsed.type).toBe('expense');
      expect(parsed.amount).toBe('2500.50');
      expect(parsed.currency).toBe('AMD');
      expect(parsed.cardMask).toBe('4083***7027');
      expect(parsed.merchantName).toBe('ZARA YEREVAN');
      expect(parsed.date).toBe('2025-12-17');
      expect(parsed.balance).toBe('473259.54');
      expect(parsed.bankName).toBe('ARCA');
    });

    it('handles refund transaction', () => {
      const title = 'ARCA transactions';
      const body = 'REFUND | 100.00 AMD | 4083***7027, | ONLINE STORE | 17.12.2025 10:30 | BALANCE: 473,359.54 AMD';

      const parsed = NotificationParser.parseNotification(title, body);

      expect(parsed).not.toBeNull();
      expect(parsed.type).toBe('income');
      expect(parsed.amount).toBe('100.00');
    });

    it('handles different date formats correctly', () => {
      const title = 'ARCA transactions';
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE | 01.01.2025 09:00 | BALANCE: 473,209.54 AMD';

      const parsed = NotificationParser.parseNotification(title, body);

      expect(parsed).not.toBeNull();
      expect(parsed.date).toBe('2025-01-01');
    });
  });

  describe('Error Handling', () => {
    it('handles parser throwing error gracefully', () => {
      // This shouldn't happen in practice, but we test error handling
      const title = 'ARCA transactions';
      const body = null; // This will cause an error in parser

      const result = NotificationParser.parseNotification(title, body);

      expect(result).toBeNull();
    });

    it('returns null when parsed result is missing required fields', () => {
      // We can't directly test this without mocking the parser,
      // but the validation logic is tested through other test cases
      const title = 'ARCA transactions';
      const body = 'INVALID | INVALID | 4083***7027, | MERCHANT | INVALID DATE';

      const result = NotificationParser.parseNotification(title, body);

      expect(result).toBeNull();
    });
  });
});
