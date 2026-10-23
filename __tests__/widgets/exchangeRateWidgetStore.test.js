import * as FileSystem from 'expo-file-system/legacy';
import {
  getWidgetChart,
  setWidgetChart,
  forgetWidget,
  resolveWidgetChart,
  WIDGET_STORE_PATH,
} from '../../app/widgets/exchangeRateWidgetStore';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const USD_RUB = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
const AMD_RUB = { id: 'b', from: 'AMD', to: 'RUB', amount: 100, range: 'week' };

describe('exchangeRateWidgetStore', () => {
  let disk;

  beforeEach(() => {
    jest.clearAllMocks();
    disk = {};
    FileSystem.getInfoAsync.mockImplementation(async (path) => ({ exists: path in disk }));
    FileSystem.readAsStringAsync.mockImplementation(async (path) => disk[path]);
    FileSystem.writeAsStringAsync.mockImplementation(async (path, text) => { disk[path] = text; });
    FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
  });

  it('remembers which chart a widget shows', async () => {
    await setWidgetChart(7, USD_RUB);
    await setWidgetChart(9, AMD_RUB);

    await expect(getWidgetChart(7)).resolves.toEqual(USD_RUB);
    await expect(getWidgetChart(9)).resolves.toEqual(AMD_RUB);
    expect(JSON.parse(disk[WIDGET_STORE_PATH])).toEqual({ 7: USD_RUB, 9: AMD_RUB });
  });

  it('answers null for a widget with no chart of its own', async () => {
    await expect(getWidgetChart(1)).resolves.toBeNull();
  });

  it('forgets a removed widget and leaves the others', async () => {
    await setWidgetChart(7, USD_RUB);
    await setWidgetChart(9, AMD_RUB);

    await forgetWidget(7);

    await expect(getWidgetChart(7)).resolves.toBeNull();
    await expect(getWidgetChart(9)).resolves.toEqual(AMD_RUB);
  });

  it('does not write when forgetting a widget it never knew', async () => {
    await forgetWidget(3);
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('ignores a chart it could not draw', async () => {
    await setWidgetChart(7, { id: 'x', from: 'USD', to: 'USD' });
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('reads an unreadable file as no widgets', async () => {
    disk[WIDGET_STORE_PATH] = '{broken';
    await expect(getWidgetChart(7)).resolves.toBeNull();
    await setWidgetChart(7, USD_RUB);
    await expect(getWidgetChart(7)).resolves.toEqual(USD_RUB);
  });

  describe('resolveWidgetChart', () => {
    it('prefers the live version of the widget’s chart, so edits reach it', () => {
      const edited = { ...USD_RUB, amount: 10 };
      expect(resolveWidgetChart([AMD_RUB, edited], USD_RUB)).toEqual(edited);
    });

    it('keeps showing its own pair after the chart is deleted in Settings', () => {
      expect(resolveWidgetChart([AMD_RUB], USD_RUB)).toEqual(USD_RUB);
    });

    it('falls back to the first chart for a widget never configured', () => {
      expect(resolveWidgetChart([AMD_RUB, USD_RUB], null)).toEqual(AMD_RUB);
    });

    it('has nothing to draw with no charts and no saved one', () => {
      expect(resolveWidgetChart([], null)).toBeNull();
    });
  });
});
