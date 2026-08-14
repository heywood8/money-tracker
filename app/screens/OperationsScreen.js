import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, TextInput, Pressable, Modal, Keyboard, BackHandler } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS, HEIGHTS } from '../styles/designTokens';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import { getDistinctLabels } from '../services/OperationsDB';
import { parseLabels, serializeLabels, addLabel, hasLabel } from '../utils/labelUtils';
import { buildRepeatedOperation } from '../utils/operationUtils';
import OperationModal from '../modals/OperationModal';
import Calculator from '../components/Calculator';
import ListCard from '../components/ListCard';
import OperationsList from '../components/operations/OperationsList';
import OperationActionMenu from '../components/operations/OperationActionMenu';
import QuickAddForm from '../components/operations/QuickAddForm';
import NotificationBindingStack, { deckPeekAllowance, deckCardHeight } from '../components/operations/NotificationBindingStack';
import PickerModal from '../components/operations/PickerModal';
import UndoSnackbar, { UNDO_DURATION_MS } from '../components/operations/UndoSnackbar';
import SearchOverlay from '../components/search/SearchOverlay';
import SearchBar from '../components/search/SearchBar';
import FilterChipStrip from '../components/search/FilterChipStrip';
import * as Currency from '../services/currency';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useMultiCurrencyTransfer from '../hooks/useMultiCurrencyTransfer';
import useOperationPicker from '../hooks/useOperationPicker';
import useQuickAddForm from '../hooks/useQuickAddForm';
import useQuickAddLocation from '../hooks/useQuickAddLocation';
import usePendingOperationSuggestions from '../hooks/usePendingOperationSuggestions';
import { useSearch } from '../contexts/SearchContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { TIMING_ENTER, TIMING_EXIT, DURATION_ENTER, DURATION_EXIT, SPRING_SETTLE } from '../utils/motion';
import AddFAB, { FAB_BOTTOM_OFFSET } from '../components/AddFAB';

// Note: dynamic createStyles removed to keep linting stable.

// Ceiling for the quick-add clip, not a size: at rest the clip must not
// constrain the form, because the form's height changes underneath it (transfer
// fields appear, a suggestion deck stacks over it) and pinning it to whatever it
// measured last would slice those off. The collapse animation never travels from
// here — it starts at the block's measured height (see the searchMode effect).
const QUICK_ADD_UNCLIPPED = 1000;

// Map a QuickAdd validation failure to the form field that should flash red,
// so single-field omissions get the same lightweight inline treatment the
// missing-category case already had (instead of a blocking OK dialog). The
// order mirrors validateOperation; returns null for anything not tied to a
// single visible field (e.g. missing type/date), which falls back to a dialog.
export const getQuickAddFlashField = (op) => {
  if (!op.amount || isNaN(parseFloat(op.amount)) || parseFloat(op.amount) <= 0) return 'amount';
  if (!op.accountId) return 'account';
  if (op.type === 'transfer') {
    if (!op.toAccountId || op.accountId === op.toAccountId) return 'toAccount';
  } else if (!op.categoryId) {
    return 'category';
  }
  return null;
};

