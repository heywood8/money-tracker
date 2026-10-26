import React, { memo, useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeConfigProvider } from '../contexts/ThemeConfigContext';
import { ThemeColorsProvider, useThemeColors } from '../contexts/ThemeColorsContext';
import { loadRateCharts, rateChartTitle } from '../services/ExchangeRateCharts';
import { RANGE_LABEL_KEYS } from '../services/ExchangeRateHistory';
import { resolveLanguage, translate } from '../services/notifications/notificationStrings';
import EmptyState from '../components/EmptyState';
import { getWidgetChart, getWidgetCharts, setWidgetChart, setWidgetCharts } from './exchangeRateWidgetStore';
import { refreshExchangeRateWidgets, renderExchangeRateWidget } from './exchangeRateWidgetRender';
import useWidgetConfigAnswer from './useWidgetConfigAnswer';
import { EXCHANGE_RATE_PAIR_WIDGET } from './widgetConstants';
import { BUTTON, BUTTON_TEXT, MODAL_TITLE } from '../styles/componentStyles';
import {
  BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, HEIGHTS, HORIZONTAL_PADDING, ICON_SIZE, SPACING,
} from '../styles/designTokens';

/**
 * What Android opens when an exchange-rate widget is placed on the home
 * screen (and when it is reconfigured from a long press): which of the charts
 * set up in Settings → Graphs the widget shows. The one-rate widget takes the
 * chart tapped; the two-rate widget numbers two taps 1 and 2 (left and right)
 * and takes them on Done.
 *
 * It is its own React root, launched by the widget library in a separate
 * activity, so none of App's providers are above it. It brings the two theme
 * providers it needs and reads the app's language the way the headless code
 * does, rather than mounting the whole app shell for a one-question screen.
 */
// How many charts the two-rate widget shows.
const PAIR_SIZE = 2;

const ChartRow = memo(({ chart, selected, order, saving, disabled, onSelect, colors, t }) => {
  const handlePress = useCallback(() => { onSelect(chart); }, [chart, onSelect]);
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.row,
        { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      testID={`widget-config-chart-${chart.id}`}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{rateChartTitle(chart)}</Text>
        <Text style={[styles.rowHint, { color: colors.mutedText }]}>
          {`${t('rate_chart_default_range')}: ${t(RANGE_LABEL_KEYS[chart.range])}`}
        </Text>
      </View>
      {order > 0 && (
        <View style={[styles.order, { backgroundColor: colors.primaryFill }]} testID={`widget-config-order-${chart.id}`}>
          <Text style={[styles.orderText, { color: colors.onPrimaryFill }]}>{order}</Text>
        </View>
      )}
      {saving && <ActivityIndicator size="small" color={colors.primary} />}
    </Pressable>
  );
});

ChartRow.displayName = 'ChartRow';

ChartRow.propTypes = {
  chart: PropTypes.shape({
    id: PropTypes.string.isRequired,
    from: PropTypes.string.isRequired,
    to: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    range: PropTypes.string.isRequired,
  }).isRequired,
  colors: PropTypes.object.isRequired,
  disabled: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  order: PropTypes.number,
  saving: PropTypes.bool,
  selected: PropTypes.bool,
  t: PropTypes.func.isRequired,
};

