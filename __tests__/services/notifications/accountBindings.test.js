/**
 * Tests for accountBindings — learned (source app + currency) -> account bindings
 * for card-less bank notifications (e.g. T-Bank SBP "счет RUB").
 */

import * as bindings from '../../../app/services/notifications/accountBindings';
import * as PreferencesDB from '../../../app/services/PreferencesDB';
import * as AccountsDB from '../../../app/services/AccountsDB';

jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { BANK_NOTIFICATIONS_ACCOUNT_BINDINGS: 'bank_notifications_account_bindings' },
  getJsonPreference: jest.fn(),
  setJsonPreference: jest.fn(),
}));
jest.mock('../../../app/services/AccountsDB');

const PKG = 'com.idamob.tinkoff.android';
const KEY = `${PKG}|RUB`;

describe('accountBindings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PreferencesDB.getJsonPreference.mockResolvedValue({});
    PreferencesDB.setJsonPreference.mockResolvedValue(undefined);
  });

  describe('bindingKey', () => {
    it('builds a "<package>|<CURRENCY>" key and uppercases the currency', () => {
      expect(bindings.bindingKey(PKG, 'rub')).toBe(KEY);
    });

    it('is null when either part is missing', () => {
      expect(bindings.bindingKey(null, 'RUB')).toBeNull();
      expect(bindings.bindingKey(PKG, null)).toBeNull();
      expect(bindings.bindingKey('', '')).toBeNull();
    });
  });

  describe('getAccountBindings', () => {
    it('returns the stored map', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3 });
      expect(await bindings.getAccountBindings()).toEqual({ [KEY]: 3 });
    });

    it('coerces a malformed (non-object / array) value to {}', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue([1, 2]);
      expect(await bindings.getAccountBindings()).toEqual({});
      PreferencesDB.getJsonPreference.mockResolvedValue(null);
      expect(await bindings.getAccountBindings()).toEqual({});
    });
  });

  describe('resolveAccountBinding', () => {
    it('resolves the bound, live account', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3 });
      AccountsDB.getAccountById.mockResolvedValue({ id: 3, currency: 'RUB' });
      expect(await bindings.resolveAccountBinding(PKG, 'RUB')).toEqual({ id: 3, currency: 'RUB' });
      expect(AccountsDB.getAccountById).toHaveBeenCalledWith(3);
    });

    it('returns null when no binding exists for the pair', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ 'other|USD': 9 });
      expect(await bindings.resolveAccountBinding(PKG, 'RUB')).toBeNull();
      expect(AccountsDB.getAccountById).not.toHaveBeenCalled();
    });

    it('ignores a binding whose account was deleted or hidden', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3 });
      AccountsDB.getAccountById.mockResolvedValueOnce({ id: 3, deletedAt: '2026-01-01' });
      expect(await bindings.resolveAccountBinding(PKG, 'RUB')).toBeNull();
      AccountsDB.getAccountById.mockResolvedValueOnce({ id: 3, hidden: 1 });
      expect(await bindings.resolveAccountBinding(PKG, 'RUB')).toBeNull();
    });

    it('returns null (never throws) on a missing key or a lookup failure', async () => {
      expect(await bindings.resolveAccountBinding(null, 'RUB')).toBeNull();
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3 });
      AccountsDB.getAccountById.mockRejectedValue(new Error('db down'));
      expect(await bindings.resolveAccountBinding(PKG, 'RUB')).toBeNull();
    });
  });

  describe('learnAccountBinding', () => {
    it('adds a new binding, preserving existing entries', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ 'other|USD': 9 });
      await bindings.learnAccountBinding(PKG, 'RUB', 3);
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_account_bindings',
        { 'other|USD': 9, [KEY]: 3 },
      );
    });

    it('overwrites an existing binding for the same pair', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 1 });
      await bindings.learnAccountBinding(PKG, 'RUB', 3);
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_account_bindings',
        { [KEY]: 3 },
      );
    });

    it('does not write when the pair is already bound to the same account', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3 });
      await bindings.learnAccountBinding(PKG, 'RUB', 3);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });

    it('is a no-op with a missing key or account id', async () => {
      await bindings.learnAccountBinding(null, 'RUB', 3);
      await bindings.learnAccountBinding(PKG, 'RUB', null);
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });
  });

  describe('clearAccountBinding', () => {
    it('removes the pair, keeping others', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ [KEY]: 3, 'other|USD': 9 });
      await bindings.clearAccountBinding(PKG, 'RUB');
      expect(PreferencesDB.setJsonPreference).toHaveBeenCalledWith(
        'bank_notifications_account_bindings',
        { 'other|USD': 9 },
      );
    });

    it('is a no-op when nothing is bound for the pair', async () => {
      PreferencesDB.getJsonPreference.mockResolvedValue({ 'other|USD': 9 });
      await bindings.clearAccountBinding(PKG, 'RUB');
      expect(PreferencesDB.setJsonPreference).not.toHaveBeenCalled();
    });
  });
});
