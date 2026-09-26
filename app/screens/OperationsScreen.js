import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, TextInput, Pressable, Modal, Keyboard, BackHandler, AppState, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS, HEIGHTS, Z_INDEX } from '../styles/designTokens';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useTabFocused } from '../contexts/TabFocusContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import { getDistinctLabels, getOperationById } from '../services/OperationsDB';
import { parseLabels, serializeLabels, addLabel, hasLabel } from '../utils/labelUtils';
import { buildRepeatedOperation } from '../utils/operationUtils';
import { getDriveBackupStatusLabel } from '../utils/driveBackupStatus';
import OperationModal from '../modals/OperationModal';
import Calculator from '../components/Calculator';
import ListCard from '../components/ListCard';
import OperationsList from '../components/operations/OperationsList';
import OperationActionMenu from '../components/operations/OperationActionMenu';
import QuickAddForm from '../components/operations/QuickAddForm';
import QuickAddRateSync from '../components/operations/QuickAddRateSync';
import NotificationBindingStack from '../components/operations/NotificationBindingStack';
import PickerModal from '../components/operations/PickerModal';
import UndoSnackbar, { UNDO_DURATION_MS } from '../components/operations/UndoSnackbar';
import { SUGGESTION_TIMEOUT_MS } from '../components/operations/DescriptionSuggestionRow';
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
import useOnForeground from '../hooks/useOnForeground';
import { useSearch } from '../contexts/SearchContext';
import { useDriveBackup } from '../contexts/DriveBackupContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { TIMING_ENTER, TIMING_EXIT, DURATION_ENTER, DURATION_EXIT, SPRING_SETTLE, recommitSharedValue } from '../utils/motion';
import AddFAB, { FAB_BOTTOM_OFFSET } from '../components/AddFAB';

// Note: dynamic createStyles removed to keep linting stable.

// Ceiling for the quick-add clip, not a size: at rest the clip must not
// constrain the form, because the form's height changes underneath it (transfer
// fields appear, a suggestion deck stacks over it) and pinning it to whatever it
// measured last would slice those off. The collapse animation never travels from
// here — it starts at the block's measured height (see the searchMode effect).
//
// Exported so a test can tell an open clip from a collapsed one by the value the
// shared value holds, rather than by repeating the number.
export const QUICK_ADD_UNCLIPPED = 1000;

// How long after a deck arrives its landing is inspected — long enough for the
// clip, the card entrance and the layout pass that measures them to settle.
const DECK_SETTLE_MS = 600;

