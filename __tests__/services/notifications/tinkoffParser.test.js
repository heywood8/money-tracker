/**
 * Tests for the Tinkoff / T-Bank notification parser
 * (`com.idamob.tinkoff.android`), exercised through the public
 * `parseBankNotification` dispatcher.
 *
 * Tinkoff's format differs from Ameria's: the merchant is the notification
 * title, the body is short Russian text with a space-grouped amount and an
 * explicit account currency, and a balance line follows that must be ignored.
 */

import {
  parseBankNotification,
  kindRequiresCategory,
  kindIsTransfer,
} from '../../../app/services/notifications/parseBankNotification';

// The canonical Tinkoff "Платеж" notification from the screenshot.
const TINKOFF_PAYMENT = {
  title: 'МегаФон',
  text: 'Платеж на 1 000 ₽, счет RUB\nБаланс 39 000 ₽',
  packageName: 'com.idamob.tinkoff.android',
  postTime: 1782000900000,
};

describe('Tinkoff notification parser', () => {
  describe('canonical Платеж (payment) template', () => {
    let result;
    beforeEach(() => {
      result = parseBankNotification(TINKOFF_PAYMENT);
    });

    it('recognizes the notification and returns an object', () => {
      expect(result).not.toBeNull();
    });

    it('maps Платеж to an expense operation', () => {
      expect(result.kind).toBe('ПЛАТЕЖ');
      expect(result.type).toBe('expense');
    });

    it('extracts and normalizes the amount (strips the space grouping)', () => {
      expect(result.amount).toBe('1000');
    });

    it('uses the transaction amount, never the balance amount', () => {
      expect(result.amount).not.toBe('39000');
      const { raw, ...structured } = result;
      expect(JSON.stringify(structured)).not.toContain('39000');
    });

    it('extracts the account currency from "счет RUB"', () => {
      expect(result.currency).toBe('RUB');
    });

    it('takes the merchant from the notification title', () => {
      expect(result.merchant).toBe('МегаФон');
    });

    it('has no card mask (this format carries none)', () => {
      expect(result.cardMask).toBeNull();
    });

    it('has no country', () => {
      expect(result.country).toBeNull();
    });

    it('leaves date/time null so the pipeline uses the post time', () => {
      expect(result.date).toBeNull();
      expect(result.time).toBeNull();
    });

    it('does not require a manual category', () => {
      expect(result.requiresCategory).toBe(false);
    });

    it('is not a transfer', () => {
      expect(result.isTransfer).toBe(false);
    });

    it('passes through the source package name', () => {
      expect(result.packageName).toBe('com.idamob.tinkoff.android');
    });

    it('keeps the raw text for auditing', () => {
      expect(result.raw).toBe(TINKOFF_PAYMENT.text);
    });
  });

  describe('other expense kinds', () => {
    it('maps Покупка to an expense', () => {
      const result = parseBankNotification({
        title: 'Пятерочка',
        text: 'Покупка на 549,90 ₽, счет RUB\nБаланс 12 300,10 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ПОКУПКА');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe('549.90');
      expect(result.merchant).toBe('Пятерочка');
    });

    it('maps Оплата to an expense', () => {
      const result = parseBankNotification({
        title: 'ЖКХ',
        text: 'Оплата 2 500 ₽, счет RUB',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ОПЛАТА');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe('2500');
    });

    it('maps Списание to an expense', () => {
      const result = parseBankNotification({
        title: 'Яндекс.Плюс',
        text: 'Списание 299 ₽, счет RUB\nБаланс 5 00 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('СПИСАНИЕ');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe('299');
    });
  });

  describe('income kinds', () => {
    it('maps Пополнение to income', () => {
      const result = parseBankNotification({
        title: 'Иван И.',
        text: 'Пополнение на 5 000 ₽, счет RUB\nБаланс 44 000 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ПОПОЛНЕНИЕ');
      expect(result.type).toBe('income');
      expect(result.amount).toBe('5000');
      expect(result.merchant).toBe('Иван И.');
    });

    it('maps Возврат to income', () => {
      const result = parseBankNotification({
        title: 'OZON',
        text: 'Возврат 1 200 ₽, счет RUB',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ВОЗВРАТ');
      expect(result.type).toBe('income');
      expect(result.amount).toBe('1200');
    });
  });

  describe('"Доступно" available-balance template (single line, no merchant)', () => {
    // The newer T-Bank template: no merchant title, and the available balance
    // ("Доступно") trails the transaction on the same line after ". ".
    const TINKOFF_TOPUP = {
      text: 'Пополнение на 242 787,85 ₽, счет RUB. Доступно 281 787,85 ₽',
      packageName: 'com.idamob.tinkoff.android',
      postTime: 1782000900000,
    };

    let result;
    beforeEach(() => {
      result = parseBankNotification(TINKOFF_TOPUP);
    });

    it('recognizes the notification and returns an object', () => {
      expect(result).not.toBeNull();
    });

    it('maps Пополнение to an income operation', () => {
      expect(result.kind).toBe('ПОПОЛНЕНИЕ');
      expect(result.type).toBe('income');
    });

    it('extracts the transaction amount, stripping the space grouping', () => {
      expect(result.amount).toBe('242787.85');
    });

    it('never reads the "Доступно" available-balance amount', () => {
      expect(result.amount).not.toBe('281787.85');
      const { raw, ...structured } = result;
      expect(JSON.stringify(structured)).not.toContain('281787');
    });

    it('extracts the account currency from "счет RUB"', () => {
      expect(result.currency).toBe('RUB');
    });

    it('has no merchant when the title is absent', () => {
      expect(result.merchant).toBeNull();
    });

    it('keeps the full raw text for auditing', () => {
      expect(result.raw).toBe(TINKOFF_TOPUP.text);
    });

    it('strips a "Доступно" balance even for an expense kind on one line', () => {
      const expense = parseBankNotification({
        title: 'Пятерочка',
        text: 'Покупка на 549,90 ₽, счет RUB. Доступно 12 300,10 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(expense.type).toBe('expense');
      expect(expense.amount).toBe('549.90');
      expect(expense.amount).not.toBe('12300.10');
    });
  });

  describe('kind keyword handling', () => {
    it('folds ё so Платёж is recognized as ПЛАТЕЖ', () => {
      const result = parseBankNotification({
        title: 'МегаФон',
        text: 'Платёж на 1 000 ₽, счет RUB',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ПЛАТЕЖ');
      expect(result.type).toBe('expense');
    });

    it('recognizes the kind case-insensitively', () => {
      const result = parseBankNotification({
        title: 'МегаФон',
        text: 'ПЛАТЕЖ на 1 000 ₽, счет RUB',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.kind).toBe('ПЛАТЕЖ');
    });
  });

  describe('amount normalization', () => {
    const amountFor = (body) =>
      parseBankNotification({
        title: 'Shop',
        text: `Покупка ${body}`,
        packageName: 'com.idamob.tinkoff.android',
      })?.amount;

    it('handles a whole-number amount with no grouping', () => {
      expect(amountFor('500 ₽, счет RUB')).toBe('500');
    });

    it('strips a non-breaking-space thousands group', () => {
      expect(amountFor('1 234 ₽, счет RUB')).toBe('1234');
    });

    it('strips a narrow no-break-space thousands group', () => {
      expect(amountFor('1 234 567 ₽, счет RUB')).toBe('1234567');
    });

    it('reads comma as the decimal separator', () => {
      expect(amountFor('12,50 ₽, счет RUB')).toBe('12.50');
    });

    it('reads dot-grouping with comma decimal', () => {
      expect(amountFor('1.234,56 ₽, счет RUB')).toBe('1234.56');
    });

    it('does not corrupt a comma decimal by 100x', () => {
      expect(amountFor('42,50 ₽, счет RUB')).not.toBe('4250');
    });
  });

  describe('currency handling', () => {
    it('prefers the explicit "счет" ISO code over the amount symbol', () => {
      const result = parseBankNotification({
        title: 'Shop',
        text: 'Покупка на 1 000 ₽, счет RUB',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.currency).toBe('RUB');
    });

    it('falls back to the ₽ symbol when no "счет" segment is present', () => {
      const result = parseBankNotification({
        title: 'Shop',
        text: 'Покупка на 1 000 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.currency).toBe('RUB');
    });
  });

  describe('optional card mask', () => {
    it('extracts a masked card number when one is present', () => {
      const result = parseBankNotification({
        title: 'МегаФон',
        text: 'Платеж на 1 000 ₽, счет RUB, карта *1234\nБаланс 39 000 ₽',
        packageName: 'com.idamob.tinkoff.android',
      });
      expect(result.cardMask).toBe('*1234');
    });
  });

  describe('source-app dispatch', () => {
    it('routes the Tinkoff package to the Tinkoff parser', () => {
      const result = parseBankNotification(TINKOFF_PAYMENT);
      expect(result).not.toBeNull();
      expect(result.packageName).toBe('com.idamob.tinkoff.android');
    });

    it('parses via fallback when the package is missing (manual paste)', () => {
      const result = parseBankNotification({
        title: 'МегаФон',
        text: 'Платеж на 1 000 ₽, счет RUB\nБаланс 39 000 ₽',
      });
      expect(result).not.toBeNull();
      expect(result.kind).toBe('ПЛАТЕЖ');
    });

    it('does not misparse an Ameria pipe notification', () => {
      // Ameria text has no Cyrillic kind, so the Tinkoff parser returns null and
      // the Ameria parser handles it — the result must be the Ameria PURCHASE.
      const result = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
        packageName: 'com.banqr.ameriabank',
      });
      expect(result.kind).toBe('PURCHASE');
      expect(result.currency).toBe('AMD');
    });
  });

  describe('per-app kind helpers', () => {
    it('never requires a manual category for a Tinkoff kind', () => {
      expect(kindRequiresCategory('ПЛАТЕЖ', 'com.idamob.tinkoff.android')).toBe(false);
      expect(kindRequiresCategory('ПОКУПКА', 'com.idamob.tinkoff.android')).toBe(false);
    });

    it('never treats a Tinkoff kind as a transfer', () => {
      expect(kindIsTransfer('ПЛАТЕЖ', 'com.idamob.tinkoff.android')).toBe(false);
      expect(kindIsTransfer('ПОПОЛНЕНИЕ', 'com.idamob.tinkoff.android')).toBe(false);
    });
  });

  describe('rejection of non-transaction notifications', () => {
    it('returns null for an unknown Russian kind (e.g. Перевод, not yet handled)', () => {
      expect(
        parseBankNotification({
          title: 'Иван И.',
          text: 'Перевод 1 000 ₽, счет RUB',
          packageName: 'com.idamob.tinkoff.android',
        }),
      ).toBeNull();
    });

    it('returns null for an informational message with no kind', () => {
      expect(
        parseBankNotification({
          title: 'Тинькофф',
          text: 'Ваш код подтверждения: 1234',
          packageName: 'com.idamob.tinkoff.android',
        }),
      ).toBeNull();
    });

    it('returns null when the amount is missing', () => {
      expect(
        parseBankNotification({
          title: 'МегаФон',
          text: 'Платеж выполнен, счет RUB',
          packageName: 'com.idamob.tinkoff.android',
        }),
      ).toBeNull();
    });

    it('returns null for empty or malformed input', () => {
      expect(
        parseBankNotification({ text: '', packageName: 'com.idamob.tinkoff.android' }),
      ).toBeNull();
      expect(
        parseBankNotification({ packageName: 'com.idamob.tinkoff.android' }),
      ).toBeNull();
    });
  });
});
