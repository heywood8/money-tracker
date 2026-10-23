import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import ChoiceChipRow from '../ChoiceChipRow';
import CurrencyChipRow from '../CurrencyChipRow';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { fetchLiveExchangeRate, getCurrencySymbol } from '../../services/currency';
import { RANGE_LABEL_KEYS, RATE_AMOUNTS, RATE_RANGES, formatRateValue } from '../../services/ExchangeRateHistory';
import { reverseRateChart } from '../../services/ExchangeRateCharts';
import { BUTTON, BUTTON_TEXT, CARD_SURFACE, SECTION_LABEL } from '../../styles/componentStyles';
import { FONT_SIZE, FONT_WEIGHT, HEIGHTS, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

/**
 * Pick `code` for one side of the pair. Picking the currency the other side
 * already holds swaps them instead, so the pair can never be one currency
 * against itself and there is no disabled chip to explain.
 *
 * @param {Object} chart
 * @param {'from'|'to'} side
 * @param {string} code
 * @returns {Object}
 */
export const pickCurrency = (chart, side, code) => {
  const other = side === 'from' ? 'to' : 'from';
  if (chart[other] === code) return { ...chart, [side]: code, [other]: chart[side] };
  return { ...chart, [side]: code };
};

/**
 * The form for one exchange-rate chart: which currency is priced in which, per
 * how many units, and which range the chart opens on.
 *
 * Only the currencies the user holds accounts in are offered — those are the
 * rates that bear on their money — plus whatever the chart already uses, so
 * editing a chart whose account has since been deleted does not silently
 * change its pair.
 */
export default function RateChartEditor({
  draft,
  onChange,
  currencies,
  editing,
  onSave,
  onDelete,
  saveError = null,
  bottomInset,
}) {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();

  const codes = useMemo(() => {
    const list = [...currencies];
    [draft.from, draft.to].forEach((code) => { if (code && !list.includes(code)) list.push(code); });
    return list;
  }, [currencies, draft.from, draft.to]);

  // Today's rate under the form, so choosing the amount is choosing a figure
  // the user can see ("100 AMD = ₽22.59") rather than guessing at one.
  const [preview, setPreview] = useState({ key: null, rate: null, offline: false });
  const previewKey = `${draft.from}|${draft.to}`;
  useEffect(() => {
    let cancelled = false;
    fetchLiveExchangeRate(draft.from, draft.to)
      .then(({ rate, source }) => {
        if (!cancelled) {
          setPreview({ key: previewKey, rate: rate ? Number(rate) : null, offline: source === 'offline' });
        }
      })
      .catch(() => { if (!cancelled) setPreview({ key: previewKey, rate: null, offline: false }); });
    return () => { cancelled = true; };
  }, [draft.from, draft.to, previewKey]);

  const previewLoading = preview.key !== previewKey;
  // A bundled offline rate can be months old: say so rather than pass it off
  // as today's.
  const previewText = !previewLoading && preview.rate
    ? `${draft.amount} ${draft.from} = ${getCurrencySymbol(draft.to)}${formatRateValue(preview.rate * draft.amount, language)}`
      + (preview.offline ? ` · ${t('rate_offline')}` : '')
    : null;

  const amountOptions = useMemo(
    () => RATE_AMOUNTS.map((value) => ({ value, label: String(value) })),
    [],
  );
  const rangeOptions = useMemo(
    () => RATE_RANGES.map((value) => ({ value, label: t(RANGE_LABEL_KEYS[value]) })),
    [t],
  );

  const handleFrom = useCallback((code) => onChange(pickCurrency(draft, 'from', code)), [draft, onChange]);
  const handleTo = useCallback((code) => onChange(pickCurrency(draft, 'to', code)), [draft, onChange]);
  const handleReverse = useCallback(() => onChange(reverseRateChart(draft)), [draft, onChange]);
  const handleAmount = useCallback((amount) => onChange({ ...draft, amount }), [draft, onChange]);
  const handleRange = useCallback((range) => onChange({ ...draft, range }), [draft, onChange]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('rate_chart_from')}</Text>
      <CurrencyChipRow
        codes={codes}
        selectedCode={draft.from}
        onSelect={handleFrom}
        colors={colors}
        showSymbol
        testIDPrefix="rate-editor-from"
      />

      <Pressable
        onPress={handleReverse}
        style={styles.reverseButton}
        accessibilityRole="button"
        accessibilityLabel={t('rate_chart_reverse')}
        testID="rate-editor-reverse"
      >
        <Icon name="swap-vertical" size={20} color={colors.primary} />
        <Text style={[styles.reverseText, { color: colors.primary }]}>{t('rate_chart_reverse')}</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>{t('rate_chart_to')}</Text>
      <CurrencyChipRow
        codes={codes}
        selectedCode={draft.to}
        onSelect={handleTo}
        colors={colors}
        showSymbol
        testIDPrefix="rate-editor-to"
      />

      <Text style={[styles.sectionLabel, styles.sectionGap, { color: colors.mutedText }]}>
        {t('rate_chart_amount')}
      </Text>
      <ChoiceChipRow
        options={amountOptions}
        selected={draft.amount}
        onSelect={handleAmount}
        colors={colors}
        testIDPrefix="rate-editor-amount"
      />

      <Text style={[styles.sectionLabel, styles.sectionGap, { color: colors.mutedText }]}>
        {t('rate_chart_default_range')}
      </Text>
      <ChoiceChipRow
        options={rangeOptions}
        selected={draft.range}
        onSelect={handleRange}
        colors={colors}
        testIDPrefix="rate-editor-range"
      />

      <View style={[styles.preview, { borderColor: colors.border }]} testID="rate-editor-preview">
        {previewLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[styles.previewText, { color: previewText ? colors.text : colors.mutedText }]}>
            {previewText || t('rate_unavailable')}
          </Text>
        )}
      </View>

      {saveError && (
        <Text style={[styles.saveError, { color: colors.destructive }]} testID="rate-editor-save-failed">
          {saveError}
        </Text>
      )}

      <Pressable
        onPress={onSave}
        style={[styles.button, { backgroundColor: colors.primaryFill }]}
        accessibilityRole="button"
        testID="rate-editor-save"
      >
        <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{t('save')}</Text>
      </Pressable>

      {editing && (
        <Pressable
          onPress={onDelete}
          style={[styles.button, styles.deleteButton, { borderColor: colors.destructive }]}
          accessibilityRole="button"
          testID="rate-editor-delete"
        >
          <Text style={[styles.buttonText, { color: colors.destructive }]}>{t('delete')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

RateChartEditor.propTypes = {
  bottomInset: PropTypes.number,
  // Account currencies, in the order the accounts are listed.
  currencies: PropTypes.arrayOf(PropTypes.string).isRequired,
  draft: PropTypes.shape({
    id: PropTypes.string,
    from: PropTypes.string.isRequired,
    to: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    range: PropTypes.string.isRequired,
  }).isRequired,
  editing: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
  onSave: PropTypes.func.isRequired,
  // Shown above Save when the last save could not be stored.
  saveError: PropTypes.string,
};

const styles = StyleSheet.create({
  button: {
    ...BUTTON,
    marginTop: SPACING.lg,
  },
  buttonText: BUTTON_TEXT,
  content: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.lg,
  },
  deleteButton: {
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  preview: {
    ...CARD_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    minHeight: HEIGHTS.input,
    paddingHorizontal: SPACING.lg,
  },
  previewText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  reverseButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.xs,
    minHeight: HEIGHTS.input,
  },
  reverseText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  saveError: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.md,
  },
  sectionGap: {
    marginTop: SPACING.xl,
  },
  sectionLabel: {
    ...SECTION_LABEL,
    marginBottom: SPACING.sm,
  },
});