const OperationsScreen = () => {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();

  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    operations,
    loading: operationsLoading,
    loadingMore,
    hasMoreOperations,
    searchState,
    hasActiveSearch,
    getSearchFilterCount,
  } = useOperationsData();
  const {
    deleteOperation,
    addOperation,
    addOptimisticOperation,
    removeOptimisticOperation,
    replaceOptimisticOperation,
    updateOperation,
    validateOperation,
    loadMoreOperations,
    jumpToDate,
    setSearchText,
    updateSearchFilters,
    loadInitialOperations,
  } = useOperationsActions();
  const { accounts, visibleAccounts, loading: accountsLoading } = useAccountsData();
  const { categories, loading: categoriesLoading } = useCategories();

  // Accounts and categories are fetched by their own providers, independently of
  // the operations query, and routinely settle after it. A row rendered in that
  // window resolves its category to "Unknown" with a question-mark icon and its
  // per-day totals to nothing — the list looks broken rather than busy. Treat
  // the window as part of the list's loading state and let the skeleton hold it.
  //
  // Gated on the array still being EMPTY, not on `loading` alone: both providers
  // re-raise `loading` for background reloads (RELOAD_ALL after an import, a
  // language switch), and those keep the previously loaded data on hand. Without
  // the length check a finished list would blink back to a skeleton every time.
  const referenceDataLoading = Boolean(
    (categoriesLoading && categories.length === 0)
    || (accountsLoading && accounts.length === 0),
  );

  // What the list can actually paint. Everything that waits for "the list has
  // real rows" keys off this rather than off operationsLoading alone, so a
  // pending scroll target is not consumed against a skeleton.
  const listLoading = operationsLoading || referenceDataLoading;

  // Display preferences. Read defensively: the context has no default value, so
  // a missing provider (e.g. in unit tests) yields undefined.
  const displaySettings = useDisplaySettings();
  // Opt-in geolocation for quick-add.
  const attachLocation = !!(displaySettings && displaySettings.attachLocation);
  // Whether the quick-add panel is pinned open at the top of the list. Only an
  // explicit `false` collapses it, so an absent provider keeps the historical
  // always-open behaviour.
  const showQuickAddPanel = !(displaySettings && displaySettings.showQuickAddPanel === false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scrollToDateString, setScrollToDateString] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(false);
  const [pendingSuggestionId, setPendingSuggestionId] = useState(null);
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  // Latest known description for the operation the suggestion row targets. Kept in
  // a ref so applying a label does not depend on the freshly-created operation
  // having already been re-loaded into `operations` (which is async).
  const pendingOpDescRef = useRef('');
  // Undo bar for a just-added operation. `token` bumps on every add so the
  // snackbar remounts (restarting its countdown/animation) when operations are
  // added back-to-back within the 5-second window.
  const [undoInfo, setUndoInfo] = useState(null); // null | { id, token }
  const undoTokenRef = useRef(0);
  // Long-press quick-action menu on a row: null | { operation, layout, row }
  const [actionMenu, setActionMenu] = useState(null);
  const [filterPanelHeight, setFilterPanelHeight] = useState(0);
  // Seeded with an estimate of the collapsed search-pill area so the list's top
  // inset is roughly right on first paint; the real value arrives via onLayout.
  const [searchBarAreaHeight, setSearchBarAreaHeight] = useState(48);
  // Which QuickAdd field failed validation, if any. `token` bumps on every failed
  // attempt so re-omitting the same field re-triggers the red flash.
  const [quickAddFlash, setQuickAddFlash] = useState(null);
  const quickAddFlashTokenRef = useRef(0);

  const { searchMode, filtersExpanded, openSearch, closeSearch, reopenSearch, toggleFilters } = useSearch();
  const isSearchOpen = searchMode === 'open';
  // With the panel setting off, the form lives behind the + button: it is
  // summoned for one entry and folds itself away again once that entry lands.
  // Meaningless while the setting is on, where the panel never leaves.
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  // A summoned form belongs to the entry the user is making; search replaces
  // that whole context, so what was open behind it should not reappear when
  // search closes.
  useEffect(() => {
    if (isSearchOpen) setQuickAddExpanded(false);
  }, [isSearchOpen]);
  const scrollOffsetRef = useRef(0);
  const prevFiltersExpandedRef = useRef(false);
  const prevSearchModeRef = useRef(searchMode);
  const quickAddMaxHeight = useSharedValue(QUICK_ADD_UNCLIPPED);
  const quickAddTranslateY = useSharedValue(0);
  // Live height of the block being clipped, measured on the slide container.
  // A ref, not state: nothing renders from it, and onLayout fires often enough
  // that a state write here would re-render the whole screen for nothing.
  const quickAddClipHeightRef = useRef(0);
  const handleQuickAddClipLayout = useCallback((event) => {
    quickAddClipHeightRef.current = Math.round(event.nativeEvent.layout.height);
  }, []);

  // Drive the clip to `collapsed`. Three motions, because three different things
  // ask for this move and they do not feel the same:
  //   'timing'  — search opening or closing. The panel is one element of a
  //               transition that also moves the search pill and the list, so it
  //               keeps time with them on the app's shared enter/exit curves.
  //   'spring'  — the + button, and the fold-away after an entry lands. A direct
  //               manipulation of this one surface: it travels on the iOS-derived
  //               spring, arriving at its own pace rather than on a stopwatch.
  //   'instant' — first paint, and a change of the setting itself (made from the
  //               settings screen, with this one not in front of the user).
  //               Nothing to watch, so nothing to animate.
  const applyQuickAddCollapse = useCallback((collapsed, mode) => {
    // Collapse from the block's REAL height rather than from the 1000 ceiling.
    // Animating 1000 → 0 spends ~93% of its time above the form's ~200dp, where
    // the clip touches nothing: the list below sat still for 300ms and then
    // jumped as the last 20ms cut through the actual content. Starting at the
    // measured height makes every frame of the collapse a frame the eye can see.
    const measured = quickAddClipHeightRef.current || QUICK_ADD_UNCLIPPED;
    // The slide's travel: exactly the block's own height, so the content clears
    // the boundary as the boundary closes. Before the first layout there is no
    // height to travel — the clip alone hides it, and the first expansion then
    // reads as an uncover rather than as a slide from far above the screen.
    const slide = quickAddClipHeightRef.current || 0;

    if (mode === 'instant') {
      quickAddMaxHeight.value = collapsed ? 0 : QUICK_ADD_UNCLIPPED;
      quickAddTranslateY.value = collapsed ? -slide : 0;
      return;
    }

    const collapseTo = (value, config) => (mode === 'spring'
      ? withSpring(value, SPRING_SETTLE)
      : withTiming(value, config));

    if (collapsed) {
      // Outer clip collapses; inner content slides upward within it.
      quickAddMaxHeight.value = measured;
      quickAddMaxHeight.value = collapseTo(0, { ...TIMING_EXIT, duration: DURATION_EXIT });
      quickAddTranslateY.value = collapseTo(-slide, { ...TIMING_EXIT, duration: DURATION_EXIT });
      return;
    }

    // Slide back down — content descends into view as the clip opens.
    quickAddTranslateY.value = collapseTo(0, { ...TIMING_ENTER, duration: DURATION_ENTER });
    // Hand the ceiling back once the form is fully open, so it can grow
    // (transfer fields, suggestion deck) without being clipped at the height it
    // happened to have when it was last closed.
    const release = (finished) => {
      'worklet';
      if (finished) quickAddMaxHeight.value = QUICK_ADD_UNCLIPPED;
    };
    quickAddMaxHeight.value = mode === 'spring'
      ? withSpring(measured, SPRING_SETTLE, release)
      : withTiming(measured, { ...TIMING_ENTER, duration: DURATION_ENTER }, release);
  }, [quickAddMaxHeight, quickAddTranslateY]);

  // Outer view: clips the content as height collapses
  const animatedQuickAddClipStyle = useAnimatedStyle(() => ({
    maxHeight: quickAddMaxHeight.value,
    overflow: 'hidden',
  }));

  // Inner view: slides the content upward within the fixed clip boundary
  const animatedQuickAddSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: quickAddTranslateY.value }],
  }));

  // Ref for FlatList to enable scrolling to top
  const flatListRef = useRef(null);
  // Synchronous guard: prevents multiple handleContentSizeChange firings from
  // each scheduling their own scroll before React re-renders with pendingScroll=false.
  const scrollScheduledRef = useRef(false);

  // Custom hooks for form and picker management
  const {
    quickAddValues,
    setQuickAddValues,
    getAccountName,
    getAccountBalance,
    getCategoryInfo,
    getCategoryName,
    filteredCategories,
    topCategoriesForType,
    topTransferAccountsForForm,
    resetForm,
    foreignRateSource,
    foreignExchangeRate,
  } = useQuickAddForm(visibleAccounts, accounts, categories, t);

  // Best-effort, non-blocking location capture primed as the user starts entering
  // an operation; attached at save time (issue #1091).
  const { getLocation: getQuickAddLocation, prime: primeQuickAddLocation } = useQuickAddLocation(attachLocation);
  // Tracks whether the amount field is currently empty, so a fix is primed exactly
  // on the empty → non-empty edge (start of entry) rather than on every keystroke.
  const amountWasEmptyRef = useRef(true);

  const {
    pickerState,
    openPicker,
    closePicker,
  } = useOperationPicker();

  // Insert a placeholder row for a just-accepted notification suggestion so the
  // binding card can leave the deck immediately while its write runs in the
  // background. The amount is an offline-rate estimate in the account currency;
  // the persisted row (arriving via RELOAD_ALL) replaces it with the exact value.
  const insertOptimisticSuggestion = useCallback((item, choice) => {
    const account = accounts.find((a) => a.id === choice.accountId);
    const accountCurrency = account?.currency;
    let amount = item.amount;
    if (account && item.currency && accountCurrency && accountCurrency !== item.currency) {
      const converted = Currency.convertAmount(item.amount, item.currency, accountCurrency);
      if (converted) amount = converted;
    }
    amount = Currency.formatAmount(amount, accountCurrency ?? 2);
    const trimmedLabel = typeof choice.labelOverride === 'string' ? choice.labelOverride.trim() : '';
    const label = trimmedLabel || item.merchant || '';
    const isTransfer = item.type === 'transfer';
    const opId = `_pending_notif_${item.id}`;
    addOptimisticOperation({
      id: opId,
      type: item.type,
      accountId: choice.accountId,
      toAccountId: isTransfer ? (choice.toAccountId ?? null) : null,
      categoryId: isTransfer ? null : (choice.categoryId ?? null),
      amount: String(amount),
      date: item.date || (item.createdAt ? item.createdAt.slice(0, 10) : toDateString(new Date())),
      description: label ? serializeLabels([label]) : null,
    });
    return opId;
  }, [accounts, addOptimisticOperation]);

  // Suggested operations parsed from bank notifications (the same pending queue
  // the settings review panel manages), surfaced as a deck of full binding
  // cards laid over the quick-add form so nothing requires a trip to settings.
  // Accepting is non-blocking: the card leaves the deck at once (revealing the
  // next suggestion or the quick-add form) and the operation lands in the list
  // with an in-flight spinner via the optimistic add/remove pair.
  const {
    suggestions: operationSuggestions,
    saveErrors: suggestionSaveErrors,
    choices: suggestionChoices,
    setChoice: setSuggestionChoice,
    refresh: refreshSuggestions,
    accept: acceptSuggestion,
    dismiss: dismissSuggestion,
  } = usePendingOperationSuggestions({
    onOptimisticAdd: insertOptimisticSuggestion,
    onOptimisticSettle: replaceOptimisticOperation,
    onOptimisticRemove: removeOptimisticOperation,
  });

  const hasSuggestions = operationSuggestions.length > 0;

  // The single source of truth for the clip. Search always wins: it takes the
  // top of the screen, and the form (with any suggestion deck over it) has to be
  // out of the way whether it was pinned or summoned. A deck of pending bank
  // notifications holds the panel open on its own — the cards are laid over the
  // form and clipped with it, and nothing else on this screen announces them, so
  // a collapsed panel would hide the very thing that needs answering.
  const quickAddCollapsed = isSearchOpen
    || (!showQuickAddPanel && !quickAddExpanded && !hasSuggestions);

  // Which input moved decides the motion, so the previous values are kept rather
  // than just the previous collapsed state.
  const quickAddMotionRef = useRef(null);
  useEffect(() => {
    const prev = quickAddMotionRef.current;
    quickAddMotionRef.current = {
      collapsed: quickAddCollapsed,
      search: isSearchOpen,
      setting: showQuickAddPanel,
    };
    // A change that leaves the panel where it is (e.g. the + button pressed with
    // search open) has nothing to play.
    if (prev && prev.collapsed === quickAddCollapsed) return;

    let mode = 'spring';
    if (!prev || prev.setting !== showQuickAddPanel) mode = 'instant';
    else if (prev.search !== isSearchOpen) mode = 'timing';
    applyQuickAddCollapse(quickAddCollapsed, mode);
  }, [quickAddCollapsed, isSearchOpen, showQuickAddPanel, applyQuickAddCollapse]);

  // Measured height of the quick-add wrapper — the binding cards pin their frame
  // to it so the deck reads as cards stacked over the form. Rounded, and only
  // committed on a real change, so onLayout can't ping-pong re-renders.
  const [quickAddHeight, setQuickAddHeight] = useState(0);
  const handleQuickAddLayout = useCallback((event) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setQuickAddHeight((prev) => (prev === measured ? prev : measured));
  }, []);

  // Pull-to-refresh: reload the transactions the list shows AND re-run the
  // notification ingestion pipeline + reload the suggestion stack. Reloading the
  // operations is what a user pulling down on a transaction list expects; the
  // ingestion run only reloads operations on its own when it books/queues
  // something (via RELOAD_ALL), so the explicit reload covers the common
  // "nothing new arrived" case. loadInitialOperations() with no args reloads
  // under the current search/filter (via the actions' internal ref); showLoading
  // is false so the native pull spinner isn't doubled by the list placeholder.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullRefreshMountedRef = useRef(true);
  useEffect(() => () => { pullRefreshMountedRef.current = false; }, []);
  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([loadInitialOperations(undefined, false), refreshSuggestions()]);
    } finally {
      if (pullRefreshMountedRef.current) setPullRefreshing(false);
    }
  }, [loadInitialOperations, refreshSuggestions]);

  const {
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    lastEditedField,
    setLastEditedField,
    rateSource,
    setRateSource,
  } = useMultiCurrencyTransfer(quickAddValues, accounts);

  // Group operations by date into date-group objects for the list.
  // Declared here (not after the unrelated effects below) because several hooks
  // reference it in their dependency arrays; declaring later would put it in
  // the Temporal Dead Zone when those arrays are evaluated during render.
  const groupedOperations = useMemo(() => {
    const sorted = [...operations].sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let currentGroup = null;

    sorted.forEach((operation) => {
      if (!currentGroup || operation.date !== currentGroup.date) {
        currentGroup = {
          type: 'dateGroup',
          id: `group-${operation.date}`,
          date: operation.date,
          spendingSums: {},
          operations: [],
        };
        groups.push(currentGroup);
      }

      currentGroup.operations.push(operation);

      if (operation.type === 'expense') {
        const account = accounts.find(acc => acc.id === operation.accountId);
        if (account) {
          const currency = account.currency || 'USD';
          const amount = parseFloat(operation.amount);
          if (!isNaN(amount)) {
            currentGroup.spendingSums[currency] = (currentGroup.spendingSums[currency] || 0) + amount;
          }
        }
      }
    });

    return groups;
  }, [operations, accounts]);

  // Scroll to date after operations are loaded
  useEffect(() => {
    if (scrollToDateString && !listLoading) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'dateGroup' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Mark that we have a pending scroll
        setPendingScroll(true);
      } else {
        // Date not found (no operations on that date or empty result) — clear scroll target
        scrollScheduledRef.current = false;
        setScrollToDateString(null);
        setPendingScroll(false);
      }
    }
  }, [scrollToDateString, listLoading, groupedOperations]);

  // Handle content size change - this fires after FlatList has laid out content
  // Wait for interactions/layout to finish, then perform a fast, graceful scroll to the target
  const handleContentSizeChange = useCallback((width, height) => {
    // scrollScheduledRef gates re-entrant calls: between the first scheduling and the
    // next React re-render (where pendingScroll becomes false), this callback can fire
    // many times. Without the ref, each firing would queue another idle-callback
    // scroll and cause snap-back whenever the user tries to scroll away.
    if (scrollScheduledRef.current) return;

    if (pendingScroll && scrollToDateString && !listLoading) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'dateGroup' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Synchronously mark as handled before the async scroll so subsequent firings bail out
        scrollScheduledRef.current = true;

        // Defer scroll until the JS thread is idle (after interactions/layout
        // have settled). The timeout guarantees it still fires under load.
        requestIdleCallback(() => {
          try {
            // Use animated: false for instant, graceful jump to distant dates
            flatListRef.current?.scrollToIndex({
              index: separatorIndex,
              animated: false,
              viewPosition: 0,
            });
          } catch (error) {
            // Fallback to estimated offset if scrollToIndex fails
            const estimatedItemHeight = 75;
            const estimatedOffset = separatorIndex * estimatedItemHeight;
            flatListRef.current?.scrollToOffset({
              offset: estimatedOffset,
              animated: false,
            });
          } finally {
            setScrollToDateString(null);
            setPendingScroll(false);
          }
        }, { timeout: 500 });
      } else {
        setScrollToDateString(null);
        setPendingScroll(false);
      }
    }
  }, [pendingScroll, scrollToDateString, listLoading, groupedOperations]);

  // Clear a stale exchange rate when the transfer's currency PAIR changes (e.g.
  // destination switched from a EUR account to an AMD account). The auto-populate
  // effect below only fires when exchangeRate is empty, so without this reset the
  // old pair's rate would be applied to the new pair.
  const ratePairRef = useRef(null);
  useEffect(() => {
    if (!isMultiCurrencyTransfer || !sourceAccount || !destinationAccount) {
      ratePairRef.current = null;
      return;
    }
    const pair = `${sourceAccount.currency}:${destinationAccount.currency}`;
    if (ratePairRef.current && ratePairRef.current !== pair && quickAddValues.exchangeRate) {
      setQuickAddValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
      setLastEditedField(null);
    }
    ratePairRef.current = pair;
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, quickAddValues.exchangeRate]);

  // Auto-populate exchange rate when multi-currency transfer accounts change (async with live rate)
  useEffect(() => {
    if (!isMultiCurrencyTransfer || !sourceAccount || !destinationAccount || quickAddValues.exchangeRate) {
      return;
    }

    let cancelled = false;
    setRateSource('loading');

    Currency.fetchLiveExchangeRate(sourceAccount.currency, destinationAccount.currency)
      .then(({ rate, source }) => {
        if (cancelled) return;
        if (rate) {
          setQuickAddValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource(source === 'live' ? 'live' : 'offline');
      })
      .catch(() => {
        if (cancelled) return;
        const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
        if (rate) {
          setQuickAddValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource('offline');
      });

    return () => { cancelled = true; };
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, quickAddValues.exchangeRate]);

  // Auto-calculate multi-currency fields based on which field was last edited
  useEffect(() => {
    if (!isMultiCurrencyTransfer) {
      // Clear exchange rate fields for same-currency transfers
      if (quickAddValues.exchangeRate || quickAddValues.destinationAmount) {
        setQuickAddValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
        setLastEditedField(null);
      }
      return;
    }

    if (!sourceAccount || !destinationAccount) return;

    // If user edited destination amount, calculate the rate
    if (lastEditedField === 'destinationAmount') {
      if (quickAddValues.amount && quickAddValues.destinationAmount) {
        const sourceAmount = parseFloat(quickAddValues.amount);
        const destAmount = parseFloat(quickAddValues.destinationAmount);

        if (!isNaN(sourceAmount) && !isNaN(destAmount) && sourceAmount > 0) {
          const calculatedRate = (destAmount / sourceAmount).toFixed(6);
          const currentRate = parseFloat(quickAddValues.exchangeRate || '0');
          const newRate = parseFloat(calculatedRate);
          if (Math.abs(currentRate - newRate) > 0.000001) {
            setQuickAddValues(v => ({ ...v, exchangeRate: calculatedRate }));
          }
        }
      }
    }
    // If user edited amount or rate, calculate destination amount.
    // Skip while the amount holds an unevaluated calculator expression ("10+5"):
    // convertAmount would coerce it to 0 and persist destinationAmount "0.00".
    else if (lastEditedField === 'amount' || lastEditedField === 'exchangeRate') {
      if (quickAddValues.amount && quickAddValues.exchangeRate && !hasOperation(quickAddValues.amount)) {
        const converted = Currency.convertAmount(
          quickAddValues.amount,
          sourceAccount.currency,
          destinationAccount.currency,
          quickAddValues.exchangeRate,
        );
        if (converted && converted !== quickAddValues.destinationAmount) {
          setQuickAddValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [isMultiCurrencyTransfer, quickAddValues.amount, quickAddValues.exchangeRate, quickAddValues.destinationAmount, sourceAccount, destinationAccount, lastEditedField]);


  const handleEditOperation = useCallback((operation) => {
    setEditingOperation(operation);
    setIsNew(false);
    setModalVisible(true);
  }, []);

  const handleDeleteOperation = useCallback((operation) => {
    showDialog(
      t('delete_operation'),
      t('delete_operation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => deleteOperation(operation.id),
        },
      ],
    );
  }, [t, showDialog, deleteOperation]);

  // Duplicate an existing operation onto today — a one-tap "log this again" for
  // recurring daily entries. All money-bearing fields (amount, accounts,
  // exchange-rate metadata, exclude-from-average flag) are copied verbatim; only
  // the date is re-stamped to today and location is dropped (a repeat happens
  // here-and-now, so stale coordinates would be misleading). Reuses the same undo
  // affordance as a normal quick-add.
  const handleRepeatOperation = useCallback(async (operation) => {
    const duplicate = buildRepeatedOperation(operation, toDateString(new Date()));

    try {
      const createdOperation = await addOperation(duplicate);
      if (createdOperation?.id) {
        undoTokenRef.current += 1;
        setUndoInfo({ id: createdOperation.id, token: undoTokenRef.current });
      }
    } catch (error) {
      // addOperation already surfaces failures via dialog.
    }
  }, [addOperation]);

  // Long-press on a row lifts it above a blurred backdrop and floats an icon
  // action bar over it (OperationActionMenu). Edit repeats the tap behaviour;
  // Repeat and Delete are the QoL-7 shortcuts. OperationsList hands us the
  // measured row layout plus a static clone to lift.
  const handleLongPressOperation = useCallback((menu) => {
    setActionMenu(menu);
  }, []);

  const closeActionMenu = useCallback(() => setActionMenu(null), []);

  // The menu dismisses itself before running an action (see RowActionMenu), so
  // these only have to act. They read the pressed operation from the menu state
  // this render closed over, which is still the open menu's.
  const handleMenuEdit = useCallback(() => {
    const op = actionMenu?.operation;
    if (op) handleEditOperation(op);
  }, [actionMenu, handleEditOperation]);

  const handleMenuRepeat = useCallback(() => {
    const op = actionMenu?.operation;
    if (op) handleRepeatOperation(op);
  }, [actionMenu, handleRepeatOperation]);

  // Hide an operation from (or return it to) every chart. Applied immediately —
  // there is no form to save afterwards, and for a balance adjustment there is no
  // form at all: its OperationModal is read-only, so this menu is the only way to
  // keep a correction out of the donut and the spending trend.
  const handleMenuToggleCharts = useCallback(async () => {
    const op = actionMenu?.operation;
    if (!op) return;
    // updateOperation surfaces its own failures via dialog (OperationsActionsContext).
    await updateOperation(op.id, { excludeFromCharts: !op.excludeFromCharts });
  }, [actionMenu, updateOperation]);

  const handleMenuDelete = useCallback(() => {
    const op = actionMenu?.operation;
    if (op) handleDeleteOperation(op);
  }, [actionMenu, handleDeleteOperation]);

  const handleDateSeparatorPress = useCallback((dateString) => {
    // Parse the date and set it as the selected date (T00:00:00 anchors the bare
    // YYYY-MM-DD string to local midnight; bare strings parse as UTC and open the
    // picker on the previous day west of Greenwich)
    const date = new Date(`${dateString}T00:00:00`);
    setSelectedDate(date);
    setShowDatePicker(true);
  }, []);

  const handleDatePickerChange = useCallback(async (event, date) => {
    setShowDatePicker(false);
    if (date) {
      const dateString = toDateString(date);

      // Find the index of the date separator for this date in current list
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'dateGroup' && item.date === dateString,
      );

      if (separatorIndex !== -1) {
        // Date is in the current list - scroll to it immediately
        flatListRef.current?.scrollToIndex({
          index: separatorIndex,
          animated: true,
          viewPosition: 0, // Position at the top of the viewport
        });
      } else {
        // Date is not in current list - load from that date to today
        // Set the target date for scrolling after load completes
        scrollScheduledRef.current = false;
        setScrollToDateString(dateString);
        setPendingScroll(true);
        await jumpToDate(dateString);
      }
    }
  }, [groupedOperations, jumpToDate]);

  // Quick add handlers
  const handleQuickAdd = useCallback(async (overrideCategoryId, overrideToAccountId) => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = quickAddValues.amount;

    if (hasOperation(finalAmount)) {
      const evaluated = evaluateExpression(finalAmount, Currency.getDecimalPlaces(sourceAccount?.currency));
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    const operationData = {
      ...quickAddValues,
      amount: finalAmount, // Use the evaluated amount
      // Use override categoryId if provided (for auto-add from category selection)
      categoryId: overrideCategoryId !== undefined ? overrideCategoryId : quickAddValues.categoryId,
      // Use override toAccountId if provided (for auto-add from transfer target shortcuts)
      toAccountId: overrideToAccountId !== undefined ? overrideToAccountId : quickAddValues.toAccountId,
      date: toDateString(new Date()),
    };

    // Determine multi-currency status using effective account IDs (including overrides)
    const effectiveSourceAccount = accounts.find(acc => acc.id === operationData.accountId);
    const effectiveDestAccount = accounts.find(acc => acc.id === operationData.toAccountId);
    const effectiveIsMultiCurrency = operationData.type === 'transfer'
      && effectiveSourceAccount
      && effectiveDestAccount
      && effectiveSourceAccount.currency !== effectiveDestAccount.currency;

    // Add currency information for multi-currency transfers
    if (effectiveIsMultiCurrency) {
      operationData.sourceCurrency = effectiveSourceAccount.currency;
      operationData.destinationCurrency = effectiveDestAccount.currency;
      // Format amounts based on currency decimal places
      operationData.amount = Currency.formatAmount(operationData.amount, effectiveSourceAccount.currency);

      // If no exchange rate set (e.g., quick add via account button), fetch one
      if (!operationData.exchangeRate) {
        try {
          const { rate } = await Currency.fetchLiveExchangeRate(
            effectiveSourceAccount.currency,
            effectiveDestAccount.currency,
          );
          if (rate) {
            operationData.exchangeRate = rate;
          }
        } catch {
          // Fallback to offline rate
          const rate = Currency.getExchangeRate(effectiveSourceAccount.currency, effectiveDestAccount.currency);
          if (rate) {
            operationData.exchangeRate = rate;
          }
        }
      }

      // Calculate destination amount from the (already expression-evaluated) amount.
      // Recompute unless the user explicitly typed the destination amount — the form
      // state may hold a destination derived from a partial expression (e.g. "10+"
      // coerced to "0.00"), which must not be trusted at save time.
      if (operationData.exchangeRate && (!operationData.destinationAmount || lastEditedField !== 'destinationAmount')) {
        const converted = Currency.convertAmount(
          operationData.amount,
          effectiveSourceAccount.currency,
          effectiveDestAccount.currency,
          operationData.exchangeRate,
        );
        if (converted) {
          operationData.destinationAmount = converted;
        }
      }

      if (operationData.destinationAmount) {
        operationData.destinationAmount = Currency.formatAmount(operationData.destinationAmount, effectiveDestAccount.currency);
      }
    } else {
      // Check if this is a foreign currency expense/income
      const opCurrency = operationData.operationCurrency;
      const isForeignCurrencyOp = opCurrency
        && effectiveSourceAccount
        && opCurrency !== effectiveSourceAccount.currency;

      if (isForeignCurrencyOp) {
        const foreignCurrency = opCurrency;
        const homeCurrency = effectiveSourceAccount.currency;
        const foreignAmount = Currency.formatAmount(operationData.amount, foreignCurrency);

        // Fetch live rate with offline fallback
        let rateToUse = null;
        try {
          const { rate } = await Currency.fetchLiveExchangeRate(foreignCurrency, homeCurrency);
          rateToUse = rate;
        } catch {
          // fall through to offline
        }
        if (!rateToUse) {
          const offlineRate = Currency.getExchangeRate(foreignCurrency, homeCurrency);
          if (offlineRate) rateToUse = String(offlineRate);
        }

        if (!rateToUse) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: 'OK' }]);
          return;
        }

        const homeAmount = Currency.convertAmount(foreignAmount, foreignCurrency, homeCurrency, rateToUse);
        if (!homeAmount) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: 'OK' }]);
          return;
        }

        // Store home-currency amount as the account deduction; foreign amount as destinationAmount
        operationData.amount = Currency.formatAmount(homeAmount, homeCurrency);
        operationData.sourceCurrency = foreignCurrency;
        operationData.destinationCurrency = homeCurrency;
        operationData.exchangeRate = rateToUse;
        operationData.destinationAmount = foreignAmount;
      } else if (effectiveSourceAccount) {
        // Format amount for same-currency operations
        operationData.amount = Currency.formatAmount(operationData.amount, effectiveSourceAccount.currency);
      }
    }

    // Strip operationCurrency — not a DB field
    delete operationData.operationCurrency;

    // Attach the current best-effort location when the feature is enabled. The fix
    // was primed as the user began entering; whatever is ready now is used (possibly
    // none), and it never blocks saving.
    const capturedLocation = getQuickAddLocation();
    if (capturedLocation && capturedLocation.latitude != null && capturedLocation.longitude != null) {
      operationData.latitude = capturedLocation.latitude;
      operationData.longitude = capturedLocation.longitude;
    }

    const error = validateOperation(operationData, t);
    if (error) {
      // Prefer the lightweight inline flash over a blocking dialog for the common
      // one-field omissions (zero amount / missing account / missing or duplicate
      // target account / missing category). The order mirrors validateOperation so
      // the flashed field matches the error that would have been shown.
      const flashField = getQuickAddFlashField(operationData);
      if (flashField) {
        quickAddFlashTokenRef.current += 1;
        setQuickAddFlash({ field: flashField, token: quickAddFlashTokenRef.current });
        return;
      }
      showDialog(t('error'), error, [{ text: 'OK' }]);
      return;
    }

    try {
      // Clear any previous suggestion before saving
      setPendingSuggestionId(null);
      setPendingSuggestions([]);

      const createdOperation = await addOperation(operationData);

      // Offer a brief window to undo the just-created operation.
      if (createdOperation?.id) {
        undoTokenRef.current += 1;
        setUndoInfo({ id: createdOperation.id, token: undoTokenRef.current });
      }

      // Save last accessed account
      if (quickAddValues.accountId) {
        setLastAccessedAccount(quickAddValues.accountId);
      }

      // Reset form but keep account and type
      resetForm();
      // The amount is cleared; the next entry starts fresh and re-primes location.
      amountWasEmptyRef.current = true;

      // The summoned form has done its job — fold it away. A no-op when the
      // panel is pinned open by the setting, which is why it is unconditional.
      setQuickAddExpanded(false);

      Keyboard.dismiss();

      // Offer quick label tagging for the freshly-created operation. Suggestions are
      // distinct labels (category-first), minus any already present on the operation.
      const effectiveCategoryId = operationData.categoryId;
      if (createdOperation?.id) {
        const suggestions = await getDistinctLabels(8, effectiveCategoryId || null);
        const existing = parseLabels(createdOperation.description);
        const filtered = suggestions.filter(label => !hasLabel(existing, label));
        if (filtered.length > 0) {
          pendingOpDescRef.current = createdOperation.description || '';
          setPendingSuggestionId(createdOperation.id);
          setPendingSuggestions(filtered);
        }
      }
    } catch (error) {
      // Errors from addOperation are already shown via dialog.
      // Errors from getDistinctLabels are non-critical — suggestion row simply won't appear.
    }
  }, [quickAddValues, validateOperation, addOperation, t, showDialog, accounts, resetForm, lastEditedField, getQuickAddLocation]);

  // Handler for auto-add with category (from picker)
  const handleAutoAddWithCategory = useCallback(async (categoryId) => {
    // Clear form immediately to avoid showing old values during save
    resetForm();
    closePicker();

    // Pass the selected categoryId directly to avoid race conditions
    await handleQuickAdd(categoryId);
  }, [resetForm, closePicker, handleQuickAdd]);

  // Handler for auto-add with target account (from transfer target shortcuts)
  const handleAutoAddWithAccount = useCallback(async (toAccountId) => {
    resetForm();
    closePicker();

    // Pass undefined for categoryId override, pass toAccountId override
    await handleQuickAdd(undefined, toAccountId);
  }, [resetForm, closePicker, handleQuickAdd]);

  // Apply a suggested label by APPENDING it to the operation's existing labels.
  // The row stays open so the user can add several labels in a row; the applied
  // chip is removed from the suggestion list, and the row auto-dismisses once no
  // suggestions remain.
  const handleApplySuggestion = useCallback(async (label) => {
    if (!pendingSuggestionId) return;
    const idToUpdate = pendingSuggestionId;

    // Append against the latest known description from the ref rather than looking
    // the operation up in `operations` — the freshly-created op may not have been
    // re-loaded into that list yet, which previously made the first tap a no-op.
    const merged = serializeLabels(addLabel(parseLabels(pendingOpDescRef.current), label));
    pendingOpDescRef.current = merged;

    // Remove the chip optimistically before the await. If updateOperation fails,
    // its error surfaces via the dialog in OperationsActionsContext; the chip stays
    // dismissed rather than re-appearing, which avoids a confusing retry loop.
    setPendingSuggestions((prev) => {
      const remaining = prev.filter(l => l.toLowerCase() !== label.toLowerCase());
      if (remaining.length === 0) {
        setPendingSuggestionId(null);
      }
      return remaining;
    });

    await updateOperation(idToUpdate, { description: merged });
  }, [pendingSuggestionId, updateOperation]);

  const handleDismissSuggestion = useCallback(() => {
    setPendingSuggestionId(null);
    setPendingSuggestions([]);
  }, []);

  // Undo a just-added operation: delete it and drop any label suggestions that
  // targeted it (otherwise the suggestion row would point at a deleted op).
  const handleUndoAdd = useCallback((operationId) => {
    deleteOperation(operationId);
    setPendingSuggestionId((prev) => {
      if (prev === operationId) {
        setPendingSuggestions([]);
        return null;
      }
      return prev;
    });
  }, [deleteOperation]);

  // `operationId` guards against a stale close: a previous bar finishing its
  // exit fade must not clear the undo state of a newer operation's bar.
  const handleUndoClosed = useCallback((operationId) => {
    setUndoInfo(prev => (prev && operationId != null && prev.id !== operationId) ? prev : null);
  }, []);

  // Fallback cleanup: the snackbar's onClosed is the normal path, but it won't
  // fire if the exit animation drops its completion callback. Without this, a
  // leaked undoInfo would keep offering an undo action for an operation whose
  // window has long since passed.
  useEffect(() => {
    if (!undoInfo) return undefined;
    const timer = setTimeout(() => setUndoInfo(null), UNDO_DURATION_MS + 1500);
    return () => clearTimeout(timer);
  }, [undoInfo]);

  // Keep the suggestion row in sync with the operation's current labels. When the
  // op is (re)loaded, refresh the ref and drop any suggestions already applied —
  // whether via this row or the edit modal — so the row reflects reality and
  // auto-dismisses once nothing is left to add. We intentionally do NOT clear the
  // row merely because the op is absent: right after creation it may not be in
  // `operations` yet, and clearing then would hide the row before the user sees it.
  useEffect(() => {
    if (!pendingSuggestionId) return;
    const op = operations.find(o => o.id === pendingSuggestionId);
    if (!op) return;
    pendingOpDescRef.current = op.description || '';
    const opLabels = parseLabels(op.description);
    setPendingSuggestions((prev) => {
      const remaining = prev.filter(s => !hasLabel(opLabels, s));
      if (remaining.length === prev.length) return prev;
      if (remaining.length === 0) setPendingSuggestionId(null);
      return remaining;
    });
  }, [operations, pendingSuggestionId]);

  const TYPES = useMemo(() => [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ], [t]);

  // Callbacks for multi-currency fields. Normalize a locale decimal comma to a
  // dot — Android decimal-pad keyboards emit "," in many locales, and downstream
  // Decimal parsing coerces comma strings to 0 (silently crediting nothing).
  const handleExchangeRateChange = useCallback((text) => {
    const normalized = text.replace(',', '.');
    setQuickAddValues(v => ({ ...v, exchangeRate: normalized }));
    setLastEditedField('exchangeRate');
    setRateSource('manual');
  }, [setRateSource]);

  const handleDestinationAmountChange = useCallback((text) => {
    const normalized = text.replace(',', '.');
    setQuickAddValues(v => ({ ...v, destinationAmount: normalized }));
    setLastEditedField('destinationAmount');
    setRateSource('manual');
  }, [setRateSource]);

  const handleOperationCurrencyChange = useCallback((currencyCode) => {
    setQuickAddValues(v => ({ ...v, operationCurrency: currencyCode }));
  }, []);

  const handleAmountChange = useCallback((text) => {
    // Kick off a best-effort location fix the moment the user starts entering an
    // amount (empty → non-empty), so it is usually ready — without ever blocking —
    // by the time they tap add.
    if (amountWasEmptyRef.current && text) {
      primeQuickAddLocation();
    }
    amountWasEmptyRef.current = !text;
    setQuickAddValues(v => ({ ...v, amount: text }));
    setLastEditedField('amount');
  }, [primeQuickAddLocation]);

  // Handlers for picker modal selections
  const handleSelectAccount = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, accountId: id }));
  }, []);

  const handleSelectToAccount = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, toAccountId: id }));
  }, []);

  const handleSelectCategory = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, categoryId: id }));
  }, []);

  // Handlers for modal visibility
  const handleCloseOperationModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  // Search handlers
  const handleCloseSearch = useCallback(() => {
    closeSearch(hasActiveSearch);
  }, [closeSearch, hasActiveSearch]);

  const handleToggleFilters = useCallback(() => {
    toggleFilters();
  }, [toggleFilters]);

  const handleClearFilterGroup = useCallback((groupKey) => {
    const clearValues = {
      text: { text: '' },
      types: { types: [] },
      dateRange: { dateRange: { startDate: null, endDate: null } },
      amountRange: { amountRange: { min: null, max: null } },
      accountIds: { accountIds: [] },
      categoryIds: { categoryIds: [] },
      labels: { labels: [] },
    };
    updateSearchFilters(clearValues[groupKey]);
  }, [updateSearchFilters]);

  const handleCollapsedPress = useCallback(() => {
    if (searchMode === 'collapsed') {
      const hasOtherFilters =
        (searchState?.types?.length > 0) ||
        (searchState?.accountIds?.length > 0) ||
        (searchState?.categoryIds?.length > 0) ||
        (searchState?.labels?.length > 0) ||
        !!searchState?.dateRange?.startDate ||
        !!searchState?.dateRange?.endDate ||
        (searchState?.amountRange?.min !== null && searchState?.amountRange?.min !== undefined) ||
        (searchState?.amountRange?.max !== null && searchState?.amountRange?.max !== undefined);
      reopenSearch(searchState?.text !== '', hasOtherFilters, (shouldExpand) => {
        if (shouldExpand !== filtersExpanded) toggleFilters();
      });
    } else {
      openSearch();
    }
  }, [searchMode, searchState, reopenSearch, filtersExpanded, toggleFilters, openSearch]);

  // Back handler for search mode
  useEffect(() => {
    if (!isSearchOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (filtersExpanded) {
        toggleFilters();
      } else {
        handleCloseSearch();
      }
      return true;
    });
    return () => sub.remove();
  }, [isSearchOpen, filtersExpanded, toggleFilters, handleCloseSearch]);

  const quickAddFormComponent = useMemo(() => (
    <>
      <Animated.View
        style={animatedQuickAddClipStyle}
        // A zero-height clip drops touches on Android, but not TalkBack: without
        // this the whole form stays reachable by screen reader while invisible.
        importantForAccessibility={quickAddCollapsed ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.View style={animatedQuickAddSlideStyle} onLayout={handleQuickAddClipLayout}>
          {/* Deck container: the binding cards overlay the quick-add form
              (absolute, sized to the measured wrapper below), with top padding
              for the peeking edges of the cards behind the front one. The
              minHeight reserves room for the floored card frame so a card never
              overhangs this container (an overhang would drop touches on the
              pinned actions on Android). Collapses with the form when search
              opens (same clip). */}
          <View
            style={{
              paddingTop: deckPeekAllowance(operationSuggestions.length),
              minHeight: hasSuggestions && quickAddHeight > 0
                ? deckPeekAllowance(operationSuggestions.length) + deckCardHeight(quickAddHeight)
                : undefined,
            }}
          >
            <View
              onLayout={handleQuickAddLayout}
              importantForAccessibility={hasSuggestions ? 'no-hide-descendants' : 'auto'}
            >
              <QuickAddForm
                colors={colors}
                t={t}
                quickAddValues={quickAddValues}
                setQuickAddValues={setQuickAddValues}
                accounts={visibleAccounts}
                filteredCategories={filteredCategories}
                topCategoriesForType={topCategoriesForType}
                getCategoryInfo={getCategoryInfo}
                getAccountName={getAccountName}
                getAccountBalance={getAccountBalance}
                getCategoryName={getCategoryName}
                openPicker={openPicker}
                handleQuickAdd={handleQuickAdd}
                handleAmountChange={handleAmountChange}
                handleExchangeRateChange={handleExchangeRateChange}
                handleDestinationAmountChange={handleDestinationAmountChange}
                onAutoAddWithCategory={handleAutoAddWithCategory}
                topTransferAccounts={topTransferAccountsForForm}
                onAutoAddWithAccount={handleAutoAddWithAccount}
                TYPES={TYPES}
                rateSource={rateSource}
                onOperationCurrencyChange={handleOperationCurrencyChange}
                foreignRateSource={foreignRateSource}
                foreignExchangeRate={foreignExchangeRate}
                flashError={quickAddFlash}
              />
            </View>
            {hasSuggestions && quickAddHeight > 0 && (
              <NotificationBindingStack
                suggestions={operationSuggestions}
                choices={suggestionChoices}
                saveErrors={suggestionSaveErrors}
                quickAddHeight={quickAddHeight}
                colors={colors}
                t={t}
                accounts={accounts}
                categories={categories}
                onChoiceChange={setSuggestionChoice}
                onSave={acceptSuggestion}
                onDismiss={dismissSuggestion}
              />
            )}
          </View>
        </Animated.View>
      </Animated.View>
      {filtersExpanded && filterPanelHeight > 0 && <View style={{ height: filterPanelHeight }} />}
    </>
  ), [animatedQuickAddClipStyle, animatedQuickAddSlideStyle, handleQuickAddClipLayout, quickAddCollapsed, colors, t, quickAddValues, visibleAccounts, filteredCategories, topCategoriesForType, getCategoryInfo, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, handleAmountChange, handleExchangeRateChange, handleDestinationAmountChange, handleAutoAddWithCategory, topTransferAccountsForForm, handleAutoAddWithAccount, TYPES, rateSource, handleOperationCurrencyChange, foreignRateSource, foreignExchangeRate, filterPanelHeight, filtersExpanded, quickAddFlash, operationSuggestions, hasSuggestions, quickAddHeight, handleQuickAddLayout, accounts, categories, suggestionSaveErrors, suggestionChoices, setSuggestionChoice, acceptSuggestion, dismissSuggestion]);

  // Auto-scroll to top when filter panel closes, but only if the user is still
  // near the top (hasn't scrolled into past dates). The threshold is filterPanelHeight:
  // if the offset is within the spacer region the user was viewing recent entries.
  useEffect(() => {
    const wasExpanded = prevFiltersExpandedRef.current;
    prevFiltersExpandedRef.current = filtersExpanded;

    if (wasExpanded && !filtersExpanded) {
      if (scrollOffsetRef.current <= filterPanelHeight) {
        requestIdleCallback(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, { timeout: 500 });
      }
    }
  }, [filtersExpanded, filterPanelHeight]);

  // Auto-scroll to top when search closes (open → closed/collapsed).
  // The user is returning to the normal view and should land on the QuickAdd form.
  // Deferred via requestAnimationFrame so the scroll runs after the close animation settles.
  useEffect(() => {
    const wasOpen = prevSearchModeRef.current === 'open';
    prevSearchModeRef.current = searchMode;

    if (wasOpen && searchMode !== 'open') {
      // Defer one animation frame so FlatList layout has settled after the
      // React commit, then scroll to the top before the QuickAdd form
      // finishes re-expanding.
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
  }, [searchMode]);

  // Handle scroll event to show/hide scroll-to-top button
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offsetY;
    // Show button when scrolled down past the calculator (roughly 250px)
    setShowScrollToTop(offsetY > 250);
  }, []);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // The undo bar floats over the same bottom-right corner as the + button, and
  // it appears on every add — which, with the panel collapsed, is exactly when
  // the button is on screen. So the button steps up over the bar for as long as
  // it is there and settles back down after, the way a FAB does on Android.
  // Measured rather than assumed: the bar's height follows the text it holds.
  // Seeded with the bar's usual single-line height rather than 0: the first add
  // of a session shows the bar and measures it in the same frame, and a 0 here
  // would compute "no overlap" and leave the button sitting on the bar until
  // onLayout arrived.
  const [undoAreaHeight, setUndoAreaHeight] = useState(HEIGHTS.listItem);
  const handleUndoAreaLayout = useCallback((event) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setUndoAreaHeight((prev) => (prev === measured ? prev : measured));
  }, []);
  const fabLift = useSharedValue(0);
  useEffect(() => {
    const barTop = insets.bottom + HEIGHTS.tabBar + undoAreaHeight + SPACING.sm;
    const overlap = undoInfo ? Math.max(0, barTop - FAB_BOTTOM_OFFSET) : 0;
    fabLift.value = withSpring(-overlap, SPRING_SETTLE);
  }, [undoInfo, undoAreaHeight, insets.bottom, fabLift]);
  const animatedFabStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fabLift.value }],
  }));

  // The + button, shown only while the panel setting is off. Opening also brings
  // the list back to the top: the form is the list's header, so summoning it
  // from halfway down a month of operations would otherwise open it off-screen.
  const handleToggleQuickAddPanel = useCallback(() => {
    if (quickAddExpanded) {
      Keyboard.dismiss();
      setQuickAddExpanded(false);
      return;
    }
    scrollToTop();
    setQuickAddExpanded(true);
  }, [quickAddExpanded, scrollToTop]);

  // A tapped "transactions to review" notification lands here (SimpleTabs switches
  // to this tab on the same event): put the suggestion deck in front of the user
  // instead of sending them to settings. Search is closed first — the quick-add
  // block, and the deck laid over it, is collapsed while search is open — and its
  // close effect already scrolls the list to the top, so only the non-search case
  // scrolls here. The queue is refreshed so a notification that arrived while the
  // app was backgrounded is ingested rather than showing a stale (or empty) deck.
  const handleOpenPendingSuggestions = useCallback(() => {
    if (isSearchOpen) handleCloseSearch();
    else scrollToTop();
    // The deck is laid over the quick-add form, so a collapsed panel would swallow
    // the very cards this event exists to show. No-op when the panel is pinned.
    setQuickAddExpanded(true);
    refreshSuggestions();
  }, [isSearchOpen, handleCloseSearch, scrollToTop, refreshSuggestions]);

  useEffect(
    () => appEvents.on(EVENTS.OPEN_PENDING_OPERATIONS, handleOpenPendingSuggestions),
    [handleOpenPendingSuggestions],
  );

  // Safety net for scrollToIndex failures. The list now provides getItemLayout,
  // so scrollToLocation resolves offsets directly and this should not fire in
  // practice. If it ever does, jump straight to an estimated offset — no retry,
  // no timeout dance (RN supplies averageItemLength from its measured cells).
  const handleScrollToIndexFailed = useCallback((info) => {
    const averageItemHeight = info?.averageItemLength || HEIGHTS.listItem;
    flatListRef.current?.scrollToOffset({
      offset: averageItemHeight * (info?.index || 0),
      animated: false,
    });
  }, []);

  const handleSearchBarAreaLayout = useCallback((event) => {
    setSearchBarAreaHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OperationsList
        ref={flatListRef}
        topInset={searchBarAreaHeight}
        groupedOperations={groupedOperations}
        accounts={accounts}
        categories={categories}
        colors={colors}
        t={t}
        initialLoading={operationsLoading}
        referenceDataLoading={referenceDataLoading}
        loadingMore={loadingMore}
        hasMoreOperations={hasMoreOperations}
        onLoadMore={loadMoreOperations}
        onEditOperation={handleEditOperation}
        onLongPressOperation={handleLongPressOperation}
        onDateSeparatorPress={handleDateSeparatorPress}
        onScroll={handleScroll}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onContentSizeChange={handleContentSizeChange}
        refreshing={pullRefreshing}
        onRefresh={handlePullRefresh}
        headerComponent={quickAddFormComponent}
        pendingSuggestionId={pendingSuggestionId}
        pendingSuggestions={pendingSuggestions}
        onApplySuggestion={handleApplySuggestion}
        onDismissSuggestion={handleDismissSuggestion}
      />

      {/* Floating undo snackbar — pinned above the tab bar, OUTSIDE the list, so
          virtualization / removeClippedSubviews can't clip it (see UndoSnackbar
          docblock and PENNY-16). The token key restarts its countdown whenever a
          newer operation replaces the one being offered for undo. */}
      {undoInfo && (
        <View
          style={[styles.floatingUndoArea, { bottom: insets.bottom + HEIGHTS.tabBar }]}
          pointerEvents="box-none"
          onLayout={handleUndoAreaLayout}
        >
          <UndoSnackbar
            key={undoInfo.token}
            operationId={undoInfo.id}
            message={t('operation_added')}
            actionLabel={t('undo')}
            colors={colors}
            onUndo={handleUndoAdd}
            onClosed={handleUndoClosed}
          />
        </View>
      )}

      {/* Floating search area — overlays the list so its content scrolls behind
          it instead of being clipped by an opaque band. The matching topInset on
          the list above keeps content from starting underneath the pill. */}
      <View
        style={styles.floatingSearchArea}
        onLayout={handleSearchBarAreaLayout}
        pointerEvents="box-none"
      >
        <SearchBar
          searchText={searchState?.text || ''}
          onSearchTextChange={setSearchText}
          onToggleFilters={handleToggleFilters}
          onClose={handleCloseSearch}
          filterCount={getSearchFilterCount ? getSearchFilterCount() : 0}
          colors={colors}
          t={t}
          collapsed={!isSearchOpen}
          onCollapsedPress={handleCollapsedPress}
        />
        {isSearchOpen && hasActiveSearch && (
          <FilterChipStrip
            searchState={searchState}
            onClearGroup={handleClearFilterGroup}
            colors={colors}
            t={t}
          />
        )}
      </View>

      {/* Picker Modal for Account/Category selection */}
      <PickerModal
        visible={pickerState.visible}
        pickerType={pickerState.type}
        pickerData={pickerState.data}
        colors={colors}
        t={t}
        onClose={closePicker}
        onSelectAccount={handleSelectAccount}
        onSelectToAccount={handleSelectToAccount}
        categoryType={quickAddValues.type === 'income' ? 'income' : 'expense'}
        quickAddValues={quickAddValues}
        onSelectCategory={handleSelectCategory}
        onAutoAddWithCategory={handleAutoAddWithCategory}
        onAutoAddWithAccount={handleAutoAddWithAccount}
      />

      {/* Long-press quick-action menu for a single operation row */}
      <OperationActionMenu
        menu={actionMenu}
        colors={colors}
        t={t}
        onClose={closeActionMenu}
        onEdit={handleMenuEdit}
        onRepeat={handleMenuRepeat}
        onToggleCharts={handleMenuToggleCharts}
        onDelete={handleMenuDelete}
      />

      {/* Scroll to Top Button - only show when scrolled down */}
      {showScrollToTop && !listLoading && (
        <TouchableOpacity
          style={[
            styles.scrollToTopButton,
            {
              top: searchBarAreaHeight + SPACING.sm,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
          accessibilityHint="Scroll to the top of the list"
        >
          <Icon name="chevron-up" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      {/* Summon/dismiss the quick-add form. Only exists while the panel setting
          is off — with the panel pinned there is nothing for it to do — and it
          steps aside while search or a suggestion deck owns the panel (the deck
          covers the form even when the panel is pinned open, so there is nothing
          to summon underneath it). The icon states what the next tap does rather
          than what the button is. */}
      {!showQuickAddPanel && !isSearchOpen && !hasSuggestions && (
        // The wrapper is what lifts: translating a full-bleed, touch-transparent
        // layer moves the button inside it without disturbing anything else.
        <Animated.View style={[StyleSheet.absoluteFill, animatedFabStyle]} pointerEvents="box-none">
          <AddFAB
            testID="quick-add-fab"
            icon={quickAddExpanded ? 'close' : 'plus'}
            onPress={handleToggleQuickAddPanel}
            accessibilityLabel={quickAddExpanded ? (t('close') || 'Close') : (t('add_operation') || 'Add Operation')}
            accessibilityHint={quickAddExpanded ? undefined : (t('add_operation_hint') || undefined)}
          />
        </Animated.View>
      )}

      <OperationModal
        visible={modalVisible}
        onClose={handleCloseOperationModal}
        operation={editingOperation}
        isNew={isNew}
        onDelete={handleDeleteOperation}
      />

      {/* Date Picker for jumping to a specific date */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDatePickerChange}
        />
      )}

      {/* Search Overlay - renders filters when search is open */}
      <SearchOverlay
        visible={searchMode === 'open'}
        onHeightChange={setFilterPanelHeight}
        topOffset={searchBarAreaHeight}
        colors={colors}
        t={t}
        onClose={handleCloseSearch}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingSearchArea: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  floatingUndoArea: {
    // `bottom` is applied inline (safe-area inset + tab bar height) so the
    // snackbar floats just above the floating tab bar instead of behind it.
    left: SPACING.lg,
    position: 'absolute',
    right: SPACING.lg,
    zIndex: 90,
  },
  scrollToTopButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg + 8,
    borderWidth: 1,
    elevation: 8,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 40,
    zIndex: 10,
  },
});

export default OperationsScreen;
