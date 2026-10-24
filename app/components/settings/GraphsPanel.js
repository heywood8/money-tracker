import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, ScrollView, Text } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import useExchangeRateCharts from '../../hooks/useExchangeRateCharts';
import { createRateChartId, rateChartTitle } from '../../services/ExchangeRateCharts';
import { DEFAULT_RATE_RANGE, RANGE_LABEL_KEYS } from '../../services/ExchangeRateHistory';
import EmptyState from '../EmptyState';
import RateChartEditor from './RateChartEditor';
import { SettingsNavRow, SETTINGS_LIST_CONTENT } from './SettingsRows';
import { EXCHANGE_RATE_PAIR_WIDGET, EXCHANGE_RATE_WIDGET } from '../../widgets/widgetConstants';
import { SECTION_LABEL } from '../../styles/componentStyles';
import { FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

/**
 * Account currencies, each once, in the order the accounts are listed — the
 * first is the currency the user thinks in, which is what a new chart prices
 * the others in.
 *
 * @param {Array<{currency: string}>} accounts
 * @returns {string[]}
 */
export const accountCurrencies = (accounts) => {
  const codes = [];
  (accounts || []).forEach(({ currency }) => {
    if (currency && !codes.includes(currency)) codes.push(currency);
  });
  return codes;
};

/**
 * The pair a new chart starts on: another account currency priced in the
 * first one (1 USD → RUB for a ruble user with a dollar account), skipping
 * pairs that already have a chart. Null when there are not two currencies.
 *
 * @param {string[]} currencies
 * @param {Array<Object>} charts
 * @returns {{from: string, to: string, amount: number, range: string}|null}
 */
export const defaultNewChart = (currencies, charts) => {
  if (currencies.length < 2) return null;
  const taken = new Set(charts.map(({ from, to }) => `${from}|${to}`));
  const candidates = [];
  currencies.forEach((to) => {
    currencies.forEach((from) => {
      if (from !== to) candidates.push({ from, to });
    });
  });
  const pair = candidates.find(({ from, to }) => !taken.has(`${from}|${to}`)) || candidates[0];
  return { ...pair, amount: 1, range: DEFAULT_RATE_RANGE };
};

/**
 * Settings → Graphs: what the Graphs tab draws beyond the user's own money.
 * Today that is the exchange-rate charts — a list of them, and the editor a
 * row or the add button pushes as a step.
 *
 * The draft lives here rather than in the editor, the way the notification
 * panel holds its template draft: the list unmounts as the editor opens.
 */
export default function GraphsPanel({ step, onPushStep, onPopStep, onRegisterBack, bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();
  const { charts, loaded, upsertChart, removeChart } = useExchangeRateCharts();

  const [draft, setDraft] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const currencies = useMemo(() => accountCurrencies(accounts), [accounts]);
  const canAdd = currencies.length >= 2;
  const editing = !!(draft && charts.some((chart) => chart.id === draft.id));

  // Back from the editor drops the draft and lets the host pop the step.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    onRegisterBack(() => {
      if (stepRef.current === 'rateEditor') {
        setDraft(null);
        setSaveFailed(false);
      }
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack]);

  const handleAdd = useCallback(() => {
    const chart = defaultNewChart(currencies, charts);
    if (!chart) return;
    setDraft({ ...chart, id: createRateChartId() });
    setSaveFailed(false);
    onPushStep('rateEditor', { editing: false });
  }, [currencies, charts, onPushStep]);

  const handleEdit = useCallback((chart) => {
    setDraft({ ...chart });
    setSaveFailed(false);
    onPushStep('rateEditor', { editing: true });
  }, [onPushStep]);

  // Saving closes the editor only once the list is stored: a failed write
  // keeps the form, and what was typed into it, on screen with a note.
  const persist = useCallback(async (write) => {
    try {
      await write();
      setDraft(null);
      setSaveFailed(false);
      onPopStep();
    } catch (error) {
      console.error('[GraphsPanel] Failed to save exchange-rate charts:', error);
      setSaveFailed(true);
    }
  }, [onPopStep]);

  const handleSave = useCallback(() => {
    if (draft) persist(() => upsertChart(draft));
  }, [draft, persist, upsertChart]);

  const handleDelete = useCallback(() => {
    if (draft) persist(() => removeChart(draft.id));
  }, [draft, persist, removeChart]);

  // Asks the launcher to place an exchange-rate widget, which then opens the
  // widget's own screen to pick the pair. Launchers that cannot pin from an app
  // (some third-party ones) answer false; the rows then say where to find the
  // widgets instead of doing nothing.
  const [pinUnsupported, setPinUnsupported] = useState(false);
  const pinWidget = useCallback(async (widgetName) => {
    let accepted = false;
    try {
      accepted = await requestPinWidget({ widgetName });
    } catch (error) {
      console.warn('[GraphsPanel] Could not request widget pinning:', error?.message);
    }
    setPinUnsupported(!accepted);
  }, []);
  const handlePinWidget = useCallback(() => pinWidget(EXCHANGE_RATE_WIDGET), [pinWidget]);
  const handlePinPairWidget = useCallback(() => pinWidget(EXCHANGE_RATE_PAIR_WIDGET), [pinWidget]);

  if (step === 'rateEditor' && draft) {
    return (
      <RateChartEditor
        draft={draft}
        onChange={setDraft}
        currencies={currencies}
        editing={editing}
        onSave={handleSave}
        onDelete={handleDelete}
        saveError={saveFailed ? t('rate_chart_save_failed') : null}
        bottomInset={bottomInset}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
        {t('exchange_rate_charts')}
      </Text>

      {loaded && charts.length === 0 && (
        <EmptyState
          icon="trending-up-outline"
          iconSet="ionicons"
          message={t('rate_charts_empty')}
          fill={false}
          testID="rate-charts-empty"
        />
      )}

      {charts.map((chart) => (
        <SettingsNavRow
          key={chart.id}
          icon="swap-horizontal-outline"
          label={rateChartTitle(chart)}
          hint={`${t('rate_chart_default_range')}: ${t(RANGE_LABEL_KEYS[chart.range])}`}
          onPress={() => handleEdit(chart)}
          testID={`rate-chart-row-${chart.id}`}
        />
      ))}

      <SettingsNavRow
        icon="add-circle-outline"
        label={t('rate_chart_add')}
        hint={canAdd ? undefined : t('rate_chart_need_two_currencies')}
        onPress={handleAdd}
        disabled={!canAdd}
        testID="rate-chart-add"
      />

      {/* Whether a launcher can pin from an app is the launcher's, not the
          widget's: one refusal changes both rows' hints. */}
      {charts.length > 0 && (
        <>
          <SettingsNavRow
            icon="apps-outline"
            label={t('widget_add_to_home')}
            hint={pinUnsupported ? t('widget_pin_unsupported') : t('widget_add_hint')}
            onPress={handlePinWidget}
            testID="rate-widget-pin"
          />
          <SettingsNavRow
            icon="albums-outline"
            label={t('widget_pair_add_to_home')}
            hint={pinUnsupported ? t('widget_pin_unsupported') : t('widget_pair_add_hint')}
            onPress={handlePinPairWidget}
            testID="rate-widget-pin-pair"
          />
        </>
      )}

      <Text style={[styles.note, { color: colors.mutedText }]}>{t('rate_source_note')}</Text>
    </ScrollView>
  );
}

GraphsPanel.propTypes = {
  bottomInset: PropTypes.number,
  onPopStep: PropTypes.func.isRequired,
  onPushStep: PropTypes.func.isRequired,
  onRegisterBack: PropTypes.func.isRequired,
  step: PropTypes.string,
};

const styles = StyleSheet.create({
  content: {
    ...SETTINGS_LIST_CONTENT,
  },
  note: {
    fontSize: FONT_SIZE.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.md,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
});
