import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Keyboard,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Switch } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import LabelInput from '../components/operations/LabelInput';
import OperationLocationRow from '../components/operations/OperationLocationRow';
import OperationFormFields from '../components/operations/OperationFormFields';
import SplitOperationModal from '../components/operations/SplitOperationModal';
import { getDistinctLabels, getLabelsNearLocation } from '../services/OperationsDB';
import useOperationLocation from '../hooks/useOperationLocation';
import * as Currency from '../services/currency';
import { formatDate } from '../services/BalanceHistoryDB';
import FormInput from '../components/FormInput';
import { SPACING, BORDER_RADIUS, FONT_SIZE, ICON_SIZE } from '../styles/designTokens';
import { DURATION_ENTER, DURATION_EXIT } from '../utils/motion';
import { motionDuration } from '../utils/reducedMotion';
import currencies from '../../assets/currencies.json';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useOperationForm from '../hooks/useOperationForm';
import ModalShell from '../components/ModalShell';
import CategoryGridSelector from '../components/CategoryGridSelector';
import AccountGridSelector from '../components/AccountGridSelector';
import { modalSharedStyles } from '../styles/modalStyles';
import useOperationPicker from '../hooks/useOperationPicker';

// Options a picker needs before a search field earns its row. Matches the
// budget line editor's threshold, so the two panels behave the same way.
const SEARCH_THRESHOLD = 8;

/**
 * OperationModal Component
 *
 * Modal for adding/editing financial operations (expenses, income, transfers).
 * Uses the shared OperationFormFields component for common form fields
 * (amount, accounts, category) with showTypeSelector={false} and showFieldIcons={false}
 * to match the modal's simpler UI pattern.
 *
 * Additional modal-specific fields:
 * - Type picker (opens modal picker)
 * - Date picker
 * - Description field with autocomplete suggestions (shown for both new and existing operations)
 * - Multi-currency fields (for cross-currency transfers)
 */

/**
 * Get currency symbol from currency code
 * @param {string} currencyCode - Currency code like 'USD', 'EUR', etc.
 * @returns {string} Currency symbol or code if not found
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * Merge proximity-derived labels (higher priority, first) with the base
 * suggestions, de-duplicating case-insensitively and keeping the first
 * (higher-priority) occurrence. A label that is both a nearby hit and a base hit
 * therefore appears once, promoted to its nearby position; base-only labels are
 * never dropped, only demoted. When `nearby` is empty the result equals `base`
 * exactly, so behaviour with the location feature off is unchanged
 * (issue #1091, R1.3 / R2.2). Ordering is the only thing controlled here —
 * LabelInput still filters/caps the merged list.
 * @param {string[]} nearby
 * @param {string[]} base
 * @returns {string[]}
 */
