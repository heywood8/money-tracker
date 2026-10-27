import * as FileSystem from 'expo-file-system/legacy';
import {
  getWidgetChart,
  getWidgetCharts,
  setWidgetChart,
  setWidgetCharts,
  forgetWidget,
  resolveWidgetChart,
  resolveWidgetCharts,
  applyWidgetWindow,
  getWidgetWindow,
  setWidgetWindow,
  stepWidgetWindow,
  WIDGET_STORE_PATH,
  WIDGET_WINDOWS_PATH,
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

  it('remembers a two-rate widget’s charts in order, beside one-rate widgets', async () => {
    await setWidgetChart(7, USD_RUB);
    await setWidgetCharts(8, [AMD_RUB, USD_RUB]);

    await expect(getWidgetCharts(8)).resolves.toEqual([AMD_RUB, USD_RUB]);
    await expect(getWidgetChart(7)).resolves.toEqual(USD_RUB);
    expect(JSON.parse(disk[WIDGET_STORE_PATH])).toEqual({ 7: USD_RUB, 8: [AMD_RUB, USD_RUB] });
  });

  it('answers no charts for a two-rate widget never set up, and keeps an empty slot', async () => {
    await expect(getWidgetCharts(8)).resolves.toEqual([]);
    await setWidgetCharts(8, [AMD_RUB]);
    await expect(getWidgetCharts(8)).resolves.toEqual([AMD_RUB]);
  });

  it('forgets a removed two-rate widget', async () => {
    await setWidgetCharts(8, [AMD_RUB, USD_RUB]);
    await forgetWidget(8);
    await expect(getWidgetCharts(8)).resolves.toEqual([]);
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

  describe('the window', () => {
    it('remembers the window a widget was switched to, in a file of its own', async () => {
      await setWidgetChart(7, USD_RUB);
      await setWidgetWindow(7, 'year');

      await expect(getWidgetWindow(7)).resolves.toBe('year');
      await expect(getWidgetWindow(9)).resolves.toBeNull();
      expect(JSON.parse(disk[WIDGET_WINDOWS_PATH])).toEqual({ 7: 'year' });
      // The chart is left as it was set up.
      await expect(getWidgetChart(7)).resolves.toEqual(USD_RUB);
    });

    it('ignores a window that is not a range', async () => {
      await setWidgetWindow(7, 'decade');
      expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      disk[WIDGET_WINDOWS_PATH] = JSON.stringify({ 7: 'decade' });
      await expect(getWidgetWindow(7)).resolves.toBeNull();
    });

    it('forgets a removed widget’s window with its chart', async () => {
      await setWidgetChart(7, USD_RUB);
      await setWidgetWindow(7, 'day');
      await setWidgetWindow(9, 'week');

      await forgetWidget(7);

      expect(JSON.parse(disk[WIDGET_STORE_PATH])).toEqual({});
      expect(JSON.parse(disk[WIDGET_WINDOWS_PATH])).toEqual({ 9: 'week' });
    });

    it('steps from the fallback range, then from the window saved', async () => {
      await expect(stepWidgetWindow(7, 'month', 1)).resolves.toBe('year');
      await expect(stepWidgetWindow(7, 'month', 1)).resolves.toBe('all');
      await expect(getWidgetWindow(7)).resolves.toBe('all');
    });

    it('stops at either end, writing nothing, unless it wraps', async () => {
      await expect(stepWidgetWindow(7, 'all', 1)).resolves.toBeNull();
      await expect(stepWidgetWindow(7, 'day', -1)).resolves.toBeNull();
      expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();

      await expect(stepWidgetWindow(7, 'all', 1, { wrap: true })).resolves.toBe('day');
      await expect(stepWidgetWindow(7, 'all', -1, { wrap: true })).resolves.toBe('all');
    });

    it('makes every step of taps in quick succession, and keeps other widgets’ windows', async () => {
      await Promise.all([
        stepWidgetWindow(7, 'day', 1),
        stepWidgetWindow(7, 'day', 1),
        stepWidgetWindow(9, 'month', -1),
      ]);

      expect(JSON.parse(disk[WIDGET_WINDOWS_PATH])).toEqual({ 7: 'month', 9: 'week' });
    });

    it('drops the window when the widget is set up again, so it shows the chart just picked', async () => {
      await setWidgetWindow(7, 'day');
      await setWidgetWindow(8, 'year');

      await setWidgetChart(7, AMD_RUB);
      await setWidgetCharts(8, [USD_RUB, AMD_RUB]);

      await expect(getWidgetWindow(7)).resolves.toBeNull();
      await expect(getWidgetWindow(8)).resolves.toBeNull();
    });

    it('draws every chart over the window, else over the first chart’s range', () => {
      expect(applyWidgetWindow([USD_RUB, AMD_RUB], 'day')).toEqual([
        { ...USD_RUB, range: 'day' }, { ...AMD_RUB, range: 'day' },
      ]);
      expect(applyWidgetWindow([null, AMD_RUB], null)).toEqual([null, AMD_RUB]);
      expect(applyWidgetWindow([USD_RUB, AMD_RUB], null)[1].range).toBe('month');
      expect(applyWidgetWindow([null, null], 'day')).toEqual([null, null]);
    });
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

  describe('resolveWidgetCharts', () => {
    const CHARTS = [USD_RUB, AMD_RUB, { ...USD_RUB, id: 'c', range: 'year' }];

    it('falls back to the first two charts for a widget never set up', () => {
      expect(resolveWidgetCharts(CHARTS, [])).toEqual([USD_RUB, AMD_RUB]);
      expect(resolveWidgetCharts([USD_RUB], [])).toEqual([USD_RUB, null]);
      expect(resolveWidgetCharts([], [])).toEqual([null, null]);
    });

    it('draws the live version of each saved chart, or the saved copy if it was deleted', () => {
      const edited = { ...AMD_RUB, amount: 10 };
      expect(resolveWidgetCharts([USD_RUB, edited], [AMD_RUB, { ...AMD_RUB, id: 'gone' }]))
        .toEqual([edited, { ...AMD_RUB, id: 'gone' }]);
    });

    it('leaves a slot empty that was saved empty', () => {
      expect(resolveWidgetCharts(CHARTS, [AMD_RUB])).toEqual([AMD_RUB, null]);
    });
  });
});
