import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
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
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import currencies from '../../assets/currencies.json';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useOperationForm from '../hooks/useOperationForm';
import ModalShell from '../components/ModalShell';
import { modalSharedStyles } from '../styles/modalStyles';
import useOperationPicker from '../hooks/useOperationPicker';

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

export default function OperationModal({ visible, onClose, operation, isNew, onDelete }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { addOperation, splitOperation, updateOperation, validateOperation } = useOperationsActions();
  const { visibleAccounts: accounts } = useAccountsData();
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
    accounts,
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

  // Operation picker hook for category navigation
  const {
    pickerState,
    categoryNavigation,
    openPicker,
    closePicker,
    navigateIntoFolder,
    navigateBack,
  } = useOperationPicker(t);

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
  const canSplit = !isNew && !isShadowOperation && values.type !== 'transfer'
    && !isForeignCurrencyOp && parseFloat(values.amount) > 0;

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

  // Empty handler for preventing event propagation
  const handleStopPropagation = useCallback(() => {}, []);

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
  const handleCategorySelect = useCallback(async (category) => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = values.amount;

    if (hasOperation(values.amount)) {
      const evaluated = evaluateExpression(values.amount, Currency.getDecimalPlaces(sourceAccount?.currency));
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    // Select entry category and update amount in one setState call
    setValues(v => ({ ...v, categoryId: category.id, amount: finalAmount }));
    closePicker();

    // Only auto-add for new operations, not when editing.
    // Foreign-currency ops are excluded: this fast path stores the raw form
    // amount without the convert/swap logic of prepareOperationData, which
    // would record the foreign nominal (e.g. 30 TRY) as the account-currency
    // amount. The user completes those with the Save button instead.
    if (isNew && !isForeignCurrencyOp) {
      // Check if amount is valid and auto-save
      const hasValidAmount = finalAmount &&
        !isNaN(parseFloat(finalAmount)) &&
        parseFloat(finalAmount) > 0;

      if (hasValidAmount) {
        // Build operation data directly with evaluated amount. Attach coordinates
        // via the shared helper so this quick-add path applies the same R1.5 rule
        // as the full save path.
        const operationData = {
          type: values.type,
          amount: finalAmount, // Use the evaluated amount directly
          accountId: values.accountId,
          categoryId: category.id,
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
  }, [values, setValues, closePicker, isNew, isForeignCurrencyOp, addOperation, onClose, hasOperation, evaluateExpression, attachLocation, location]);

  // FlatList key extractor
  const keyExtractor = useCallback((item) => {
    return item.id || item.key;
  }, []);

  // FlatList render item
  const renderPickerItem = useCallback(({ item }) => {
    if (pickerState.type === 'account' || pickerState.type === 'toAccount') {
      const handlePress = pickerState.type === 'account' ? handleAccountSelect : handleToAccountSelect;
      return (
        <Pressable
          onPress={() => handlePress(item.id)}
          style={({ pressed }) => [
            styles.pickerOption,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <View style={styles.accountOption}>
            <Text style={[styles.pickerOptionText, styles.accountName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.pickerOptionCurrency, { color: colors.mutedText }]} numberOfLines={1}>
              {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
            </Text>
          </View>
        </Pressable>
      );
    } else if (pickerState.type === 'category') {
      const isFolder = item.type === 'folder';
      const isSelected = !isFolder && values.categoryId === item.id;
      const name = item.nameKey ? t(item.nameKey) : item.name;

      return (
        <Pressable
          onPress={() => {
            if (isFolder) {
              navigateIntoFolder(item);
            } else {
              handleCategorySelect(item);
            }
          }}
          style={({ pressed }) => [
            styles.gridCell,
            { backgroundColor: isSelected ? colors.selected : colors.altRow, borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <Icon name={item.icon} size={24} color={colors.text} />
          <Text style={[styles.gridCellName, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
          {isFolder && (
            <View style={styles.folderBadge}>
              <Icon name="folder-outline" size={12} color={colors.mutedText} />
            </View>
          )}
        </Pressable>
      );
    }
    return null;
  }, [pickerState.type, colors, values, handleAccountSelect, handleToAccountSelect, handleCategorySelect, navigateIntoFolder, t]);

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

  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_operation') : t('edit_operation')}
        onSave={isShadowOperation ? undefined : handleSaveWithLabels}
        onCancel={handleClose}
        cancelLabel={isShadowOperation ? t('close') : t('cancel')}
        onDelete={!isNew && onDelete ? handleDelete : undefined}
        deleteDisabled={!canDeleteShadowOperation}
        deleteLabel={t('delete_operation')}
        extraActions={splitExtraActions}
        scrollRef={scrollViewRef}
        showBlurOverlay
      >
        {/* Shared Form Fields: type selector, amount, account(s), category, multi-currency */}
        <OperationFormFields
          colors={colors}
          t={t}
          values={values}
          setValues={setValues}
          accounts={accounts}
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
          hideCategoryPicker={!isNew}
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
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('select_category') || 'Category').toUpperCase()}
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
              {(t('select_date') || 'Date').toUpperCase()}
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

        {errors.general && <Text style={styles.error}>{errors.general}</Text>}
      </ModalShell>

      {/* Split Operation Modal */}
      <SplitOperationModal
        visible={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onConfirm={handleSplitConfirm}
        originalAmount={values.amount}
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

      {/* Unified Picker Modal */}
      <Modal
        visible={pickerState.visible && visible}
        animationType="slide"
        transparent
        onRequestClose={closePicker}
      >
        <Pressable style={styles.pickerOverlay} onPress={closePicker}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={handleStopPropagation}>
            {pickerState.type === 'category' && categoryNavigation.breadcrumb.length > 0 && (
              <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
                <Pressable onPress={navigateBack} style={styles.backButton}>
                  <Icon name="arrow-left" size={24} color={colors.primary} />
                </Pressable>
                <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                  {categoryNavigation.breadcrumb[categoryNavigation.breadcrumb.length - 1].name}
                </Text>
              </View>
            )}
            <FlatList
              data={pickerState.data}
              keyExtractor={keyExtractor}
              numColumns={pickerState.type === 'category' ? 3 : 1}
              columnWrapperStyle={pickerState.type === 'category' ? styles.gridRow : undefined}
              contentContainerStyle={pickerState.type === 'category' ? styles.gridContent : undefined}
              renderItem={renderPickerItem}
              ListEmptyComponent={
                <Text style={[styles.pickerEmptyText, { color: colors.mutedText }]}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {(pickerState.type !== 'category' || !isNew) && (
              <Pressable style={styles.closeButton} onPress={closePicker}>
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  accountName: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  accountOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
  },
  breadcrumbContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  categoryDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 48,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledInput: {
    opacity: 0.6,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  folderBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  gridCell: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
    margin: SPACING.xs,
    padding: SPACING.md,
    position: 'relative',
    width: (Dimensions.get('window').width - SPACING.md * 2 - SPACING.sm * 2 - SPACING.xs * 2 * 3) / 3,
  },
  gridCellName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  gridContent: {
    padding: SPACING.sm,
  },
  gridRow: {
    justifyContent: 'flex-start',
  },
  halfFieldWrapper: {
    flex: 1,
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
  pickerEmptyText: {
    padding: 20,
    textAlign: 'center',
  },
  pickerModalContent: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '70%',
    padding: SPACING.md,
    width: '100%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pickerOptionCurrency: {
    fontSize: 14,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  pickerOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
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
    fontSize: 14,
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
  }),
  isNew: PropTypes.bool,
  onDelete: PropTypes.func,
};

OperationModal.defaultProps = {
  visible: false,
  onClose: () => {},
  operation: null,
  isNew: false,
  onDelete: null,
};