const mergeSuggestions = (nearby, base) => {
  const seen = new Set();
  const result = [];
  for (const label of [...(nearby || []), ...(base || [])]) {
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
};

/**
 * Build the latitude/longitude overrides to persist on save, or null when none
 * should be written. Single source of truth shared by both save paths (full save
 * and the quick category-add) so the non-destructive R1.5 rule is applied
 * consistently: persist coordinates when the feature is on, OR when the operation
 * already carries coordinates (preserve them even with the toggle off). `??` (not
 * `||`) keeps a valid 0.0 coordinate.
 * @param {boolean} attachLocation
 * @param {{latitude: *, longitude: *}|null} location
 * @returns {{latitude: *, longitude: *}|null}
 */
const buildLocationOverrides = (attachLocation, location) => {
  if (attachLocation || (location && location.latitude != null)) {
    return { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null };
  }
  return null;
};

export default function OperationModal({
  visible = false, onClose = () => {}, operation = null, isNew = false, onDelete = null,
  openCategoryPicker = false,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  // A subpanel covers the sheet edge to edge, including the strip ModalShell
  // reserves for the system navigation bar — so it pads that back in itself.
  const insets = useSafeAreaInsets();
  const { addOperation, splitOperation, updateOperation, validateOperation } = useOperationsActions();
  // Pickers offer the visible accounts; the operation's own accounts are looked
  // up among all of them. An archived account is still on its operations, and
  // not finding it made a cross-currency transfer look like a same-currency one:
  // the form cleared its rate, and saving any edit failed in the DB.
  const { accounts: allAccountsFromContext, visibleAccounts: accounts } = useAccountsData();
  const allAccounts = allAccountsFromContext || accounts;
  const { categories } = useCategories();
  // Read defensively: this context has no default value, so a missing provider
  // (e.g. in unit tests) yields undefined rather than throwing on destructure.
  const displaySettings = useDisplaySettings();
  const attachLocation = !!(displaySettings && displaySettings.attachLocation);

  // Existing coordinates when editing an operation (null for a new one).
  const initialLocation = (!isNew && operation && operation.latitude != null && operation.longitude != null)
    ? { latitude: operation.latitude, longitude: operation.longitude }
    : null;

  // Geolocation capture lifecycle (kept out of useOperationForm). Only captures
  // for a new operation when the feature is enabled; never blocks saving.
  const {
    location,
    status: locationStatus,
    capture: captureLocation,
    clearLocation,
  } = useOperationLocation({ enabled: attachLocation, isNew, visible, initialLocation });

  // Operation form hook (includes multi-currency logic)
  const {
    values,
    setValues,
    errors,
    showDatePicker,
    setShowDatePicker,
    lastEditedField,
    setLastEditedField,
    isShadowOperation,
    canDeleteShadowOperation,
    filteredCategories,
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    isForeignCurrencyOp,
    rateSource,
    setRateSource,
    isSaving,
    handleSave,
    handleClose,
    handleDelete,
    handleSplit,
    getAccountName,
    getAccountBalance,
    getCategoryName,
    formatDateForDisplay,
  } = useOperationForm({
    visible,
    operation,
    isNew,
    accounts: allAccounts,
    categories,
    t,
    addOperation,
    splitOperation,
    updateOperation,
    validateOperation,
    showDialog,
    onClose,
    onDelete,
  });

  // Which picker is open (the category tree is walked by CategoryGridSelector).
  const {
    pickerState,
    openPicker,
    closePicker,
  } = useOperationPicker();

  // The picker is a SUBPANEL over this sheet, not a modal of its own (see
  // CLAUDE.md, "Modal Sub-Navigation"). A second bottom sheet stacked on the
  // first landed its rounded top edge in the middle of the form, cut the fields
  // under it in half and put a second "close" next to the sheet's own Cancel —
  // three surfaces reading as one broken one. It now slides in from the right
  // over the whole card, header and action row included.
  //
  // `panel` is a local mirror of the open picker rather than a read of
  // `pickerState`: the hook clears type and data the instant it closes, and the
  // panel still has an exit animation to play with something in it.
  const [panel, setPanel] = useState(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const mainAnim = useRef(new Animated.Value(0)).current;
  const panelAnim = useRef(new Animated.Value(0)).current;
  // Guards the close animation's completion against a picker reopened inside its
  // 180ms window — the stale callback would otherwise unmount the new panel.
  const panelTokenRef = useRef(0);
  // Whether a panel is currently up, readable synchronously inside the effect so
  // a closed picker does not start an exit animation it has nothing to play on —
  // these modals stay mounted for the whole session.
  const panelOpenRef = useRef(false);

  useEffect(() => {
    if (pickerState.visible) {
      panelOpenRef.current = true;
      panelTokenRef.current++;
      Keyboard.dismiss();
      setPickerQuery('');
      setPanel({ type: pickerState.type, data: pickerState.data });
      Animated.parallel([
        Animated.timing(mainAnim, {
          toValue: 1, duration: motionDuration(DURATION_EXIT), easing: Easing.in(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(panelAnim, {
          toValue: 1, duration: motionDuration(DURATION_ENTER), easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    if (!panelOpenRef.current) return;
    panelOpenRef.current = false;
    const token = ++panelTokenRef.current;
    Animated.parallel([
      Animated.timing(panelAnim, {
        toValue: 0, duration: motionDuration(180), easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(mainAnim, {
        toValue: 0, duration: motionDuration(240), easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start(() => {
      if (panelTokenRef.current === token) setPanel(null);
    });
  }, [pickerState.visible, pickerState.type, pickerState.data, mainAnim, panelAnim]);

  // Closing the sheet with a picker open must not leave the panel mid-animation
  // for the next open — reset both to "no panel" outright.
  //
  // `closePicker()` is the load-bearing line: ModalShell's backdrop dismisses the
  // sheet directly, without consulting `onBackIntercept`, so a tap there would
  // otherwise leave the hook parked on {visible: true, type, data}. The mirror
  // effect keys off exactly those three values, so the next openPicker with the
  // same type and the same (stable) array would compare equal, never run, and
  // the picker would simply stop opening for the rest of the session — these
  // modals never unmount.
  useEffect(() => {
    if (visible) return;
    panelOpenRef.current = false;
    setPanel(null);
    mainAnim.setValue(0);
    panelAnim.setValue(0);
    closePicker();
  }, [visible, mainAnim, panelAnim, closePicker]);

  // Android back closes the picker first; only a sheet with none open is
  // dismissed (ModalShell plays its own exit for that). Keyed on the hook rather
  // than on `panel`, which outlives it by the length of the exit animation — a
  // back press in that window belongs to the sheet, not to a panel already gone.
  const handleBackIntercept = useCallback(() => {
    if (!pickerState.visible) return false;
    closePicker();
    return true;
  }, [pickerState.visible, closePicker]);

  // A host can ask for the form to come up on its category picker — the "Change
  // category" button on the auto-added receipt does, because correcting the
  // guessed category is the whole reason that press happened.
  //
  // It waits for the form to have loaded this operation: `filteredCategories` is
  // keyed on `values.type`, and the picker is opened with a snapshot of the list,
  // so opening it during the render that merely *scheduled* the load would hand
  // it the previous operation's categories. Comparing the loaded type against the
  // operation's own is what says the load has landed.
  const autoOpenedCategoryRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      autoOpenedCategoryRef.current = false;
      return;
    }
    if (!openCategoryPicker || autoOpenedCategoryRef.current) return;
    if (isNew || !operation || isShadowOperation) return;
    // A transfer has no category — its counterpart is an account — so there is
    // nothing to open.
    if (values.type === 'transfer') return;
    if (values.type !== (operation.type || 'expense')) return;
    autoOpenedCategoryRef.current = true;
    openPicker('category', filteredCategories);
  }, [
    visible, openCategoryPicker, isNew, operation, isShadowOperation,
    values.type, filteredCategories, openPicker,
  ]);

  // State for split modal
  const [showSplitModal, setShowSplitModal] = useState(false);

  // Scroll ref for auto-scrolling to description field on keyboard focus
  const scrollViewRef = useRef(null);

  // Autocomplete suggestions for the label editor, split into two independent
  // sources so the location-independent base query isn't re-run when a fix
  // arrives: `baseSuggestions` (distinct labels, category-first) and
  // `nearbySuggestions` (proximity recall). They are merged below.
  const [baseSuggestions, setBaseSuggestions] = useState([]);
  const [nearbySuggestions, setNearbySuggestions] = useState([]);

  // Ref to the label editor so Save can flush a half-typed label synchronously
  // (avoids losing a label the user typed but did not commit before tapping Save).
  const labelInputRef = useRef(null);
  const handleSaveWithLabels = useCallback(() => {
    const flushed = labelInputRef.current?.flush();
    const overrides = {};
    if (flushed != null) overrides.description = flushed || null;
    const locOverrides = buildLocationOverrides(attachLocation, location);
    if (locOverrides) Object.assign(overrides, locOverrides);
    return handleSave(Object.keys(overrides).length > 0 ? overrides : undefined);
  }, [handleSave, attachLocation, location]);

  // Base suggestions — location-independent, so keyed only on visibility/category.
  // On a transient DB error we keep the previous list (no setState in catch) rather
  // than clearing the strip.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    getDistinctLabels(50, values.categoryId || null)
      .then(results => { if (!cancelled) setBaseSuggestions(results); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, values.categoryId]);

  // Nearby (proximity recall) — only queried when the feature is on AND a fix is
  // available; otherwise empty, so the merged result equals today's base-only
  // behaviour byte-for-byte (R1.3, R2.4). Keyed on `location` so it re-runs when a
  // fix becomes ready, without re-running the base query.
  useEffect(() => {
    if (!visible) return undefined;
    const lat = attachLocation && location ? location.latitude : null;
    const lng = attachLocation && location ? location.longitude : null;
    if (lat == null || lng == null) {
      setNearbySuggestions([]);
      return undefined;
    }
    let cancelled = false;
    getLabelsNearLocation(lat, lng)
      .then(results => { if (!cancelled) setNearbySuggestions(results); })
      .catch(() => { if (!cancelled) setNearbySuggestions([]); });
    return () => { cancelled = true; };
  }, [visible, attachLocation, location]);

  // Proximity-first merge (case-insensitive dedupe). When nearby is empty this
  // equals base exactly.
  const labelSuggestions = useMemo(
    () => mergeSuggestions(nearbySuggestions, baseSuggestions),
    [nearbySuggestions, baseSuggestions],
  );

  // Determine if split button should be shown
  // Only for editing expense/income (not transfers, not shadow operations, not new).
  // Foreign-currency ops are excluded: the form model holds swapped amount/rate
  // fields (foreign amount in `amount`), and handleSplit persists form values
  // verbatim — splitting one would write the foreign nominal as the account
  // amount, corrupting the row and the account balance.
  // The amount the split works from: a pending calculator entry is resolved the
  // way handleSplit resolves it, so the button and the split sheet's own check
  // agree with what will be written ("100+" has no value to split).
  const splitBaseAmount = useMemo(() => (
    hasOperation(values.amount)
      ? evaluateExpression(values.amount, Currency.getDecimalPlaces(sourceAccount?.currency))
      : values.amount
  ), [values.amount, sourceAccount]);
  const canSplit = !isNew && !isShadowOperation && values.type !== 'transfer'
    && !isForeignCurrencyOp && Currency.isPositiveAmount(splitBaseAmount);

  // Handle split confirmation
  const handleSplitConfirm = useCallback(async (splitAmount, categoryId) => {
    const result = await handleSplit(splitAmount, categoryId);
    if (result.success) {
      // Keep modal open with updated amount - user can split again
      setShowSplitModal(false);
    } else {
      // Show error (dialog is handled inside handleSplit if needed)
      console.error('[OperationModal] Split failed:', result.error);
    }
  }, [handleSplit]);

  // Memoize calculator amount change handler for performance
  const handleAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, amount: text }));
      setLastEditedField('amount');
    }
  }, [isShadowOperation, setValues, setLastEditedField]);

  // Handler for exchange rate changes. Decimal commas from locale decimal-pad
  // keyboards are normalized to dots — Decimal parsing coerces comma strings to 0.
  const handleExchangeRateChange = useCallback((text) => {
    if (!isShadowOperation) {
      const normalized = text.replace(',', '.');
      setValues(v => ({ ...v, exchangeRate: normalized }));
      setLastEditedField('exchangeRate');
      setRateSource('manual');
    }
  }, [isShadowOperation, setValues, setLastEditedField, setRateSource]);

  // Handler for destination amount changes
  const handleDestinationAmountChange = useCallback((text) => {
    if (!isShadowOperation) {
      const normalized = text.replace(',', '.');
      setValues(v => ({ ...v, destinationAmount: normalized }));
      setLastEditedField('destinationAmount');
      setRateSource('manual');
    }
  }, [isShadowOperation, setValues, setLastEditedField, setRateSource]);

  // Handler for operation currency changes (foreign currency expense/income)
  const handleOperationCurrencyChange = useCallback((code) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, operationCurrency: code }));
    }
  }, [isShadowOperation, setValues]);

  // Handler for description changes
  const handleDescriptionChange = useCallback((text) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, description: text }));
    }
  }, [isShadowOperation, setValues]);

  // Handler for the "exclude from spending average" toggle
  const handleToggleExcludeFromAvg = useCallback((val) => {
    if (!isShadowOperation) {
      setValues(v => ({ ...v, excludeFromAvg: val }));
    }
  }, [isShadowOperation, setValues]);

  // Handler for the "hide from the charts" toggle.
  //
  // A balance adjustment is read-only here — every field above is disabled and
  // ModalShell shows no Save button — so for one the flag is written straight to
  // the DB on toggle. `values` is updated first so the switch tracks the finger
  // rather than the round-trip; a failed write surfaces via the dialog inside
  // OperationsActionsContext, and reopening the row shows the persisted state.
  const handleToggleExcludeFromCharts = useCallback((val) => {
    setValues(v => ({ ...v, excludeFromCharts: val }));
    if (isShadowOperation && operation?.id != null) {
      updateOperation(operation.id, { excludeFromCharts: val });
    }
  }, [isShadowOperation, setValues, updateOperation, operation]);

  // Handler for description focus (auto-scroll to end)
  // We scroll twice: immediately for initial positioning, then again after the
  // suggestion chips have animated in (150ms fade-in), so chips are visible.
  const handleDescriptionFocus = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, []);

  // Handler for opening date picker
  const handleOpenDatePicker = useCallback(() => {
    if (!isShadowOperation) {
      setShowDatePicker(true);
    }
  }, [isShadowOperation, setShowDatePicker]);

  // Handler for date picker change
  const handleDateChange = useCallback((event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setValues(v => ({
        ...v,
        date: formatDate(selectedDate),
      }));
    }
  }, [setValues]);

  // Handler for account selection in picker
  const handleAccountSelect = useCallback((accountId) => {
    setValues(v => ({ ...v, accountId }));
    closePicker();
  }, [setValues, closePicker]);

  // Handler for "to account" selection in picker
  const handleToAccountSelect = useCallback((accountId) => {
    setValues(v => ({ ...v, toAccountId: accountId }));
    closePicker();
  }, [setValues, closePicker]);

  // Handler for category selection in picker
  const handleCategorySelect = useCallback(async (categoryId) => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = values.amount;

    if (hasOperation(values.amount)) {
      // A foreign-currency amount is typed in the operation currency, so it keeps
      // that currency's decimals (a USD amount on a JPY account keeps its cents),
      // matching what handleSave evaluates with.
      const amountCurrency = (isForeignCurrencyOp && values.operationCurrency) || sourceAccount?.currency;
      const evaluated = evaluateExpression(values.amount, Currency.getDecimalPlaces(amountCurrency));
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    // Select entry category and update amount in one setState call
    setValues(v => ({ ...v, categoryId, amount: finalAmount }));
    closePicker();

    // Only auto-add for new operations, not when editing.
    // Foreign-currency ops are excluded: this fast path stores the raw form
    // amount without the convert/swap logic of prepareOperationData, which
    // would record the foreign nominal (e.g. 30 TRY) as the account-currency
    // amount. The user completes those with the Save button instead.
    if (isNew && !isForeignCurrencyOp) {
      // Auto-save only a plain positive amount. `parseFloat` let an unevaluable
      // entry ("10+") through, and it was written to the amount column verbatim.
      if (Currency.isPositiveAmount(finalAmount)) {
        // Build operation data directly with evaluated amount, rounded to the
        // account currency like the Save path. Attach coordinates via the shared
        // helper so this quick-add path applies the same R1.5 rule as the full
        // save path.
        const operationData = {
          type: values.type,
          amount: sourceAccount ? Currency.formatAmount(finalAmount, sourceAccount.currency) : finalAmount,
          accountId: values.accountId,
          categoryId,
          date: values.date,
          description: values.description || null,
          ...(buildLocationOverrides(attachLocation, location) || {}),
        };

        try {
          await addOperation(operationData);

          // Save last accessed account
          if (operationData.accountId) {
            setLastAccessedAccount(operationData.accountId);
          }

          onClose();
        } catch (error) {
          console.error('[OperationModal] Failed to add operation:', error);
        }
      }
    }
  }, [values, setValues, closePicker, isNew, isForeignCurrencyOp, sourceAccount, addOperation, onClose, hasOperation, evaluateExpression, attachLocation, location]);

  // Reads the mirror, not `pickerState`: closePicker() nulls the hook's type
  // immediately, so a tap landing during the panel's exit animation would fall
  // through to the "to account" branch and write the id to the wrong field.
  const handleSelectPickedAccount = useCallback((accountId) => {
    const select = panel?.type === 'account' ? handleAccountSelect : handleToAccountSelect;
    select(accountId);
  }, [panel, handleAccountSelect, handleToAccountSelect]);

  const TYPES = [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ];

  const splitExtraActions = canSplit ? (
    <Pressable
      style={[styles.splitButtonContainer, { backgroundColor: colors.card }]}
      onPress={() => setShowSplitModal(true)}
      testID="split-button"
    >
      <Icon name="call-split" size={18} color={colors.primary} />
      <Text style={[styles.splitButtonText, { color: colors.primary }]}>
        {t('split_transaction')}
      </Text>
    </Pressable>
  ) : null;

  const panelWidth = Dimensions.get('window').width;
  const panelTranslateX = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });
  const mainTranslateX = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const mainOpacity = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const isCategoryPanel = panel?.type === 'category';
  const isAccountPanel = panel?.type === 'account' || panel?.type === 'toAccount';
  const panelTitle = isCategoryPanel
    ? t('select_category')
    : (panel?.type === 'toAccount' ? t('to_account') : t('select_account'));
  // Categories are counted whole — the grid searches the entire tree, not the
  // folder level it happens to be showing.
  const panelOptionCount = panel ? panel.data.length : 0;

  const pickerPanel = panel ? (
    <Animated.View
      testID="operation-picker-panel"
      // The panel is still mounted for its ~180ms exit. A second tap inside that
      // window is never intentional, and on a new operation the category grid
      // auto-saves — so it would post the operation twice.
      pointerEvents={pickerState.visible ? 'auto' : 'none'}
      style={[
        styles.panel,
        { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.md },
        { opacity: panelAnim, transform: [{ translateX: panelTranslateX }] },
      ]}
    >
      <View style={styles.panelHeader}>
        <Pressable
          onPress={closePicker}
          style={styles.panelBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          testID="operation-picker-back"
        >
          <Icon name="arrow-left" size={ICON_SIZE.base} color={colors.text} />
        </Pressable>
        <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>
          {panelTitle}
        </Text>
      </View>

      {panelOptionCount >= SEARCH_THRESHOLD && (
        <FormInput
          value={pickerQuery}
          onChangeText={setPickerQuery}
          placeholder={t('search')}
          leftIcon="magnify"
          testID="operation-picker-search"
        />
      )}

      <ScrollView
        style={styles.panelListBody}
        contentContainerStyle={styles.panelList}
        keyboardShouldPersistTaps="handled"
      >
        {/* Categories nest, so the picker is the app's shared category grid
            (CLAUDE.md, "Category selection") rather than a list of its own. */}
        {isCategoryPanel && (
          <CategoryGridSelector
            categories={panel.data}
            categoryType={values.type === 'income' ? 'income' : 'expense'}
            selectedCategoryId={values.categoryId || null}
            onSelect={handleCategorySelect}
            colors={colors}
            t={t}
            query={pickerQuery}
            onQueryChange={setPickerQuery}
          />
        )}
        {/* Accounts group by currency in the shared account grid
            (CLAUDE.md, "Account selection"). Gated on the two account types
            rather than "not a category", so an unrecognised picker type shows
            an empty panel instead of a grid of whatever it was opened with. */}
        {isAccountPanel && (
          <AccountGridSelector
            accounts={panel.data}
            selectedAccountId={panel.type === 'account' ? values.accountId : values.toAccountId}
            onSelect={handleSelectPickedAccount}
            colors={colors}
            t={t}
            query={pickerQuery}
          />
        )}
      </ScrollView>
    </Animated.View>
  ) : null;

  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_operation') : t('edit_operation')}
        onSave={isShadowOperation ? undefined : handleSaveWithLabels}
        saveDisabled={isSaving}
        onCancel={handleClose}
        cancelLabel={isShadowOperation ? t('close') : t('cancel')}
        onDelete={!isNew && onDelete ? handleDelete : undefined}
        deleteDisabled={!canDeleteShadowOperation}
        deleteLabel={t('delete_operation')}
        extraActions={splitExtraActions}
        scrollRef={scrollViewRef}
        showBlurOverlay
        overlayPanel={pickerPanel}
        onBackIntercept={handleBackIntercept}
      >
        <Animated.View style={{ opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }}>
          {/* Shared Form Fields: type selector, amount, account(s), category, multi-currency */}
          <OperationFormFields
            colors={colors}
            t={t}
            values={values}
            setValues={setValues}
            accounts={accounts}
            allAccounts={allAccounts}
            categories={filteredCategories}
            getAccountName={getAccountName}
            getAccountBalance={getAccountBalance}
            getCategoryName={getCategoryName}
            openPicker={openPicker}
            onAmountChange={handleAmountChange}
            TYPES={TYPES}
            showTypeSelector={true}
            showAccountBalance={true}
            showFieldIcons={true}
            hideCategoryPicker
            hideTransferTargetPicker={true}
            transferLayout="sideBySide"
            compact={true}
            disabled={isShadowOperation}
            containerBackground={colors.card}
            onExchangeRateChange={handleExchangeRateChange}
            onDestinationAmountChange={handleDestinationAmountChange}
            rateSource={rateSource}
            onOperationCurrencyChange={handleOperationCurrencyChange}
            foreignCurrencyEditable={true}
          />

          {/* Category / To Account + Date row */}
          <View style={styles.categoryDateRow}>
            {values.type === 'transfer' ? (
              <View style={styles.halfFieldWrapper}>
                <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                  {(t('to_account') || 'To').toUpperCase()}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButtonHalf,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                    isShadowOperation && styles.disabledInput,
                  ]}
                  onPress={() => !isShadowOperation && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                  disabled={isShadowOperation}
                  accessibilityRole="button"
                  accessibilityLabel={t('to_account')}
                  testID="to-account-picker"
                >
                  <Icon name="swap-horizontal" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                  <Text
                    style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                    numberOfLines={1}
                  >
                    {values.toAccountId ? getAccountName(values.toAccountId) : t('to_account')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.halfFieldWrapper}>
                {/* The eyebrow NAMES the field; the imperative belongs on the
                    button, which already reads "Select category" until one is
                    picked. A label that keeps ordering you to select something
                    you have already selected is the part that read wrong. */}
                <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                  {(t('category') || 'Category').toUpperCase()}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButtonHalf,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                    isShadowOperation && styles.disabledInput,
                  ]}
                  onPress={() => !isShadowOperation && openPicker('category', filteredCategories)}
                  disabled={isShadowOperation}
                  accessibilityRole="button"
                  accessibilityLabel={t('select_category')}
                  testID="category-input"
                >
                  <Icon name="tag" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                  <Text
                    style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                    numberOfLines={1}
                  >
                    {getCategoryName(values.categoryId)}
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.halfFieldWrapper}>
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('date') || 'Date').toUpperCase()}
              </Text>
              <Pressable
                style={[
                  styles.pickerButtonHalf,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isShadowOperation && styles.disabledInput,
                ]}
                onPress={handleOpenDatePicker}
                disabled={isShadowOperation}
                accessibilityRole="button"
                accessibilityLabel={t('select_date')}
                testID="date-input"
              >
                <Icon name="calendar" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                  {formatDateForDisplay(values.date)}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Labels editor (stored in the description field) */}
          <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
            {(t('labels') || 'Labels').toUpperCase()}
          </Text>
          <LabelInput
            ref={labelInputRef}
            value={values.description || ''}
            onChangeText={handleDescriptionChange}
            suggestions={labelSuggestions}
            placeholder={t('add_label_placeholder')}
            editable={!isShadowOperation}
            colors={colors}
            t={t}
            onFocus={handleDescriptionFocus}
          />

          {/* Location row (stored as latitude/longitude). Only when the feature is on. */}
          {attachLocation && !isShadowOperation && (
            <OperationLocationRow
              status={locationStatus}
              location={location}
              onCapture={captureLocation}
              onClear={clearLocation}
              colors={colors}
              t={t}
            />
          )}

          {/* Exclude-from-average toggle. Only when editing an expense (the burndown
              forecast / daily average is expense-based), never for shadow ops. */}
          {!isNew && !isShadowOperation && values.type === 'expense' && (
            <View style={styles.excludeAvgRow}>
              <View style={styles.excludeAvgTextContainer}>
                <Text style={[modalSharedStyles.fieldLabel, styles.excludeAvgLabel, { color: colors.mutedText }]}>
                  {(t('exclude_from_average') || 'Exclude from spending average').toUpperCase()}
                </Text>
                <Text style={[styles.excludeAvgHint, { color: colors.mutedText }]}>
                  {t('exclude_from_average_hint') || "Won't affect the daily average or burndown forecast"}
                </Text>
              </View>
              <Switch
                value={!!values.excludeFromAvg}
                onValueChange={handleToggleExcludeFromAvg}
                trackColor={{ false: colors.border, true: colors.primary + '66' }}
                thumbColor={values.excludeFromAvg ? colors.primary : colors.mutedText}
                testID="exclude-from-avg-switch"
              />
            </View>
          )}

          {/* Hide-from-charts toggle. Expenses and income both feed a donut and the
              summary totals; a transfer feeds neither, so it has nothing to hide.
              Shown for a balance adjustment too — it is the one control that is live
              on an otherwise read-only form, and skewed charts are exactly what a
              correction causes (it writes itself straight to the DB, see the
              handler). */}
          {!isNew && values.type !== 'transfer' && (
            <View style={styles.excludeAvgRow}>
              <View style={styles.excludeAvgTextContainer}>
                <Text style={[modalSharedStyles.fieldLabel, styles.excludeAvgLabel, { color: colors.mutedText }]}>
                  {(t('exclude_from_charts') || 'Hide from charts').toUpperCase()}
                </Text>
                <Text style={[styles.excludeAvgHint, { color: colors.mutedText }]}>
                  {t('exclude_from_charts_hint') || "Won't appear in the donut or the spending trend"}
                </Text>
              </View>
              <Switch
                value={!!values.excludeFromCharts}
                onValueChange={handleToggleExcludeFromCharts}
                trackColor={{ false: colors.border, true: colors.primary + '66' }}
                thumbColor={values.excludeFromCharts ? colors.primary : colors.mutedText}
                testID="exclude-from-charts-switch"
              />
            </View>
          )}

          {errors.general && <Text style={[styles.error, { color: colors.destructive }]}>{errors.general}</Text>}
        </Animated.View>
      </ModalShell>

      {/* Split Operation Modal */}
      <SplitOperationModal
        visible={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onConfirm={handleSplitConfirm}
        originalAmount={splitBaseAmount ?? values.amount}
        operationType={values.type}
        categories={categories}
        colors={colors}
        t={t}
      />

      {/* Date Picker — anchor the bare YYYY-MM-DD date to local midnight; parsing
          it bare (UTC) pre-selects the previous day west of Greenwich, and
          confirming would silently move the operation back one day */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date(values.date?.includes('T') ? values.date : `${values.date}T00:00:00`)}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

    </>
  );
}

