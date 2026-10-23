import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeConfigProvider } from '../contexts/ThemeConfigContext';
import { ThemeColorsProvider, useThemeColors } from '../contexts/ThemeColorsContext';
import { loadRateCharts, rateChartTitle } from '../services/ExchangeRateCharts';
import { RANGE_LABEL_KEYS } from '../services/ExchangeRateHistory';
import { resolveLanguage, translate } from '../services/notifications/notificationStrings';
import EmptyState from '../components/EmptyState';
import { getWidgetChart, setWidgetChart } from './exchangeRateWidgetStore';
import { refreshExchangeRateWidgets, renderExchangeRateWidget } from './exchangeRateWidgetRender';
import { BUTTON, BUTTON_TEXT, MODAL_TITLE } from '../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, HEIGHTS, HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';

/**
 * What Android opens when the exchange-rate widget is placed on the home
 * screen (and when it is reconfigured from a long press): which of the charts
 * set up in Settings → Graphs this widget shows.
 *
 * It is its own React root, launched by the widget library in a separate
 * activity, so none of App's providers are above it. It brings the two theme
 * providers it needs and reads the app's language the way the headless code
 * does, rather than mounting the whole app shell for a one-question screen.
 */
// How long the screen waits to draw the widget before handing back to the
// launcher. The rates are usually saved already and the draw is instant; on a
// slow network the widget is finished in the background instead of holding
// this screen up (and tempting a back press that would remove the widget).
const RENDER_WAIT_MS = 4000;

// The draw, or null if it fails or outlasts `ms`.
const drawWithin = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
};

const ChartRow = memo(({ chart, selected, saving, disabled, onSelect, colors, t }) => {
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
  saving: PropTypes.bool,
  selected: PropTypes.bool,
  t: PropTypes.func.isRequired,
};

function ConfigContent({ widgetInfo, renderWidget, setResult }) {
  const { colors } = useThemeColors();
  const [language, setLanguage] = useState('en');
  const [charts, setCharts] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const t = useCallback((key) => translate(language, key), [language]);
  const busy = savingId !== null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveLanguage(),
      loadRateCharts().catch(() => []),
      getWidgetChart(widgetInfo.widgetId).catch(() => null),
    ]).then(([lang, list, stored]) => {
      if (cancelled) return;
      setLanguage(lang);
      setCharts(list);
      setCurrentId(stored?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [widgetInfo.widgetId]);

  // The launcher takes exactly one answer. A second one (a double tap, or a
  // cancel landing while a pick is still being drawn) could remove a widget the
  // user had just set up, so everything after the first is dropped.
  const settledRef = useRef(false);
  const busyRef = useRef(false);
  const settle = useCallback((result) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setResult(result);
  }, [setResult]);

  const cancel = useCallback(() => {
    if (!busyRef.current) settle('cancel');
  }, [settle]);

  // Hardware back is the cancel, as everywhere else in the app. A widget that
  // was just placed is then taken off the home screen again by the launcher.
  // While a pick is being saved, back is swallowed rather than undoing it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => subscription.remove();
  }, [cancel]);

  const finish = useCallback(async (chart) => {
    if (busyRef.current || settledRef.current) return;
    busyRef.current = true;
    setSavingId(chart ? chart.id : 'empty');
    try {
      if (chart) await setWidgetChart(widgetInfo.widgetId, chart);
    } catch (error) {
      console.warn('[widgets] Could not save the widget\'s chart:', error?.message);
    }
    const rendered = await drawWithin(renderExchangeRateWidget(widgetInfo), RENDER_WAIT_MS);
    if (rendered) {
      renderWidget(rendered);
    } else {
      refreshExchangeRateWidgets();
    }
    settle('ok');
  }, [widgetInfo, renderWidget, settle]);

  const handleAddAnyway = useCallback(() => { finish(null); }, [finish]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('widget_config_title')}</Text>

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
              selected={chart.id === currentId}
              saving={savingId === chart.id}
              disabled={busy}
              onSelect={finish}
              colors={colors}
              t={t}
            />
          ))}
        </ScrollView>
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
