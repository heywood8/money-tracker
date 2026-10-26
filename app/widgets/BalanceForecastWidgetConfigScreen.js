import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeConfigProvider } from '../contexts/ThemeConfigContext';
import { ThemeColorsProvider, useThemeColors } from '../contexts/ThemeColorsContext';
import { DisplaySettingsProvider } from '../contexts/DisplaySettingsContext';
import { getAllAccounts } from '../services/AccountsDB';
import { resolveLanguage, translate } from '../services/notifications/notificationStrings';
import AccountGridSelector from '../components/AccountGridSelector';
import ChoiceChipRow from '../components/ChoiceChipRow';
import EmptyState from '../components/EmptyState';
import {
  getWidgetConfig, normalizeColumns, resolveForecastAccounts, setWidgetConfig,
} from './balanceForecastWidgetStore';
import { refreshBalanceForecastWidgets, renderBalanceForecastWidget } from './balanceForecastWidgetRender';
import useWidgetConfigAnswer from './useWidgetConfigAnswer';
import { FORECAST_COLUMNS } from './widgetConstants';
import { BUTTON, BUTTON_TEXT, MODAL_TITLE, SECTION_LABEL } from '../styles/componentStyles';
import { FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';

/**
 * What Android opens when a balance-forecast widget is placed on the home
 * screen (and when it is reconfigured from a long press): which columns the
 * widget's table has and which accounts it forecasts. Taps toggle columns in a
 * chip row and accounts in the app's account grid; Done saves them and draws
 * the widget. Every account picked (as for a new widget, where all start
 * picked) is saved as "every account", so one opened later joins the widget
 * instead of being left off a list it never had the chance to be on. One
 * column always stays picked: a table of names alone says nothing.
 *
 * Like the exchange-rate widgets' screen it is its own React root with none of
 * App's providers above it, so it brings the few it needs: the theme, and the
 * display settings the account grid reads to hide balances.
 */
function ConfigContent({ widgetInfo, renderWidget, setResult }) {
  const { colors } = useThemeColors();
  const [language, setLanguage] = useState('en');
  const [accounts, setAccounts] = useState(null);
  const [pickedIds, setPickedIds] = useState([]);
  const [columns, setColumns] = useState(FORECAST_COLUMNS);
  const t = useCallback((key) => translate(language, key), [language]);
  // Answers the launcher once, from Done or a cancel (back included).
  const { complete, cancel, savingKey, busyRef } = useWidgetConfigAnswer({
    widgetInfo,
    renderWidget,
    setResult,
    draw: renderBalanceForecastWidget,
    redrawLater: refreshBalanceForecastWidgets,
  });
  const saving = savingKey !== null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveLanguage(),
      getAllAccounts().catch(() => []),
      getWidgetConfig(widgetInfo.widgetId).catch(() => ({ accountIds: null, columns: normalizeColumns(null) })),
    ]).then(([lang, all, stored]) => {
      if (cancelled) return;
      const active = (all || []).filter((account) => !account.hidden);
      setLanguage(lang);
      setAccounts(active);
      // What the widget shows now, or for a new widget every account and
      // column, so Done alone places what the widget would draw anyway.
      setPickedIds(resolveForecastAccounts(active, stored.accountIds).map((account) => String(account.id)));
      setColumns(stored.columns);
    });
    return () => { cancelled = true; };
  }, [widgetInfo.widgetId]);

  // Saves the picks (accounts null: every account) and draws the widget.
  const save = useCallback((ids) => {
    complete('done', () => setWidgetConfig(widgetInfo.widgetId, { accountIds: ids, columns }));
  }, [complete, widgetInfo.widgetId, columns]);

  // Toggles a column, keeping the table's order; the last one stays.
  const toggleColumn = useCallback((column) => {
    if (busyRef.current) return;
    setColumns((current) => {
      if (!current.includes(column)) return FORECAST_COLUMNS.filter((key) => key === column || current.includes(key));
      return current.length > 1 ? current.filter((key) => key !== column) : current;
    });
  }, [busyRef]);
  const columnOptions = useMemo(() => [
    { value: 'balance', label: t('widget_forecast_col_now_long') },
    { value: 'daily', label: t('widget_forecast_col_daily_long') },
    { value: 'forecast', label: t('widget_forecast_col_forecast_long') },
  ], [t]);

  const togglePick = useCallback((accountId) => {
    if (busyRef.current) return;
    const id = String(accountId);
    setPickedIds((ids) => (ids.includes(id) ? ids.filter((picked) => picked !== id) : [...ids, id]));
  }, [busyRef]);

  const handleDone = useCallback(() => {
    const everyAccount = (accounts || []).every((account) => pickedIds.includes(String(account.id)));
    save(everyAccount ? null : pickedIds);
  }, [save, accounts, pickedIds]);
  // No accounts yet: the widget follows every account, so the first one
  // opened shows up on it.
  const handleAddAnyway = useCallback(() => { save(null); }, [save]);

  const canFinish = !saving && pickedIds.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('widget_forecast_config_title')}</Text>

      {accounts === null ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : accounts.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState icon="wallet-outline" message={t('no_accounts')} fill={false} />
          <Pressable
            onPress={handleAddAnyway}
            disabled={saving}
            style={[styles.button, { backgroundColor: colors.primaryFill }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            testID="widget-forecast-add-anyway"
          >
            <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{t('widget_add_anyway')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.mutedText }]}>{t('widget_forecast_config_hint')}</Text>
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('widget_forecast_columns')}</Text>
            <ChoiceChipRow
              options={columnOptions}
              selectedValues={columns}
              onSelect={toggleColumn}
              colors={colors}
              testIDPrefix="widget-forecast-column"
              style={styles.columns}
            />
            <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('accounts')}</Text>
            <AccountGridSelector
              accounts={accounts}
              selectedAccountIds={pickedIds}
              onSelect={togglePick}
              colors={colors}
              t={t}
              testIDPrefix="widget-forecast-account"
            />
          </ScrollView>
          <Pressable
            onPress={handleDone}
            disabled={!canFinish}
            style={[styles.button, { backgroundColor: pickedIds.length === 0 ? colors.border : colors.primaryFill }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canFinish }}
            testID="widget-forecast-done"
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.onPrimaryFill} />
              : <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{t('done')}</Text>}
          </Pressable>
        </>
      )}

      <Pressable
        onPress={cancel}
        disabled={saving}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        testID="widget-forecast-cancel"
      >
        <Text style={[styles.buttonText, { color: saving ? colors.mutedText : colors.primary }]}>{t('cancel')}</Text>
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

export default function BalanceForecastWidgetConfigScreen(props) {
  return (
    <SafeAreaProvider>
      <ThemeConfigProvider>
        <ThemeColorsProvider>
          <DisplaySettingsProvider>
            <ConfigContent {...props} />
          </DisplaySettingsProvider>
        </ThemeColorsProvider>
      </ThemeConfigProvider>
    </SafeAreaProvider>
  );
}

BalanceForecastWidgetConfigScreen.propTypes = widgetConfigPropTypes;

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
  columns: {
    marginBottom: SPACING.lg,
  },
  container: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.lg,
  },
  list: {
    paddingBottom: SPACING.lg,
  },
  loading: {
    flex: 1,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    marginBottom: SPACING.sm,
  },
  title: {
    ...MODAL_TITLE,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.xl,
  },
});
