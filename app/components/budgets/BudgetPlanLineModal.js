import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { DURATION_ENTER, DURATION_EXIT } from '../../utils/motion';
import { motionDuration } from '../../utils/reducedMotion';
import { useDialog } from '../../contexts/DialogContext';
import FormInput from '../FormInput';
import ModalShell from '../ModalShell';
import CategoryGridSelector from '../CategoryGridSelector';
import AccountGridSelector from '../AccountGridSelector';
import CurrencyChipRow from '../CurrencyChipRow';
import { SPACING, BORDER_RADIUS, FONT_SIZE, ICON_SIZE } from '../../styles/designTokens';
import * as Currency from '../../services/currency';
import EmptyState from '../EmptyState';
import { SECTION_LABEL } from '../../styles/componentStyles';

const KINDS = ['income', 'expense', 'transfer'];

// Accent tint, as a hex alpha suffix on `colors.primary` (a real hex in both
// themes — see ThemeColorsContext). A tinted accent reads as "selected" in light
// and dark alike, which a solid primary fill does not: white-on-#4da3ff sits at
// ~2.8:1 in the dark theme, and that is what every filled chip in here used to be.
const TINT = '1F';

// A picker gets a search field once its list stops fitting on one screenful.
// Below that, the field is one more thing to look past.
const SEARCH_THRESHOLD = 8;

// Track width − thumb − 2×inset. Kept as a constant because the thumb travels it
// on the native driver, where the value has to be known up front.
const SWITCH_TRAVEL = 20;

/**
 * One row of the sheet's grouped settings card: tinted leading glyph, the field
 * name above its current value, and a trailing affordance (a chevron by default,
 * or whatever `trailing` supplies).
 *
 * The field name lives INSIDE the row rather than as a caption above it: seven
 * stacked label+control pairs is what made the old editor a wall of text where
 * everything had equal weight and nothing had focus.
 */
function SheetRow({
  colors,
  icon,
  title,
  value,
  muted = false,
  onPress,
  testID,
  accessibilityLabel = null,
  accessibilityRole = 'button',
  accessibilityState = null,
  trailing = null,
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.selected }]}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityValue={{ text: value }}
      testID={testID}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + TINT }]}>
        <Icon name={icon} size={ICON_SIZE.sm} color={colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.mutedText }]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[styles.rowValue, { color: muted ? colors.mutedText : colors.text }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      {trailing || <Icon name="chevron-right" size={ICON_SIZE.md} color={colors.mutedText} />}
    </Pressable>
  );
}

SheetRow.propTypes = {
  colors: PropTypes.object.isRequired,
  icon: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  muted: PropTypes.bool,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
  accessibilityLabel: PropTypes.string,
  accessibilityRole: PropTypes.string,
  accessibilityState: PropTypes.object,
  trailing: PropTypes.node,
};

/**
 * Inset segmented control — a recessed track with the selected option raised out
 * of it, marked by the accent rather than filled with it.
 */
