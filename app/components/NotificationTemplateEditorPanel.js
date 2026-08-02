import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useCategories } from '../contexts/CategoriesContext';
import FormInput from './FormInput';
import SimplePicker from './SimplePicker';
import CategoryGridSelector from './CategoryGridSelector';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';
import { BUTTON_COMPACT, BUTTON_TEXT, CARD_SURFACE, SECTION_LABEL } from '../styles/componentStyles';
import {
  deriveFieldRule,
  matchTemplate,
  previewTemplate,
  tokenize,
  validateTemplate,
} from '../services/notifications/templateEngine';
import { normalizeNotificationText, DATE_ORDERS } from '../services/notifications/valueFormat';
import { saveCustomTemplate } from '../services/notifications/customTemplates';
import currencies from '../../assets/currencies.json';

/**
 * "Parse template" editor — where a user teaches Penny to read a new app's
 * notifications.
 *
 * ## Marking by tapping words, not by selecting text
 *
 * The notification is rendered as a grid of tappable word chips. Tapping a chip
 * assigns it to whichever field is active; tapping another widens the span to
 * cover both; tapping an assigned chip clears the field. A drag-to-select over live text
 * would be the obvious design and the wrong one: RN text selection can't report
 * offsets back reliably, selection handles fight the parent ScrollView, and
 * precise dragging over a 13px line is miserable on a phone. Tapping a word is a
 * 44px target that hits exactly what the user aimed at, every time.
 *
 * The tap doesn't have to be precise *within* a word either — the engine trims a
 * marked span to the value in it, so tapping "1 000,50," yields the number and
 * tapping "₽," yields the symbol.
 *
 * ## The preview is the template, not a mock-up
 *
 * Every change re-derives the rules, re-runs them against the sample, and
 * highlights *what the compiled template extracts*. So the chips light up
 * because the template found them, not because they were tapped. When a rule
 * would grab the balance instead of the charge, the highlight jumps to the
 * balance and the mistake is visible before it can ever book a wrong operation.
 *
 * The card underneath shows the same thing as a finished descriptor, plus how
 * many of the app's other captured notifications the template matches — the one
 * number that says whether this template generalizes or only fits its sample.
 */

/** Fields the user can mark, in the order they're offered. */
const MARKABLE_FIELDS = [
  { key: 'amount', icon: 'cash-outline', required: true },
  { key: 'merchant', icon: 'storefront-outline' },
  { key: 'currency', icon: 'pricetags-outline' },
  { key: 'card', icon: 'card-outline' },
  { key: 'date', icon: 'calendar-outline' },
  { key: 'time', icon: 'time-outline' },
];

/** Fallback English labels, used when a translation key is missing. */
const FIELD_LABELS = {
  amount: 'Amount',
  merchant: 'Name',
  currency: 'Currency',
  card: 'Card',
  date: 'Date',
  time: 'Time',
  trigger: 'Keyword',
};

/** English fallbacks for the engine's warning keys. */
const WARNING_FALLBACKS = {
  template_warning_amount_unanchored:
    'The amount has no surrounding words to anchor it — it may pick up the balance instead.',
  template_warning_no_merchant: 'No name marked — operations will have no payee.',
  template_warning_no_trigger:
    'No keyword marked — this template may claim the app’s other messages too.',
};

/** English fallbacks for the engine's error keys. */
const ERROR_FALLBACKS = {
  template_error_name_required: 'Give the template a name.',
  template_error_type_required: 'Choose expense or income.',
  template_error_amount_required: 'Mark the amount.',
  template_error_currency_required: 'Mark a currency, or pick a fixed one.',
  template_error_no_match: 'The template doesn’t match the notification it was built from.',
};

/**
 * Tint for a field's chips. The amount and the keyword — the two fields that
 * decide *whether* and *how much* — get the accent; the descriptive fields share
 * a muted one, so the grid reads as "these two matter most" at a glance.
 * @param {string} field
 * @param {Object} colors
 * @returns {string}
 */
const fieldColor = (field, colors) => {
  if (field === 'amount') return colors.primary;
  if (field === 'trigger') return colors.income;
  return colors.transfer;
};

