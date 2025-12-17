/**
 * Tests for ArcaParser.js - ARCA bank notification parser
 * These tests ensure ARCA notification format is correctly parsed
 */

import * as ArcaParser from '../../../app/services/notification/parsers/ArcaParser';

describe('ArcaParser', () => {
  describe('canParse', () => {
    it('returns true for ARCA notifications with title', () => {
      const result = ArcaParser.canParse('ARCA transactions', 'Some body');
      expect(result).toBe(true);
    });

    it('returns true for ARCA notifications in body', () => {
      const result = ArcaParser.canParse('Bank notification', 'ARCA PRE-PURCHASE ...');
      expect(result).toBe(true);
    });

    it('returns true regardless of case', () => {
      expect(ArcaParser.canParse('arca transactions', '')).toBe(true);
      expect(ArcaParser.canParse('ARCA Transactions', '')).toBe(true);
    });

    it('returns false for non-ARCA notifications', () => {
      const result = ArcaParser.canParse('ACBA Bank', 'Payment notification');
      expect(result).toBe(false);
    });

    it('returns false for empty notifications', () => {
      const result = ArcaParser.canParse('', '');
      expect(result).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses standard ARCA notification correctly', () => {
      const title = 'ARCA transactions';
      const body = 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD';

      const result = ArcaParser.parse(title, body);

      expect(result).toEqual({
        type: 'expense',
        amount: '1300.00',
        currency: 'AMD',
        cardMask: '4083***7027',
        merchantName: 'YANDEX.GO, AM',
        date: '2025-12-11',
        balance: '475760.04',
        balanceCurrency: 'AMD',
        rawText: body,
        bankName: 'ARCA',
        transactionTypeRaw: 'PRE-PURCHASE',
      });
    });

    it('parses notification with different transaction type', () => {
      const body = 'PURCHASE | 500.00 AMD | 4083***7027, | SUPERMARKET | 15.12.2025 10:30 | BALANCE: 475,260.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('expense');
      expect(result.transactionTypeRaw).toBe('PURCHASE');
      expect(result.amount).toBe('500.00');
    });

    it('parses notification with refund as income', () => {
      const body = 'REFUND | 100.00 AMD | 4083***7027, | ONLINE STORE | 16.12.2025 14:20 | BALANCE: 475,360.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('income');
      expect(result.transactionTypeRaw).toBe('REFUND');
    });

    it('parses notification without balance', () => {
      const body = 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09';

      const result = ArcaParser.parse('ARCA', body);

      expect(result).not.toBeNull();
      expect(result.balance).toBeNull();
      expect(result.balanceCurrency).toBeNull();
    });

    it('parses notification with amount without thousands separator', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.amount).toBe('50.00');
    });

    it('parses notification with different merchant format', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | STARBUCKS YEREVAN | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.merchantName).toBe('STARBUCKS YEREVAN');
    });

    it('returns null for empty body', () => {
      const result = ArcaParser.parse('ARCA', '');

      expect(result).toBeNull();
    });

    it('returns null for invalid format (too few parts)', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027';

      const result = ArcaParser.parse('ARCA', body);

      expect(result).toBeNull();
    });

    it('returns null for invalid amount', () => {
      const body = 'PURCHASE | INVALID | 4083***7027, | CAFE | 11.12.2025 12:09';

      const result = ArcaParser.parse('ARCA', body);

      expect(result).toBeNull();
    });

    it('returns null for invalid date', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE | INVALID DATE | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result).toBeNull();
    });

    it('handles merchant name with trailing comma', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE, | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.merchantName).toBe('CAFE');
    });

    it('normalizes merchant name with extra whitespace', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, |  CAFE   YEREVAN  | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.merchantName).toBe('CAFE YEREVAN');
    });

    it('parses card mask with trailing comma', () => {
      const body = 'PURCHASE | 50.00 AMD | 4083***7027, | CAFE | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.cardMask).toBe('4083***7027');
    });
  });

  describe('Edge Cases', () => {
    it('handles withdrawal transaction type', () => {
      const body = 'WITHDRAWAL | 100.00 AMD | 4083***7027, | ATM | 11.12.2025 12:09 | BALANCE: 475,660.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('expense');
    });

    it('handles deposit transaction type', () => {
      const body = 'DEPOSIT | 1000.00 AMD | 4083***7027, | BRANCH | 11.12.2025 12:09 | BALANCE: 476,760.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('income');
    });

    it('handles transfer transaction type', () => {
      const body = 'TRANSFER | 500.00 AMD | 4083***7027, | TO ACCOUNT | 11.12.2025 12:09 | BALANCE: 475,260.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('transfer');
    });

    it('defaults to expense for unknown transaction type', () => {
      const body = 'UNKNOWN-TYPE | 50.00 AMD | 4083***7027, | MERCHANT | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.type).toBe('expense');
    });

    it('handles large amounts with multiple thousand separators', () => {
      const body = 'PURCHASE | 1,234,567.89 AMD | 4083***7027, | LUXURY STORE | 11.12.2025 12:09 | BALANCE: 475,710.04 AMD';

      const result = ArcaParser.parse('ARCA', body);

      expect(result.amount).toBe('1234567.89');
    });
  });
});
