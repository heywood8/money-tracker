import * as FileSystem from 'expo-file-system/legacy';
import {
  getWidgetConfig,
  setWidgetConfig,
  normalizeColumns,
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

  const ALL_COLUMNS = ['balance', 'daily', 'forecast'];

  it('remembers each widget’s accounts, as strings, and its columns', async () => {
    await setWidgetConfig(7, { accountIds: [1, 4], columns: ['forecast', 'balance'] });
    await setWidgetConfig(9, { accountIds: ['2'], columns: ['daily'] });

    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: ['1', '4'], columns: ['balance', 'forecast'] });
    await expect(getWidgetConfig(9)).resolves.toEqual({ accountIds: ['2'], columns: ['daily'] });
  });

  it('keeps a file of its own, apart from the exchange-rate widgets', async () => {
    await setWidgetConfig(7, { accountIds: [1], columns: ALL_COLUMNS });

    expect(FORECAST_STORE_PATH).not.toBe(WIDGET_STORE_PATH);
    expect(Object.keys(disk)).toEqual([FORECAST_STORE_PATH]);
    expect(JSON.parse(disk[FORECAST_STORE_PATH])).toEqual({ 7: { accountIds: ['1'], columns: ALL_COLUMNS } });
  });

  it('remembers a widget set to every account', async () => {
    await setWidgetConfig(7, { accountIds: [1] });
    await setWidgetConfig(7, { accountIds: null, columns: ['forecast'] });

    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: null, columns: ['forecast'] });
  });

  it('shows every account and column on a widget never configured', async () => {
    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: null, columns: ALL_COLUMNS });
  });

  it('gives a widget saved before there were columns every column', async () => {
    disk[FORECAST_STORE_PATH] = JSON.stringify({ 7: { accountIds: ['1'] } });
    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: ['1'], columns: ALL_COLUMNS });
  });

  it('reads an unreadable file as empty', async () => {
    disk[FORECAST_STORE_PATH] = '{not json';
    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: null, columns: ALL_COLUMNS });
  });

  it('forgets a removed widget and leaves the others', async () => {
    await setWidgetConfig(7, { accountIds: [1] });
    await setWidgetConfig(9, { accountIds: [2] });

    await forgetForecastWidget(7);

    await expect(getWidgetConfig(7)).resolves.toEqual({ accountIds: null, columns: ALL_COLUMNS });
    await expect(getWidgetConfig(9)).resolves.toEqual({ accountIds: ['2'], columns: ALL_COLUMNS });
  });

  it('does not write when forgetting a widget it never knew', async () => {
    await forgetForecastWidget(7);
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  describe('normalizeColumns', () => {
    it('keeps the known columns, once each, in the table’s order', () => {
      expect(normalizeColumns(['forecast', 'bogus', 'balance', 'forecast'])).toEqual(['balance', 'forecast']);
    });

    it.each([
      ['nothing', undefined],
      ['an empty list', []],
      ['only unknown keys', ['bogus']],
      ['not a list', 'forecast'],
    ])('gives every column for %s', (_label, columns) => {
      expect(normalizeColumns(columns)).toEqual(ALL_COLUMNS);
    });
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
