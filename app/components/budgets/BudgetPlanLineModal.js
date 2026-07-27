import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  Keyboard,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { DURATION_ENTER, DURATION_EXIT } from '../../utils/motion';
import { motionDuration } from '../../utils/reducedMotion';
import { useDialog } from '../../contexts/DialogContext';
import useKeyboardOffset from '../../hooks/useKeyboardOffset';
import FormInput from '../FormInput';
import ModalBlurOverlay from '../ModalBlurOverlay';
import ModalHeader from '../ModalHeader';
import * as Currency from '../../services/currency';

// The overlay carries the keyboard inset, so it has to be animatable.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const KINDS = ['income', 'expense', 'transfer'];

/**
 * BudgetPlanLineModal — editor for a single budget line: a monthly target that
 * may also carry an executable template. Follows the repo's subpanel pattern (see
 * CLAUDE.md): the target and account pickers slide in over the form inside the
 * SAME modal — never a nested Modal.
 *
 * `kind` decides what the line means and what an execution would create:
 *   - expense  → tracks spending across ONE OR MORE expense categories (at least
 *     one required); the picker toggles them, and spending in their descendants
 *     always rolls up (a parent category IS its subtree — nothing to configure),
 *   - transfer → tracks incoming transfers into ONE destination account (required),
 *   - income   → declares part of the month's expected income; categories are
 *     optional context (income is compared against the month's real income as a
 *     whole, see BudgetPlansDB.calculateLineActual).
 * A line links to categories OR an account, never both — enforced here and again
 * in BudgetPlansDB.
 *
 * Picking an EXECUTION ACCOUNT turns the line into a one-tap payable (the former
 * planned operation): the account is what the created operation touches, so the
 * line's amount is then expressed in that account's currency and the currency
 * picker steps aside. Without an account the line stays a pure analytic target.
 *
 * A recurring line is a global template that applies to every calendar month
 * automatically (like the old v1 per-category budgets, and like a recurring
 * planned operation); a one-off line belongs to this month's plan only, and — when
 * it has a template — is consumed by its execution.
 */
