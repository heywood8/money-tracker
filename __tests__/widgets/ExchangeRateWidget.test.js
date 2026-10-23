/**
 * The exchange-rate home-screen widget's layout. Built with the widget
 * library's own tree builder — the same call the launcher path makes — so a
 * component it cannot turn into RemoteViews (a hook, an unsupported style)
 * fails here rather than on a phone.
 */

import React from 'react';
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import {
  ExchangeRateWidget,
  buildSparklineSvg,
  describeRate,
  thinValues,
} from '../../app/widgets/ExchangeRateWidget';
import { GRAPHS_DEEP_LINK } from '../../app/widgets/widgetConstants';
import { lightTheme, darkTheme } from '../../app/contexts/ThemeColorsContext';

// The real palettes: the widget reads them directly (it has no provider above
// it), and jest.setup.js mocks this module down to the hook alone.
jest.mock('../../app/contexts/ThemeColorsContext', () => jest.requireActual('../../app/contexts/ThemeColorsContext'));

const CHART = { id: 'c1', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
const POINTS = [
  { date: '2026-09-23', rate: 84.29 },
  { date: '2026-10-10', rate: 85.1 },
  { date: '2026-10-23', rate: 81.55 },
];

const render = (model, { theme = 'light', width = 250, height = 180 } = {}) => buildWidgetTree(
  <ExchangeRateWidget model={{ language: 'en', ...model }} theme={theme} width={width} height={height} />,
);

// Every node of a given type, depth first.
const nodesOf = (tree, type, found = []) => {
  if (tree.type === type) found.push(tree);
  (tree.children || []).forEach((child) => nodesOf(child, type, found));
  return found;
};
const textsOf = (tree) => nodesOf(tree, 'TextWidget').map((node) => node.props.text);

describe('ExchangeRateWidget', () => {
  describe('ready', () => {
    it('prints the pair, the rate, its move and the date', () => {
      const tree = render({ status: 'ready', chart: CHART, points: POINTS, stale: false });

      expect(textsOf(tree)).toEqual(['1 USD → RUB', 'Oct 23', '₽81.55', '▼ -2.74 (-3.25%)']);
    });

    it('prices the configured amount', () => {
      const tree = render({
        status: 'ready',
        chart: { ...CHART, from: 'AMD', amount: 100 },
        points: [{ date: '2026-10-22', rate: 0.2259 }, { date: '2026-10-23', rate: 0.2272 }],
        stale: false,
      });

      expect(textsOf(tree)).toEqual(['100 AMD → RUB', 'Oct 23', '₽22.72', '▲ +0.13 (+0.58%)']);
    });

    it('says when the rates are the saved copy', () => {
      const tree = render({ status: 'ready', chart: CHART, points: POINTS, stale: true });

      // On the change's row, pinned right, where a long title cannot push it out.
      expect(textsOf(tree)).toEqual(['1 USD → RUB', 'Oct 23', '₽81.55', '▼ -2.74 (-3.25%)', 'offline']);
    });

    it('draws the line when the widget is tall enough, and not when it is not', () => {
      expect(nodesOf(render({ status: 'ready', chart: CHART, points: POINTS }), 'SvgWidget')).toHaveLength(1);
      expect(nodesOf(render({ status: 'ready', chart: CHART, points: POINTS }, { height: 110 }), 'SvgWidget'))
        .toHaveLength(0);
    });

    it('keeps the figures but drops the line when no rate is a number', () => {
      const tree = render({
        status: 'ready', chart: CHART, points: [...POINTS.slice(0, 2), { date: '2026-10-23', rate: NaN }],
      });
      expect(nodesOf(tree, 'SvgWidget')).toHaveLength(1);
      const broken = render({ status: 'ready', chart: CHART, points: [{ date: '2026-10-23', rate: NaN }] });
      expect(nodesOf(broken, 'SvgWidget')).toHaveLength(0);
    });

    it('lets the title give way rather than the date', () => {
      const tree = render({ status: 'ready', chart: { ...CHART, amount: 1000, from: 'AMD' }, points: POINTS }, { width: 110 });
      const titleBox = tree.children[0].children[0];
      // The title sits in the row's flexing box, the date beside it at its own width.
      expect(titleBox.props.weight).toBe(1);
      expect(titleBox.children[0].props).toMatchObject({ text: '1000 AMD → RUB', truncate: 'END', maxLines: 1 });
      expect(tree.children[0].children[1].props.text).toBe('Oct 23');
    });

    it('opens the Graphs tab when tapped', () => {
      const tree = render({ status: 'ready', chart: CHART, points: POINTS });

      expect(tree.props.clickAction).toBe('OPEN_URI');
      expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
    });

    it('draws in the theme the launcher asks for', () => {
      const light = render({ status: 'ready', chart: CHART, points: POINTS }, { theme: 'light' });
      const dark = render({ status: 'ready', chart: CHART, points: POINTS }, { theme: 'dark' });

      expect(light.props.backgroundColor).toBe(lightTheme.colors.surface);
      expect(dark.props.backgroundColor).toBe(darkTheme.colors.surface);
      expect(nodesOf(light, 'SvgWidget')[0].props.svgString).toContain(lightTheme.colors.primary);
      expect(nodesOf(dark, 'SvgWidget')[0].props.svgString).toContain(darkTheme.colors.primary);
    });
  });

  it('tells the user where to set a chart up when there is none', () => {
    const tree = render({ status: 'empty' });

    expect(textsOf(tree)).toEqual(['Add an exchange rate chart in Settings → Graphs']);
    expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
  });

  it('names the pair and the failure when nothing could be loaded', () => {
    const tree = render({ status: 'error', chart: CHART });

    expect(textsOf(tree)).toEqual(['1 USD → RUB\nCould not load rates']);
  });

  it('speaks the language it is given', () => {
    const tree = render({ status: 'empty', language: 'ru' });

    expect(textsOf(tree)).toEqual(['Добавьте график курса в Настройки → Графики']);
  });

  describe('describeRate', () => {
    it('returns null for no points', () => {
      expect(describeRate(CHART, [], 'en')).toBeNull();
    });

    it('marks an unchanged rate with neither arrow', () => {
      const figures = describeRate(CHART, [{ date: '2026-10-22', rate: 81 }, { date: '2026-10-23', rate: 81 }], 'en');
      expect(figures.arrow).toBe('•');
      expect(figures.change).toBe('0.00 (0.00%)');
    });
  });

  describe('buildSparklineSvg', () => {
    it('scales the series to the box, highest value at the top', () => {
      const svg = buildSparklineSvg([1, 3, 2], 100, 50, '#007AFF');

      expect(svg).toContain('width="100" height="50" viewBox="0 0 100 50"');
      // First point (1) at the bottom inset, second (3) at the top inset.
      expect(svg).toContain('M0.0 48.0 L50.0 2.0 L100.0 25.0');
      expect(svg).toContain('stroke="#007AFF"');
    });

    it('draws nothing at all when no value is a number', () => {
      expect(buildSparklineSvg([NaN, Infinity], 100, 40, '#000000')).toBeNull();
    });

    it('draws a flat line through the middle for an unchanging or single value', () => {
      expect(buildSparklineSvg([5, 5], 100, 40, '#000000')).toContain('M0.0 20.0 L100.0 20.0');
      expect(buildSparklineSvg([5], 100, 40, '#000000')).toContain('M0.0 20.0 L100.0 20.0');
    });
  });

  describe('thinValues', () => {
    it('keeps a short series whole', () => {
      expect(thinValues([1, 2, 3], 5)).toEqual([1, 2, 3]);
    });

    it('thins a long one to the limit, keeping both ends', () => {
      const thinned = thinValues(Array.from({ length: 366 }, (_, i) => i), 120);
      expect(thinned).toHaveLength(120);
      expect(thinned[0]).toBe(0);
      expect(thinned[119]).toBe(365);
    });
  });
});