const styles = StyleSheet.create({
  categoryDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  disabledInput: {
    opacity: 0.6,
  },
  error: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.sm,
  },
  excludeAvgHint: {
    fontSize: FONT_SIZE.sm,
  },
  excludeAvgLabel: {
    marginBottom: 2,
  },
  excludeAvgRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  excludeAvgTextContainer: {
    flex: 1,
  },
  halfFieldWrapper: {
    flex: 1,
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
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  panelList: {
    paddingBottom: SPACING.lg,
  },
  // Bounds the grid to what is left of the panel. Without it the ScrollView
  // sizes to its content inside a fixed-height column and the overflow is
  // simply clipped — categories past the fold that cannot be scrolled to.
  panelListBody: {
    flex: 1,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  pickerButtonHalf: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    minHeight: 48,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  pickerButtonText: {
    fontSize: 13,
  },
  splitButtonContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: SPACING.sm,
  },
  splitButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },

});

OperationModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  operation: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    accountId: PropTypes.string,
    categoryId: PropTypes.string,
    description: PropTypes.string,
    date: PropTypes.string,
    toAccountId: PropTypes.string,
    exchangeRate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    destinationAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    latitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    longitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    excludeFromAvg: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
    excludeFromCharts: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
  }),
  isNew: PropTypes.bool,
  onDelete: PropTypes.func,
  openCategoryPicker: PropTypes.bool,
};

