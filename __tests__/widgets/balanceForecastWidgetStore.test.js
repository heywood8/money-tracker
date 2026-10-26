import * as FileSystem from 'expo-file-system/legacy';
import {
  getWidgetAccountIds,
  setWidgetAccountIds,
  forgetForecastWidget,
  resolveForecastAccounts,
  FORECAST_STORE_PATH,
} from '../../app/widgets/balanceForecastWidgetStore';
import { WIDGET_STORE_PATH } from '../../app/widgets/exchangeRateWidgetStore';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const CARD = { id: 1, name: 'Card', currency: 'USD', balance: '100', hidden: 0 };
const CASH = { id: 2, name: 'Cash', currency: 'EUR', balance: '50', hidden: 0 };
const OLD = { id: 3, name: 'Old', currency: 'USD', balance: '0', hidden: 1 };
const SAVINGS = { id: 4, name: 'Savings', currency: 'RUB', balance: '1000', hidden: 0 };

describe('balanceForecastWidgetStore', () => {
  let disk;

  beforeEach(() => {
    jest.clearAllMocks();
    disk = {};
    FileSystem.getInfoAsync.mockImplementation(async (path) => ({ exists: path in disk }));
    FileSystem.readAsStringAsync.mockImplementation(async (path) => disk[path]);
    FileSystem.writeAsStringAsync.mockImplementation(async (path, text) => { disk[path] = text; });
    FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
  });

  it('remembers which accounts each widget shows, as strings', async () => {
    await setWidgetAccountIds(7, [1, 4]);
    await setWidgetAccountIds(9, ['2']);

    await expect(getWidgetAccountIds(7)).resolves.toEqual(['1', '4']);
    await expect(getWidgetAccountIds(9)).resolves.toEqual(['2']);
  });

  it('keeps a file of its own, apart from the exchange-rate widgets', async () => {
    await setWidgetAccountIds(7, [1]);

    expect(FORECAST_STORE_PATH).not.toBe(WIDGET_STORE_PATH);
    expect(Object.keys(disk)).toEqual([FORECAST_STORE_PATH]);
    expect(JSON.parse(disk[FORECAST_STORE_PATH])).toEqual({ 7: { accountIds: ['1'] } });
  });

  it('remembers a widget set to every account', async () => {
    await setWidgetAccountIds(7, [1]);
    await setWidgetAccountIds(7, null);

    await expect(getWidgetAccountIds(7)).resolves.toBeNull();
    expect(JSON.parse(disk[FORECAST_STORE_PATH])).toEqual({ 7: { accountIds: null } });
  });

  it('has nothing for a widget never configured', async () => {
    await expect(getWidgetAccountIds(7)).resolves.toBeNull();
  });

  it('reads an unreadable file as empty', async () => {
    disk[FORECAST_STORE_PATH] = '{not json';
    await expect(getWidgetAccountIds(7)).resolves.toBeNull();
  });

  it('forgets a removed widget and leaves the others', async () => {
    await setWidgetAccountIds(7, [1]);
    await setWidgetAccountIds(9, [2]);

    await forgetForecastWidget(7);

    await expect(getWidgetAccountIds(7)).resolves.toBeNull();
    await expect(getWidgetAccountIds(9)).resolves.toEqual(['2']);
  });

  it('does not write when forgetting a widget it never knew', async () => {
    await forgetForecastWidget(7);
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  describe('resolveForecastAccounts', () => {
    const ALL = [CARD, CASH, OLD, SAVINGS];

    it('shows every active account on a widget never configured', () => {
      expect(resolveForecastAccounts(ALL, null)).toEqual([CARD, CASH, SAVINGS]);
    });

    it('shows the picked accounts in the Accounts screen’s order, not the pick order', () => {
      expect(resolveForecastAccounts(ALL, ['4', '1'])).toEqual([CARD, SAVINGS]);
    });

    it('matches ids whatever their type', () => {
      expect(resolveForecastAccounts([{ ...CARD, id: '1' }, CASH], ['1', '2'])).toHaveLength(2);
    });

    it('drops picked accounts since deleted or archived', () => {
      expect(resolveForecastAccounts(ALL, ['3', '99'])).toEqual([]);
    });

    it('copes with no account list', () => {
      expect(resolveForecastAccounts(undefined, null)).toEqual([]);
    });
  });
});