function ConfigContent({ widgetInfo, renderWidget, setResult }) {
  const { colors } = useThemeColors();
  const [language, setLanguage] = useState('en');
  const [charts, setCharts] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  // The two-rate widget's picks, in order.
  const [pickedIds, setPickedIds] = useState([]);
  const t = useCallback((key) => translate(language, key), [language]);
  // Answers the launcher once, from a pick, Done or a cancel (back included).
  const { complete, cancel, savingKey: savingId, busyRef } = useWidgetConfigAnswer({
    widgetInfo,
    renderWidget,
    setResult,
    draw: renderExchangeRateWidget,
    redrawLater: refreshExchangeRateWidgets,
  });
  const busy = savingId !== null;
  const pair = widgetInfo.widgetName === EXCHANGE_RATE_PAIR_WIDGET;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveLanguage(),
      loadRateCharts().catch(() => []),
      pair
        ? getWidgetCharts(widgetInfo.widgetId).catch(() => [])
        : getWidgetChart(widgetInfo.widgetId).catch(() => null),
    ]).then(([lang, list, stored]) => {
      if (cancelled) return;
      setLanguage(lang);
      setCharts(list);
      if (pair) {
        // A chart the widget shows that was since deleted in Settings is
        // still drawn from its saved copy; it is listed after the others, so
        // Done keeps it rather than quietly dropping it.
        const kept = stored.filter((chart) => chart && !list.some((c) => c.id === chart.id));
        setCharts([...list, ...kept]);
        // What it shows now, or for a new widget the first two charts, so
        // Done alone places the same pair the widget would draw anyway.
        const own = stored.filter(Boolean).map((chart) => chart.id);
        setPickedIds(own.length ? own : list.slice(0, PAIR_SIZE).map((chart) => chart.id));
      } else {
        setCurrentId(stored?.id ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [widgetInfo.widgetId, pair]);

  const finish = useCallback((chart) => {
    complete(chart ? chart.id : 'empty', chart ? () => setWidgetChart(widgetInfo.widgetId, chart) : null);
  }, [complete, widgetInfo.widgetId]);

  // A tap picks the next slot, a second tap on a pick drops it, and a third
  // chart replaces the right-hand one rather than being ignored.
  const togglePick = useCallback((chart) => {
    if (busyRef.current) return;
    setPickedIds((ids) => {
      if (ids.includes(chart.id)) return ids.filter((id) => id !== chart.id);
      return ids.length < PAIR_SIZE ? [...ids, chart.id] : [...ids.slice(0, PAIR_SIZE - 1), chart.id];
    });
  }, [busyRef]);

  const handlePairDone = useCallback(() => {
    const picked = pickedIds.map((id) => (charts || []).find((chart) => chart.id === id)).filter(Boolean);
    complete('pair', () => setWidgetCharts(widgetInfo.widgetId, picked));
  }, [complete, pickedIds, charts, widgetInfo.widgetId]);

  const handleAddAnyway = useCallback(() => { finish(null); }, [finish]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t(pair ? 'widget_pair_config_title' : 'widget_config_title')}
      </Text>

      {charts === null ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : charts.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState icon="chart-line-variant" message={t('widget_rate_empty')} fill={false} />
          <Pressable
            onPress={handleAddAnyway}
            disabled={busy}
            style={[styles.button, { backgroundColor: colors.primaryFill }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            testID="widget-config-add-anyway"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{t('widget_add_anyway')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {charts.map((chart) => (
            <ChartRow
              key={chart.id}
              chart={chart}
              selected={pair ? pickedIds.includes(chart.id) : chart.id === currentId}
              order={pair ? pickedIds.indexOf(chart.id) + 1 : 0}
              saving={savingId === chart.id}
              disabled={busy}
              onSelect={pair ? togglePick : finish}
              colors={colors}
              t={t}
            />
          ))}
        </ScrollView>
      )}

      {pair && charts !== null && charts.length > 0 && (
        <Pressable
          onPress={handlePairDone}
          disabled={busy || pickedIds.length === 0}
          style={[
            styles.button,
            { backgroundColor: pickedIds.length === 0 ? colors.border : colors.primaryFill },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || pickedIds.length === 0 }}
          testID="widget-config-done"
        >
          {savingId === 'pair'
            ? <ActivityIndicator size="small" color={colors.onPrimaryFill} />
            : <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{t('done')}</Text>}
        </Pressable>
      )}

      <Pressable
        onPress={cancel}
        disabled={busy}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        testID="widget-config-cancel"
      >
        <Text style={[styles.buttonText, { color: busy ? colors.mutedText : colors.primary }]}>{t('cancel')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const widgetConfigPropTypes = {
  renderWidget: PropTypes.func.isRequired,
  setResult: PropTypes.func.isRequired,
  widgetInfo: PropTypes.shape({
    widgetId: PropTypes.number.isRequired,
    widgetName: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
  }).isRequired,
};

ConfigContent.propTypes = widgetConfigPropTypes;

export default function ExchangeRateWidgetConfigScreen(props) {
  return (
    <SafeAreaProvider>
      <ThemeConfigProvider>
        <ThemeColorsProvider>
          <ConfigContent {...props} />
        </ThemeColorsProvider>
      </ThemeConfigProvider>
    </SafeAreaProvider>
  );
}

ExchangeRateWidgetConfigScreen.propTypes = widgetConfigPropTypes;

const styles = StyleSheet.create({
  button: {
    ...BUTTON,
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
  },
  buttonText: BUTTON_TEXT,
  cancel: {
    ...BUTTON,
    marginBottom: SPACING.sm,
  },
  container: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    gap: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  loading: {
    flex: 1,
  },
  order: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: ICON_SIZE.md,
    justifyContent: 'center',
    marginLeft: SPACING.sm,
    width: ICON_SIZE.md,
  },
  orderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  row: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem + SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  rowHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  rowLabel: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  rowText: {
    flex: 1,
  },
  title: {
    ...MODAL_TITLE,
    paddingVertical: SPACING.xl,
  },
});