/**
 * The trigger word a tapped token contributes: the token with the punctuation
 * that surrounds it stripped, so tapping "Платеж," stores "Платеж".
 *
 * Trimmed by an allow-list of separator characters rather than by "everything
 * that isn't a letter". A negated-letter class would need `\p{L}`, and a
 * notification's payee can be in any script — the rest of the parsing code
 * (see bankParsers/ameriabank.js) spells its letter ranges out for the same
 * reason. Falls back to the raw token when trimming would leave nothing.
 *
 * @param {{ text: string }} token
 * @returns {string}
 */
const triggerWord = (token) => {
  const raw = String(token?.text || '');
  return raw.replace(/^[\s.,;:|()[\]"'«»–—-]+|[\s.,;:|()[\]"'«»–—-]+$/g, '') || raw;
};

/**
 * Split a string into lines of tokens, keeping absolute offsets so a tapped
 * chip maps back to a span of the original text.
 * @param {string} text
 * @returns {Array<Array<{ text: string, start: number, end: number }>>}
 */
const tokenLines = (text) => {
  const source = normalizeNotificationText(text);
  if (!source) return [];
  const lines = [];
  let offset = 0;
  source.split('\n').forEach((line) => {
    lines.push(tokenize(line).map((token) => ({
      text: token.text,
      start: token.start + offset,
      end: token.end + offset,
    })));
    offset += line.length + 1; // + the newline
  });
  return lines.filter((line) => line.length > 0);
};

export default function NotificationTemplateEditorPanel({
  notification,
  template = null,
  recentNotifications = [],
  onDone,
  bottomInset = 0,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { categories } = useCategories();
  const label = useCallback(
    (key, fallback) => t(key) || fallback,
    [t],
  );

  // The notification the template is built from. Editing an existing template
  // reopens the sample it was built from, so the marks can be re-derived against
  // the very text they were made on.
  const sample = useMemo(() => {
    if (template && (template.sample?.text || template.sample?.title)) {
      return {
        title: template.sample.title || '',
        text: template.sample.text || '',
        packageName: template.packageName || null,
      };
    }
    return {
      title: notification?.title || '',
      text: notification?.text || '',
      packageName: notification?.packageName || null,
    };
  }, [notification, template]);

  const packageName = sample.packageName;

  const [name, setName] = useState(template?.name || '');
  const [type, setType] = useState(template?.type || 'expense');
  const [categoryId, setCategoryId] = useState(template?.categoryId || null);
  const [fixedCurrency, setFixedCurrency] = useState(template?.currency || null);
  const [dateOrder, setDateOrder] = useState(template?.dateOrder || 'dmy');
  const [triggers, setTriggers] = useState(template?.triggers || []);
  const [fields, setFields] = useState(template?.fields || {});
  const [activeField, setActiveField] = useState('amount');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Spans the user tapped, per field. Kept alongside the derived rules because a
  // rule is an anchor pair — it can't say which chips to keep extending.
  const [spans, setSpans] = useState({});

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const titleLines = useMemo(() => tokenLines(sample.title), [sample.title]);
  const bodyLines = useMemo(() => tokenLines(sample.text), [sample.text]);

  // Reopening a saved template: recover the marked spans by running its own
  // rules over its sample, so the chips light up exactly where the template
  // reads — which is the honest thing to show, even if the rule has since
  // drifted from what was originally tapped.
  useEffect(() => {
    if (!template) return;
    const { ranges } = previewTemplate({ ...template, enabled: true }, sample);
    const recovered = {};
    Object.entries(ranges).forEach(([field, range]) => {
      recovered[field] = { source: range.source, start: range.start, end: range.end };
    });
    setSpans(recovered);
    // Mount-only: `template` and `sample` are the values this panel was opened
    // with, and the editor owns the draft from here on — re-running would undo
    // the user's marks.
  }, []);

  // Just the parts of the draft that decide what it *matches*. Kept separate
  // from the draft below because the name and the default category don't affect
  // matching: without the split, typing a name would re-run the template over
  // every captured notification on every keystroke.
  const matcher = useMemo(() => ({
    packageName,
    type,
    currency: fixedCurrency,
    dateOrder,
    fields,
    triggers,
    enabled: true,
  }), [packageName, type, fixedCurrency, dateOrder, fields, triggers]);

  const draft = useMemo(() => ({
    ...matcher,
    id: template?.id,
    // The raw trimmed name, not a placeholder-substituted one: validateTemplate
    // has to be able to see that it is still empty, or the save button would be
    // enabled for a template the DB then refuses to store.
    name: name.trim(),
    categoryId,
    sample: { title: sample.title, text: sample.text },
    enabled: template ? template.enabled : true,
  }), [matcher, template, name, categoryId, sample]);

  const preview = useMemo(() => previewTemplate(matcher, sample), [matcher, sample]);
  const validation = useMemo(() => validateTemplate(draft, sample), [draft, sample]);

  // How many of this app's other captured notifications the template also reads.
  // A template that matches only its own sample is one that memorized it.
  const coverage = useMemo(() => {
    const siblings = (recentNotifications || []).filter((item) => {
      if (!item || (item.text === sample.text && item.title === sample.title)) return false;
      return !packageName || item.packageName === packageName;
    });
    if (siblings.length === 0) return null;
    const matched = siblings.filter((item) => matchTemplate(matcher, item)).length;
    return { matched, total: siblings.length };
  }, [recentNotifications, matcher, sample, packageName]);

  // ── Marking ────────────────────────────────────────────────────────────────

  /**
   * Assign a tapped token to the active field.
   *
   * Tapping a token already in the field's span clears the field; tapping one
   * outside it widens the span to cover both (so a multi-word payee is one tap
   * per word, and an over-wide span is undone by tapping back inside it — the
   * preview shows what the widened span actually extracts either way).
   *
   * Widening is only offered within the same source string — a span can't
   * straddle the title and the body, so a tap in the other one starts fresh.
   */
  const handleTokenPress = useCallback((token, source) => {
    const field = activeField;
    const sourceText = normalizeNotificationText(source === 'title' ? sample.title : sample.text);

    // The span and its rule are worked out here, from the current state, rather
    // than inside a setState updater: an updater has to stay pure, and nesting
    // the second setState inside the first would run the derivation twice under
    // StrictMode and apply it against a stale span.
    const current = spans[field];
    let next;
    if (current && current.source === source
      && token.start >= current.start && token.end <= current.end) {
      next = null; // tapped inside the existing span -> clear the field
    } else if (current && current.source === source
      && (token.start >= current.end || token.end <= current.start)) {
      // A token outside the span widens it to cover both, so a two-word payee
      // is two taps.
      next = {
        source,
        start: Math.min(current.start, token.start),
        end: Math.max(current.end, token.end),
      };
    } else {
      next = { source, start: token.start, end: token.end };
    }

    const rule = next ? deriveFieldRule(sourceText, next, field, source) : null;

    setSpans((prev) => {
      const updated = { ...prev };
      if (next) updated[field] = next;
      else delete updated[field];
      return updated;
    });
    setFields((prev) => {
      const updated = { ...prev };
      if (rule) updated[field] = rule;
      else delete updated[field];
      return updated;
    });
  }, [activeField, sample, spans]);

  /**
   * Toggle a token as a trigger word — the literal that has to be present for
   * this template to claim a notification at all.
   */
  const handleTriggerPress = useCallback((token) => {
    const word = triggerWord(token);
    setTriggers((prev) => (
      prev.some((entry) => entry.toLowerCase() === word.toLowerCase())
        ? prev.filter((entry) => entry.toLowerCase() !== word.toLowerCase())
        : [...prev, word]
    ));
  }, []);

  // Where each field's rule *actually* matches — this, not the tapped span, is
  // what tints the chips.
  const matchedRanges = useMemo(() => {
    const bySource = { title: [], text: [] };
    Object.entries(preview.ranges).forEach(([field, range]) => {
      bySource[range.source === 'title' ? 'title' : 'text'].push({ ...range, field });
    });
    return bySource;
  }, [preview.ranges]);

  const fieldForToken = useCallback((token, source) => {
    const hit = matchedRanges[source].find((r) => token.start < r.end && r.start < token.end);
    if (hit) return hit.field;
    // A tapped span whose rule failed to derive still shows, in an error tint, so
    // the tap never silently does nothing.
    const marked = Object.entries(spans).find(([, span]) => (
      span.source === source && token.start < span.end && span.start < token.end
    ));
    return marked ? 'unresolved' : null;
  }, [matchedRanges, spans]);

  const isTrigger = useCallback((token) => {
    const word = triggerWord(token);
    return triggers.some((entry) => entry.toLowerCase() === word.toLowerCase());
  }, [triggers]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (validation.errors.length > 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // `draft.name` is already the trimmed value validation approved.
      await saveCustomTemplate(draft);
      if (mountedRef.current) onDone(true);
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(error?.message || 'save failed');
        setSaving(false);
      }
    }
  }, [draft, onDone, saving, validation.errors.length]);

  // currencies.json is keyed by ISO code; the picker wants a list.
  const currencyItems = useMemo(
    () => Object.keys(currencies || {}).map((code) => ({
      label: code,
      subLabel: currencies[code]?.name,
      value: code,
    })),
    [],
  );

  const descriptor = preview.descriptor;
  const canSave = validation.errors.length === 0 && !saving;

  const renderTokenGrid = (lines, source) => (
    lines.map((line, lineIndex) => (
      <View key={`${source}-${lineIndex}`} style={styles.tokenLine}>
        {line.map((token) => {
          const field = activeField === 'trigger' ? null : fieldForToken(token, source);
          const trigger = isTrigger(token);
          const tint = field === 'unresolved'
            ? colors.destructive
            : (field ? fieldColor(field, colors) : null);
          const showTrigger = trigger && (activeField === 'trigger' || !field);
          const background = tint
            ? `${tint}26`
            : (showTrigger ? `${colors.income}26` : colors.background);
          return (
            <Pressable
              key={`${source}-${token.start}`}
              onPress={() => (activeField === 'trigger'
                ? handleTriggerPress(token)
                : handleTokenPress(token, source))}
              style={[styles.token, {
                backgroundColor: background,
                borderColor: tint || (showTrigger ? colors.income : colors.border),
              }]}
              testID={`template-token-${source}-${token.start}`}
              accessibilityRole="button"
              accessibilityLabel={token.text}
              accessibilityState={{ selected: !!field || showTrigger }}
            >
              <Text style={[styles.tokenText, { color: colors.text }]}>{token.text}</Text>
            </Pressable>
          );
        })}
      </View>
    ))
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── What to mark ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {label('notification_template_mark', 'Mark the fields').toUpperCase()}
      </Text>
      <Text style={[styles.hint, { color: colors.mutedText }]}>
        {label('notification_template_mark_hint',
          'Pick a field, then tap the words that hold it. Tap again to clear.')}
      </Text>

      <View style={styles.fieldChips}>
        {[...MARKABLE_FIELDS, { key: 'trigger', icon: 'key-outline' }].map((field) => {
          const active = activeField === field.key;
          const filled = field.key === 'trigger' ? triggers.length > 0 : !!fields[field.key];
          const tint = fieldColor(field.key, colors);
          return (
            <TouchableOpacity
              key={field.key}
              onPress={() => setActiveField(field.key)}
              style={[styles.fieldChip, {
                backgroundColor: active ? tint : colors.surface,
                borderColor: active ? tint : colors.border,
              }]}
              testID={`template-field-${field.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label(`notification_template_field_${field.key}`, FIELD_LABELS[field.key])}
            >
              <Ionicons
                name={filled ? 'checkmark-circle' : field.icon}
                size={14}
                color={active ? '#ffffff' : (filled ? tint : colors.mutedText)}
              />
              <Text style={[styles.fieldChipText, active ? styles.chipTextActive : { color: colors.text }]}>
                {label(`notification_template_field_${field.key}`, FIELD_LABELS[field.key])}
                {field.required ? ' *' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── The notification, as tappable words ── */}
      <View style={[styles.sampleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {titleLines.length > 0 && (
          <>
            <Text style={[styles.sampleLabel, { color: colors.mutedText }]}>
              {label('notification_template_source_title', 'Title').toUpperCase()}
            </Text>
            {renderTokenGrid(titleLines, 'title')}
          </>
        )}
        {bodyLines.length > 0 && (
          <>
            {titleLines.length > 0 && (
              <Text style={[styles.sampleLabel, styles.sampleLabelSpaced, { color: colors.mutedText }]}>
                {label('notification_template_source_text', 'Text').toUpperCase()}
              </Text>
            )}
            {renderTokenGrid(bodyLines, 'text')}
          </>
        )}
      </View>

      {/* ── Live preview: what the template makes of its own sample ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {label('notification_template_preview', 'Preview').toUpperCase()}
      </Text>
      <View style={[styles.sampleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {descriptor ? (
          <>
            <View style={styles.previewRow}>
              <Text style={[styles.previewMerchant, { color: colors.text }]} numberOfLines={1}>
                {descriptor.merchant || label('notification_template_no_name', 'No name')}
              </Text>
              <Text style={[styles.previewAmount, {
                color: type === 'income' ? colors.income : colors.expense,
              }]}
              >
                {type === 'income' ? '+' : '−'}{descriptor.amount} {descriptor.currency}
              </Text>
            </View>
            <Text style={[styles.previewMeta, { color: colors.mutedText }]}>
              {[
                descriptor.date,
                descriptor.time,
                descriptor.cardMask,
              ].filter(Boolean).join(' · ') || label('notification_template_meta_none', 'No date or card marked')}
            </Text>
          </>
        ) : (
          <Text style={[styles.previewError, { color: colors.destructive }]}>
            {label('notification_template_no_preview',
              'Nothing parses yet — mark at least the amount.')}
          </Text>
        )}

        {coverage && (
          <Text style={[styles.previewMeta, { color: colors.mutedText }]}>
            {label('notification_template_coverage', 'Also matches')}
            {` ${coverage.matched}/${coverage.total} `}
            {label('notification_template_coverage_suffix', 'other captured notifications')}
          </Text>
        )}
      </View>

      {validation.warnings.map((key) => (
        <View key={key} style={styles.noticeRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.warning }]}>
            {label(key, WARNING_FALLBACKS[key] || key)}
          </Text>
        </View>
      ))}
      {validation.errors.map((key) => (
        <View key={key} style={styles.noticeRow}>
          <Ionicons name="close-circle-outline" size={15} color={colors.destructive} />
          <Text style={[styles.noticeText, { color: colors.destructive }]}>
            {label(key, ERROR_FALLBACKS[key] || key)}
          </Text>
        </View>
      ))}

      {/* ── Settings ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {label('notification_template_settings', 'Template').toUpperCase()}
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
        {label('name', 'Name').toUpperCase()}
      </Text>
      <FormInput
        value={name}
        onChangeText={setName}
        placeholder={label('notification_template_name_placeholder', 'e.g. ACBA purchase')}
        testID="template-name-input"
      />

      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
        {label('type', 'Type').toUpperCase()}
      </Text>
      <View style={styles.typeRow}>
        {['expense', 'income'].map((option) => {
          const active = type === option;
          const tint = option === 'income' ? colors.income : colors.expense;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => setType(option)}
              style={[styles.typeButton, {
                backgroundColor: active ? tint : colors.surface,
                borderColor: active ? tint : colors.border,
              }]}
              testID={`template-type-${option}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.typeButtonText, active ? styles.chipTextActive : { color: colors.text }]}>
                {label(option, option === 'income' ? 'Income' : 'Expense')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* A fixed currency is only needed when the notification doesn't name one. */}
      {!fields.currency && (
        <>
          <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
            {label('currency', 'Currency').toUpperCase()}
            {' *'}
          </Text>
          <Text style={[styles.hint, { color: colors.mutedText }]}>
            {label('notification_template_currency_hint',
              'This app’s notifications don’t spell out a currency — pick the one it means.')}
          </Text>
          <View style={[styles.pickerWrap, { borderColor: colors.border }]}>
            <SimplePicker
              value={fixedCurrency}
              onValueChange={setFixedCurrency}
              items={currencyItems}
              colors={colors}
              closeLabel={label('close', 'Close')}
            />
          </View>
        </>
      )}

      {/* Only a marked date can be ambiguous, so the order picker only appears
          once there is one — and only when the sample can't settle it itself. */}
      {fields.date && (
        <>
          <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
            {label('notification_template_date_order', 'Date order').toUpperCase()}
          </Text>
          <View style={styles.typeRow}>
            {DATE_ORDERS.map((order) => {
              const active = dateOrder === order;
              return (
                <TouchableOpacity
                  key={order}
                  onPress={() => setDateOrder(order)}
                  style={[styles.typeButton, {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                  testID={`template-date-order-${order}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.typeButtonText, active ? styles.chipTextActive : { color: colors.text }]}>
                    {order.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.categoryLabelRow}>
        <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
          {label('notification_template_category', 'Default category').toUpperCase()}
        </Text>
        {categoryId ? (
          <TouchableOpacity
            onPress={() => setCategoryId(null)}
            style={styles.clearCategory}
            accessibilityRole="button"
            accessibilityLabel={label('clear', 'Clear')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={14} color={colors.mutedText} />
            <Text style={[styles.selectedCategoryText, { color: colors.text }]} numberOfLines={1}>
              {getCategoryDisplayName(categoryId, categories, t)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.hint, { color: colors.mutedText }]}>
        {label('notification_template_category_hint',
          'Used until a category is learned for the payee. Optional.')}
      </Text>
      <CategoryGridSelector
        categories={categories}
        categoryType={type}
        selectedCategoryId={categoryId}
        onSelect={setCategoryId}
        colors={colors}
        t={t}
        testIDPrefix="template-category"
      />

      {saveError ? (
        <View style={styles.noticeRow}>
          <Ionicons name="close-circle-outline" size={15} color={colors.destructive} />
          <Text style={[styles.noticeText, { color: colors.destructive }]}>
            {label('notification_template_save_failed', 'Could not save the template.')}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onDone(false)}
          style={styles.actionButton}
          accessibilityRole="button"
          testID="template-cancel"
        >
          <Text style={[styles.actionLabel, { color: colors.mutedText }]}>
            {label('cancel', 'Cancel')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.actionButton, styles.actionButtonPrimary, {
            backgroundColor: canSave ? colors.primary : colors.border,
          }]}
          accessibilityRole="button"
          testID="template-save"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
              {label('save', 'Save')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

NotificationTemplateEditorPanel.propTypes = {
  // The captured notification to build from (omitted when editing a template
  // that carries its own sample).
  notification: PropTypes.shape({
    title: PropTypes.string,
    text: PropTypes.string,
    packageName: PropTypes.string,
  }),
  // The template being edited, or null when creating a new one.
  template: PropTypes.object,
  // Other captured notifications, used for the match-rate readout.
  recentNotifications: PropTypes.array,
  // Called with true when a template was saved, false when the user cancelled.
  onDone: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  actionButton: BUTTON_COMPACT,
  actionButtonPrimary: {
    minWidth: 88,
  },
  actionLabel: BUTTON_TEXT,
  actionLabelPrimary: {
    color: '#ffffff',
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
    marginBottom: SPACING.lg,
    marginTop: SPACING.lg,
  },
  categoryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  clearCategory: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: SPACING.xs,
  },
  fieldChip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  fieldChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fieldChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    ...SECTION_LABEL,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 17,
    marginBottom: SPACING.sm,
  },
  noticeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  noticeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    lineHeight: 17,
  },
  pickerWrap: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  previewError: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
  },
  previewMerchant: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    marginRight: SPACING.sm,
  },
  previewMeta: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sampleCard: {
    ...CARD_SURFACE,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  sampleLabel: {
    ...SECTION_LABEL,
    marginBottom: SPACING.xs,
  },
  sampleLabelSpaced: {
    marginTop: SPACING.md,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    ...SECTION_LABEL,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  selectedCategoryText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  token: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  tokenLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  tokenText: {
    fontSize: FONT_SIZE.md,
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: SPACING.sm,
  },
  typeButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