// The diagnostic log is a 500-entry ring buffer (LogService's MAX_ENTRIES), and
// the quick-add wrapper is the noisiest thing on this screen: a LayoutAnimation
// walks it down a pixel per frame (450, 449, 448 …) and every step used to take
// a line. The 2026-09-18 export spent 180 of its 500 entries on those frames and
// had evicted the deck's arrival — the only part of the file anyone needed to
// read — before it was ever uploaded. So a run of layout passes takes two lines
// whatever distance it covers: the pass that starts it, and the value it settles
// on once it has stopped moving. A move below the epsilon does not even start a
// line of its own — measured against the last LOGGED height, so a frame-by-frame
// walk cannot accumulate its way into one line per 8dp travelled.
const LAYOUT_LOG_EPSILON = 8;
const LAYOUT_SETTLE_LOG_MS = 250;

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

  const { t, language } = useLocalization();
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
  // Gated on the array still being EMPTY, not on `loading` alone. Both providers
  // now route background reloads (RELOAD_ALL after an import, a language switch)
  // through a separate flag precisely because those keep the previously loaded
  // data on hand — but the length check is what makes this gate say "there is
  // nothing to render yet" rather than "a fetch is in flight", so it stays.
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
  // Whether the operation form should come up with its category picker already
  // open. Only the "Change category" notification button sets it (see
  // handleOpenOperationCategory); every other way into the form opens the form.
  const [openCategoryPicker, setOpenCategoryPicker] = useState(false);
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
  // Undo bar for the last reversible action — a just-added operation or a
  // just-deleted one. `token` bumps on every action so the snackbar remounts
  // (restarting its countdown/animation) when actions land back-to-back within
  // the 5-second window.
  const [undoInfo, setUndoInfo] = useState(null); // null | { kind: 'add' | 'delete', id, token }
  const undoTokenRef = useRef(0);
  // Operations hidden from the list because a delete is in flight for them. An
  // id goes in the moment Delete is tapped and comes out either on Undo (the
  // row returns untouched) or once the committed delete has actually dropped it
  // from `operations` — never in between, or the row would flash back for the
  // frames between commit and reload.
  const [hiddenOperationIds, setHiddenOperationIds] = useState(() => new Set());
  // The single id whose deletion is still deferred (its undo window is open).
  // A ref, not state: the commit path has to read it synchronously from an
  // unmount cleanup and from a second delete landing in the same frame.
  const pendingDeleteRef = useRef(null);
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
  // True while a quick-add save is in flight. The ref is the actual guard (it flips
  // synchronously, so two taps in the same frame cannot both get through); the state
  // only drives the button's disabled/busy appearance.
  const quickAddSavingRef = useRef(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const { searchMode, filtersExpanded, openSearch, closeSearch, reopenSearch, toggleFilters } = useSearch();
  const isSearchOpen = searchMode === 'open';

  // The Drive backup reports itself through the resting search pill rather than a
  // second bar floating above it: two stacked pills at the top of the screen for
  // something that happens once a day was one pill too many, and the pill is idle
  // exactly when the backup has something to say.
  //
  // The pill is also the only way into search, so the cancel button hands it back
  // the moment it is tapped rather than holding it through a "Cancelling…" that
  // can outlast a multi-megabyte upload: the service only notices a cancel
  // between files, and nothing gives a stalled Drive request a deadline. The run
  // unwinds on its own, and the settings panel is where its dying breath is
  // reported.
  const {
    isRunning: driveBackupRunning,
    progress: driveBackupProgress,
    cancelling: driveBackupCancelling,
    cancelBackup: cancelDriveBackup,
  } = useDriveBackup();
  const driveBackupLabel = useMemo(
    () => (driveBackupRunning && !driveBackupCancelling
      ? getDriveBackupStatusLabel(driveBackupProgress, t)
      : null),
    [driveBackupRunning, driveBackupCancelling, driveBackupProgress, t],
  );
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
    const measured = Math.round(event.nativeEvent.layout.height);
    // A zero from an OPEN block is never the truth, for the same reason it is
    // not on the wrapper below (see handleQuickAddLayout): the form is always
    // laid out there, so a 0 is a transient pass — a card-leave LayoutAnimation
    // reports several in a row. Keeping it poisoned this ref, which is how the
    // 2026-09-18 log came to report `slide: 0` on a block that measured 444 a
    // frame later, and left every collapse animating from the fallback height
    // instead of from the height the eye can see. A deck now holds the block
    // collapsed rather than open, so its card-leave zeros arrive on exactly that
    // path — hence the second half of the test, matching the wrapper's guard.
    if (measured === 0
      && (!quickAddCollapsedRef.current || suggestionsCountRef.current > 0)) return;
    quickAddClipHeightRef.current = measured;
  }, []);

  // Read by the layout handler below, which must not be re-created on every
  // collapse (its identity is a dep of the memoized header).
  const quickAddCollapsedRef = useRef(true);
  // Whether the run of zero-height layout passes currently being dropped has
  // already been logged.
  const droppedZeroRef = useRef(false);
  // Mirror of the height state, so the handler can report the height it kept.
  const quickAddHeightRef = useRef(0);
  // The frame the deck container actually got. `clipHeight` says the block was
  // open; this says the cards inside it had somewhere to draw.
  const deckHostHeightRef = useRef(0);
  const deckHostRef = useRef(null);
  const handleDeckHostLayout = useCallback((event) => {
    deckHostHeightRef.current = Math.round(event.nativeEvent.layout.height);
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
    // The deck used to reserve a frame in here as well, so the clip had to open
    // to at least that or the cards sat clipped inside it. They are no longer in
    // the clip, so this is the form's own height and nothing else.
    const measured = quickAddClipHeightRef.current || QUICK_ADD_UNCLIPPED;
    // The slide's travel: exactly the block's own height, so the content clears
    // the boundary as the boundary closes. Before the first layout there is no
    // height to travel — the clip alone hides it, and the first expansion then
    // reads as an uncover rather than as a slide from far above the screen.
    const slide = quickAddClipHeightRef.current || 0;
    console.log('[deck] clip', { collapsed, mode, measured, slide });

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

  // Put the clip's current geometry back on the screen, without moving it.
  //
  // applyQuickAddCollapse only runs on a CHANGE of the collapsed state, and a
  // change written while the app is in the background never reaches the view
  // (see recommitSharedValue): the value is right, the pixels are the ones from
  // before the app was paused. That is a deck's normal arrival — a bank
  // notification queues a suggestion while the user is away, the block opens for
  // it behind a stopped activity, and when the tapped alert brings the app
  // forward the panel is still collapsed. Nothing repairs it on its own either:
  // the deck holds `quickAddCollapsed` false on its own, so the deep link's
  // setQuickAddExpanded(true) changes nothing and the motion effect has nothing
  // to play. On 2026-09-12 that left the review deck invisible (with the +
  // button already stood down for it) until the user opened and closed search.
  //
  // So the two moments where this screen comes back into view re-commit what
  // they find: the return to the foreground, and the deep link itself.
  const reassertQuickAddClip = useCallback((reason) => {
    const collapsed = quickAddCollapsedRef.current;
    const slide = quickAddClipHeightRef.current || 0;
    console.log('[deck] clip re-assert', { reason, collapsed, slide });
    // Open re-commits the ceiling rather than the measured height, which is
    // where an uninterrupted open animation hands it back anyway.
    recommitSharedValue(quickAddMaxHeight, collapsed ? 0 : QUICK_ADD_UNCLIPPED);
    recommitSharedValue(quickAddTranslateY, collapsed ? -slide : 0);
  }, [quickAddMaxHeight, quickAddTranslateY]);

  useOnForeground(useCallback(() => {
    reassertQuickAddClip('foreground');
  }, [reassertQuickAddClip]));

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
    // Structural fields only (type / accounts / category / currency). The typed
    // fields live in quickAddValuesStore so a keystroke does not re-render this
    // screen — see useQuickAddValuesStore.
    quickAddValues,
    quickAddValuesStore,
    setQuickAddValues,
    getAccountName,
    getAccountBalance,
    getCategoryInfo,
    getCategoryName,
    filteredCategories,
    topCategoriesForType,
    topTransferAccountsForForm,
    resetForm,
    clearDate: clearQuickAddDate,
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
  //
  // A deck now REPLACES the form rather than being laid over it: the cards are
  // rendered outside this clip, so leaving the form open underneath them would
  // stack two blocks down the page instead of one. The form comes back when the
  // queue empties.
  const quickAddCollapsed = isSearchOpen
    || hasSuggestions
    || (!showQuickAddPanel && !quickAddExpanded);
  // Whether the review deck is on screen. It is rendered OUTSIDE the quick-add
  // clip (see the JSX below), which is the whole point of this flag.
  //
  // Six repairs were made inside that clip, and the 2026-09-20 export finally
  // says why every one of them was unreachable. At each arrival the log carries
  // the same impossible pair: `clipHeight: 0` next to `deckHostHeight: 444` —
  // the clip's content view measuring nothing while its own child measures the
  // full card frame. That is a shut clip with its content overflowing it
  // invisibly, and `measureInWindow` cannot see it, which is why the rect the
  // previous round added reported a perfectly healthy 444 at y=46 on a screen
  // showing no cards at all.
  //
  // Nothing React renders can reopen that clip. `useAnimatedStyle` hands React
  // an opaque object, so React never renders a literal `maxHeight` — Reanimated
  // writes that prop into the shadow tree itself. A static style with no
  // `maxHeight` therefore diffs to no change at all, and the `maxHeight: 0`
  // Reanimated left behind (written while the activity was stopped, with no
  // frame to commit into) stays on the view. Only Reanimated can clear it, which
  // is exactly what opening and closing search does, and why that stayed the
  // only cure through six attempts.
  //
  // So the cards stop living in the clip. Their container is a plain View, a
  // sibling of the clip rather than a child, sized by the front card's content,
  // and no shared value, ceiling, transform or overflow stands between them and
  // the screen.
  const deckUp = hasSuggestions && !isSearchOpen;
  // Mirrors for the layout handler and the diagnostic snapshot, which both run
  // outside a render and must read the block as it stands, not as it stood when
  // their callback was created.
  quickAddCollapsedRef.current = quickAddCollapsed;
  const suggestionsCountRef = useRef(0);
  suggestionsCountRef.current = operationSuggestions.length;

  // The quick-add date chip is sticky *within a sitting*: back-filling yesterday
  // is rarely one entry, so the chosen day survives an add (see `resetForm`).
  // What it must not survive is the user leaving the form — a "Yesterday" still
  // armed on the next visit would silently mis-date an entry, and after a night
  // in the background it would mis-date it by two days.
  //
  // Each way of leaving clears at its own source rather than through the derived
  // `quickAddCollapsed`: that flag is also raised by the summoned form folding
  // itself away after every add, which is the one collapse that must NOT end the
  // sitting (it is what back-filling six entries looks like). The sources are
  // search taking the screen, another tab taking it (here), the app going to the
  // background (below) and the + button dismissing the form
  // (`handleToggleQuickAddPanel`).
  const operationsTabFocused = useTabFocused('Operations');
  useEffect(() => {
    if (operationsTabFocused && !isSearchOpen) return;
    clearQuickAddDate();
  }, [operationsTabFocused, isSearchOpen, clearQuickAddDate]);

  const clearQuickAddDateRef = useRef(clearQuickAddDate);
  useEffect(() => { clearQuickAddDateRef.current = clearQuickAddDate; });
  const loggedAppStateRef = useRef(null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // The transition itself, so a deck that filled behind a stopped activity
      // can be told from one that arrived in front of the user. That is the case
      // every repair so far has been aimed at, and no export has ever carried
      // the transition next to the arrival. Deduped: Android re-announces the
      // state it is already in, and two lines per app switch is the whole budget
      // this is worth.
      if (loggedAppStateRef.current !== nextState) {
        loggedAppStateRef.current = nextState;
        console.log('[deck] appstate', { to: nextState, suggestions: suggestionsCountRef.current });
      }
      if (nextState === 'background' || nextState === 'inactive') clearQuickAddDateRef.current();
    });
    // A stubbed AppState (unit environments) hands back nothing to remove.
    return () => subscription?.remove?.();
  }, []);

  // Measured height of the quick-add wrapper — the binding cards never get
  // shorter than it, so the list does not jump when the deck gives way to the
  // form. Rounded, and only committed on a real change, so onLayout can't
  // ping-pong re-renders. The deck does not wait for it: a panel collapsed behind
  // the + button has no reason to have been measured yet, and the cards size to
  // their own content regardless (deckCardMinHeight is only their floor).
  const [quickAddHeight, setQuickAddHeight] = useState(0);
  const loggedQuickAddHeightRef = useRef(null);
  const quickAddHeightLogTimerRef = useRef(null);
  useEffect(() => () => {
    if (quickAddHeightLogTimerRef.current) clearTimeout(quickAddHeightLogTimerRef.current);
  }, []);
  const handleQuickAddLayout = useCallback((event) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    // A zero from an *open* block is never the truth: the form is always there,
    // so 0 means a transient pass — the card-leave LayoutAnimation reports one
    // every time a suggestion is accepted. Keeping it dropped the cards' minimum
    // to the MIN_CARD_HEIGHT floor, so a card shorter than the form shrank for a
    // frame and jumped back once the form measured again. While the block is
    // collapsed 0 *is* the truth (nothing is laid out behind the + button), and
    // the deck floors its minimum for exactly that case — except while a deck is
    // UP, because a deck now collapses the form itself and the cards take their
    // minimum from the height it last had. Reading that collapse as "the form is
    // 0 tall" would drop every card's minimum to the floor the moment it appeared.
    if (measured === 0 && (!quickAddCollapsedRef.current || suggestionsCountRef.current > 0)) {
      // Once per run of them: a LayoutAnimation reports several zero passes in a
      // row, and this handler runs on every frame of one.
      if (!droppedZeroRef.current) {
        droppedZeroRef.current = true;
        console.log('[deck] quick-add measured 0 while open, keeping', { height: quickAddHeightRef.current });
      }
      return;
    }
    droppedZeroRef.current = false;
    quickAddHeightRef.current = measured;
    // The pass that starts a run, then the value it settles on — not the 180
    // frames between them (see LAYOUT_LOG_EPSILON). A pending settle timer is
    // what says a run is still going: while one is armed nothing is logged at
    // once, however far the run travels, so a 450 → 300 collapse cannot spend a
    // line per 8dp of it.
    const lastLogged = loggedQuickAddHeightRef.current;
    const runInFlight = quickAddHeightLogTimerRef.current !== null;
    if (!runInFlight
      && (lastLogged === null || Math.abs(measured - lastLogged) >= LAYOUT_LOG_EPSILON)) {
      loggedQuickAddHeightRef.current = measured;
      console.log('[deck] quick-add measured', { height: measured });
    }
    if (measured !== loggedQuickAddHeightRef.current) {
      if (quickAddHeightLogTimerRef.current) clearTimeout(quickAddHeightLogTimerRef.current);
      quickAddHeightLogTimerRef.current = setTimeout(() => {
        quickAddHeightLogTimerRef.current = null;
        const settled = quickAddHeightRef.current;
        if (settled === loggedQuickAddHeightRef.current) return;
        loggedQuickAddHeightRef.current = settled;
        console.log('[deck] quick-add settled', { height: settled });
      }, LAYOUT_SETTLE_LOG_MS);
    }
    setQuickAddHeight((prev) => (prev === measured ? prev : measured));
  }, []);
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
    // search open, or a deck landing on a block already open or opening) has
    // nothing to play.
    if (prev && prev.collapsed === quickAddCollapsed) return;

    let mode = 'spring';
    if (!prev || prev.setting !== showQuickAddPanel) mode = 'instant';
    else if (prev.search !== isSearchOpen) mode = 'timing';
    // A deck arriving now CLOSES this block rather than opening it — the cards
    // took the panel's place instead of being laid over the form inside it — so
    // a queue landing is a plain collapse and the deck's own entrance is the
    // only motion the arrival plays.
    else if (hasSuggestions) mode = 'instant';
    applyQuickAddCollapse(quickAddCollapsed, mode);
  }, [quickAddCollapsed, isSearchOpen, showQuickAddPanel, hasSuggestions, applyQuickAddCollapse]);

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
      await Promise.all([loadInitialOperations(undefined, false), refreshSuggestions('pull')]);
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
    // Rows whose delete is in flight are dropped here rather than at the list:
    // the day's spending sums are accumulated in this same pass, so filtering
    // further down would leave a deleted row's amount in the header total.
    const visible = hiddenOperationIds.size === 0
      ? operations
      : operations.filter(operation => !hiddenOperationIds.has(operation.id));
    const sorted = [...visible].sort((a, b) => new Date(b.date) - new Date(a.date));
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
          // Summed with decimal.js, not `+` on floats: a day of 0.1 + 0.2 rows
          // is exactly the case the repo uses Currency for everywhere else, and
          // this total is printed beside the rows it adds up. Kept as a string
          // for the same reason.
          //
          // No currency argument: that rounds to the currency's precision on
          // EVERY addition, so three ₽100.50 rows (a 0-decimal currency, which
          // a CSV/JSON restore can still carry fractional amounts for) would
          // total ₽303 instead of ₽302. Accumulate exact, round once at
          // display, as OperationsDB does.
          if (!isNaN(parseFloat(operation.amount))) {
            currentGroup.spendingSums[currency] = Currency.add(
              currentGroup.spendingSums[currency] || '0',
              operation.amount,
            );
          }
        }
      }
    });

    return groups;
  }, [operations, accounts, hiddenOperationIds]);

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

  // The three effects that keep a cross-currency transfer's rate and destination
  // amount in step with the typed amount now live in <QuickAddRateSync />, a
  // headless component mounted inside the quick-add subtree. They depended on
  // the typed fields, so keeping them here made every keystroke re-render this
  // whole screen.

  const handleEditOperation = useCallback((operation) => {
    setEditingOperation(operation);
    setIsNew(false);
    setOpenCategoryPicker(false);
    setModalVisible(true);
  }, []);

  // Drop any label suggestions aimed at an operation that is going away, so the
  // suggestion row never points at a row the user can no longer see.
  const dropSuggestionsFor = useCallback((operationId) => {
    setPendingSuggestionId((prev) => {
      if (prev === operationId) {
        setPendingSuggestions([]);
        return null;
      }
      return prev;
    });
  }, []);

  const unhideOperation = useCallback((operationId) => {
    setHiddenOperationIds((prev) => {
      if (!prev.has(operationId)) return prev;
      const next = new Set(prev);
      next.delete(operationId);
      return next;
    });
  }, []);

  // Run the deferred delete for real. Every path that closes an undo window
  // funnels through here, and the ref flips before the call so a timeout racing
  // an unmount (or a second delete) can only commit once.
  const commitPendingDelete = useCallback(() => {
    const id = pendingDeleteRef.current;
    if (!id) return;
    pendingDeleteRef.current = null;
    // The id deliberately stays in `hiddenOperationIds` until the delete lands
    // and drops it from `operations`; clearing it here would flash the row back
    // for the frames between the two.
    dropSuggestionsFor(id);
    // deleteOperation reports its own failures via dialog and then rethrows, so
    // catch here: an uncaught rejection from this fire-and-forget call would be
    // noise, and a row that is still in the ledger has to become visible again.
    Promise.resolve(deleteOperation(id)).catch(() => unhideOperation(id));
  }, [deleteOperation, dropSuggestionsFor, unhideOperation]);

  // A single bar serves every undoable action, so raising a new one closes the
  // previous one's window — a deferred delete losing its bar must be committed
  // here, not silently dropped.
  const showUndo = useCallback((kind, id) => {
    commitPendingDelete();
    undoTokenRef.current += 1;
    setUndoInfo({ kind, id, token: undoTokenRef.current });
  }, [commitPendingDelete]);

  // Delete is optimistic: the row leaves the list at once and the real delete
  // waits out the undo window, so the common case costs one tap instead of a
  // blocking confirmation. Nothing has touched the database yet, which is why
  // Undo restores the row, the balance and the balance-history point exactly.
  const handleDeleteOperation = useCallback((operation) => {
    const id = operation?.id;
    if (!id) return;
    // Commits any delete still pending (showUndo) before this one takes the bar.
    showUndo('delete', id);
    pendingDeleteRef.current = id;
    setHiddenOperationIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [showUndo]);

  // Undo a deferred delete: the operation was never touched, so un-hiding the
  // row is the whole restore — balance and balance-history point included.
  const handleUndoDelete = useCallback((operationId) => {
    if (pendingDeleteRef.current === operationId) pendingDeleteRef.current = null;
    unhideOperation(operationId);
  }, [unhideOperation]);

  // Stop hiding ids the committed delete has actually removed from `operations`.
  // The pending id is exempt: it is still in the list on purpose.
  useEffect(() => {
    setHiddenOperationIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set();
      prev.forEach((id) => {
        if (id === pendingDeleteRef.current || operations.some(op => op.id === id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [operations]);

  // Close the window for good: commit whatever delete was deferred and retire the
  // bar. The token bump invalidates the outgoing bar's pending `onClosed` so it
  // cannot reopen or re-commit anything.
  const endUndoWindow = useCallback(() => {
    commitPendingDelete();
    undoTokenRef.current += 1;
    setUndoInfo(null);
  }, [commitPendingDelete]);

  // The undo window does not outlive the app being put away. SimpleTabs keeps
  // this screen mounted for the whole session, so backgrounding — not unmounting
  // — is what normally ends it, and Android freezes JS timers on pause: a bar
  // left standing would return still counting down, with an Undo that silently
  // does nothing (the delete is committed) or, for an add, deletes an operation
  // the user logged minutes ago. So commit and dismiss on the way out. The ref
  // keeps the subscription mount-scoped instead of re-subscribing on every
  // deleteOperation identity.
  const endUndoWindowRef = useRef(endUndoWindow);
  useEffect(() => { endUndoWindowRef.current = endUndoWindow; });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') endUndoWindowRef.current();
    });
    return () => {
      // A stubbed AppState (unit environments) hands back nothing to remove.
      subscription?.remove?.();
      endUndoWindowRef.current();
    };
  }, []);

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
        showUndo('add', createdOperation.id);
      }
    } catch (error) {
      // addOperation already surfaces failures via dialog.
    }
  }, [addOperation, showUndo]);

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
    // A cancelled picker still calls onChange on Android, with the date it opened
    // on; jumping there would scroll or reload the list the user just declined.
    if (event?.type === 'dismissed') return;
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
        // Date is not in current list - load everything from that date on
        // Set the target date for scrolling after load completes
        scrollScheduledRef.current = false;
        setScrollToDateString(dateString);
        setPendingScroll(true);
        await jumpToDate(dateString);
      }
    }
  }, [groupedOperations, jumpToDate]);

  // Quick add handlers.
  //
  // `capturedValues` is the form's values as of the moment the add was
  // requested. The auto-add shortcuts clear the form before calling, so they
  // capture first and pass them in; everything else reads the current snapshot.
  // This used to work by accident: the values were `useState` on this screen, so
  // a caller that reset the form still held the pre-reset render's values. They
  // are an external store now, where a write is visible immediately, so the
  // ordering is spelled out instead of inferred.
  const performQuickAdd = useCallback(async (overrideCategoryId, overrideToAccountId, capturedValues) => {
    const formValues = capturedValues ?? quickAddValuesStore.getSnapshot();

    // Automatically evaluate any pending math operation before saving
    let finalAmount = formValues.amount;

    if (hasOperation(finalAmount)) {
      // A non-transfer amount is typed in the operation currency when a foreign
      // one is picked: evaluate with THAT currency's decimals, as the modal does,
      // or "12.50+3.25" USD on a RUB account (0 decimals) is booked as $16.
      const amountCurrency = (formValues.type !== 'transfer' && formValues.operationCurrency)
        || sourceAccount?.currency;
      const evaluated = evaluateExpression(finalAmount, Currency.getDecimalPlaces(amountCurrency));
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    const operationData = {
      ...formValues,
      amount: finalAmount, // Use the evaluated amount
      // Use override categoryId if provided (for auto-add from category selection)
      categoryId: overrideCategoryId !== undefined ? overrideCategoryId : formValues.categoryId,
      // Use override toAccountId if provided (for auto-add from transfer target shortcuts)
      toAccountId: overrideToAccountId !== undefined ? overrideToAccountId : formValues.toAccountId,
      // The quick-add date chip parks a back-dated entry in `formValues.date`;
      // null (the usual case) means today, resolved here rather than when the
      // form was opened, so a session left open across midnight still books the
      // day the user is actually in.
      date: formValues.date || toDateString(new Date()),
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
      // Check if this is a foreign currency expense/income. A transfer is never
      // one: the currency chip is hidden for transfers, but a foreign currency
      // picked in Expense mode survives the switch to Transfer, and without this
      // guard a same-currency transfer was booked as a conversion (100 AMD typed,
      // 39,000 AMD debited as "100 USD").
      const opCurrency = operationData.operationCurrency;
      const isForeignCurrencyOp = operationData.type !== 'transfer'
        && opCurrency
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
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: t('ok') }]);
          return;
        }

        const homeAmount = Currency.convertAmount(foreignAmount, foreignCurrency, homeCurrency, rateToUse);
        if (!homeAmount) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: t('ok') }]);
          return;
        }

        // The fetched rate is foreign→home, but the column holds account→foreign
        // (amount × rate = destinationAmount), as the edit form and the
        // bank-notification importer write it. Stored uninverted, re-opening the
        // operation read 30 TRY at 11.76 as 30 × 0.085 = 3 AMD and saving rewrote
        // the account deduction to that.
        const accountToForeignRate = Currency.invertRate(rateToUse);
        if (!accountToForeignRate) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: t('ok') }]);
          return;
        }

        // Store home-currency amount as the account deduction; foreign amount as destinationAmount
        operationData.amount = Currency.formatAmount(homeAmount, homeCurrency);
        operationData.sourceCurrency = foreignCurrency;
        operationData.destinationCurrency = homeCurrency;
        operationData.exchangeRate = accountToForeignRate;
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
      showDialog(t('error'), error, [{ text: t('ok') }]);
      return;
    }

    try {
      // Clear any previous suggestion before saving
      setPendingSuggestionId(null);
      setPendingSuggestions([]);

      const createdOperation = await addOperation(operationData);

      // Offer a brief window to undo the just-created operation.
      if (createdOperation?.id) {
        showUndo('add', createdOperation.id);
      }

      // Save last accessed account
      if (formValues.accountId) {
        setLastAccessedAccount(formValues.accountId);
      }

      // Reset form but keep account and type
      resetForm();
      // The amount is cleared; the next entry starts fresh and re-primes location.
      amountWasEmptyRef.current = true;

      // The summoned form has done its job — fold it away. A no-op when the
      // panel is pinned open by the setting, which is why it is unconditional.
      // Deliberately does NOT retire a parked date: the reset above kept it, and
      // this fold is the middle of a back-fill, not the end of one.
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
  }, [quickAddValuesStore, sourceAccount, validateOperation, addOperation, t, showDialog, accounts, resetForm, lastEditedField, getQuickAddLocation, showUndo]);

  // A second tap on Add while the first save is still pending used to book the same
  // operation twice — the DB write is async, and a cross-currency entry awaits a live
  // exchange-rate fetch before it even reaches the write. Guard every entry point
  // (the Add button and both auto-add shortcuts route through here).
  const handleQuickAdd = useCallback(async (overrideCategoryId, overrideToAccountId, capturedValues) => {
    if (quickAddSavingRef.current) return;
    quickAddSavingRef.current = true;
    setQuickAddSaving(true);
    try {
      await performQuickAdd(overrideCategoryId, overrideToAccountId, capturedValues);
    } finally {
      quickAddSavingRef.current = false;
      setQuickAddSaving(false);
    }
  }, [performQuickAdd]);

  // Handler for auto-add with category (from picker)
  const handleAutoAddWithCategory = useCallback(async (categoryId) => {
    // Capture BEFORE clearing: the form is cleared immediately so the user never
    // sees stale values during the save, and the store makes that clear visible
    // at once.
    const capturedValues = quickAddValuesStore.getSnapshot();
    resetForm();
    closePicker();

    // Pass the selected categoryId directly to avoid race conditions
    await handleQuickAdd(categoryId, undefined, capturedValues);
  }, [quickAddValuesStore, resetForm, closePicker, handleQuickAdd]);

  // Handler for auto-add with target account (from transfer target shortcuts)
  const handleAutoAddWithAccount = useCallback(async (toAccountId) => {
    // Captured before the reset, for the same reason as above.
    const capturedValues = quickAddValuesStore.getSnapshot();
    resetForm();
    closePicker();

    // Pass undefined for categoryId override, pass toAccountId override
    await handleQuickAdd(undefined, toAccountId, capturedValues);
  }, [quickAddValuesStore, resetForm, closePicker, handleQuickAdd]);

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

  // Retire the suggestion row on its own after SUGGESTION_TIMEOUT_MS. The window
  // starts when the suggestions are set (a beat before the row renders), and
  // tapping a chip does not extend it — only a new operation (a new
  // `pendingSuggestionId`) restarts the clock.
  useEffect(() => {
    if (!pendingSuggestionId) return undefined;
    const timer = setTimeout(handleDismissSuggestion, SUGGESTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingSuggestionId, handleDismissSuggestion]);

  // Undo a just-added operation: delete it and drop any label suggestions that
  // targeted it (otherwise the suggestion row would point at a deleted op).
  const handleUndoAdd = useCallback((operationId) => {
    // deleteOperation reports its own failure via dialog and then rethrows; the
    // catch keeps this fire-and-forget call from raising an unhandled rejection.
    Promise.resolve(deleteOperation(operationId)).catch(() => {});
    dropSuggestionsFor(operationId);
  }, [deleteOperation, dropSuggestionsFor]);

  // Keyed on the bar's token — `undoTokenRef` always holds the newest one — so a
  // previous bar finishing its exit fade neither clears nor commits the window a
  // newer bar now owns. The operation id cannot do this job: deleting a row,
  // undoing, and deleting it again all inside one 200ms fade produces two bars
  // for the same id, and the outgoing one would close the incoming one's window.
  const handleUndoClosed = useCallback((token) => {
    if (token !== undoTokenRef.current) return;
    // The window closed without an Undo tap, so the deferred delete is final.
    // (Undo clears the ref first, so this is a no-op on that path.)
    commitPendingDelete();
    setUndoInfo(null);
  }, [commitPendingDelete]);

  // One closure per bar, so the memoized snackbar is not handed a new callback
  // on every parent render while its countdown is running.
  const handleBarClosed = useMemo(() => {
    const token = undoInfo?.token;
    return () => handleUndoClosed(token);
  }, [undoInfo?.token, handleUndoClosed]);

  // Fallback cleanup: the snackbar's onClosed is the normal path, but it won't
  // fire if the exit animation drops its completion callback. Without this, a
  // leaked undoInfo would keep offering an undo action for an operation whose
  // window has long since passed.
  useEffect(() => {
    if (!undoInfo) return undefined;
    const timer = setTimeout(() => handleUndoClosed(undoInfo.token), UNDO_DURATION_MS + 1500);
    return () => clearTimeout(timer);
  }, [undoInfo, handleUndoClosed]);

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
    // The picker request belongs to the press that opened this form, not to the
    // form: leaving it set would greet the next edit with a picker nobody asked
    // for.
    setOpenCategoryPicker(false);
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
      {/* The review deck: a plain container, a SIBLING of the clip rather than a
          child of it. Nothing here is animated, has a ceiling, or is clipped —
          because the clip is precisely what six repairs could not reopen once
          Reanimated had written a `maxHeight: 0` into it behind a stopped
          activity (see `deckUp`). It sets no height either: the deck lays its
          front card out in normal flow and pads its own top for the peeking
          edges, so the container takes its height from the card's content. A
          height pinned here from the form clipped the card whenever the form
          had not been measured yet. */}
      {deckUp && (
        <View
          ref={deckHostRef}
          onLayout={handleDeckHostLayout}
        >
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
        </View>
      )}
      <Animated.View
        testID="quick-add-clip"
        style={animatedQuickAddClipStyle}
        // A zero-height clip drops touches on Android, but not TalkBack: without
        // this the whole form stays reachable by screen reader while invisible.
        importantForAccessibility={quickAddCollapsed ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.View
          testID="quick-add-slide"
          style={animatedQuickAddSlideStyle}
          onLayout={handleQuickAddClipLayout}
        >
          <View
            testID="quick-add-measure"
            onLayout={handleQuickAddLayout}
          >
            <QuickAddForm
              colors={colors}
              t={t}
              valuesStore={quickAddValuesStore}
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
              saving={quickAddSaving}
            />
            <QuickAddRateSync
              valuesStore={quickAddValuesStore}
              setValues={setQuickAddValues}
              isMultiCurrencyTransfer={isMultiCurrencyTransfer}
              sourceAccount={sourceAccount}
              destinationAccount={destinationAccount}
              lastEditedField={lastEditedField}
              setLastEditedField={setLastEditedField}
              setRateSource={setRateSource}
            />
          </View>
        </Animated.View>
      </Animated.View>
      {filtersExpanded && filterPanelHeight > 0 && <View style={{ height: filterPanelHeight }} />}
    </>
  ), [animatedQuickAddClipStyle, animatedQuickAddSlideStyle, handleQuickAddClipLayout, quickAddCollapsed, deckUp, colors, t, quickAddValuesStore, setQuickAddValues, isMultiCurrencyTransfer, sourceAccount, destinationAccount, lastEditedField, setLastEditedField, setRateSource, visibleAccounts, filteredCategories, topCategoriesForType, getCategoryInfo, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, handleAmountChange, handleExchangeRateChange, handleDestinationAmountChange, handleAutoAddWithCategory, topTransferAccountsForForm, handleAutoAddWithAccount, TYPES, rateSource, handleOperationCurrencyChange, foreignRateSource, foreignExchangeRate, filterPanelHeight, filtersExpanded, quickAddFlash, quickAddSaving, operationSuggestions, hasSuggestions, quickAddHeight, handleQuickAddLayout, handleDeckHostLayout, accounts, categories, suggestionSaveErrors, suggestionChoices, setSuggestionChoice, acceptSuggestion, dismissSuggestion]);

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
      // Dismissing the form by hand ends the sitting, so a parked back-date goes
      // with it — unlike the automatic fold after an add.
      clearQuickAddDate();
      setQuickAddExpanded(false);
      return;
    }
    scrollToTop();
    setQuickAddExpanded(true);
  }, [quickAddExpanded, scrollToTop, clearQuickAddDate]);

  // A tapped "transactions to review" notification lands here (SimpleTabs switches
  // to this tab on the same event): put the suggestion deck in front of the user
  // instead of sending them to settings. Search is closed first — the quick-add
  // block, and the deck laid over it, is collapsed while search is open — and its
  // close effect already scrolls the list to the top, so only the non-search case
  // scrolls here. The queue is refreshed so a notification that arrived while the
  // app was backgrounded is ingested rather than showing a stale (or empty) deck.
  const handleOpenPendingSuggestions = useCallback(() => {
    console.log('[deck] open-pending event', {
      isSearchOpen, showQuickAddPanel, quickAddExpanded, suggestions: operationSuggestions.length,
    });
    if (isSearchOpen) handleCloseSearch();
    else scrollToTop();
    // Nothing to open: the cards are no longer laid over the quick-add form, so
    // the form stays folded and the deck below renders on its own. Expanding it
    // here used to be how the cards were uncovered; now it would only leave the
    // form pinned open, with the + button reading "close", once the user has
    // answered the queue. The clip is still re-committed for the form's own
    // sake — a pinned panel opened behind a stopped activity has the same lost
    // commit, and with a deck up this commits the collapse it should be in.
    reassertQuickAddClip('open-pending');
    refreshSuggestions('open-pending');
    // Past the clip, the scroll and the layout pass that follow this event: the
    // geometry the cards actually ended up with on the screen the user is
    // looking at while reporting that they cannot see them.
    setTimeout(() => deckOnScreenRef.current?.('open-pending'), DECK_SETTLE_MS);
  }, [
    isSearchOpen, handleCloseSearch, scrollToTop, refreshSuggestions,
    showQuickAddPanel, quickAddExpanded, operationSuggestions.length,
    reassertQuickAddClip,
  ]);

  useEffect(
    () => appEvents.on(EVENTS.OPEN_PENDING_OPERATIONS, handleOpenPendingSuggestions),
    [handleOpenPendingSuggestions],
  );

  // The "operations added" receipt's "Change category" button lands here: the
  // operation was booked automatically and its category was guessed, so the form
  // opens straight onto the category picker.
  //
  // The row is read from the database rather than from the loaded list — the
  // list holds one window of dates, and an operation booked for an older date
  // (or on a screen the user has since scrolled away from) is simply not in it.
  const handleOpenOperationCategory = useCallback(async (payload) => {
    const operationId = payload?.operationId;
    if (operationId == null) return;
    try {
      const operation = await getOperationById(operationId);
      if (!operation) {
        console.log('[notif-route] change category: operation is gone', { operationId });
        return;
      }
      setEditingOperation(operation);
      setIsNew(false);
      setOpenCategoryPicker(true);
      setModalVisible(true);
    } catch (error) {
      // A failed read is not worth a dialog: the user pressed a notification
      // button, and the operations list they land on is still the right place.
      console.warn('[notif-route] change category: failed to load the operation', error);
    }
  }, []);

  useEffect(
    () => appEvents.on(EVENTS.OPEN_OPERATION_CATEGORY, handleOpenOperationCategory),
    [handleOpenOperationCategory],
  );

  // A deck that arrives on its own — the foreground resync, a pull-to-refresh, a
  // reload after the settings queue changed, or a tapped alert whose event was
  // lost — needs the same landing as a handled tap: the cards sit in the list
  // header and nothing else on this screen announces them (the + button stands
  // down while they are up), so a list scrolled into last month would hold them
  // out of sight indefinitely. Search keeps the block clipped, and its close
  // effect already scrolls to the top, so only the non-search case scrolls here.
  const deckWasUpRef = useRef(hasSuggestions);
  useEffect(() => {
    const wasUp = deckWasUpRef.current;
    deckWasUpRef.current = hasSuggestions;
    if (!wasUp && hasSuggestions && !isSearchOpen) scrollToTop();
  }, [hasSuggestions, isSearchOpen, scrollToTop]);

  // The state the deck lands in, and — a moment later — what the clip actually
  // did with it. The second line is the one that tells a deck that is in the
  // tree but clipped or off screen from one that never reached the tree.
  //
  // It reads through a ref refreshed on every render rather than through the
  // effect's own closure. The effect only re-runs when the deck size changes, so
  // a closure froze the panel state as it stood at that instant — which is how
  // the log ended up carrying impossible pairs (a stack rendered at
  // quickAddHeight 437 and, a minute later, a "clip after arrival" reporting 0
  // for the same deck). Every field below is now read at the moment it is
  // printed.
  const deckSnapshotRef = useRef(null);
  deckSnapshotRef.current = {
    showQuickAddPanel, quickAddExpanded, isSearchOpen, quickAddCollapsed, quickAddHeight,
  };
  const deckSnapshot = useCallback(() => ({
    ...deckSnapshotRef.current,
    suggestions: suggestionsCountRef.current,
    clipHeight: quickAddClipHeightRef.current,
    deckHostHeight: deckHostHeightRef.current,
    maxHeight: Math.round(quickAddMaxHeight.value),
    translateY: Math.round(quickAddTranslateY.value),
    scrollOffset: Math.round(scrollOffsetRef.current),
  }), [quickAddMaxHeight, quickAddTranslateY]);
  // The deck container's rect in WINDOW coordinates.
  //
  // Read it WITH `clipHeight` and `deckHostHeight` from the same line, never on
  // its own: measureInWindow reports a LAYOUT frame and cannot see `overflow:
  // hidden`, so a container overflowing a shut clip reports a perfectly healthy
  // rect while painting nothing. That is what the 2026-09-20 export showed —
  // `x: 0, y: 46, height: 444` on a screen with no cards on it — and reading the
  // rect alone cost a round. The pair that gave it away in the same lines was
  // `clipHeight: 0` beside `deckHostHeight: 444`: a content view measuring
  // nothing while its own child measures the full frame.
  //
  // The container is no longer inside the clip, so the rect now means what it
  // says: a y above the viewport is the list scrolled past the header, and a
  // sane rect with nothing on screen would leave only paint.
  const deckOnScreen = useCallback((reason) => {
    const node = deckHostRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y, width, height) => {
      console.log('[deck] on screen', {
        reason,
        x: Math.round(x || 0),
        y: Math.round(y || 0),
        width: Math.round(width || 0),
        height: Math.round(height || 0),
        screen: Math.round(Dimensions.get('window').height),
        ...deckSnapshot(),
      });
    });
  }, [deckSnapshot]);
  // Read by the deep-link handler, which is declared above this and would hit
  // the temporal dead zone if it listed `deckOnScreen` as a dependency.
  const deckOnScreenRef = useRef(null);
  deckOnScreenRef.current = deckOnScreen;

  // The deck's landing when the app comes back with cards already queued.
  //
  // A deck that filled behind a stopped activity had its arrival scroll dropped
  // along with everything else that needed a frame, so the list can still be
  // sitting where the user left it — with the header, and the cards in it, above
  // the viewport. Unanimated: an animated scroll requested on the way back from
  // the background is the kind of thing that gets dropped too.
  useOnForeground(useCallback(() => {
    if (suggestionsCountRef.current === 0) return;
    // Search owns the screen and keeps the panel clipped, so the place the user
    // had scrolled their results to is not the deck's to take. Closing search
    // scrolls to the top on its own, which is where the deck lands anyway.
    if (isSearchOpen) return;
    if (scrollOffsetRef.current > 0) {
      console.log('[deck] foreground scroll re-assert', {
        offset: Math.round(scrollOffsetRef.current),
      });
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    deckOnScreen('foreground');
  }, [deckOnScreen, isSearchOpen]));

  useEffect(() => {
    console.log('[deck] suggestions changed', deckSnapshot());
    if (!hasSuggestions) return undefined;
    // Not a plain 600ms report: JS timers are held back while the app sits in
    // the background, so this one has fired 73 seconds — and once 14 minutes —
    // after the deck arrived, and was read as if it described the frame right
    // after. `lateBy` says how long it actually waited, and a wait that ran long
    // is labelled rather than passed off as a settled clip.
    const scheduledAt = Date.now();
    const timer = setTimeout(() => {
      const lateBy = Date.now() - scheduledAt - DECK_SETTLE_MS;
      console.log('[deck] clip after arrival', {
        ...deckSnapshot(),
        lateBy,
        stale: lateBy > DECK_SETTLE_MS,
      });
      deckOnScreen('arrival');
    }, DECK_SETTLE_MS);
    return () => clearTimeout(timer);
    // Logged on deck changes only; the snapshot reads live state when it prints.
  }, [hasSuggestions, operationSuggestions.length, deckSnapshot, deckOnScreen]);

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
        language={language}
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
            message={undoInfo.kind === 'delete' ? t('operation_deleted') : t('operation_added')}
            icon={undoInfo.kind === 'delete' ? 'trash-can-outline' : 'check-circle'}
            actionLabel={t('undo')}
            colors={colors}
            onUndo={undoInfo.kind === 'delete' ? handleUndoDelete : handleUndoAdd}
            onClosed={handleBarClosed}
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
          statusLabel={driveBackupLabel}
          onCancelStatus={cancelDriveBackup}
        />
        {isSearchOpen && hasActiveSearch && (
          <FilterChipStrip
            searchState={searchState}
            onClearGroup={handleClearFilterGroup}
            colors={colors}
            t={t}
            language={language}
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
        valuesStore={quickAddValuesStore}
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
          accessibilityLabel={t('scroll_to_top')}
          accessibilityHint={t('scroll_to_top_hint')}
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

      {/* Keyed on the operation so a form already on screen is rebuilt for a new
          one rather than kept. useOperationForm loads its values once per open
          and then guards against re-running, so swapping only the prop — which
          the "Change category" deep link can do over an open form — would leave
          the previous operation's amount, account and date sitting under the new
          operation's id, and Save would write them onto it. */}
      <OperationModal
        key={editingOperation ? String(editingOperation.id) : 'new'}
        visible={modalVisible}
        onClose={handleCloseOperationModal}
        operation={editingOperation}
        isNew={isNew}
        onDelete={handleDeleteOperation}
        openCategoryPicker={openCategoryPicker}
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
        language={language}
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
    zIndex: Z_INDEX.toast,
  },
  floatingUndoArea: {
    // `bottom` is applied inline (safe-area inset + tab bar height) so the
    // snackbar floats just above the floating tab bar instead of behind it.
    left: SPACING.lg,
    position: 'absolute',
    right: SPACING.lg,
    zIndex: Z_INDEX.popover,
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
    zIndex: Z_INDEX.dropdown,
  },
});

export default OperationsScreen;