export default function BudgetPlanLineModal({
  visible = false,
  line = null,
  initialKind = 'expense',
  currency = 'USD',
  expenseCategories = [],
  incomeCategories = [],
  accounts = [],
  groups = [],
  saving = false,
  onSaveLine = () => {},
  onDeleteLine = () => {},
  onCreateGroup = null,
  onClose = () => {},
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  // Lifts the card above the keyboard. NOT a KeyboardAvoidingView — see the
  // hook's own note for what that one does inside a Modal under edge-to-edge.
  const keyboardOffset = useKeyboardOffset(visible);

  const isEditingLine = line != null;

  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [comment, setComment] = useState('');
  // A line tracks EITHER categories OR a destination account (the "exactly one
  // kind of target" invariant); an income line may have neither. Since migration
  // 0021 the category side is a SET — several categories can share one budget.
  const [categoryIds, setCategoryIds] = useState([]);
  const [toAccountId, setToAccountId] = useState(null);
  // Execution account — set means "this line is executable".
  const [accountId, setAccountId] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [lineCurrency, setLineCurrency] = useState(currency);
  // The envelope this line belongs to (migration 0022), or null for a line that
  // stands on its own — which is what every line is until it is put in one.
  const [groupId, setGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState(null);

  const accountsById = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  );
  const targetCategories = kind === 'income' ? incomeCategories : expenseCategories;
  const categoriesById = useMemo(
    () => new Map([...expenseCategories, ...incomeCategories].map(c => [c.id, c])),
    [expenseCategories, incomeCategories],
  );

  // An executable line's amount lives in its account's currency (that is the
  // currency the created operation is in), so the picker only applies to a
  // template-less line — recurring or not (both may be priced in a currency of
  // their own since migration 0020).
  const executionCurrency = accountId != null ? accountsById.get(accountId)?.currency : null;
  // A one-off line stores currency: null to mean "inherit the plan's", which is
  // what it did before it had a picker — so only a chip that differs from the
  // plan's currency is written out. A recurring line has no plan to inherit
  // from and always carries its own.
  const oneOffCurrency = lineCurrency && lineCurrency !== currency ? lineCurrency : null;
  const effectiveCurrency = executionCurrency || (isRecurring ? lineCurrency : oneOffCurrency);
  // What the amount is actually denominated in. A template-less one-off line stores
  // currency: null and is priced in the plan's currency, so the field is labelled
  // with that rather than left bare. (May still be '' if the plan has no currency
  // yet — no accounts exist.)
  const displayCurrency = effectiveCurrency || currency;

  // Currency options for a template-less line: every currency in use across the
  // user's accounts, the plan's own currency (always offered, even if no
  // account currently uses it), and — when editing — the line's existing
  // currency (it may no longer match any account, e.g. the account was closed).
  const currencyOptions = useMemo(() => {
    const set = new Set(accounts.map(a => a.currency));
    set.add(currency);
    if (line?.currency) set.add(line.currency);
    return [...set];
  }, [accounts, currency, line]);

  // Subpanel navigation for the pickers.
  const [activeSubPanel, setActiveSubPanel] = useState(null); // null | 'target' | 'account' | 'group'
  // Which kind of target the target picker is currently showing.
  const [pickerKind, setPickerKind] = useState('category'); // 'category' | 'account'
  const mainAnim = useRef(new Animated.Value(0)).current;
  const subPanelAnim = useRef(new Animated.Value(0)).current;

  // Initialize form each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (line) {
      setKind(line.kind || 'expense');
      setAmount(line.amount != null ? String(line.amount) : '');
      setLabel(line.label || '');
      setComment(line.comment || '');
      // Older callers (and stored lines read before 0021) only carry categoryId.
      setCategoryIds(line.categoryIds ?? (line.categoryId != null ? [line.categoryId] : []));
      setToAccountId(line.toAccountId ?? null);
      setAccountId(line.accountId ?? null);
      setIsRecurring(!!line.isRecurring);
      setLineCurrency(line.currency || currency);
      setGroupId(line.groupId ?? null);
    } else {
      setKind(initialKind);
      setAmount('');
      setLabel('');
      setComment('');
      setCategoryIds([]);
      setToAccountId(null);
      setAccountId(null);
      setIsRecurring(false);
      setLineCurrency(currency);
      setGroupId(null);
    }
    setNewGroupName('');
  }, [visible, line, initialKind, currency]);

  // Reset subpanel + animations whenever the modal is hidden.
  useEffect(() => {
    if (!visible) {
      setActiveSubPanel(null);
      mainAnim.setValue(0);
      subPanelAnim.setValue(0);
    }
  }, [visible, mainAnim, subPanelAnim]);

  // Guards the close animation's completion callback against a panel opened in
  // the meantime: closing runs for 180ms, and a tap on the OTHER picker inside
  // that window would otherwise be undone when the stale callback fires and
  // clears activeSubPanel.
  const subPanelTokenRef = useRef(0);

  const openSubPanel = useCallback((panel) => {
    Keyboard.dismiss();
    subPanelTokenRef.current++;
    setActiveSubPanel(panel);
    Animated.parallel([
      Animated.timing(mainAnim, {
        toValue: 1, duration: motionDuration(DURATION_EXIT), easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(subPanelAnim, {
        toValue: 1, duration: motionDuration(DURATION_ENTER), easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [mainAnim, subPanelAnim]);

  const closeSubPanel = useCallback(() => {
    const token = ++subPanelTokenRef.current;
    Animated.parallel([
      Animated.timing(subPanelAnim, {
        toValue: 0, duration: motionDuration(180), easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(mainAnim, {
        toValue: 0, duration: motionDuration(240), easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start(() => {
      if (subPanelTokenRef.current === token) setActiveSubPanel(null);
    });
  }, [subPanelAnim, mainAnim]);

  const openTargetPanel = useCallback(() => {
    // Open the picker on the tab matching the current selection. An income line
    // tracks no transfer target, so it only ever shows categories.
    setPickerKind(kind !== 'income' && toAccountId != null ? 'account' : 'category');
    openSubPanel('target');
  }, [kind, toAccountId, openSubPanel]);

  const openAccountPanel = useCallback(() => openSubPanel('account'), [openSubPanel]);
  const openGroupPanel = useCallback(() => openSubPanel('group'), [openSubPanel]);

  const handleSelectGroup = useCallback((id) => {
    setGroupId(id);
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  // Creating the envelope from inside the line that is joining it: the
  // alternative is making the user leave a half-filled form, go create a group
  // somewhere else, and come back to it.
  const handleCreateGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name || !onCreateGroup) return;
    try {
      const created = await onCreateGroup(name);
      if (created?.id) {
        setGroupId(created.id);
        setNewGroupName('');
        closeSubPanel();
      }
    } catch (createError) {
      // Already surfaced by the host's error dialog; keep the panel open so the
      // typed name isn't lost.
      console.error('Failed to create budget line group:', createError);
    }
  }, [newGroupName, onCreateGroup, closeSubPanel]);

  // Switching kind drops a target that no longer applies, so the line can never
  // be saved as e.g. a transfer that still carries a category.
  const handleSelectKind = useCallback((next) => {
    setKind(next);
    setError(null);
    if (next === 'transfer') {
      setCategoryIds([]);
    } else {
      setToAccountId(null);
      // Keep whichever of the picked categories still belong to the new kind's
      // list — switching expense↔income shares no categories, so this usually
      // empties the set, but it never silently keeps an income category on an
      // expense line.
      const allowed = next === 'income' ? incomeCategories : expenseCategories;
      const allowedIds = new Set(allowed.map(c => c.id));
      setCategoryIds(prev => prev.filter(id => allowedIds.has(id)));
    }
  }, [incomeCategories, expenseCategories]);

  // Picking a target also settles the kind, so the two can never contradict each
  // other: a line tracking a destination account IS a transfer, and one tracking
  // a category is not (income keeps its kind — an income line may carry an income
  // category for context).
  // Categories toggle rather than replace, and the panel STAYS OPEN — picking a
  // set of them is the point, and closing on the first tap would make adding a
  // second category a four-tap round trip. "Done" (or back) closes it.
  const handleToggleCategory = useCallback((cat) => {
    setToAccountId(null);
    setKind(prev => (prev === 'transfer' ? 'expense' : prev));
    setError(null);
    setCategoryIds(prev => (
      prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
    ));
  }, []);

  const handleSelectTransferTarget = useCallback((acc) => {
    setToAccountId(acc.id);
    setCategoryIds([]);
    setKind('transfer');
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  const handleSelectExecutionAccount = useCallback((acc) => {
    setAccountId(acc ? acc.id : null);
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  // Normalize a locale decimal comma to a dot — Android decimal-pad keyboards
  // emit "," in many locales and the currency parsing downstream reads a comma
  // string as garbage (parseFloat('1,5') === 1, Decimal treats it as 0). Same
  // treatment every other amount field in the app gives its input, except the
  // replace is global: leaving a second comma in place would smuggle a value past
  // this handler that only Currency.isValid can then reject.
  const handleAmountChange = useCallback((text) => {
    setAmount(text.replace(/,/g, '.'));
    setError(null);
  }, []);

  // Kept apart so the error can say which of the two things is wrong: "1,234,56"
  // normalizes to an unparseable "1.234.56", which is not the same complaint as a
  // well-formed zero.
  const amountIsParseable = Currency.isValid(amount);
  const amountIsPositive = amountIsParseable && Currency.compare(amount, '0') > 0;

  const handleSave = useCallback(() => {
    // The host is already mid-save (e.g. the previous tap's ensurePlan()/save is
    // still in flight) — ignore this tap rather than fire a second concurrent
    // save. The button itself is also disabled while saving; this is a second
    // line of defense against a tap that lands before the disabled style commits.
    if (saving) return;
    Keyboard.dismiss();
    if (kind === 'expense' && categoryIds.length === 0) {
      setError(t('allocation_needs_target'));
      return;
    }
    if (kind === 'transfer' && toAccountId == null) {
      setError(t('destination_account_required'));
      return;
    }
    if (!amountIsParseable) {
      setError(t('valid_amount_required'));
      return;
    }
    if (!amountIsPositive) {
      setError(t('amount_must_be_greater_than_zero'));
      return;
    }
    if (kind === 'transfer' && accountId != null && accountId === toAccountId) {
      setError(t('accounts_must_be_different'));
      return;
    }
    onSaveLine({
      kind,
      amount: String(amount),
      label: label.trim() || null,
      comment: comment.trim() || null,
      categoryIds: kind === 'transfer' ? [] : categoryIds,
      toAccountId: kind === 'transfer' ? (toAccountId ?? null) : null,
      accountId: accountId ?? null,
      isRecurring,
      // An executable line is priced in its account's currency; a template-less
      // one-off line inherits the plan's (null).
      currency: effectiveCurrency,
      // An income line is never grouped — groups aggregate allocations, and the
      // group row is not offered for one (see the picker below).
      groupId: kind === 'income' ? null : groupId,
    });
  }, [saving, kind, amount, amountIsParseable, amountIsPositive, label, comment, categoryIds, toAccountId, accountId,
    isRecurring, effectiveCurrency, groupId, onSaveLine, t]);

  const handleDelete = useCallback(() => {
    if (!isEditingLine) return;
    showDialog(
      t('delete_allocation'),
      t('delete_allocation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => onDeleteLine(line.id),
        },
      ],
    );
  }, [isEditingLine, showDialog, t, onDeleteLine, line]);

  const handleRequestClose = useCallback(() => {
    if (activeSubPanel) {
      closeSubPanel();
    } else {
      onClose();
    }
  }, [activeSubPanel, closeSubPanel, onClose]);

  // Selected-target summary for the picker row on the main form. With several
  // categories the row names the first and counts the rest ("Groceries +2") —
  // spelling them all out would wrap the row for any realistic set.
  const targetSummary = useMemo(() => {
    if (kind !== 'transfer' && categoryIds.length > 0) {
      const names = categoryIds.map(id => categoriesById.get(id)?.name || t('allocation_unlinked'));
      const first = categoriesById.get(categoryIds[0]);
      return {
        icon: first?.icon || 'shape-outline',
        name: names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0],
      };
    }
    if (kind === 'transfer' && toAccountId != null) {
      const acc = accountsById.get(toAccountId);
      return { icon: 'bank-transfer', name: acc?.name || t('allocation_unlinked') };
    }
    return null;
  }, [kind, categoryIds, toAccountId, categoriesById, accountsById, t]);

  const executionAccount = accountId != null ? accountsById.get(accountId) : null;
  const selectedGroup = groupId != null ? groups.find(g => g.id === groupId) : null;

  const panelWidth = Dimensions.get('window').width;
  const subPanelTranslateX = subPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });
  const mainTranslateX = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const mainOpacity = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const renderTargetItem = useCallback(({ item }) => {
    const isCat = pickerKind === 'category';
    const selected = isCat ? categoryIds.includes(item.id) : toAccountId === item.id;
    return (
      <Pressable
        onPress={() => (isCat ? handleToggleCategory(item) : handleSelectTransferTarget(item))}
        style={({ pressed }) => [
          styles.pickerOption,
          { borderColor: colors.border },
          pressed && { backgroundColor: colors.selected },
          selected && { backgroundColor: colors.selected },
        ]}
        // A category toggles in and out of the set; an account replaces the
        // target outright, so they get different a11y roles.
        accessibilityRole={isCat ? 'checkbox' : 'button'}
        accessibilityState={isCat ? { checked: selected } : { selected }}
        accessibilityLabel={item.name}
        testID={`plan-target-option-${isCat ? 'cat' : 'acc'}-${item.id}`}
      >
        <Icon name={isCat ? (item.icon || 'shape-outline') : 'bank-transfer'} size={22} color={colors.text} />
        <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        {isCat && selected && (
          <Icon name="check" size={20} color={colors.primary} />
        )}
      </Pressable>
    );
  }, [pickerKind, categoryIds, toAccountId, colors, handleToggleCategory, handleSelectTransferTarget]);

  const renderExecutionAccountItem = useCallback(({ item }) => (
    <Pressable
      onPress={() => handleSelectExecutionAccount(item)}
      style={({ pressed }) => [
        styles.pickerOption,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.selected },
        accountId === item.id && { backgroundColor: colors.selected },
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      testID={`plan-account-option-${item.id}`}
    >
      <Icon name="wallet-outline" size={22} color={colors.text} />
      <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
        {item.name} · {item.currency}
      </Text>
    </Pressable>
  ), [accountId, colors, handleSelectExecutionAccount]);

  const title = isEditingLine ? t('edit_allocation') : t('add_allocation');

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleRequestClose}
        testID="plan-line-modal"
      >
        <AnimatedPressable
          style={[styles.modalOverlay, { paddingBottom: keyboardOffset }]}
          onPress={onClose}
        >
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Animated.View
              style={[styles.mainContent, { opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }]}
            >
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <ModalHeader title={title} />

                {/* What this line is: income declares expected income, expense
                    and transfer allocate it. */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {t('allocation_type')}
                  </Text>
                  <View style={styles.segment}>
                    {KINDS.map((option) => (
                      <Pressable
                        key={option}
                        style={[
                          styles.segmentButton,
                          { borderColor: colors.border },
                          kind === option && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => handleSelectKind(option)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: kind === option }}
                        accessibilityLabel={t(option)}
                        testID={`plan-line-kind-${option}`}
                      >
                        <Text style={[styles.segmentText, { color: kind === option ? colors.text : colors.mutedText }]}>
                          {t(option)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Tracking target */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {kind === 'income' ? `${t('income_target')} · ${t('optional')}` : t('tracking_target')}
                  </Text>
                  <Pressable
                    style={[styles.targetButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={openTargetPanel}
                    accessibilityRole="button"
                    accessibilityLabel={t('select_target')}
                    testID="plan-target-picker"
                  >
                    {targetSummary ? (
                      <View style={styles.targetValue}>
                        <Icon name={targetSummary.icon} size={20} color={colors.text} />
                        <Text style={[styles.text16, { color: colors.text }]} numberOfLines={1}>
                          {targetSummary.name}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.text16, { color: colors.mutedText }]}>
                        {t('select_target')}
                      </Text>
                    )}
                    <Icon name="chevron-right" size={20} color={colors.mutedText} />
                  </Pressable>
                </View>

                {/* Execution account — set one and the line becomes a one-tap
                    payable (the former planned operation). */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {t('template_account')} · {t('optional')}
                  </Text>
                  <Pressable
                    style={[styles.targetButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={openAccountPanel}
                    accessibilityRole="button"
                    accessibilityLabel={t('template_account')}
                    testID="plan-account-picker"
                  >
                    {executionAccount ? (
                      <View style={styles.targetValue}>
                        <Icon name="wallet-outline" size={20} color={colors.text} />
                        <Text style={[styles.text16, { color: colors.text }]} numberOfLines={1}>
                          {executionAccount.name} · {executionAccount.currency}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.text16, { color: colors.mutedText }]}>
                        {t('no_template_account')}
                      </Text>
                    )}
                    <Icon name="chevron-right" size={20} color={colors.mutedText} />
                  </Pressable>
                  <Text style={[styles.fieldHint, { color: colors.mutedText }]}>
                    {t('template_account_hint')}
                  </Text>
                </View>

                {/* Group — an envelope this line shares with others (migration
                    0022). Offered for allocations only: an income line declares
                    expected income and has no spending for a group to total. */}
                {kind !== 'income' && (
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                      {t('group')} · {t('optional')}
                    </Text>
                    <Pressable
                      style={[styles.targetButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                      onPress={openGroupPanel}
                      accessibilityRole="button"
                      accessibilityLabel={t('group')}
                      testID="plan-group-picker"
                    >
                      {selectedGroup ? (
                        <View style={styles.targetValue}>
                          <Icon name="folder-outline" size={20} color={colors.text} />
                          <Text style={[styles.text16, { color: colors.text }]} numberOfLines={1}>
                            {selectedGroup.label}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.text16, { color: colors.mutedText }]}>
                          {t('no_group')}
                        </Text>
                      )}
                      <Icon name="chevron-right" size={20} color={colors.mutedText} />
                    </Pressable>
                  </View>
                )}

                {/* Recurring toggle: a recurring line is a global template that
                    applies to every calendar month automatically, instead of
                    being scoped to this one month. */}
                <Pressable
                  style={[styles.recurringRow, { borderColor: colors.border }]}
                  onPress={() => setIsRecurring(v => !v)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isRecurring }}
                  accessibilityLabel={t('recurring_allocation')}
                  testID="plan-line-recurring-toggle"
                >
                  <View style={styles.recurringLabel}>
                    <Icon name="repeat" size={20} color={colors.text} />
                    <Text style={[styles.text16, { color: colors.text }]}>
                      {t('recurring_allocation')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.switchTrack,
                      { backgroundColor: isRecurring ? colors.primary : colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.switchThumb,
                        { transform: [{ translateX: isRecurring ? 18 : 2 }] },
                      ]}
                    />
                  </View>
                </Pressable>

                {/* Currency picker — shown for any line without an execution
                    account: with an account the amount is by definition in that
                    account's currency and there is nothing to pick. A one-off
                    line defaults to the plan's currency (and stores null, i.e.
                    "inherit", while it stays on it). */}
                {executionCurrency == null && currencyOptions.length > 0 && (
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                      {t('currency')}
                    </Text>
                    <View style={styles.currencyRow}>
                      {currencyOptions.map((code) => (
                        <Pressable
                          key={code}
                          style={[
                            styles.currencyChip,
                            { borderColor: colors.border },
                            lineCurrency === code && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                          onPress={() => setLineCurrency(code)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: lineCurrency === code }}
                          accessibilityLabel={code}
                          testID={`plan-line-currency-${code}`}
                        >
                          <Text style={[styles.currencyChipText, { color: colors.text }]}>{code}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Amount — a plain numeric field. A budget line is typed once
                    and rarely edited, so the on-screen calculator cost half the
                    modal's height (its bottom row sat under the button bar) and
                    bought nothing the number pad doesn't already give. */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {t('amount')}{displayCurrency ? ` · ${displayCurrency}` : ''}
                  </Text>
                  <FormInput
                    value={amount}
                    onChangeText={handleAmountChange}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    testID="plan-line-amount"
                  />
                </View>

                {/* Label + comment */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {t('allocation_label')} · {t('optional')}
                  </Text>
                  <FormInput
                    value={label}
                    onChangeText={setLabel}
                    placeholder={targetSummary?.name || t('allocation_label')}
                    testID="plan-line-label"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                    {t('allocation_comment')} · {t('optional')}
                  </Text>
                  <FormInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder={t('allocation_comment')}
                    multiline
                    numberOfLines={2}
                    testID="plan-line-comment"
                  />
                </View>

                {error && (
                  <Text style={[styles.error, { color: colors.danger }]} testID="plan-line-error">
                    {error}
                  </Text>
                )}

                {isEditingLine && (
                  <Pressable
                    style={[styles.deleteRow, { borderTopColor: colors.border }]}
                    onPress={handleDelete}
                    accessibilityRole="button"
                    accessibilityLabel={t('delete_allocation')}
                    testID="plan-line-delete"
                  >
                    <Icon name="delete-outline" size={20} color={colors.delete || colors.danger} />
                    <Text style={[styles.deleteText, { color: colors.delete || colors.danger }]}>
                      {t('delete_allocation')}
                    </Text>
                  </Pressable>
                )}
              </ScrollView>

              <View style={[styles.buttonRow, { backgroundColor: colors.card }]}>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.secondary }]}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel')}
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.primary }, saving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={t('save')}
                  accessibilityState={{ disabled: saving, busy: saving }}
                  testID="plan-line-save"
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>{t('save')}</Text>
                </Pressable>
              </View>
            </Animated.View>

            {/* Target picker subpanel (slides in over the form) */}
            {activeSubPanel === 'target' && (
              <Animated.View
                testID="plan-target-subpanel"
                style={[
                  styles.subPanel,
                  { backgroundColor: colors.card },
                  { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
                ]}
              >
                <View style={styles.subPanelHeader}>
                  <Pressable
                    onPress={closeSubPanel}
                    style={styles.subPanelBack}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('back')}
                    testID="plan-target-back"
                  >
                    <Icon name="arrow-left" size={24} color={colors.text} />
                  </Pressable>
                  <Text style={[styles.subPanelTitle, { color: colors.text }]}>{t('select_target')}</Text>
                  {/* Categories toggle in place instead of closing the panel,
                      so there has to be something that says "I'm finished
                      picking". The account tab needs none — one tap there is
                      the whole selection. */}
                  {pickerKind === 'category' && (
                    <Pressable
                      onPress={closeSubPanel}
                      style={styles.subPanelDone}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('done')}
                      testID="plan-target-done"
                    >
                      <Text style={[styles.subPanelDoneText, { color: colors.primary }]}>{t('done')}</Text>
                    </Pressable>
                  )}
                </View>

                {/* Two-mode toggle: category OR destination account. An income
                    line tracks no transfer target, so it skips the toggle. */}
                {kind !== 'income' && (
                  <View style={styles.segment}>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        { borderColor: colors.border },
                        pickerKind === 'category' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setPickerKind('category')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pickerKind === 'category' }}
                      accessibilityLabel={t('category_target')}
                      testID="plan-target-tab-category"
                    >
                      <Text style={[styles.segmentText, { color: pickerKind === 'category' ? colors.text : colors.mutedText }]}>
                        {t('category_target')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        { borderColor: colors.border },
                        pickerKind === 'account' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setPickerKind('account')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pickerKind === 'account' }}
                      accessibilityLabel={t('transfer_target')}
                      testID="plan-target-tab-account"
                    >
                      <Text style={[styles.segmentText, { color: pickerKind === 'account' ? colors.text : colors.mutedText }]}>
                        {t('transfer_target')}
                      </Text>
                    </Pressable>
                  </View>
                )}

                <FlatList
                  data={kind !== 'income' && pickerKind === 'account' ? accounts : targetCategories}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderTargetItem}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={(
                    <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                      {pickerKind === 'category' ? t('no_categories') : t('no_accounts')}
                    </Text>
                  )}
                />
              </Animated.View>
            )}

            {/* Group subpanel: pick an existing envelope, drop out of one, or
                create one without leaving the half-filled form. */}
            {activeSubPanel === 'group' && (
              <Animated.View
                testID="plan-group-subpanel"
                style={[
                  styles.subPanel,
                  { backgroundColor: colors.card },
                  { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
                ]}
              >
                <View style={styles.subPanelHeader}>
                  <Pressable
                    onPress={closeSubPanel}
                    style={styles.subPanelBack}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('back')}
                    testID="plan-group-back"
                  >
                    <Icon name="arrow-left" size={24} color={colors.text} />
                  </Pressable>
                  <Text style={[styles.subPanelTitle, { color: colors.text }]}>{t('group')}</Text>
                </View>

                {onCreateGroup && (
                  <View style={styles.newGroupRow}>
                    <View style={styles.newGroupInput}>
                      <FormInput
                        value={newGroupName}
                        onChangeText={setNewGroupName}
                        placeholder={t('new_group')}
                        testID="plan-group-new-name"
                      />
                    </View>
                    <Pressable
                      onPress={handleCreateGroup}
                      disabled={!newGroupName.trim()}
                      style={[
                        styles.newGroupButton,
                        { backgroundColor: colors.primary },
                        !newGroupName.trim() && styles.buttonDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t('create_group')}
                      accessibilityState={{ disabled: !newGroupName.trim() }}
                      testID="plan-group-create"
                    >
                      <Icon name="plus" size={20} color={colors.text} />
                    </Pressable>
                  </View>
                )}

                <Pressable
                  onPress={() => handleSelectGroup(null)}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    { borderColor: colors.border },
                    pressed && { backgroundColor: colors.selected },
                    groupId == null && { backgroundColor: colors.selected },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('no_group')}
                  testID="plan-group-option-none"
                >
                  <Icon name="close-circle-outline" size={22} color={colors.text} />
                  <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
                    {t('no_group')}
                  </Text>
                </Pressable>

                <FlatList
                  data={groups}
                  keyExtractor={(item) => String(item.id)}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleSelectGroup(item.id)}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                        groupId === item.id && { backgroundColor: colors.selected },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: groupId === item.id }}
                      accessibilityLabel={item.label}
                      testID={`plan-group-option-${item.id}`}
                    >
                      <Icon name="folder-outline" size={22} color={colors.text} />
                      <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )}
                  ListEmptyComponent={(
                    <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                      {t('no_groups_yet')}
                    </Text>
                  )}
                />
              </Animated.View>
            )}

            {/* Execution account subpanel */}
            {activeSubPanel === 'account' && (
              <Animated.View
                testID="plan-account-subpanel"
                style={[
                  styles.subPanel,
                  { backgroundColor: colors.card },
                  { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
                ]}
              >
                <View style={styles.subPanelHeader}>
                  <Pressable
                    onPress={closeSubPanel}
                    style={styles.subPanelBack}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('back')}
                    testID="plan-account-back"
                  >
                    <Icon name="arrow-left" size={24} color={colors.text} />
                  </Pressable>
                  <Text style={[styles.subPanelTitle, { color: colors.text }]}>{t('template_account')}</Text>
                </View>

                <Pressable
                  onPress={() => handleSelectExecutionAccount(null)}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    { borderColor: colors.border },
                    pressed && { backgroundColor: colors.selected },
                    accountId == null && { backgroundColor: colors.selected },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('no_template_account')}
                  testID="plan-account-option-none"
                >
                  <Icon name="close-circle-outline" size={22} color={colors.text} />
                  <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
                    {t('no_template_account')}
                  </Text>
                </Pressable>

                <FlatList
                  data={accounts}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderExecutionAccountItem}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={(
                    <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                      {t('no_accounts')}
                    </Text>
                  )}
                />
              </Animated.View>
            )}
          </Pressable>
        </AnimatedPressable>
      </Modal>
    </>
  );
}

BudgetPlanLineModal.propTypes = {
  visible: PropTypes.bool,
  line: PropTypes.shape({
    id: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
    comment: PropTypes.string,
    categoryId: PropTypes.string,
    categoryIds: PropTypes.arrayOf(PropTypes.string),
    toAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    accountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    kind: PropTypes.oneOf(KINDS),
    isRecurring: PropTypes.bool,
    currency: PropTypes.string,
    groupId: PropTypes.string,
  }),
  initialKind: PropTypes.oneOf(KINDS),
  currency: PropTypes.string,
  expenseCategories: PropTypes.array,
  incomeCategories: PropTypes.array,
  accounts: PropTypes.array,
  groups: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  })),
  saving: PropTypes.bool,
  onSaveLine: PropTypes.func,
  onDeleteLine: PropTypes.func,
  onCreateGroup: PropTypes.func,
  onClose: PropTypes.func,
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  currencyChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deleteRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    marginTop: 8,
  },
  field: {
    marginBottom: 16,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  mainContent: {
    flexShrink: 1,
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    elevation: 5,
    flexDirection: 'column',
    maxHeight: '85%',
    minHeight: '55%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  newGroupButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  newGroupInput: {
    flex: 1,
  },
  newGroupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  pickerOption: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  recurringLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  recurringRow: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    padding: 12,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subPanel: {
    // `absoluteFill`, NOT `absoluteFillObject`: RN 0.85 dropped the latter (see
    // Libraries/StyleSheet/StyleSheetExports.js — only `absoluteFill` is
    // exported). Spreading the removed property is a silent no-op, which left
    // this panel with no `position: absolute` at all: it was laid out in normal
    // flow under the still-mounted form, so the picker rendered in the modal's
    // bottom half below a screenful of blank card.
    ...StyleSheet.absoluteFill,
    padding: 20,
  },
  subPanelBack: {
    marginRight: 8,
    padding: 4,
  },
  subPanelDone: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
  },
  subPanelDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  subPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  switchTrack: {
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 36,
  },
  targetButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  targetValue: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  text16: {
    fontSize: 16,
  },
});
