import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Switch } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getCategoryDisplayName } from '../utils/categoryUtils';
import EmptyState from './EmptyState';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';
import { BADGE, BADGE_TEXT, CARD_SURFACE, SECTION_LABEL } from '../styles/componentStyles';
import { BANK_PARSERS } from '../services/notifications/bankParsers';
import {
  deleteCustomTemplate,
  reloadCustomTemplates,
  setCustomTemplateEnabled,
} from '../services/notifications/customTemplates';

/**
 * "Templates" subpanel — every way Penny knows how to read a notification, in
 * one list (the notification-processing panel's Templates tab).
 *
 * Two sections, because the two kinds of parser answer different questions:
 *
 *   1. **Your templates** — the ones built by marking fields in a captured
 *      notification. Editable, switchable off, deletable.
 *   2. **Built in** — the parsers that ship with the app, listed read-only with
 *      the kinds each recognizes. They are here so the list answers "is my bank
 *      already supported?" rather than only "what have I built?" — without that,
 *      an empty list would read as "Penny can't read anything".
 *
 * A template is switched off rather than deleted when it misfires: the marking
 * work is worth keeping while the user figures out what to change, and a
 * disabled template stops affecting ingestion immediately.
 */
export default function NotificationTemplatesContentPanel({ active = true, onEdit = null, bottomInset = 0 }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { categories } = useCategories();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [templates, setTemplates] = useState([]);
  // The row awaiting delete confirmation, or null. Two-tap, mirroring the
  // bindings panel, so a stray tap never drops work that took marking to build.
  const [pendingDelete, setPendingDelete] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Reads through the parser's cache rather than the DB directly, so opening
  // this panel also brings the cache back in step. That matters because this is
  // where a user comes when a template "isn't working" — the panel should be
  // the thing that fixes a stale cache, not another view of it.
  const reload = useCallback(async () => {
    const list = await reloadCustomTemplates();
    if (!mountedRef.current) return;
    setTemplates(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (error) {
        // Non-fatal; show whatever loaded.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [reload]);

  // The page stays mounted behind the panel's tab pager, so returning to it
  // after saving a template elsewhere has to re-read the list — and re-reading
  // it is also what brings the parser's cache back in step (see reload above).
  const wasActiveRef = useRef(active);
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      reload().catch(() => {});
    }
    wasActiveRef.current = active;
  }, [active, reload]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [reload]);

  const handleToggle = useCallback(async (template, enabled) => {
    // Optimistic: the switch has to feel immediate, and a failed write is
    // reconciled by the reload that follows.
    setTemplates((prev) => prev.map((item) => (
      item.id === template.id ? { ...item, enabled } : item
    )));
    try {
      await setCustomTemplateEnabled(template.id, enabled);
    } catch (error) {
      // fall through to the reload below, which restores the real state
    }
    await reload();
  }, [reload]);

  const handleDelete = useCallback(async (template) => {
    setPendingDelete(null);
    await deleteCustomTemplate(template.id).catch(() => {});
    await reload();
  }, [reload]);

  /** Which fields a template extracts, for the row's summary line. */
  const fieldSummary = useCallback((template) => {
    const names = {
      amount: t('notification_template_field_amount') || 'Amount',
      currency: t('notification_template_field_currency') || 'Currency',
      merchant: t('notification_template_field_merchant') || 'Name',
      card: t('notification_template_field_card') || 'Card',
      date: t('notification_template_field_date') || 'Date',
      time: t('notification_template_field_time') || 'Time',
    };
    return Object.keys(template.fields || {}).map((key) => names[key] || key).join(' · ');
  }, [t]);

  const builtIns = useMemo(() => BANK_PARSERS.map((parser) => ({
    displayName: parser.displayName || parser.packageNames[0],
    packageName: parser.packageNames[0],
    kinds: parser.knownKinds || [],
  })), []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* ── Custom templates ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {`${(t('notification_templates_custom') || 'Your templates').toUpperCase()}  ·  ${templates.length}`}
      </Text>

      {templates.length === 0 ? (
        <EmptyState
          icon="create-outline"
          iconSet="ionicons"
          iconSize={40}
          fill={false}
          style={styles.emptyState}
          message={t('notification_templates_empty')
            || 'No templates yet. Long-press a notification in the list to build one.'}
        />
      ) : (
        templates.map((template) => (
          <View
            key={template.id}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardTitleRow}>
              <View style={styles.cardTitleText}>
                <Ionicons
                  name={template.type === 'income' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                  size={16}
                  color={template.type === 'income' ? colors.income : colors.expense}
                />
                <Text style={[styles.templateName, { color: colors.text }]} numberOfLines={1}>
                  {template.name}
                </Text>
              </View>
              <Switch
                value={template.enabled}
                onValueChange={(value) => handleToggle(template, value)}
                trackColor={{ false: colors.border, true: colors.primary }}
                testID={`template-toggle-${template.id}`}
                accessibilityLabel={t('notification_templates_enabled') || 'Enabled'}
              />
            </View>

            <Text style={[styles.cardMeta, { color: colors.mutedText }]} numberOfLines={1}>
              {template.packageName || (t('notification_templates_any_app') || 'Any app')}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedText }]} numberOfLines={2}>
              {fieldSummary(template)}
            </Text>
            {template.categoryId ? (
              <Text style={[styles.cardMeta, { color: colors.mutedText }]} numberOfLines={1}>
                {`${t('notification_template_category') || 'Default category'}: `}
                {getCategoryDisplayName(template.categoryId, categories, t)}
              </Text>
            ) : null}

            {template.triggers && template.triggers.length > 0 ? (
              <View style={styles.badgeRow}>
                {template.triggers.map((trigger) => (
                  <View
                    key={trigger}
                    style={[styles.badge, { backgroundColor: `${colors.income}26` }]}
                  >
                    <Text style={[styles.badgeText, { color: colors.text }]}>{trigger}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.rowActions}>
              {pendingDelete === template.id ? (
                <>
                  <TouchableOpacity
                    onPress={() => setPendingDelete(null)}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('cancel') || 'Cancel'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={20} color={colors.mutedText} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(template)}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('delete') || 'Delete'}
                    testID={`template-delete-confirm-${template.id}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash" size={20} color={colors.destructive} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => setPendingDelete(template.id)}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('delete') || 'Delete'}
                    testID={`template-delete-${template.id}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.mutedText} />
                  </TouchableOpacity>
                  {/* Editing needs the sample the template was built from; one
                      restored from a pre-sample backup can only be deleted. */}
                  {onEdit && (template.sample.text || template.sample.title) ? (
                    <TouchableOpacity
                      onPress={() => onEdit(template)}
                      style={[styles.editButton, { borderColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('edit') || 'Edit'}
                      testID={`template-edit-${template.id}`}
                    >
                      <Ionicons name="create-outline" size={15} color={colors.primary} />
                      <Text style={[styles.editButtonText, { color: colors.primary }]}>
                        {t('edit') || 'Edit'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          </View>
        ))
      )}

      {/* ── Built-in parsers ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {`${(t('notification_templates_builtin') || 'Built in').toUpperCase()}  ·  ${builtIns.length}`}
      </Text>
      <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
        {t('notification_templates_builtin_hint')
          || 'Shipped with Penny. A template you build for the same app takes priority.'}
      </Text>

      {builtIns.map((parser) => (
        <View
          key={parser.packageName}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleText}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.mutedText} />
              <Text style={[styles.templateName, { color: colors.text }]} numberOfLines={1}>
                {parser.displayName}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardMeta, { color: colors.mutedText }]} numberOfLines={1}>
            {parser.packageName}
          </Text>
          <View style={styles.badgeRow}>
            {parser.kinds.map((kind) => (
              <View key={kind} style={[styles.badge, { backgroundColor: `${colors.primary}1f` }]}>
                <Text style={[styles.badgeText, { color: colors.text }]}>{kind}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

NotificationTemplatesContentPanel.propTypes = {
  // Whether this is the panel's showing tab. False keeps the page mounted (so a
  // swipe reveals it fully drawn) but tells it its data may have gone stale.
  active: PropTypes.bool,
  // Called with a template row to open it in the editor. Omitted when the host
  // has nowhere to open it.
  onEdit: PropTypes.func,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  badge: BADGE,
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  badgeText: BADGE_TEXT,
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  cardMeta: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  cardTitleText: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginRight: SPACING.sm,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  editButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.xl,
  },
  iconButton: {
    padding: SPACING.xs,
  },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
    marginTop: SPACING.sm,
  },
  scroll: {
    flex: 1,
  },
  sectionHint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 17,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    ...SECTION_LABEL,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  templateName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
});