function Segments({ colors, options, value, onChange }) {
  return (
    <View style={[styles.segment, { backgroundColor: colors.background }]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={[
              styles.segmentButton,
              active && { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            testID={option.testID}
          >
            <Text
              style={[styles.segmentText, { color: active ? colors.primary : colors.mutedText }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

Segments.propTypes = {
  colors: PropTypes.object.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    testID: PropTypes.string,
  })).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

/** One tappable row inside a picker subpanel. */
function OptionRow({
  colors,
  icon,
  label,
  selected = false,
  onPress,
  testID,
  accessibilityRole = 'button',
  accessibilityState = null,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        selected && { backgroundColor: colors.primary + TINT },
        pressed && { backgroundColor: colors.selected },
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState || { selected }}
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={ICON_SIZE.md} color={selected ? colors.primary : colors.text} />
      <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {selected && <Icon name="check-circle" size={ICON_SIZE.sm} color={colors.primary} />}
    </Pressable>
  );
}

OptionRow.propTypes = {
  colors: PropTypes.object.isRequired,
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
  accessibilityRole: PropTypes.string,
  accessibilityState: PropTypes.object,
};

/** Back arrow + title (+ optional trailing action) for a picker subpanel. */
function PanelHeader({ colors, title, onBack, backLabel, backTestID, children = null }) {
  return (
    <View style={styles.panelHeader}>
      <Pressable
        onPress={onBack}
        style={styles.panelBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        testID={backTestID}
      >
        <Icon name="arrow-left" size={ICON_SIZE.base} color={colors.text} />
      </Pressable>
      <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {children}
    </View>
  );
}

PanelHeader.propTypes = {
  colors: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
  backLabel: PropTypes.string.isRequired,
  backTestID: PropTypes.string,
  children: PropTypes.node,
};

/**
 * BudgetPlanLineModal — editor for a single budget line: one month's target for
 * a set of categories, a set of spending accounts, or a transfer destination.
 * Built on ModalShell, the app's shared bottom sheet (drag-to-dismiss, keyboard
 * lift, cancel/save row), and following the repo's subpanel pattern (see
 * CLAUDE.md): the target, account and group pickers slide in over the sheet
 * through ModalShell's `overlayPanel` slot — never a nested Modal.
 *
 * The form is ordered by what decides what: kind first (it settles what the rest
 * of the sheet means), then the amount as the sheet's one hero figure, then the
 * links (target / group / scope) grouped into a single card of rows, and finally
 * the free-text label and comment.
 *
 * `kind` decides what the line means:
 *   - expense  → tracks spending across ONE OR MORE expense categories and/or
 *     ONE OR MORE source accounts (at least one of the two required); the pickers
 *     toggle them, and spending in a category's descendants always rolls up (a
 *     parent category IS its subtree — nothing to configure),
 *   - transfer → tracks incoming transfers into ONE destination account (required),
 *   - income   → declares part of the month's expected income; categories are
 *     optional context (income is compared against the month's real income as a
 *     whole, see BudgetPlansDB.calculateLineActual).
 * A line links to categories OR a transfer target, never both — enforced here and
 * again in BudgetPlansDB.
 *
 * The SOURCE-ACCOUNT filter (migration 0024) is a SECOND, INDEPENDENT dimension,
 * not a third kind of target: it says which accounts an expense must have been
 * paid from, and combines with the categories by AND. Categories only → those
 * categories from any account (every pre-0024 line); accounts only → everything
 * spent on those accounts; both → the intersection. It is offered for expense
 * lines only — a transfer line tracks incoming transfers and an income line has
 * no per-line spending, so neither has expenses for it to narrow.
 *
 * A recurring line is a global template that applies to every calendar month
 * automatically (like the old v1 per-category budgets); a one-off line belongs to
 * this month's plan only.
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
  // A subpanel covers the sheet edge to edge, including the strip ModalShell
  // reserves for the system navigation bar — so it pads that back in itself.
  const insets = useSafeAreaInsets();

  const isEditingLine = line != null;

  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [comment, setComment] = useState('');
  // A line tracks EITHER categories OR a destination account (the "exactly one
  // kind of target" invariant); an income line may have neither. Since migration
  // 0021 the category side is a SET — several categories can share one budget.
  const [categoryIds, setCategoryIds] = useState([]);
  // The source accounts whose expenses count (migration 0024). Empty = any
  // account, which is what every line was before this existed.
  const [sourceAccountIds, setSourceAccountIds] = useState([]);
  const [toAccountId, setToAccountId] = useState(null);
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

  // A one-off line stores currency: null to mean "inherit the plan's", which is
  // what it did before it had a picker — so only a chip that differs from the
  // plan's currency is written out. A recurring line has no plan to inherit
  // from and always carries its own.
  const oneOffCurrency = lineCurrency && lineCurrency !== currency ? lineCurrency : null;
  const effectiveCurrency = isRecurring ? lineCurrency : oneOffCurrency;
  // What the amount is actually denominated in. A one-off line on the plan's own
  // currency stores null, so the field is labelled with the plan's rather than
  // left bare. (May still be '' if the plan has no currency yet — no accounts
  // exist.)
  const displayCurrency = effectiveCurrency || currency;

  // Currency options: every currency in use across the user's accounts, the
  // plan's own currency (always offered, even if no account currently uses it),
  // and — when editing — the line's existing currency (it may no longer match any
  // account, e.g. the account was closed).
  const currencyOptions = useMemo(() => {
    const set = new Set(accounts.map(a => a.currency));
    set.add(currency);
    if (line?.currency) set.add(line.currency);
    return [...set];
  }, [accounts, currency, line]);
  // One option is not a choice: the single chip would be the plan's own currency,
  // permanently selected, saying nothing the amount's own label does not already.
  const showCurrencyChips = currencyOptions.length > 1;

  // Subpanel navigation for the pickers.
  const [activeSubPanel, setActiveSubPanel] = useState(null); // null | 'target' | 'sources' | 'group'
  // Which kind of target the target picker is currently showing.
  const [pickerKind, setPickerKind] = useState('category'); // 'category' | 'account'
  // Filter for the open picker's list. Scoped to the panel, so it resets on open.
  const [query, setQuery] = useState('');
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
      setSourceAccountIds(line.sourceAccountIds ?? []);
      setToAccountId(line.toAccountId ?? null);
      setIsRecurring(!!line.isRecurring);
      setLineCurrency(line.currency || currency);
      setGroupId(line.groupId ?? null);
    } else {
      setKind(initialKind);
      setAmount('');
      setLabel('');
      setComment('');
      setCategoryIds([]);
      setSourceAccountIds([]);
      setToAccountId(null);
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

  // The scope switch animates rather than snapping: it is the one control here
  // whose state is not spelled out by a value that changes next to it.
  const recurringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(recurringAnim, {
      toValue: isRecurring ? 1 : 0,
      duration: motionDuration(180),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isRecurring, recurringAnim]);

  // Guards the close animation's completion callback against a panel opened in
  // the meantime: closing runs for 180ms, and a tap on the OTHER picker inside
  // that window would otherwise be undone when the stale callback fires and
  // clears activeSubPanel.
  const subPanelTokenRef = useRef(0);

  const openSubPanel = useCallback((panel) => {
    Keyboard.dismiss();
    subPanelTokenRef.current++;
    setQuery('');
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
    Keyboard.dismiss();
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

  const openSourcesPanel = useCallback(() => openSubPanel('sources'), [openSubPanel]);
  const openGroupPanel = useCallback(() => openSubPanel('group'), [openSubPanel]);

  // Switching the picker's tab is switching lists, so the filter typed for one
  // must not carry over and hide the other.
  const handleSelectPickerKind = useCallback((next) => {
    setPickerKind(next);
    setQuery('');
  }, []);

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
    // Only an expense line has expenses of its own for the source filter to
    // narrow; carrying it over would leave a setting on the sheet that changes
    // nothing, and BudgetPlansDB rejects it outright.
    if (next !== 'expense') {
      setSourceAccountIds([]);
    }
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
  const handleToggleCategory = useCallback((categoryId) => {
    setToAccountId(null);
    setKind(prev => (prev === 'transfer' ? 'expense' : prev));
    setError(null);
    setCategoryIds(prev => (
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    ));
  }, []);

  const handleSelectTransferTargetId = useCallback((id) => {
    setToAccountId(id);
    setCategoryIds([]);
    // A transfer line tracks incoming transfers, not expenses — same reason
    // handleSelectKind clears it.
    setSourceAccountIds([]);
    setKind('transfer');
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  // Source accounts toggle and the panel stays open, exactly like the category
  // side: picking a SET is the point, and one tap per round trip would make a
  // two-card filter a four-tap affair.
  const handleToggleSourceAccount = useCallback((accountId) => {
    setError(null);
    setSourceAccountIds(prev => (
      prev.some(id => String(id) === String(accountId))
        ? prev.filter(id => String(id) !== String(accountId))
        : [...prev, accountId]
    ));
  }, []);

  // "Any account" — the default state, and the way back out of a filter without
  // hunting down each selected chip.
  const handleClearSourceAccounts = useCallback(() => {
    setSourceAccountIds([]);
    setError(null);
  }, []);

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
    // Either filter alone is a complete expense budget ("everything on this
    // card" needs no category), so the line only needs one of the two.
    if (kind === 'expense' && categoryIds.length === 0 && sourceAccountIds.length === 0) {
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
    onSaveLine({
      kind,
      amount: String(amount),
      label: label.trim() || null,
      comment: comment.trim() || null,
      categoryIds: kind === 'transfer' ? [] : categoryIds,
      // Expense lines only — see the component doc comment. Always sent (never
      // omitted) so clearing the filter on an existing line actually clears it:
      // an absent `sourceAccountIds` means "leave it alone" to BudgetPlansDB.
      sourceAccountIds: kind === 'expense' ? sourceAccountIds : [],
      toAccountId: kind === 'transfer' ? (toAccountId ?? null) : null,
      isRecurring,
      // A one-off line on the plan's own currency inherits it (null).
      currency: effectiveCurrency,
      // An income line is never grouped — groups aggregate allocations, and the
      // group row is not offered for one (see the picker below).
      groupId: kind === 'income' ? null : groupId,
    });
  }, [saving, kind, amount, amountIsParseable, amountIsPositive, label, comment, categoryIds,
    sourceAccountIds, toAccountId,
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

  // Android back closes the open picker first; only a sheet with none left to
  // close is dismissed (ModalShell plays its own exit for that).
  const handleBackIntercept = useCallback(() => {
    if (!activeSubPanel) return false;
    closeSubPanel();
    return true;
  }, [activeSubPanel, closeSubPanel]);

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

  // Same "first name, count the rest" shorthand the target row uses, for the
  // same reason: three account names do not fit on one row at any font size.
  const sourceAccountsSummary = useMemo(() => {
    if (sourceAccountIds.length === 0) return null;
    const names = sourceAccountIds.map(
      id => accountsById.get(id)?.name || t('allocation_unlinked'),
    );
    return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
  }, [sourceAccountIds, accountsById, t]);

  const selectedGroup = groupId != null ? groups.find(g => g.id === groupId) : null;

  const panelWidth = Dimensions.get('window').width;
  const subPanelTranslateX = subPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });
  const mainTranslateX = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const mainOpacity = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const switchTranslateX = recurringAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SWITCH_TRAVEL] });

  // Which of the two lists the target picker is showing. An income line tracks no
  // transfer target, so for one of those it is always the categories.
  const showingCategories = kind === 'income' || pickerKind === 'category';
  // Whether the panel earns a search field. Categories are counted whole (the grid
  // searches the entire tree, not the folder level it happens to be showing).
  const targetOptionCount = showingCategories ? targetCategories.length : accounts.length;

  const title = isEditingLine ? t('edit_allocation') : t('add_allocation');
  const panelStyle = [
    styles.panel,
    { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.md },
    { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
  ];

  const subPanel = activeSubPanel ? (
    <Animated.View testID={`plan-${activeSubPanel}-subpanel`} style={panelStyle}>
      {activeSubPanel === 'target' && (
        <>
          <PanelHeader
            colors={colors}
            title={t('select_target')}
            onBack={closeSubPanel}
            backLabel={t('back')}
            backTestID="plan-target-back"
          >
            {/* Categories toggle in place instead of closing the panel, so there
                has to be something that says "I'm finished picking". The account
                tab needs none — one tap there is the whole selection. */}
            {showingCategories && (
              <Pressable
                onPress={closeSubPanel}
                style={styles.panelDone}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('done')}
                testID="plan-target-done"
              >
                <Text style={[styles.panelDoneText, { color: colors.primary }]}>{t('done')}</Text>
              </Pressable>
            )}
          </PanelHeader>

          {/* Two-mode toggle: category OR destination account. An income line
              tracks no transfer target, so it skips the toggle. */}
          {kind !== 'income' && (
            <Segments
              colors={colors}
              value={pickerKind}
              onChange={handleSelectPickerKind}
              options={[
                { key: 'category', label: t('category_target'), testID: 'plan-target-tab-category' },
                { key: 'account', label: t('transfer_target'), testID: 'plan-target-tab-account' },
              ]}
            />
          )}

          {targetOptionCount >= SEARCH_THRESHOLD && (
            <FormInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search')}
              leftIcon="magnify"
              testID="plan-target-search"
            />
          )}

          {/* Categories are a tree, so they get the app's shared category grid
              rather than a list that pretends they are all siblings. A folder is
              a legitimate target here — spending in a parent's whole subtree rolls
              up into it — which is what `selectableFolders` offers inside it. */}
          {showingCategories ? (
            <ScrollView
              style={styles.panelListBody}
              contentContainerStyle={styles.panelList}
              keyboardShouldPersistTaps="handled"
            >
              <CategoryGridSelector
                categories={targetCategories}
                categoryType={kind === 'income' ? 'income' : 'expense'}
                selectedCategoryIds={categoryIds}
                onSelect={handleToggleCategory}
                colors={colors}
                t={t}
                selectableFolders
                query={query}
                onQueryChange={setQuery}
                testIDPrefix="plan-target-option-cat"
              />
            </ScrollView>
          ) : (
            /* Accounts group by currency in the shared account grid — a transfer
               target is almost always chosen within one currency. */
            <ScrollView
              style={styles.panelListBody}
              contentContainerStyle={styles.panelList}
              keyboardShouldPersistTaps="handled"
            >
              <AccountGridSelector
                accounts={accounts}
                selectedAccountId={toAccountId}
                onSelect={handleSelectTransferTargetId}
                colors={colors}
                t={t}
                query={query}
                testIDPrefix="plan-target-option-acc"
              />
            </ScrollView>
          )}
        </>
      )}

      {/* Which accounts the spending has to come from (migration 0024). A
          multi-select grid, not a single pick: "the two cards I actually pay
          with" is the common shape of this filter. */}
      {activeSubPanel === 'sources' && (
        <>
          <PanelHeader
            colors={colors}
            title={t('spending_accounts')}
            onBack={closeSubPanel}
            backLabel={t('back')}
            backTestID="plan-sources-back"
          >
            {/* Chips toggle in place rather than closing the panel, so — as on
                the category tab — something has to say "I'm finished picking". */}
            <Pressable
              onPress={closeSubPanel}
              style={styles.panelDone}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('done')}
              testID="plan-sources-done"
            >
              <Text style={[styles.panelDoneText, { color: colors.primary }]}>{t('done')}</Text>
            </Pressable>
          </PanelHeader>

          {accounts.length >= SEARCH_THRESHOLD && (
            <FormInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search')}
              leftIcon="magnify"
              testID="plan-sources-search"
            />
          )}

          {/* The no-filter state, spelled out rather than implied by "nothing is
              selected" — and the one tap back to it from a filter of five. */}
          <OptionRow
            colors={colors}
            icon="check-all"
            label={t('all_accounts')}
            selected={sourceAccountIds.length === 0}
            onPress={handleClearSourceAccounts}
            testID="plan-sources-option-all"
          />

          <ScrollView
            style={styles.panelListBody}
            contentContainerStyle={styles.panelList}
            keyboardShouldPersistTaps="handled"
          >
            <AccountGridSelector
              accounts={accounts}
              selectedAccountIds={sourceAccountIds}
              onSelect={handleToggleSourceAccount}
              colors={colors}
              t={t}
              query={query}
              testIDPrefix="plan-sources-option"
            />
          </ScrollView>
        </>
      )}

      {/* Pick an existing envelope, drop out of one, or create one without
          leaving the half-filled form. */}
      {activeSubPanel === 'group' && (
        <>
          <PanelHeader
            colors={colors}
            title={t('group')}
            onBack={closeSubPanel}
            backLabel={t('back')}
            backTestID="plan-group-back"
          />

          {onCreateGroup && (
            <View style={styles.newGroupRow}>
              <View style={styles.newGroupInput}>
                <FormInput
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder={t('new_group')}
                  leftIcon="folder-plus-outline"
                  testID="plan-group-new-name"
                />
              </View>
              <Pressable
                onPress={handleCreateGroup}
                disabled={!newGroupName.trim()}
                style={[
                  styles.newGroupButton,
                  { backgroundColor: colors.primary },
                  !newGroupName.trim() && styles.disabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('create_group')}
                accessibilityState={{ disabled: !newGroupName.trim() }}
                testID="plan-group-create"
              >
                <Icon name="plus" size={ICON_SIZE.md} color="#fff" />
              </Pressable>
            </View>
          )}

          <OptionRow
            colors={colors}
            icon="close-circle-outline"
            label={t('no_group')}
            selected={groupId == null}
            onPress={() => handleSelectGroup(null)}
            testID="plan-group-option-none"
          />

          <FlatList
            data={groups}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            style={styles.panelListBody}
            contentContainerStyle={styles.panelList}
            renderItem={({ item }) => (
              <OptionRow
                colors={colors}
                icon="folder-outline"
                label={item.label}
                selected={groupId === item.id}
                onPress={() => handleSelectGroup(item.id)}
                testID={`plan-group-option-${item.id}`}
              />
            )}
            ListEmptyComponent={(
              <EmptyState message={t('no_groups_yet')} fill={false} />
            )}
          />
        </>
      )}
    </Animated.View>
  ) : null;

  return (
    <ModalShell
      visible={visible}
      onDismiss={onClose}
      onCancel={onClose}
      onSave={handleSave}
      saveDisabled={saving}
      saveTestID="plan-line-save"
      onDelete={isEditingLine ? handleDelete : null}
      deleteLabel={t('delete_allocation')}
      deleteTestID="plan-line-delete"
      title={title}
      showBlurOverlay
      overlayPanel={subPanel}
      onBackIntercept={handleBackIntercept}
    >
      <Animated.View
        testID="plan-line-modal"
        style={[styles.form, { opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }]}
      >
        {/* What this line is: income declares expected income, expense and
            transfer allocate it. First, because it decides what everything
            below it means. */}
        <Segments
          colors={colors}
          value={kind}
          onChange={handleSelectKind}
          options={KINDS.map(option => ({
            key: option,
            label: t(option),
            testID: `plan-line-kind-${option}`,
          }))}
        />

        {/* The sheet's one hero figure. A budget line is a number with things
            attached to it, and the old editor rendered that number in the same
            48dp box as its optional comment. */}
        <View style={[styles.amountCard, { backgroundColor: colors.background }]}>
          <Text style={[styles.amountLabel, { color: colors.mutedText }]}>
            {t('amount')}{displayCurrency ? ` · ${displayCurrency}` : ''}
          </Text>
          <TextInput
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0"
            placeholderTextColor={colors.mutedText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.amountInput, { color: colors.text }]}
            accessibilityLabel={t('amount')}
            testID="plan-line-amount"
          />

          {/* Currency picker — offered for any line without an execution
              account: with an account the amount is by definition in that
              account's currency and there is nothing to pick. A one-off line
              defaults to the plan's currency (and stores null, i.e. "inherit",
              while it stays on it). */}
          {showCurrencyChips && (
            <CurrencyChipRow
              codes={currencyOptions}
              selectedCode={lineCurrency}
              onSelect={setLineCurrency}
              colors={colors}
              testIDPrefix="plan-line-currency"
              style={styles.currencyRow}
            />
          )}
        </View>

        {/* Everything the line is linked to, in one card of rows: what it
            tracks, what executes it, which envelope it belongs to, and how long
            it lives. */}
        <View style={[styles.group, { backgroundColor: colors.background }]}>
          <SheetRow
            colors={colors}
            icon={targetSummary?.icon || (kind === 'transfer' ? 'bank-transfer' : 'target')}
            title={kind === 'income' ? `${t('income_target')} · ${t('optional')}` : t('tracking_target')}
            value={targetSummary?.name || t('select_target')}
            muted={!targetSummary}
            onPress={openTargetPanel}
            accessibilityLabel={t('select_target')}
            testID="plan-target-picker"
          />

          {/* Which accounts the spending must come from (migration 0024).
              Expense lines only: a transfer line tracks incoming transfers and
              an income line has no per-line spending, so there is nothing for
              this to narrow on either. Sits directly under the target row —
              the two together are the one sentence "what counts toward this
              budget", and reading them apart is what makes an AND filter
              confusing. */}
          {kind === 'expense' && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SheetRow
                colors={colors}
                icon="credit-card-outline"
                title={`${t('spending_accounts')} · ${t('optional')}`}
                value={sourceAccountsSummary || t('all_accounts')}
                muted={!sourceAccountsSummary}
                onPress={openSourcesPanel}
                accessibilityLabel={t('spending_accounts')}
                testID="plan-sources-picker"
              />
            </>
          )}

          {/* Group — an envelope this line shares with others (migration 0022).
              Offered for allocations only: an income line declares expected
              income and has no spending for a group to total. */}
          {kind !== 'income' && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SheetRow
                colors={colors}
                icon="folder-outline"
                title={`${t('group')} · ${t('optional')}`}
                value={selectedGroup ? selectedGroup.label : t('no_group')}
                muted={!selectedGroup}
                onPress={openGroupPanel}
                accessibilityLabel={t('group')}
                testID="plan-group-picker"
              />
            </>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Scope: a recurring line is a global template that applies to every
              calendar month automatically, instead of being scoped to this one. */}
          <SheetRow
            colors={colors}
            icon="repeat"
            title={t('recurring_allocation')}
            value={isRecurring ? t('recurring') : t('one_time')}
            onPress={() => setIsRecurring(v => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: isRecurring }}
            accessibilityLabel={t('recurring_allocation')}
            testID="plan-line-recurring-toggle"
            trailing={(
              <View style={[styles.switchTrack, { backgroundColor: colors.border }]}>
                <Animated.View
                  style={[
                    styles.switchTrackFill,
                    { backgroundColor: colors.primary, opacity: recurringAnim },
                  ]}
                />
                <Animated.View
                  style={[styles.switchThumb, { transform: [{ translateX: switchTranslateX }] }]}
                />
              </View>
            )}
          />
        </View>

        {/* The one thing the rows above cannot say on their own: that the two
            filters INTERSECT. Shown only once a filter is actually set — before
            that there is no ambiguity to resolve. */}
        {sourceAccountsSummary && (
          <Text style={[styles.groupHint, { color: colors.mutedText }]} testID="plan-sources-hint">
            {categoryIds.length > 0 ? t('spending_accounts_hint_with_categories') : t('spending_accounts_hint')}
          </Text>
        )}

        <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
          {t('allocation_label')} · {t('optional')}
        </Text>
        <FormInput
          value={label}
          onChangeText={setLabel}
          placeholder={targetSummary?.name || t('allocation_label')}
          testID="plan-line-label"
        />

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

        {error && (
          <View style={[styles.errorBanner, { backgroundColor: colors.delete + TINT }]}>
            <Icon name="alert-circle-outline" size={ICON_SIZE.sm} color={colors.delete} />
            <Text style={[styles.errorText, { color: colors.delete }]} testID="plan-line-error">
              {error}
            </Text>
          </View>
        )}
      </Animated.View>
    </ModalShell>
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
    sourceAccountIds: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    toAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
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
  amountCard: {
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    padding: 0,
  },
  amountLabel: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.xs,
  },
  // Placement only — the chips themselves are CurrencyChipRow's.
  currencyRow: {
    marginTop: SPACING.md,
  },
  disabled: {
    opacity: 0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // Starts where the row's text does, so the tinted glyphs read as one column
    // instead of four boxed-off rows.
    marginLeft: 34 + SPACING.md + SPACING.md,
  },
  errorBanner: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    padding: SPACING.md,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  fieldLabel: {
    ...SECTION_LABEL,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  form: {
    paddingBottom: SPACING.xs,
  },
  group: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  groupHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  newGroupButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    height: 48,
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    width: 48,
  },
  newGroupInput: {
    flex: 1,
  },
  newGroupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  optionText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  panel: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  panelBack: {
    marginRight: SPACING.xs,
    padding: SPACING.xs,
  },
  panelDone: {
    marginLeft: 'auto',
    paddingHorizontal: SPACING.xs,
  },
  panelDoneText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  panelList: {
    paddingBottom: SPACING.lg,
  },
  // Bounds the list to what is left of the panel. Without it the FlatList sizes
  // to its content inside a fixed-height column and the overflow is simply
  // clipped — a category list past the fold that cannot be scrolled to.
  panelListBody: {
    flex: 1,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  rowBody: {
    flex: 1,
  },
  rowIcon: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowTitle: {
    fontSize: FONT_SIZE.sm,
  },
  rowValue: {
    fontSize: FONT_SIZE.base,
    fontWeight: '500',
    marginTop: 1,
  },
  segment: {
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
    padding: SPACING.xs,
  },
  segmentButton: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  segmentText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.pill,
    height: 22,
    margin: 2,
    width: 22,
  },
  switchTrack: {
    borderRadius: BORDER_RADIUS.pill,
    height: 26,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  switchTrackFill: {
    ...StyleSheet.absoluteFill,
  },
});
