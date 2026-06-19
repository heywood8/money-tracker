import React, { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable, Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Calculator from '../Calculator';
import MultiCurrencyFields from '../modals/MultiCurrencyFields';
import CurrencyPickerModal from './CurrencyPickerModal';
import * as Currency from '../../services/currency';
import currencies from '../../../assets/currencies.json';

const getCurrencySymbol = (code) => currencies[code]?.symbol || code;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { hasOperation as checkHasOperation, evaluateExpression } from '../../utils/calculatorUtils';
import { SPACING, BORDER_RADIUS } from '../../styles/layout';
import { FONT_SIZE } from '../../styles/designTokens';

// Enable LayoutAnimation on Android so the inline category browser can animate
// its height changes smoothly when drilling between hierarchy levels.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Horizontal slide distance (px) for the category browser push/pop transition.
const CATEGORY_SLIDE_DISTANCE = 28;

/**
 * OperationFormFields Component
 *
 * Reusable form fields for operation entry (expense, income, transfer)
 *
 * DEPENDENCIES:
 * - QuickAddForm (app/components/operations/QuickAddForm.js)
 * - OperationModal (app/modals/OperationModal.js)
 *
 * IMPORTANT: When modifying this component, ensure you test ALL dependent components:
 * 1. QuickAddForm - Verify type selector, account pickers (with icons/balance), calculator, category picker
 * 2. OperationModal - Verify account pickers (no icons), calculator, category picker (type picker is separate)
 *
 * Test both:
 * - UI/Layout (side-by-side vs stacked, account balance display, disabled state)
 * - Functionality (picker callbacks, amount changes, type switching, transfer logic)
 *
 * @param {Object} props
 * @param {Object} props.colors - Theme colors
 * @param {Function} props.t - Translation function
 * @param {Object} props.values - Form values {type, accountId, toAccountId, amount, categoryId}
 * @param {Function} props.setValues - Function to update form values
 * @param {Array} props.accounts - Available accounts
 * @param {Array} props.categories - Available categories
 * @param {Function} props.getAccountName - Function to get account name by ID
 * @param {Function} props.getAccountBalance - Function to get formatted account balance by ID (optional)
 * @param {Function} props.getCategoryName - Function to get category name by ID
 * @param {Function} props.openPicker - Function to open picker modal
 * @param {Function} props.onAmountChange - Callback when amount changes
 * @param {Function} props.onAdd - Callback for add action (QuickAdd only)
 * @param {Array} props.TYPES - Operation types [{key, label, icon}]
 * @param {boolean} props.showTypeSelector - Whether to show inline type selector buttons
 * @param {boolean} props.showAccountBalance - Whether to show account balance in picker
 * @param {boolean} props.showFieldIcons - Whether to show icons in account/category pickers
 * @param {string} props.transferLayout - 'sideBySide' or 'stacked' layout for transfer accounts
 * @param {boolean} props.disabled - Whether form is disabled
 * @param {string} props.containerBackground - Background color for calculator container
 * @param {Function} props.onExchangeRateChange - Callback for exchange rate change (multi-currency transfers)
 * @param {Function} props.onDestinationAmountChange - Callback for destination amount change (multi-currency transfers)
 */
const OperationFormFields = memo(({
  colors,
  t,
  values,
  setValues,
  accounts,
  categories,
  topCategoriesForType,
  getCategoryInfo,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  onAmountChange,
  onAdd,
  TYPES,
  showTypeSelector = true,
  showAccountBalance = false,
  showFieldIcons = true,
  hideCategoryPicker = false,
  hideTransferTargetPicker = false,
  transferLayout = 'stacked',
  disabled = false,
  containerBackground,
  onExchangeRateChange,
  onDestinationAmountChange,
  onAutoAddWithCategory,
  topTransferAccounts,
  onAutoAddWithAccount,
  rateSource,
  compact = false,
  onOperationCurrencyChange,
  foreignRateSource,
  foreignExchangeRate,
  foreignCurrencyEditable = false,
  flashCategoryError = 0,
}) => {
  const { hideBalances } = useDisplaySettings();

  // Local state for currency picker visibility
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  // Animated value for category chip error flash (0 = normal, 1 = error red)
  const categoryErrorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flashCategoryError) return;
    categoryErrorAnim.setValue(1);
    Animated.timing(categoryErrorAnim, {
      toValue: 0,
      duration: 2000,
      useNativeDriver: false,
    }).start();
  }, [flashCategoryError, categoryErrorAnim]);

  const chipErrorBorderColor = useMemo(() =>
    categoryErrorAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.border, '#ef4444'],
    }),
  [categoryErrorAnim, colors.border]);

  // Inline "All categories" browser state — replaces the bottom-sheet picker in
  // QuickAdd. We render the category hierarchy in-place using chips that look
  // identical to the suggested-category shortcuts, so the suggested → all
  // transition reads as a single morphing list rather than a modal swap.
  const [categoryBrowse, setCategoryBrowse] = useState({
    active: false,
    folderId: null, // null = root level
    breadcrumb: [], // [{ id, name }] of folders drilled into
  });
  // Animated values shared across suggestion/browse renders so the same wrapper
  // slides + fades as content swaps (native-thread driven).
  const browseOpacity = useRef(new Animated.Value(1)).current;
  const browseTranslateX = useRef(new Animated.Value(0)).current;

  // Reset the browser whenever the operation type changes — a leftover folderId
  // from a previous type would otherwise filter to nothing.
  useEffect(() => {
    setCategoryBrowse({ active: false, folderId: null, breadcrumb: [] });
    browseOpacity.setValue(1);
    browseTranslateX.setValue(0);
  }, [values.type, browseOpacity, browseTranslateX]);

  // Animate a level change: the content is swapped immediately (keeping the
  // interaction responsive and the state deterministic), then the new level
  // slides in from the side and fades up. `direction` is 'forward' (drilling
  // in / opening all → slide from the right) or 'back' (popping out → slide
  // from the left). The container's height change is smoothed with
  // LayoutAnimation so the list below glides rather than jumping.
  const animateCategorySwap = useCallback((direction, applyChange) => {
    const enterFrom = direction === 'forward' ? CATEGORY_SLIDE_DISTANCE : -CATEGORY_SLIDE_DISTANCE;
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    browseOpacity.setValue(0);
    browseTranslateX.setValue(enterFrom);
    applyChange();
    Animated.parallel([
      Animated.timing(browseOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(browseTranslateX, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [browseOpacity, browseTranslateX]);

  // Open the inline browser at the root level.
  const enterCategoryBrowse = useCallback(() => {
    if (disabled) return;
    animateCategorySwap('forward', () => setCategoryBrowse({ active: true, folderId: null, breadcrumb: [] }));
  }, [disabled, animateCategorySwap]);

  // Drill into a folder.
  const handleBrowseIntoFolder = useCallback((folder) => {
    if (disabled) return;
    const name = folder.nameKey ? t(folder.nameKey) : folder.name;
    animateCategorySwap('forward', () => setCategoryBrowse(prev => ({
      active: true,
      folderId: folder.id,
      breadcrumb: [...prev.breadcrumb, { id: folder.id, name }],
    })));
  }, [disabled, t, animateCategorySwap]);

  // Back chip: pop one folder level, or exit the browser when at root.
  const handleBrowseBack = useCallback(() => {
    if (disabled) return;
    if (categoryBrowse.breadcrumb.length === 0) {
      animateCategorySwap('back', () => setCategoryBrowse({ active: false, folderId: null, breadcrumb: [] }));
    } else {
      const nb = categoryBrowse.breadcrumb.slice(0, -1);
      const newFolderId = nb.length ? nb[nb.length - 1].id : null;
      animateCategorySwap('back', () => setCategoryBrowse({ active: true, folderId: newFolderId, breadcrumb: nb }));
    }
  }, [disabled, categoryBrowse.breadcrumb, animateCategorySwap]);

  // Select a leaf category from within the browser. Mirrors the shortcut
  // behaviour: auto-add when an amount is present, otherwise just set the value.
  const handleBrowseSelectLeaf = useCallback((categoryId) => {
    if (disabled) return;
    const hasValidAmount = values.amount && values.amount.trim() !== '';
    if (hasValidAmount && onAutoAddWithCategory) {
      onAutoAddWithCategory(categoryId);
      // Form is being reset by the parent — collapse the browser instantly.
      setCategoryBrowse({ active: false, folderId: null, breadcrumb: [] });
      browseOpacity.setValue(1);
      browseTranslateX.setValue(0);
    } else {
      setValues(v => ({ ...v, categoryId }));
      animateCategorySwap('back', () => setCategoryBrowse({ active: false, folderId: null, breadcrumb: [] }));
    }
  }, [disabled, values.amount, onAutoAddWithCategory, setValues, animateCategorySwap, browseOpacity, browseTranslateX]);

  // Memoize input styles
  const inputStyle = useMemo(() => ({
    backgroundColor: colors.inputBackground,
    borderColor: colors.inputBorder,
  }), [colors]);

  const groupBorderStyle = useMemo(() => ({
    borderColor: colors.border,
  }), [colors]);

  const disabledStyle = useMemo(() =>
    disabled ? styles.disabledInput : null
  , [disabled]);

  // Get source and destination accounts for multi-currency detection
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.accountId);
  }, [accounts, values.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === values.toAccountId);
  }, [accounts, values.toAccountId]);

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = useMemo(() => {
    if (values.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [values.type, sourceAccount, destinationAccount]);

  // Detect foreign currency expense/income
  const isForeignCurrencyOp = useMemo(() => {
    if (values.type === 'transfer') return false;
    if (!values.operationCurrency || !sourceAccount) return false;
    return values.operationCurrency !== sourceAccount.currency;
  }, [values.type, values.operationCurrency, sourceAccount]);

  // Compute live preview of home-currency amount for foreign currency ops
  const foreignPreviewAmount = useMemo(() => {
    if (!isForeignCurrencyOp || !foreignExchangeRate || !sourceAccount) return null;
    let numericAmount = values.amount;
    if (!numericAmount) return null;
    if (checkHasOperation(numericAmount)) {
      const ev = evaluateExpression(numericAmount, Currency.getDecimalPlaces(values.operationCurrency));
      if (ev !== null) numericAmount = String(ev);
      else return null;
    }
    const converted = Currency.convertAmount(
      numericAmount,
      values.operationCurrency,
      sourceAccount.currency,
      foreignExchangeRate,
    );
    if (!converted) return null;
    return converted;
  }, [isForeignCurrencyOp, foreignExchangeRate, values.amount, values.operationCurrency, sourceAccount]);

  // Render type selector buttons
  const renderTypeSelector = () => (
    <View style={[styles.typeSelector, compact && styles.typeSelectorCompact]}>
      {TYPES.map(type => {
        const isSelected = values.type === type.key;
        const textColor = isSelected ? colors.text : (disabled ? colors.mutedText : colors.text);

        return (
          <Pressable
            key={type.key}
            style={[
              styles.typeButton,
              {
                backgroundColor: isSelected ? colors.selected : colors.inputBackground,
                borderColor: colors.border,
              },
              disabledStyle,
            ]}
            onPress={() => !disabled && setValues(v => {
              const switchingBetweenExpenseIncome =
                (v.type === 'expense' && type.key === 'income') ||
                (v.type === 'income' && type.key === 'expense');
              const shouldClearCategory = type.key === 'transfer' || switchingBetweenExpenseIncome;
              return {
                ...v,
                type: type.key,
                categoryId: shouldClearCategory ? '' : v.categoryId,
                toAccountId: '',
              };
            })}
            disabled={disabled}
          >
            <Icon
              name={type.icon}
              size={18}
              color={textColor}
            />
            <Text style={[
              styles.typeButtonText,
              { color: textColor },
            ]}>
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Render account picker with optional balance and icon
  const renderAccountPicker = (
    accountId,
    onPress,
    label,
    iconName = 'wallet',
    style = styles.formInput,
    testID,
  ) => (
    <Pressable
      style={[style, compact && styles.formInputCompact, inputStyle, groupBorderStyle, disabledStyle]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      {showFieldIcons && (
        <Icon name={iconName} size={18} color={disabled ? colors.mutedText : colors.mutedText} />
      )}
      <Text
        style={[styles.formInputText, showAccountBalance && styles.flex1, { color: disabled ? colors.mutedText : colors.text }]}
        numberOfLines={1}
      >
        {accountId ? getAccountName(accountId) : label}
      </Text>
      {showAccountBalance && accountId && (
        hideBalances ? (
          <View style={styles.hiddenBalance} />
        ) : (
          <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
            {getAccountBalance(accountId)}
          </Text>
        )
      )}
    </Pressable>
  );

  // Render account pickers based on transfer layout
  const renderAccountPickers = () => {
    if (values.type === 'transfer' && transferLayout === 'sideBySide') {
      // QuickAdd transfer: only source account on top, target is below calculator
      return renderAccountPicker(
        values.accountId,
        () => !disabled && openPicker('account', accounts),
        t('select_account'),
      );
    } else if (values.type === 'transfer' && transferLayout === 'stacked') {
      // Stacked layout for OperationModal
      return (
        <>
          {renderAccountPicker(
            values.accountId,
            () => !disabled && openPicker('account', accounts),
            t('select_account'),
          )}
          {renderAccountPicker(
            values.toAccountId,
            () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
            `${t('to_account')}: ${values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}`,
            'wallet',
            styles.formInput,
            'to-account-picker',
          )}
        </>
      );
    } else {
      // Single account picker for non-transfer
      return renderAccountPicker(
        values.accountId,
        () => !disabled && openPicker('account', accounts),
        t('select_account'),
      );
    }
  };

  // Whether the inline "All categories" browser is available (QuickAdd context).
  const categoryBrowseEnabled = !!onAutoAddWithCategory;

  // Open-the-browser button (shared by the loaded shortcuts grid and the loading
  // placeholder). Falls back to the legacy bottom-sheet picker only in the
  // unlikely case the browser is unavailable.
  const handleAllCategoriesPress = () => {
    if (disabled) return;
    if (categoryBrowseEnabled) {
      enterCategoryBrowse();
    } else {
      openPicker('category', categories);
    }
  };

  // Animated wrapper style — both suggestion and browse content live inside the
  // same Animated.View so swapping between them slides + fades as one element.
  const categoryAnimStyle = {
    opacity: browseOpacity,
    transform: [{ translateX: browseTranslateX }],
  };

  // Placeholder rows shown during initial load in QuickAdd before categories are ready
  const renderCategoryPlaceholderRows = () => {
    const renderPlaceholderChip = (key) => (
      <View
        key={key}
        style={[
          styles.categoryShortcutButton,
          compact && styles.categoryShortcutButtonCompact,
          styles.placeholderChip,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.placeholderDot, { backgroundColor: colors.mutedText }]} />
        <View style={[styles.placeholderBar, { backgroundColor: colors.mutedText }]} />
      </View>
    );

    return (
      <>
        <View style={styles.categoryButtonsContainer}>
          <Pressable
            style={[styles.categoryPickerButton, inputStyle, groupBorderStyle]}
            onPress={handleAllCategoriesPress}
            disabled={disabled}
          >
            <Icon name="menu" size={16} color={disabled ? colors.mutedText : colors.text} />
            <Text style={[styles.categoryPickerText, { color: disabled ? colors.mutedText : colors.text }]} numberOfLines={2}>
              {t('all_categories')}
            </Text>
          </Pressable>
          {renderPlaceholderChip('ph-0')}
          {renderPlaceholderChip('ph-1')}
          {renderPlaceholderChip('ph-2')}
        </View>
        <View style={styles.categoryButtonsContainer}>
          {renderPlaceholderChip('ph-3')}
          {renderPlaceholderChip('ph-4')}
          {renderPlaceholderChip('ph-5')}
          {renderPlaceholderChip('ph-6')}
        </View>
      </>
    );
  };

  // Suggested-category shortcut rows (the default QuickAdd view)
  const renderCategorySuggestionRows = () => {
    const handleCategoryPress = (categoryId) => {
      if (disabled) return;
      const hasValidAmount = values.amount && values.amount.trim() !== '';
      if (hasValidAmount && onAutoAddWithCategory) {
        onAutoAddWithCategory(categoryId);
      } else {
        setValues(v => ({ ...v, categoryId }));
      }
    };

    // Count only leaf categories — folders inflate the length but never appear as chips
    const showAllButton = categories.filter(c => c.type !== 'folder').length > 8;
    const firstRowCats = showAllButton ? topCategoriesForType.slice(0, 3) : topCategoriesForType.slice(0, 4);
    const secondRowCats = showAllButton ? topCategoriesForType.slice(3) : topCategoriesForType.slice(4);

    const renderCategoryChip = (category, index, isSecondRow = false) => {
      const categoryInfo = getCategoryInfo ? getCategoryInfo(category.id) : { name: category.name, icon: category.icon, parentName: null };
      const isSelected = values.categoryId === category.id;
      const textColor = isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text);

      return (
        <AnimatedPressable
          key={category.id}
          testID={`category-shortcut-${isSecondRow ? 'r2-' : ''}${index}`}
          style={[
            styles.categoryShortcutButton,
            compact && styles.categoryShortcutButtonCompact,
            {
              backgroundColor: isSelected ? colors.primary : colors.inputBackground,
              borderColor: chipErrorBorderColor,
            },
            disabledStyle,
          ]}
          onPress={() => handleCategoryPress(category.id)}
          disabled={disabled}
        >
          <Icon name={categoryInfo.icon} size={18} color={textColor} />
          <Text
            style={[styles.categoryShortcutText, { color: textColor }]}
            numberOfLines={isSecondRow ? 1 : 2}
            ellipsizeMode="tail"
          >
            {categoryInfo.name}
          </Text>
        </AnimatedPressable>
      );
    };

    return (
      <>
        {/* Row 1: "All categories" button (if > 8 total) + first 3 or 4 shortcuts */}
        <View style={styles.categoryButtonsContainer}>
          {showAllButton && (
            <Pressable
              testID="all-categories-button"
              style={styles.categoryPickerPressable}
              onPress={handleAllCategoriesPress}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t('all_categories')}
            >
              <Animated.View style={[styles.categoryPickerButton, inputStyle, { borderColor: chipErrorBorderColor }, disabledStyle]}>
                <Icon name="menu" size={16} color={disabled ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.categoryPickerText, { color: disabled ? colors.mutedText : colors.text }]}
                  numberOfLines={2}
                >
                  {t('all_categories')}
                </Text>
              </Animated.View>
            </Pressable>
          )}
          {firstRowCats.map((category, index) => renderCategoryChip(category, index, false))}
        </View>

        {/* Row 2: always 4 flex-1 slots to match row 1 widths; invisible spacers for empty slots */}
        <View style={[styles.categoryButtonsContainer, secondRowCats.length === 0 && styles.invisible]}>
          {Array.from({ length: 4 }, (_, i) => {
            const category = secondRowCats[i];
            if (!category) {
              return (
                <View
                  key={`cat-spacer-${i}`}
                  style={[
                    styles.categoryShortcutButton,
                    compact && styles.categoryShortcutButtonCompact,
                    styles.invisible,
                  ]}
                />
              );
            }
            return renderCategoryChip(category, i, true);
          })}
        </View>
      </>
    );
  };

  // Inline "All categories" hierarchy rows. The first slot is a back chip (pops
  // a level / exits), followed by the categories at the current level. Folders
  // drill in; leaf entries select. Chips reuse the shortcut styling so the
  // suggested → all transition feels like one continuous list.
  const renderCategoryBrowseRows = () => {
    const items = categories.filter(c =>
      categoryBrowse.folderId == null ? !c.parentId : c.parentId === categoryBrowse.folderId,
    );

    const renderBackChip = () => (
      <Pressable
        key="category-browse-back"
        testID="category-browse-back"
        style={[styles.categoryPickerButton, inputStyle, groupBorderStyle, disabledStyle]}
        onPress={handleBrowseBack}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('back')}
      >
        <Icon name="arrow-left" size={16} color={disabled ? colors.mutedText : colors.text} />
        <Text
          style={[styles.categoryPickerText, { color: disabled ? colors.mutedText : colors.text }]}
          numberOfLines={2}
        >
          {t('back')}
        </Text>
      </Pressable>
    );

    const renderBrowseChip = (item, key) => {
      const isFolder = item.type === 'folder';
      const isSelected = !isFolder && values.categoryId === item.id;
      const name = item.nameKey ? t(item.nameKey) : item.name;
      const textColor = isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text);

      return (
        <Pressable
          key={key}
          testID={`category-browse-${key}`}
          style={[
            styles.categoryShortcutButton,
            compact && styles.categoryShortcutButtonCompact,
            {
              backgroundColor: isSelected ? colors.primary : colors.inputBackground,
              borderColor: colors.border,
            },
            disabledStyle,
          ]}
          onPress={() => (isFolder ? handleBrowseIntoFolder(item) : handleBrowseSelectLeaf(item.id))}
          disabled={disabled}
        >
          <Icon name={item.icon || (isFolder ? 'folder' : 'help-circle')} size={18} color={textColor} />
          <Text
            style={[styles.categoryShortcutText, { color: textColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {name}
          </Text>
          {isFolder && (
            <View style={styles.browseFolderBadge}>
              <Icon name="folder-outline" size={11} color={isSelected ? 'rgba(255,255,255,0.85)' : colors.mutedText} />
            </View>
          )}
        </Pressable>
      );
    };

    // Back chip occupies the first slot (where "All categories" was); the rest
    // are the current level's categories, chunked into rows of four.
    const slots = [{ kind: 'back' }, ...items.map(item => ({ kind: 'item', item }))];
    const rows = [];
    for (let i = 0; i < slots.length; i += 4) rows.push(slots.slice(i, i + 4));

    return rows.map((row, ri) => {
      const padded = [...row];
      while (padded.length < 4) padded.push({ kind: 'spacer', id: `sp-${ri}-${padded.length}` });
      return (
        <View key={`category-browse-row-${ri}`} style={styles.categoryButtonsContainer}>
          {padded.map((slot, ci) => {
            if (slot.kind === 'back') return renderBackChip();
            if (slot.kind === 'spacer') {
              return (
                <View
                  key={slot.id}
                  style={[
                    styles.categoryShortcutButton,
                    compact && styles.categoryShortcutButtonCompact,
                    styles.invisible,
                  ]}
                />
              );
            }
            return renderBrowseChip(slot.item, slot.item.id);
          })}
        </View>
      );
    });
  };

  // Render category picker with shortcuts / inline browser
  const renderCategoryPicker = () => {
    if (hideCategoryPicker) return null;
    if (values.type === 'transfer') return null;

    const hasSuggestions = topCategoriesForType && topCategoriesForType.length > 0;

    // OperationModal / non-shortcut context: single full-width picker (no inline browser)
    if (!categoryBrowseEnabled && !hasSuggestions) {
      return (
        <Pressable
          style={[styles.formInput, inputStyle, disabledStyle]}
          onPress={() => !disabled && openPicker('category', categories)}
          disabled={disabled}
        >
          {showFieldIcons && (
            <Icon name="tag" size={18} color={disabled ? colors.mutedText : colors.mutedText} />
          )}
          <Text style={[styles.formInputText, { color: disabled ? colors.mutedText : colors.text }]}>
            {getCategoryName(values.categoryId)}
          </Text>
        </Pressable>
      );
    }

    let content;
    if (categoryBrowse.active) {
      content = renderCategoryBrowseRows();
    } else if (hasSuggestions) {
      content = renderCategorySuggestionRows();
    } else {
      // QuickAdd: categories not yet loaded — show the blurred placeholder grid
      content = renderCategoryPlaceholderRows();
    }

    return (
      <Animated.View
        style={[
          styles.categoryRowsWrapper,
          compact && styles.categoryRowsWrapperCompact,
          categoryAnimStyle,
        ]}
      >
        {content}
      </Animated.View>
    );
  };

  // Render transfer target account picker with shortcuts (below calculator)
  const renderTransferTargetPicker = () => {
    if (values.type !== 'transfer' || transferLayout !== 'sideBySide') return null;

    if (topTransferAccounts && topTransferAccounts.length > 0) {
      const handleTargetPress = (accountId) => {
        if (disabled) return;
        const hasValidAmount = values.amount && values.amount.trim() !== '';
        if (hasValidAmount && onAutoAddWithAccount) {
          onAutoAddWithAccount(accountId);
        } else {
          setValues(v => ({ ...v, toAccountId: accountId }));
        }
      };

      // Show "all" button only when there are more than 8 available target accounts
      const availableAccountCount = accounts.filter(acc => acc.id !== values.accountId).length;
      const showAllAccountsButton = availableAccountCount > 8;
      const firstRowAccounts = showAllAccountsButton ? topTransferAccounts.slice(0, 3) : topTransferAccounts.slice(0, 4);
      const secondRowAccounts = showAllAccountsButton ? topTransferAccounts.slice(3) : topTransferAccounts.slice(4);

      const renderAccountChip = (account) => {
        const isSelected = values.toAccountId === account.id;
        const textColor = isSelected ? '#fff' : (disabled ? colors.mutedText : colors.text);
        const balanceColor = isSelected ? 'rgba(255,255,255,0.7)' : colors.mutedText;

        return (
          <Pressable
            key={account.id}
            style={[
              styles.accountShortcutButton,
              compact && styles.accountShortcutButtonCompact,
              {
                backgroundColor: isSelected ? colors.primary : colors.inputBackground,
                borderColor: colors.border,
              },
              disabledStyle,
            ]}
            onPress={() => handleTargetPress(account.id)}
            disabled={disabled}
          >
            {getAccountBalance && (
              hideBalances ? (
                <View style={styles.hiddenBalanceSmall} />
              ) : (
                <Text
                  style={[styles.accountShortcutBalance, { color: balanceColor }]}
                  numberOfLines={1}
                >
                  {getAccountBalance(account.id)}
                </Text>
              )
            )}
            <Text
              style={[styles.accountShortcutName, { color: textColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {account.name}
            </Text>
          </Pressable>
        );
      };

      return (
        <View style={[styles.categoryRowsWrapper, compact && styles.categoryRowsWrapperCompact]}>
          {/* Row 1: "All accounts" button (if > 8 total) + first 3 or 4 shortcuts */}
          <View style={styles.categoryButtonsContainer}>
            {showAllAccountsButton && (
              <Pressable
                style={[styles.categoryPickerButton, inputStyle, groupBorderStyle, disabledStyle]}
                onPress={() => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                disabled={disabled}
              >
                <Icon name="menu" size={16} color={disabled ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.categoryPickerText, { color: disabled ? colors.mutedText : colors.text }]}
                  numberOfLines={2}
                >
                  {t('all_accounts')}
                </Text>
              </Pressable>
            )}
            {firstRowAccounts.map((account) => renderAccountChip(account))}
          </View>

          {/* Row 2: always 4 flex-1 slots to match row 1 widths; invisible spacers for empty slots */}
          <View style={[styles.categoryButtonsContainer, secondRowAccounts.length === 0 && styles.invisible]}>
            {Array.from({ length: 4 }, (_, i) => {
              const account = secondRowAccounts[i];
              if (!account) {
                return (
                  <View
                    key={`acc-spacer-${i}`}
                    style={[
                      styles.accountShortcutButton,
                      compact && styles.accountShortcutButtonCompact,
                      styles.invisible,
                    ]}
                  />
                );
              }
              return renderAccountChip(account);
            })}
          </View>
        </View>
      );
    }

    // Fallback: single full-width picker
    return renderAccountPicker(
      values.toAccountId,
      () => !disabled && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId)),
      t('to_account'),
      'swap-horizontal',
      styles.formInput,
      'to-account-picker',
    );
  };

  return (
    <>
      {showTypeSelector && renderTypeSelector()}
      {renderAccountPickers()}
      <View style={disabledStyle}>
        <Calculator
          value={values.amount}
          onValueChange={onAmountChange}
          colors={colors}
          placeholder={t('amount')}
          onAdd={onAdd}
          containerBackground={containerBackground}
          compact={compact}
          currencyCode={compact && values.type !== 'transfer' && onOperationCurrencyChange ? getCurrencySymbol(values.operationCurrency) : undefined}
          onCurrencyPress={compact && values.type !== 'transfer' && onOperationCurrencyChange ? () => setShowCurrencyPicker(true) : undefined}
        />
      </View>
      {isForeignCurrencyOp && sourceAccount && !foreignCurrencyEditable && (
        <View style={styles.ratePreviewRow}>
          <Text style={[styles.ratePreviewText, { color: colors.mutedText }]}>
            {foreignRateSource === 'loading'
              ? t('fetching_rate')
              : foreignPreviewAmount
                ? `≈ ${foreignPreviewAmount} ${sourceAccount.currency}${foreignRateSource === 'offline' ? ` (${t('offline_rate')})` : ''}`
                : t('rate_unavailable')}
          </Text>
        </View>
      )}
      {isForeignCurrencyOp && sourceAccount && foreignCurrencyEditable && onExchangeRateChange && onDestinationAmountChange && (
        <MultiCurrencyFields
          colors={colors}
          t={t}
          sourceAccount={{ currency: values.operationCurrency }}
          destinationAccount={{ currency: sourceAccount.currency }}
          exchangeRate={values.exchangeRate || ''}
          destinationAmount={values.destinationAmount || ''}
          isShadowOperation={disabled}
          onExchangeRateChange={onExchangeRateChange}
          onDestinationAmountChange={onDestinationAmountChange}
          rateSource={rateSource || 'offline'}
        />
      )}
      {isMultiCurrencyTransfer && sourceAccount && destinationAccount && onExchangeRateChange && onDestinationAmountChange && (
        <MultiCurrencyFields
          colors={colors}
          t={t}
          sourceAccount={sourceAccount}
          destinationAccount={destinationAccount}
          exchangeRate={values.exchangeRate || ''}
          destinationAmount={values.destinationAmount || ''}
          isShadowOperation={disabled}
          onExchangeRateChange={onExchangeRateChange}
          onDestinationAmountChange={onDestinationAmountChange}
          rateSource={rateSource}
        />
      )}
      {values.type === 'transfer' ? (hideTransferTargetPicker ? null : renderTransferTargetPicker()) : renderCategoryPicker()}
      <CurrencyPickerModal
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        onSelect={(code) => {
          setShowCurrencyPicker(false);
          if (onOperationCurrencyChange) onOperationCurrencyChange(code);
        }}
        selectedCurrency={values.operationCurrency}
        colors={colors}
        t={t}
      />
    </>
  );
});

OperationFormFields.displayName = 'OperationFormFields';

OperationFormFields.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  values: PropTypes.shape({
    type: PropTypes.string.isRequired,
    accountId: PropTypes.string,
    toAccountId: PropTypes.string,
    amount: PropTypes.string,
    categoryId: PropTypes.string,
    exchangeRate: PropTypes.string,
    destinationAmount: PropTypes.string,
    operationCurrency: PropTypes.string,
  }).isRequired,
  setValues: PropTypes.func.isRequired,
  accounts: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  topCategoriesForType: PropTypes.array,
  getCategoryInfo: PropTypes.func,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  onAmountChange: PropTypes.func.isRequired,
  onAdd: PropTypes.func,
  TYPES: PropTypes.array.isRequired,
  showTypeSelector: PropTypes.bool,
  showAccountBalance: PropTypes.bool,
  showFieldIcons: PropTypes.bool,
  hideCategoryPicker: PropTypes.bool,
  hideTransferTargetPicker: PropTypes.bool,
  transferLayout: PropTypes.oneOf(['sideBySide', 'stacked']),
  disabled: PropTypes.bool,
  containerBackground: PropTypes.string,
  onExchangeRateChange: PropTypes.func,
  onDestinationAmountChange: PropTypes.func,
  onAutoAddWithCategory: PropTypes.func,
  topTransferAccounts: PropTypes.array,
  onAutoAddWithAccount: PropTypes.func,
  rateSource: PropTypes.oneOf(['loading', 'live', 'offline']),
  compact: PropTypes.bool,
  onOperationCurrencyChange: PropTypes.func,
  foreignRateSource: PropTypes.oneOf(['loading', 'live', 'offline']),
  foreignExchangeRate: PropTypes.string,
  foreignCurrencyEditable: PropTypes.bool,
  flashCategoryError: PropTypes.number,
};

const styles = StyleSheet.create({
  accountBalanceText: {
    fontSize: 12,
  },
  accountShortcutBalance: {
    fontSize: 10,
    textAlign: 'center',
  },
  accountShortcutButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  accountShortcutButtonCompact: {
    minHeight: 48,
  },
  accountShortcutName: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
  browseFolderBadge: {
    position: 'absolute',
    right: 3,
    top: 3,
  },
  categoryButtonsContainer: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  categoryPickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  categoryPickerPressable: {
    flex: 1,
  },
  categoryPickerText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  categoryRowsWrapper: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  categoryRowsWrapperCompact: {
    marginBottom: SPACING.xs,
  },
  categoryShortcutButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  categoryShortcutButtonCompact: {
    minHeight: 48,
  },
  categoryShortcutText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  disabledInput: {
    opacity: 0.6,
  },
  flex1: {
    flex: 1,
  },
  formInput: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    minHeight: 44,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  formInputCompact: {
    marginBottom: SPACING.xs,
  },
  formInputText: {
    fontSize: 14,
    fontWeight: '500',
  },
  hiddenBalance: {
    backgroundColor: 'rgba(120, 120, 120, 0.25)',
    borderRadius: 4,
    height: 12,
    width: 64,
  },
  hiddenBalanceSmall: {
    backgroundColor: 'rgba(120, 120, 120, 0.25)',
    borderRadius: 3,
    height: 8,
    width: 40,
  },
  invisible: {
    opacity: 0,
  },
  placeholderBar: {
    borderRadius: 3,
    height: 7,
    marginTop: 3,
    width: '55%',
  },
  placeholderChip: {
    opacity: 0.35,
  },
  placeholderDot: {
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  ratePreviewRow: {
    alignItems: 'center',
    marginBottom: SPACING.xs,
    marginTop: -SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  ratePreviewText: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  typeSelectorCompact: {
    marginBottom: SPACING.sm,
  },
});

export default OperationFormFields;
