import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useBudgetPlans } from '../../contexts/BudgetPlansContext';
import * as Currency from '../../services/currency';
import { SPACING } from '../../styles/layout';
import BudgetPlanLineModal from './BudgetPlanLineModal';

/** Current month as YYYY-MM. */
const currentMonthKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/** Shift a YYYY-MM key by `delta` months. */
const addMonths = (monthKey, delta) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
};

/** Localized "Month YYYY" label for a YYYY-MM key. */
const formatMonthLabel = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const CLOSED_MODAL = { visible: false, mode: 'line', line: null };

/**
 * MonthlyPlanSection — the envelope-style monthly plan editor that sits at the
 * top of the Budget tab: month header with ‹ › navigation, expected income,
 * allocation lines (category- or transfer-target-linked) with live-computed
 * remainder, and add/reorder/delete actions. Purely declarative — no
 * actual-vs-plan tracking yet (that is a later roadmap part).
 */
export default function MonthlyPlanSection({ currency = 'USD', expenseCategories = [], accounts = [] }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    plans,
    addPlan,
    copyPlan,
    updatePlan,
    addLine,
    updateLine,
    deleteLine,
    reorderLines,
    getPlanLines,
  } = useBudgetPlans();

  const [month, setMonth] = useState(currentMonthKey);
  const [lines, setLines] = useState([]);
  const [modal, setModal] = useState(CLOSED_MODAL);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(() => plans.find(p => p.month === month) || null, [plans, month]);
  const prevMonth = useMemo(() => addMonths(month, -1), [month]);
  const prevPlanExists = useMemo(() => plans.some(p => p.month === prevMonth), [plans, prevMonth]);

  const planId = plan?.id ?? null;
  const planCurrency = plan?.currency || currency;

  const categoriesById = useMemo(
    () => new Map(expenseCategories.map(c => [c.id, c])),
    [expenseCategories],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const reloadLines = useCallback(async (planId) => {
    if (!planId) {
      setLines([]);
      return;
    }
    try {
      const data = await getPlanLines(planId);
      setLines(data);
    } catch (error) {
      console.error('Failed to load plan lines:', error);
      setLines([]);
    }
  }, [getPlanLines]);

  // Load lines whenever the shown plan changes (month navigation, create, copy).
  // Keyed on planId (not the plan object) so an income edit — which produces a new
  // plan object but the same id — doesn't trigger a redundant lines re-fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!planId) {
        if (!cancelled) setLines([]);
        return;
      }
      try {
        const data = await getPlanLines(planId);
        if (!cancelled) setLines(data);
      } catch (error) {
        console.error('Failed to load plan lines:', error);
        if (!cancelled) setLines([]);
      }
    })();
    return () => { cancelled = true; };
  }, [planId, getPlanLines]);

  // Live totals: allocated = Σ line amounts, remainder = income − allocated.
  // Same precise decimal math as BudgetPlansDB.getPlanTotals, computed locally so
  // the remainder updates immediately as lines/income change.
  const totals = useMemo(() => {
    const income = plan?.expectedIncome ?? '0';
    let allocated = '0';
    for (const line of lines) {
      allocated = Currency.add(allocated, line.amount, planCurrency);
    }
    const remainder = Currency.subtract(income, allocated, planCurrency);
    return { income, allocated, remainder };
  }, [plan, lines, planCurrency]);

  const remainderNegative = Currency.isNegative(totals.remainder);

  const handlePrev = useCallback(() => setMonth(m => addMonths(m, -1)), []);
  const handleNext = useCallback(() => setMonth(m => addMonths(m, 1)), []);

  const handleCreateEmpty = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await addPlan({ month, currency: currency || 'USD' });
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      setBusy(false);
    }
  }, [busy, addPlan, month, currency]);

  const handleCopyLast = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await copyPlan(prevMonth, month);
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      setBusy(false);
    }
  }, [busy, copyPlan, prevMonth, month]);

  const openIncomeEditor = useCallback(() => {
    setModal({ visible: true, mode: 'income', line: null });
  }, []);
  const openAddLine = useCallback(() => {
    setModal({ visible: true, mode: 'line', line: null });
  }, []);
  const openEditLine = useCallback((line) => {
    setModal({ visible: true, mode: 'line', line });
  }, []);
  const closeModal = useCallback(() => setModal(CLOSED_MODAL), []);

  const handleSaveIncome = useCallback(async (amount) => {
    if (!plan) return;
    try {
      await updatePlan(plan.id, { expectedIncome: amount });
    } catch (error) {
      // Error dialog already shown by the context.
    } finally {
      closeModal();
    }
  }, [plan, updatePlan, closeModal]);

  // Line-level context actions don't surface their own errors (unlike plan-level
  // ones), so report failures here and keep the editor open on error rather than
  // silently dropping the user's input.
  const handleSaveLine = useCallback(async (lineData) => {
    if (!plan) return;
    try {
      if (modal.line) {
        await updateLine(modal.line.id, lineData);
      } else {
        await addLine(plan.id, { ...lineData, sortOrder: lines.length });
      }
      await reloadLines(plan.id);
      closeModal();
    } catch (error) {
      console.error('Failed to save plan line:', error);
      showDialog('Error', error.message, [{ text: t('ok') }]);
    }
  }, [plan, modal.line, updateLine, addLine, lines.length, reloadLines, closeModal, showDialog, t]);

  const handleDeleteLine = useCallback(async (lineId) => {
    if (!plan) return;
    try {
      await deleteLine(lineId);
      await reloadLines(plan.id);
      closeModal();
    } catch (error) {
      console.error('Failed to delete plan line:', error);
      showDialog('Error', error.message, [{ text: t('ok') }]);
    }
  }, [plan, deleteLine, reloadLines, closeModal, showDialog, t]);

  const handleLongPressLine = useCallback((line) => {
    showDialog(
      t('delete_allocation'),
      t('delete_allocation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => handleDeleteLine(line.id) },
      ],
    );
  }, [showDialog, t, handleDeleteLine]);

  // Move a line up/down and persist the new sort order.
  const handleMove = useCallback(async (index, direction) => {
    if (!plan) return;
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const reordered = lines.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setLines(reordered); // optimistic
    try {
      await reorderLines(plan.id, reordered.map(l => l.id));
      await reloadLines(plan.id);
    } catch (error) {
      console.error('Failed to reorder plan lines:', error);
      await reloadLines(plan.id); // revert to persisted order
    }
  }, [plan, lines, reorderLines, reloadLines]);

  const lineDisplayName = useCallback((line) => {
    if (line.label) return line.label;
    if (line.categoryId != null) return categoriesById.get(line.categoryId)?.name || t('allocation_unlinked');
    if (line.toAccountId != null) return accountsById.get(line.toAccountId)?.name || t('allocation_unlinked');
    return t('allocation_unlinked');
  }, [categoriesById, accountsById, t]);

  const lineIcon = useCallback((line) => {
    if (line.isBroken) return 'link-off';
    if (line.toAccountId != null) return 'bank-transfer';
    return categoriesById.get(line.categoryId)?.icon || 'shape-outline';
  }, [categoriesById]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="monthly-plan-section">
      {/* Month header with ‹ › navigation */}
      <View style={styles.monthHeader}>
        <Pressable
          onPress={handlePrev}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={t('previous_month')}
          testID="plan-prev-month"
        >
          <Icon name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.text }]} testID="plan-month-label">
          {formatMonthLabel(month)}
        </Text>
        <Pressable
          onPress={handleNext}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel={t('next_month')}
          testID="plan-next-month"
        >
          <Icon name="chevron-right" size={26} color={colors.text} />
        </Pressable>
      </View>

      {!plan ? (
        <View style={styles.emptyPlan} testID="plan-empty-state">
          <Icon name="clipboard-text-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>{t('no_plan_for_month')}</Text>
          <View style={styles.emptyActions}>
            <Pressable
              style={[styles.primaryAction, { backgroundColor: colors.primary }]}
              onPress={handleCreateEmpty}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('create_empty_plan')}
              testID="plan-create-empty"
            >
              <Icon name="plus" size={18} color={colors.text} />
              <Text style={[styles.primaryActionText, { color: colors.text }]}>{t('create_empty_plan')}</Text>
            </Pressable>
            {prevPlanExists && (
              <Pressable
                style={[styles.secondaryAction, { borderColor: colors.border }]}
                onPress={handleCopyLast}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('copy_from_last_month')}
                testID="plan-copy-last"
              >
                <Icon name="content-copy" size={18} color={colors.text} />
                <Text style={[styles.secondaryActionText, { color: colors.text }]}>{t('copy_from_last_month')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <>
          {/* Expected income (tap to edit) */}
          <Pressable
            style={[styles.incomeRow, { borderColor: colors.border }]}
            onPress={openIncomeEditor}
            accessibilityRole="button"
            accessibilityLabel={t('expected_income')}
            testID="plan-income-row"
          >
            <View style={styles.incomeLabel}>
              <Icon name="cash-plus" size={20} color={colors.text} />
              <Text style={[styles.incomeText, { color: colors.text }]}>{t('expected_income')}</Text>
            </View>
            <Text style={[styles.incomeAmount, { color: colors.text }]}>
              {Currency.formatAmount(totals.income, planCurrency)} {planCurrency}
            </Text>
          </Pressable>

          {/* Allocation lines */}
          {lines.map((line, index) => (
            <Pressable
              key={line.id}
              style={[styles.lineRow, index % 2 === 1 && { backgroundColor: colors.altRow }]}
              onPress={() => openEditLine(line)}
              onLongPress={() => handleLongPressLine(line)}
              accessibilityRole="button"
              accessibilityLabel={`${t('edit_allocation')}: ${lineDisplayName(line)}`}
              testID={`plan-line-${line.id}`}
            >
              <Icon name={lineIcon(line)} size={20} color={colors.text} />
              <View style={styles.lineBody}>
                <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={1}>
                  {lineDisplayName(line)}
                </Text>
                {!!line.comment && (
                  <Text style={[styles.lineComment, { color: colors.mutedText }]} numberOfLines={1}>
                    {line.comment}
                  </Text>
                )}
              </View>
              <Text style={[styles.lineAmount, { color: colors.text }]}>
                {Currency.formatAmount(line.amount, planCurrency)}
              </Text>
              <View style={styles.moveButtons}>
                <Pressable
                  onPress={() => handleMove(index, -1)}
                  disabled={index === 0}
                  hitSlop={6}
                  style={styles.moveButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('move_up')}
                  testID={`plan-line-up-${line.id}`}
                >
                  <Icon name="chevron-up" size={20} color={index === 0 ? colors.border : colors.mutedText} />
                </Pressable>
                <Pressable
                  onPress={() => handleMove(index, 1)}
                  disabled={index === lines.length - 1}
                  hitSlop={6}
                  style={styles.moveButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('move_down')}
                  testID={`plan-line-down-${line.id}`}
                >
                  <Icon name="chevron-down" size={20} color={index === lines.length - 1 ? colors.border : colors.mutedText} />
                </Pressable>
              </View>
            </Pressable>
          ))}

          {/* Add allocation */}
          <Pressable
            style={[styles.addRow, { borderColor: colors.border }]}
            onPress={openAddLine}
            accessibilityRole="button"
            accessibilityLabel={t('add_allocation')}
            testID="plan-add-line"
          >
            <Icon name="plus" size={20} color={colors.primary} />
            <Text style={[styles.addText, { color: colors.primary }]}>{t('add_allocation')}</Text>
          </Pressable>

          {/* Totals */}
          <View style={[styles.totalsRow, { borderTopColor: colors.border }]} testID="plan-totals">
            <Text style={[styles.totalsLabel, { color: colors.mutedText }]}>
              {t('allocated')}: {Currency.formatAmount(totals.allocated, planCurrency)} {planCurrency}
            </Text>
            <Text
              style={[styles.totalsRemainder, { color: remainderNegative ? colors.danger : colors.text }]}
              testID="plan-remainder"
            >
              {t('remainder')}: {Currency.formatAmount(totals.remainder, planCurrency)} {planCurrency}
            </Text>
          </View>
        </>
      )}

      <BudgetPlanLineModal
        visible={modal.visible}
        mode={modal.mode}
        line={modal.line}
        currency={planCurrency}
        initialIncome={totals.income}
        expenseCategories={expenseCategories}
        accounts={accounts}
        onSaveLine={handleSaveLine}
        onSaveIncome={handleSaveIncome}
        onDeleteLine={handleDeleteLine}
        onClose={closeModal}
      />
    </View>
  );
}

MonthlyPlanSection.propTypes = {
  currency: PropTypes.string,
  expenseCategories: PropTypes.array,
  accounts: PropTypes.array,
};

const styles = StyleSheet.create({
  addRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  addText: {
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  emptyActions: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
    width: '100%',
  },
  emptyPlan: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  emptyText: {
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  incomeAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  incomeLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  incomeRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  incomeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  lineAmount: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  lineBody: {
    flex: 1,
    marginLeft: 10,
  },
  lineComment: {
    fontSize: 12,
    marginTop: 1,
  },
  lineName: {
    fontSize: 15,
  },
  lineRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: SPACING.sm,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  moveButton: {
    paddingHorizontal: 2,
  },
  moveButtons: {
    flexDirection: 'row',
    marginLeft: 6,
  },
  navButton: {
    padding: 4,
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalsLabel: {
    fontSize: 14,
  },
  totalsRemainder: {
    fontSize: 14,
    fontWeight: '700',
  },
  totalsRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
});
