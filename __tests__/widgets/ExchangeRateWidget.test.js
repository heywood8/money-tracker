/**
 * The exchange-rate home-screen widget's layout. Built with the widget
 * library's own tree builder — the same call the launcher path makes — so a
 * component it cannot turn into RemoteViews (a hook, an unsupported style)
 * fails here rather than on a phone.
 */

import React from 'react';
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import {
  ExchangeRatePairWidget,
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
// The node directly holding a given node, depth first.
const parentOf = (tree, target) => {
  for (const child of tree.children || []) {
    if (child === target) return tree;
    const found = parentOf(child, target);
    if (found) return found;
  }
  return null;
};
const textNode = (tree, start) => nodesOf(tree, 'TextWidget').find((node) => node.props.text.startsWith(start));

// The colour a text is drawn in, found by the start of its text. The builder
// lifts it out of `style` onto the node's own props.
const colorOf = (tree, start) => nodesOf(tree, 'TextWidget')
  .find((node) => node.props.text.startsWith(start)).props.color;

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
      const title = textNode(tree, '1000 AMD');
      const titleBox = parentOf(tree, title);
      // The title sits in the row's flexing box, the date beside it at its own width.
      expect(titleBox.props.weight).toBe(1);
      expect(title.props).toMatchObject({ truncate: 'END', maxLines: 1 });
      expect(parentOf(tree, titleBox).children[1].props.text).toBe('Oct 23');
    });

    it('says when the rates were last fetched, beside the rate', () => {
      const today = new Date();
      today.setHours(14, 5, 0, 0);
      const tree = render({ status: 'ready', chart: CHART, points: POINTS, checkedAt: today.getTime() });

      const fetched = textNode(tree, '↻');
      expect(fetched.props.text).toMatch(/^↻ 0?2:05|^↻ 14:05/);
      // On the rate's row, pinned right of the rate, which is what gives way.
      const row = parentOf(tree, parentOf(tree, fetched));
      expect(row.children[0].children[0].props.text).toBe('₽81.55');
    });

    it('makes the fetch time a refresh button, and says when one is running', () => {
      const tree = render({ status: 'ready', chart: CHART, points: POINTS, checkedAt: Date.now() });
      const area = parentOf(tree, textNode(tree, '↻'));

      expect(area.props.clickAction).toBe('REFRESH_RATES');
      expect(area.props.accessibilityLabel).toBe('Refresh rates');
      expect(textNode(render({ status: 'ready', chart: CHART, points: POINTS, refreshing: true }), '↻').props.text)
        .toBe('↻ …');
    });

    it('leaves the fetch time out when there is none', () => {
      expect(textNode(render({ status: 'ready', chart: CHART, points: POINTS }), '↻')).toBeUndefined();
    });

    it('runs the line to the widget’s edges and bottom, rounding its corners', () => {
      const tree = render({ status: 'ready', chart: CHART, points: POINTS }, { width: 250, height: 180 });
      const [line] = nodesOf(tree, 'SvgWidget');

      // No padding around it: the root has none, the text keeps its own.
      expect(tree.props.paddingLeft ?? 0).toBe(0);
      expect(line.props.svgString).toContain('width="250"');
      // Down to the bottom edge: 180 less the padding and text above it.
      expect(line.props.svgString).toContain('height="96"');
      expect(line.props.svgString).toContain('A28 28 0 0 1 222 96');
      expect(line.props.svgString).toContain('clip-path="url(#c)"');
    });

    it('colours the move by its direction, in the theme asked for', () => {
      const falling = { status: 'ready', chart: CHART, points: POINTS };
      const rising = { ...falling, points: [...POINTS].reverse().map((p, i) => ({ ...p, date: POINTS[i].date })) };
      const flat = { ...falling, points: [POINTS[0], { ...POINTS[0], date: '2026-10-23' }] };

      expect(colorOf(render(falling), '▼')).toBe(lightTheme.colors.overspend);
      expect(colorOf(render(rising), '▲')).toBe(lightTheme.colors.success);
      expect(colorOf(render(flat), '•')).toBe(lightTheme.colors.mutedText);
      expect(colorOf(render(falling, { theme: 'dark' }), '▼')).toBe(darkTheme.colors.overspend);
      // The rest of the row stays muted: only the move carries the signal.
      expect(colorOf(render(falling), '1 USD')).toBe(lightTheme.colors.mutedText);
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

    expect(textsOf(tree)).toEqual(['1 USD → RUB\nCould not load rates ↻']);
    expect(tree.props.accessibilityLabel).toBe('1 USD → RUB: Could not load rates');
  });

  it('offers a refresh by tap when nothing could be loaded, and shows it running', () => {
    const tree = render({ status: 'error', chart: CHART });
    expect(parentOf(tree, textNode(tree, '1 USD')).props.clickAction).toBe('REFRESH_RATES');

    expect(textsOf(render({ status: 'error', chart: CHART, refreshing: true }))).toEqual(['1 USD → RUB\n↻ …']);
  });

  it('keeps the setup prompt a plain link to the app', () => {
    const tree = render({ status: 'empty' });
    expect(parentOf(tree, textNode(tree, 'Add')).props.clickAction).toBeUndefined();
  });

  it('speaks the language it is given', () => {
    const tree = render({ status: 'empty', language: 'ru' });

    expect(textsOf(tree)).toEqual(['Добавьте график курса в Настройки → Графики']);
  });

  describe('ExchangeRatePairWidget', () => {
    const AMD = { id: 'c2', from: 'RUB', to: 'AMD', amount: 1, range: 'month' };
    const AMD_POINTS = [{ date: '2026-09-23', rate: 4.32 }, { date: '2026-10-23', rate: 4.47 }];
    const renderPair = (models, { theme = 'light', width = 380, height = 180 } = {}) => buildWidgetTree(
      <ExchangeRatePairWidget models={models.map((m) => ({ language: 'en', ...m }))} theme={theme} width={width} height={height} />,
    );

    it('draws two rates side by side in one card, a hairline between them', () => {
      const tree = renderPair([
        { status: 'ready', chart: CHART, points: POINTS },
        { status: 'ready', chart: AMD, points: AMD_POINTS },
      ]);

      expect(tree.props.orientation).toBe('HORIZONTAL');
      expect(tree.props.backgroundColor).toBe(lightTheme.colors.surface);
      const [first, divider, second] = tree.children;
      expect(tree.children).toHaveLength(3);
      // No gap: the halves meet the line on either side.
      expect(first.props.width).toBe(189.5);
      expect(second.props.margin).toBeUndefined();
      expect(divider.props).toMatchObject({ width: 1, backgroundColor: lightTheme.colors.border });
      expect(textsOf(first)).toContain('₽81.55');
      expect(textsOf(second)).toContain('֏4.470');
      expect(tree.props.clickActionData).toEqual({ uri: GRAPHS_DEEP_LINK });
    });

    it('rounds each half’s line only at the card’s outer corner', () => {
      const tree = renderPair([
        { status: 'ready', chart: CHART, points: POINTS },
        { status: 'ready', chart: AMD, points: AMD_POINTS },
      ]);
      const [left, right] = nodesOf(tree, 'SvgWidget').map((node) => node.props.svgString);

      // (380 - 1) / 2 wide each, rounded to whole dp in the SVG.
      expect(left).toContain('width="190"');
      expect(left).toContain('A0 0 0 0 1 190 96');
      expect(left).toContain('A28 28 0 0 1 0 68');
      expect(right).toContain('A28 28 0 0 1 162 96');
      expect(right).toContain('A0 0 0 0 1 0 96');
    });

    it('says what is missing in one half and draws the other', () => {
      const tree = renderPair([
        { status: 'ready', chart: CHART, points: POINTS },
        { status: 'empty' },
      ]);

      expect(textsOf(tree.children[2])).toEqual(['Add an exchange rate chart in Settings → Graphs']);
      expect(nodesOf(tree.children[0], 'SvgWidget')).toHaveLength(1);
    });

    it('shows one prompt across the widget when nothing is set up', () => {
      const tree = renderPair([{ status: 'empty' }, { status: 'empty' }]);

      expect(textsOf(tree)).toEqual(['Add an exchange rate chart in Settings → Graphs']);
    });

    it('names both rates to a screen reader', () => {
      const tree = renderPair([
        { status: 'ready', chart: CHART, points: POINTS, stale: true },
        { status: 'error', chart: AMD },
      ]);

      expect(tree.props.accessibilityLabel)
        .toBe('1 USD → RUB: ₽81.55, -2.74 (-3.25%), offline; 1 RUB → AMD: Could not load rates');
    });
  });

  describe('describeRate', () => {
    it('returns null for no points', () => {
      expect(describeRate(CHART, [], 'en')).toBeNull();
    });

    it('marks an unchanged rate with neither arrow', () => {
      const figures = describeRate(CHART, [{ date: '2026-10-22', rate: 81 }, { date: '2026-10-23', rate: 81 }], 'en');
      expect(figures.arrow).toBe('•');
      expect(figures.change).toBe('0.00 (0.00%)');
      expect(figures.delta).toBe(0);
    });

    it('treats a move too small to print as no move', () => {
      const figures = describeRate(CHART, [{ date: '2026-10-22', rate: 81.55 }, { date: '2026-10-23', rate: 81.551 }], 'en');
      expect(figures).toMatchObject({ arrow: '•', change: '0.00 (0.00%)', delta: 0 });
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

    it('leaves room under the line and rounds the bottom corners when asked', () => {
      const svg = buildSparklineSvg([1, 3], 100, 50, '#007AFF', { bottomInset: 10, radiusLeft: 20, radiusRight: 0 });

      // Lowest point 10 above the bottom; the fill still reaches it.
      expect(svg).toContain('M0.0 40.0 L100.0 2.0 L100 50 L0 50 Z');
      expect(svg).toContain('<clipPath id="c"><path d="M0 0 H100 V50 A0 0 0 0 1 100 50 H20 A20 20 0 0 1 0 30 Z"/>');
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
