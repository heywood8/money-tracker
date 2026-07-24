import React, { useMemo, useCallback, useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Dimensions, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableRipple, Text } from 'react-native-paper';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Svg, Circle } from 'react-native-svg';

const SCREEN_TIMING = { duration: 300, easing: Easing.out(Easing.cubic) };
const PILL_TIMING = { duration: 200, easing: Easing.out(Easing.quad) };
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import OperationsScreen from '../screens/OperationsScreen';
import AccountsScreen from '../screens/AccountsScreen';
import GraphsScreen from '../screens/GraphsScreen';
import PlannedOperationsScreen from '../screens/PlannedOperationsScreen';
import BudgetScreen from '../screens/BudgetScreen';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { SwipeNavigationGestureProvider } from '../contexts/SwipeNavigationContext';
import Header from '../components/Header';
import SettingsScreen from '../screens/SettingsScreen';
import { appEvents, EVENTS } from '../services/eventEmitter';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Append alpha channel to a hex color (hex 00-FF)
const withAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};

const TAB_ICONS = {
  Operations: 'swap-horizontal',
  Accounts: 'wallet-outline',
  Graphs: 'chart-line',
  Planned: 'calendar-clock',
  Budget: 'piggy-bank-outline',
  Settings: 'cog-outline',
};

const PROGRESS_RADIUS = 9;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

// Circular material progress indicator that replaces the Settings cog icon
// while an update is downloading or being verified.
const UpdateProgressIcon = memo(({ phase, progress, color }) => {
  const spinValue = useSharedValue(0);

  useEffect(() => {
    if (phase === 'verifying') {
      spinValue.value = withRepeat(
        withTiming(1, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(spinValue);
      spinValue.value = 0;
    }
    return () => cancelAnimation(spinValue);
  }, [phase, spinValue]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value * 360 - 90}deg` }],
  }));

  const strokeOffset = PROGRESS_CIRCUMFERENCE * (1 - (progress ?? 0));

  if (phase === 'verifying') {
    return (
      <Animated.View style={spinStyle}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle
            cx={11}
            cy={11}
            r={PROGRESS_RADIUS}
            stroke={color}
            strokeWidth={2.5}
            fill="none"
            strokeDasharray={`${PROGRESS_CIRCUMFERENCE * 0.75} ${PROGRESS_CIRCUMFERENCE * 0.25}`}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    );
  }

  // Determinate circle: track + progress arc, rotated so fill starts at 12 o'clock
  return (
    <View style={{ transform: [{ rotate: '-90deg' }] }}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle
          cx={11}
          cy={11}
          r={PROGRESS_RADIUS}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={0.25}
        />
        <Circle
          cx={11}
          cy={11}
          r={PROGRESS_RADIUS}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={PROGRESS_CIRCUMFERENCE}
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
});

UpdateProgressIcon.displayName = 'UpdateProgressIcon';

UpdateProgressIcon.propTypes = {
  phase: PropTypes.string,
  progress: PropTypes.number,
  color: PropTypes.string.isRequired,
};

// Memoized tab button with icon + label, pill active state
const TabButton = memo(({ tab, isActive = false, colors, onPress = () => {}, isUpdating = false, updatePhase = null, updateProgress = null }) => {
  const handlePress = useCallback(() => {
    onPress(tab.key);
  }, [onPress, tab.key]);

  const iconColor = isActive ? colors.primary : colors.mutedText;

  const labelStyle = useMemo(() => [
    styles.tabLabel,
    {
      color: isActive ? colors.primary : colors.mutedText,
      fontWeight: isActive ? '700' : '500',
    },
  ], [isActive, colors.primary, colors.mutedText]);

  return (
    <TouchableRipple
      style={styles.tab}
      onPressIn={handlePress}
      rippleColor="rgba(0, 0, 0, .08)"
      borderless
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={styles.tabContent}>
        {isUpdating ? (
          <UpdateProgressIcon phase={updatePhase} progress={updateProgress} color={iconColor} />
        ) : (
          <MaterialCommunityIcons
            name={TAB_ICONS[tab.key] || 'circle-outline'}
            size={22}
            color={iconColor}
          />
        )}
        <Text
          variant="labelSmall"
          style={labelStyle}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </View>
    </TouchableRipple>
  );
});

TabButton.displayName = 'TabButton';

TabButton.propTypes = {
  tab: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string,
  }).isRequired,
  isActive: PropTypes.bool,
  colors: PropTypes.shape({
    primary: PropTypes.string,
    mutedText: PropTypes.string,
  }).isRequired,
  onPress: PropTypes.func,
  isUpdating: PropTypes.bool,
  updatePhase: PropTypes.string,
  updateProgress: PropTypes.number,
};

// Gradient geometry. The fade tints toward the theme background (not black), so
// it dissolves the scrolling content into the surface behind the floating bar
// the same way in both themes — a black fade looked like a dark smudge on the
// light theme. Cubic ease-in gives a natural-looking ramp.
const TAB_OVERLAY_HEIGHT = 130;
const GRADIENT_STEPS = 20;
const GRADIENT_MAX_OPACITY = 0.82;

// Build the transparent → background-colored gradient steps for a given theme
// background hex. Reuses withAlpha so each step is `${bgHex}${alpha}`.
const buildGradientSteps = (backgroundHex) =>
  Array.from({ length: GRADIENT_STEPS }, (_, i) => {
    const t = i / (GRADIENT_STEPS - 1);
    const easedT = t * t * t; // cubic ease-in
    return withAlpha(backgroundHex, easedT * GRADIENT_MAX_OPACITY);
  });

// Fade behind the tab bar region. Purely visual: it must not swallow touches,
// because it extends well above the bar and would make elements anchored just
// above the bar (undo bar, FABs) untappable. Touch blocking around the pill
// lives on floatingBarWrapper instead. `stepColors` is memoized by the parent
// on colors.background so the memo() stays stable across unrelated re-renders.
const TabGradient = memo(({ stepColors }) => {
  const stepHeight = TAB_OVERLAY_HEIGHT / GRADIENT_STEPS;
  return (
    <View style={styles.tabGradientOverlay} pointerEvents="none" testID="tab-gradient">
      {stepColors.map((color, i) => (
        <View key={i} style={{ height: stepHeight, backgroundColor: color }} />
      ))}
    </View>
  );
});

TabGradient.displayName = 'TabGradient';

TabGradient.propTypes = {
  stepColors: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default function SimpleTabs() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showAccountsTab, showBudgetTab } = useDisplaySettings();
  const { isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();
  const [active, setActive] = React.useState('Operations');
  const [subPanelActive, setSubPanelActive] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);

  // Cold-start optimization: only the active Operations screen is real on the
  // first commit; the background tab slots render lightweight placeholders so
  // their (heavy) mount — GraphsScreen's chart-data pipeline in particular —
  // stays off the cold-start critical path. A single idle callback then flips
  // this true, mounting every screen for the rest of the session. This does NOT
  // reintroduce the blank/black-on-swipe bug that forced screens to stay
  // mounted: the flip fires one idle tick after the first interactive frame —
  // before a user could physically start a swipe — so by the time any tab can
  // be revealed every screen is already mounted. After the flip all screens
  // stay mounted permanently, exactly as before; only the initial mount is
  // delayed by a moment.
  const [backgroundMounted, setBackgroundMounted] = React.useState(false);
  React.useEffect(() => {
    // requestIdleCallback is the app's deferral primitive (see OperationsScreen /
    // OperationsActionsContext); InteractionManager is deprecated per jest.setup.
    const handle = requestIdleCallback(() => setBackgroundMounted(true));
    return () => cancelIdleCallback(handle);
  }, []);

  // Guard ref — updated synchronously so handleTabPress never reads stale state.
  const isTransitioningRef = useRef(false);
  // Shared value mirror — readable on the worklet thread inside panGesture
  // callbacks without making any React state a useMemo dep (which would
  // reinstall the native gesture recognizer mid-animation and cause jitter).
  const isTransitioningShared = useSharedValue(false);

  // The Accounts tab is optional — inserted just before Settings (second to last)
  // only when the "show accounts in main menu" preference is on.
  const TABS = useMemo(() => {
    const tabs = [{ key: 'Operations', label: t('operations') || 'Operations' }];
    tabs.push({ key: 'Graphs', label: t('graphs') || 'Graphs' });
    tabs.push({ key: 'Planned', label: t('planned') || 'Planned' });
    if (showBudgetTab) {
      tabs.push({ key: 'Budget', label: t('budget') || 'Budget' });
    }
    if (showAccountsTab) {
      tabs.push({ key: 'Accounts', label: t('accounts') || 'Accounts' });
    }
    tabs.push({ key: 'Settings', label: t('settings') || 'Settings' });
    return tabs;
  }, [t, showAccountsTab, showBudgetTab]);

  // ---- shared animation values ----
  const translateX = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const tabBarWidthShared = useSharedValue(SCREEN_WIDTH);
  // Dedicated pill position — animated independently so it works for swipe,
  // adjacent, and non-adjacent transitions.
  const pillPosition = useSharedValue(0);

  // Per-screen horizontal offset for non-adjacent transitions.
  // During a non-adjacent tap A→D we instantly reposition the target screen to
  // be adjacent to the source (worklet thread, no React render), animate the
  // strip exactly 1 screen width (same as adjacent), then snap strip to the
  // real resting position and zero the offset — both on the worklet thread so
  // there is no visible jump. All screens stay pre-mounted; no overlay needed.
  // Six sets of animation values are allocated up front (hooks can't be
  // conditional); only the first TABS.length are used at any time.
  const screenAdjust0 = useSharedValue(0);
  const screenAdjust1 = useSharedValue(0);
  const screenAdjust2 = useSharedValue(0);
  const screenAdjust3 = useSharedValue(0);
  const screenAdjust4 = useSharedValue(0);
  const screenAdjust5 = useSharedValue(0);
  // Opacity per screen — intermediates are zeroed during non-adjacent transitions
  // so they don't bleed through when the target overlaps their strip position.
  const screenOpacity0 = useSharedValue(1);
  const screenOpacity1 = useSharedValue(1);
  const screenOpacity2 = useSharedValue(1);
  const screenOpacity3 = useSharedValue(1);
  const screenOpacity4 = useSharedValue(1);
  const screenOpacity5 = useSharedValue(1);

  const screenAdjustedStyle0 = useAnimatedStyle(() => ({ opacity: screenOpacity0.value, transform: [{ translateX: screenAdjust0.value }] }));
  const screenAdjustedStyle1 = useAnimatedStyle(() => ({ opacity: screenOpacity1.value, transform: [{ translateX: screenAdjust1.value }] }));
  const screenAdjustedStyle2 = useAnimatedStyle(() => ({ opacity: screenOpacity2.value, transform: [{ translateX: screenAdjust2.value }] }));
  const screenAdjustedStyle3 = useAnimatedStyle(() => ({ opacity: screenOpacity3.value, transform: [{ translateX: screenAdjust3.value }] }));
  const screenAdjustedStyle4 = useAnimatedStyle(() => ({ opacity: screenOpacity4.value, transform: [{ translateX: screenAdjust4.value }] }));
  const screenAdjustedStyle5 = useAnimatedStyle(() => ({ opacity: screenOpacity5.value, transform: [{ translateX: screenAdjust5.value }] }));

  // Called on JS thread when a non-adjacent transition finishes.
  const clearTransitioningRef = useCallback(() => {
    isTransitioningRef.current = false;
  }, []);

  const handleTabPress = useCallback((tabKey) => {
    if (isTransitioningRef.current) return;
    const newIndex = TABS.findIndex(tab => tab.key === tabKey);
    const oldIndex = TABS.findIndex(tab => tab.key === active);
    if (newIndex === -1 || newIndex === oldIndex) return;

    const distance = Math.abs(newIndex - oldIndex);

    // ---- Start the animation FIRST, before the setActive React update ----
    // Writing shared values schedules the slide/pill animation directly on the
    // UI thread and does not depend on a React render, so it starts on the very
    // next frame instead of waiting for React to commit the tab-highlight change.
    activeIndex.value = newIndex;
    pillPosition.value = withTiming(newIndex, PILL_TIMING);

    if (distance === 1) {
      translateX.value = withTiming(-newIndex * SCREEN_WIDTH, SCREEN_TIMING);
    } else {
      // ---- Non-adjacent tab ----
      // Reposition the target screen to sit immediately adjacent to the source
      // on the worklet thread (zero React overhead). The strip then animates
      // exactly 1 screen width — identical feel to adjacent. On completion the
      // strip snaps to the real resting position and the per-screen offset is
      // zeroed simultaneously, both on the worklet thread — no visual jump.
      const direction = newIndex > oldIndex ? 1 : -1;
      // How far to shift the target so it appears one screen width past the source.
      const adjacentOffset = (oldIndex + direction - newIndex) * SCREEN_WIDTH;
      const adjSharedValues = [screenAdjust0, screenAdjust1, screenAdjust2, screenAdjust3, screenAdjust4, screenAdjust5];
      const opacityValues = [screenOpacity0, screenOpacity1, screenOpacity2, screenOpacity3, screenOpacity4, screenOpacity5];
      const targetAdjust = adjSharedValues[newIndex];

      isTransitioningShared.value = true;
      isTransitioningRef.current = true;

      // Hide intermediate screens so they don't bleed through when the repositioned
      // target overlaps their strip position (all worklet-thread, no React render).
      for (let i = 0; i < TABS.length; i++) {
        if (i !== oldIndex && i !== newIndex) opacityValues[i].value = 0;
      }

      targetAdjust.value = adjacentOffset; // instant reposition on worklet thread
      translateX.value = withTiming(-(oldIndex + direction) * SCREEN_WIDTH, SCREEN_TIMING, (finished) => {
        'worklet';
        if (!finished) return;
        // Snap strip, zero offset, restore opacities — all on worklet thread, no flash.
        translateX.value = -newIndex * SCREEN_WIDTH;
        targetAdjust.value = 0;
        opacityValues[0].value = 1;
        opacityValues[1].value = 1;
        opacityValues[2].value = 1;
        opacityValues[3].value = 1;
        opacityValues[4].value = 1;
        opacityValues[5].value = 1;
        isTransitioningShared.value = false;
        runOnJS(clearTransitioningRef)();
      });
    }

    // ---- React state AFTER the animation is scheduled ----
    // Only the tab highlight changes; all screens are already mounted, so the
    // destination content is on-screen and slides in together with the strip.
    setActive(tabKey);
  }, [TABS, active, activeIndex, translateX, pillPosition, isTransitioningShared,
    screenAdjust0, screenAdjust1, screenAdjust2, screenAdjust3, screenAdjust4, screenAdjust5,
    screenOpacity0, screenOpacity1, screenOpacity2, screenOpacity3, screenOpacity4, screenOpacity5,
    clearTransitioningRef]);

  // When the Accounts or Budget tab is toggled on/off the tab set changes size
  // and indices shift, so snap the strip/pill to the current tab's new index.
  // useLayoutEffect (not useEffect) runs before paint, so the strip is
  // repositioned in the same commit the tab set changes — otherwise a
  // wrong/blank screen flashes for one frame. If the active tab was removed
  // (e.g. Budget hidden while on it), fall back to Operations.
  React.useLayoutEffect(() => {
    const idx = TABS.findIndex(tab => tab.key === active);
    const safeIdx = idx === -1 ? 0 : idx;
    if (idx === -1) setActive(TABS[0].key);
    activeIndex.value = safeIdx;
    pillPosition.value = safeIdx;
    translateX.value = -safeIdx * SCREEN_WIDTH;
    // Intentionally only re-run when the tab set is toggled — depending on
    // `active` would re-snap the strip mid-animation on every tab switch.
  }, [showAccountsTab, showBudgetTab]);

  // A tapped "transactions to review" notification routes here: jump to the
  // Settings tab. SettingsScreen listens for the same event and opens the
  // notification-processing subpanel, so the two land together.
  React.useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPEN_NOTIFICATION_PROCESSING, () => {
      handleTabPress('Settings');
    });
    return unsubscribe;
  }, [handleTabPress]);

  // Android hardware back button navigates to Operations from any other tab
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (active !== 'Operations' && !isTransitioningRef.current) {
        handleTabPress('Operations');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [active, handleTabPress]);

  // Pan gesture for swipe navigation with real-time feedback.
  // isTransitioningShared guards against swipe during non-adjacent transitions
  // without being a useMemo dep — avoids reinstalling the native gesture
  // recognizer mid-animation which causes jitter.
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(!subPanelActive)
      .activeOffsetX([-10, 10])
      .failOffsetY([-10, 10])
      .onStart(() => {
        'worklet';
        if (isTransitioningShared.value) return;
        startTranslateX.value = translateX.value;
      })
      .onUpdate((event) => {
        'worklet';
        if (isTransitioningShared.value) return;
        const newTranslateX = startTranslateX.value + event.translationX;
        const maxTranslateX = 0;
        const minTranslateX = -(TABS.length - 1) * SCREEN_WIDTH;
        translateX.value = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));
        pillPosition.value = -translateX.value / SCREEN_WIDTH;
      })
      .onEnd((event) => {
        'worklet';
        if (isTransitioningShared.value) return;
        const { translationX: gestureTranslationX, velocityX } = event;
        const SWIPE_THRESHOLD = 50;
        const VELOCITY_THRESHOLD = 500;

        const currentIndex = activeIndex.value;
        let newIndex = currentIndex;

        if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
          newIndex = Math.min(currentIndex + 1, TABS.length - 1);
        } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
          newIndex = Math.max(currentIndex - 1, 0);
        }

        if (newIndex !== currentIndex) {
          activeIndex.value = newIndex;
          pillPosition.value = withTiming(newIndex, PILL_TIMING);
          translateX.value = withTiming(-newIndex * SCREEN_WIDTH, SCREEN_TIMING, (isFinished) => {
            if (isFinished) {
              runOnJS(setActive)(TABS[newIndex].key);
            }
          });
        } else {
          pillPosition.value = withTiming(currentIndex, PILL_TIMING);
          translateX.value = withTiming(-currentIndex * SCREEN_WIDTH, SCREEN_TIMING);
        }
      });
  }, [translateX, activeIndex, startTranslateX, TABS, setActive, subPanelActive, pillPosition, isTransitioningShared]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleTabBarLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTabBarWidth(width);
    tabBarWidthShared.value = width;
  }, [tabBarWidthShared]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const tabWidth = tabBarWidthShared.value / TABS.length;
    const barPadding = 15;
    const position = pillPosition.value * tabWidth + barPadding;
    return {
      transform: [{ translateX: position }],
      width: tabWidth,
    };
  });

  // All screens stay mounted for the whole session once backgroundMounted flips
  // (one idle tick after the first interactive frame). Navigation only ever
  // moves the strip (swipe to a neighbour, tap to any tab), so every screen
  // must already be on-screen — lazy mounting ON reveal left a not-yet-mounted
  // screen blank/black when a swipe uncovered it before its mount committed.
  // The deferral below is not lazy-on-reveal: it mounts every background screen
  // proactively before any swipe is possible, so the invariant still holds.
  //
  // Each screen element is memoized so SimpleTabs re-renders (active-tab
  // highlight, tab-bar layout) don't re-render the heavy screen subtrees: a
  // stable element reference lets React skip reconciling them, which avoids a
  // frame drop / stutter as a switch animation settles.
  // Placeholder shown in a background tab slot until backgroundMounted flips.
  // It only ever occupies an off-screen strip position on the very first frame
  // (the Operations strip is the one on screen), so it is never actually seen;
  // the theme background keeps it from flashing if a strip edge peeks during a
  // fast first-frame swipe. Reused across every deferred slot — the keyed
  // Animated.View wrappers keep the instances distinct.
  const backgroundPlaceholder = useMemo(
    () => <View style={[styles.screenPlaceholder, { backgroundColor: colors.background }]} />,
    [colors.background],
  );

  const operationsScreen = useMemo(() => <OperationsScreen />, []);
  // The Accounts tab reuses the same accounts screen as a full-screen duplicate
  // (all accounts, no subpanel header). Mounted only when the tab is enabled.
  // Background screens render a placeholder until backgroundMounted flips true,
  // then swap to the real screen once and stay mounted for the session.
  const accountsScreen = useMemo(
    () => (backgroundMounted ? <AccountsScreen /> : backgroundPlaceholder),
    [backgroundMounted, backgroundPlaceholder],
  );
  const graphsScreen = useMemo(
    () => (backgroundMounted ? <GraphsScreen /> : backgroundPlaceholder),
    [backgroundMounted, backgroundPlaceholder],
  );
  const plannedScreen = useMemo(
    () => (backgroundMounted ? <PlannedOperationsScreen /> : backgroundPlaceholder),
    [backgroundMounted, backgroundPlaceholder],
  );
  const budgetScreen = useMemo(
    () => (backgroundMounted ? <BudgetScreen /> : backgroundPlaceholder),
    [backgroundMounted, backgroundPlaceholder],
  );
  const settingsScreen = useMemo(
    () => (backgroundMounted
      ? <SettingsScreen setSubPanelActive={setSubPanelActive} />
      : backgroundPlaceholder),
    [backgroundMounted, backgroundPlaceholder, setSubPanelActive],
  );

  // Screens in strip order — matches TABS. Keyed by identity so instances are
  // preserved (not remounted) when the optional Accounts tab shifts positions.
  const orderedScreens = useMemo(() => {
    const list = [{ key: 'Operations', el: operationsScreen }];
    list.push({ key: 'Graphs', el: graphsScreen });
    list.push({ key: 'Planned', el: plannedScreen });
    if (showBudgetTab) list.push({ key: 'Budget', el: budgetScreen });
    if (showAccountsTab) list.push({ key: 'Accounts', el: accountsScreen });
    list.push({ key: 'Settings', el: settingsScreen });
    return list;
  }, [showAccountsTab, showBudgetTab, operationsScreen, accountsScreen, graphsScreen, plannedScreen, budgetScreen, settingsScreen]);

  const renderScreens = useCallback(() => {
    const positionStyles = [
      screenAdjustedStyle0, screenAdjustedStyle1, screenAdjustedStyle2,
      screenAdjustedStyle3, screenAdjustedStyle4, screenAdjustedStyle5,
    ];
    return (
      <>
        {orderedScreens.map((item, i) => (
          <Animated.View key={item.key} style={[styles.screen, positionStyles[i]]}>
            {item.el}
          </Animated.View>
        ))}
      </>
    );
  }, [orderedScreens,
    screenAdjustedStyle0, screenAdjustedStyle1, screenAdjustedStyle2,
    screenAdjustedStyle3, screenAdjustedStyle4, screenAdjustedStyle5]);

  const displayedTab = active;

  // Recomputed only when the theme background changes, not on every tab switch.
  const gradientStepColors = useMemo(
    () => buildGradientSteps(colors.background),
    [colors.background],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header />
      <View style={styles.content}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.screensContainer, { width: SCREEN_WIDTH * TABS.length }, animatedStyle]}>
            {/* Expose the swipe Pan gesture so nested horizontal scrollables
                (e.g. label-suggestion chips) can take priority over screen
                swipes via blocksExternalGesture. */}
            <SwipeNavigationGestureProvider value={panGesture}>
              {renderScreens()}
            </SwipeNavigationGestureProvider>
          </Animated.View>
        </GestureDetector>
      </View>
      {/* Visual gradient only — rendered before floatingBarWrapper so the tab
          buttons stay on top */}
      <TabGradient stepColors={gradientStepColors} />
      {/* Floating bar overlays content so screen shows through behind it.
          The wrapper is exactly as tall as the bar plus its bottom margin and
          safe-area inset, and it uses the default pointerEvents so the empty
          space beside and below the pill absorbs accidental taps — without
          reaching any higher than the bar itself. */}
      <SafeAreaView edges={['bottom']} style={styles.floatingBarWrapper} testID="tab-bar-wrapper">
        <View style={[
          styles.floatingBar,
          // Widen the bar for the extra tabs so labels don't get cramped.
          TABS.length >= 5 && styles.floatingBarWide,
          TABS.length >= 6 && styles.floatingBarExtraWide,
          {
            backgroundColor: withAlpha(colors.surface, 0.87),
            borderColor: withAlpha(colors.border, 0.5),
          },
        ]}>
          <Animated.View
            style={[
              styles.activePill,
              { backgroundColor: colors.primary + '1A' },
              pillAnimatedStyle,
            ]}
          />
          <View style={styles.tabsRow} onLayout={handleTabBarLayout}>
            {TABS.map(tab => (
              <TabButton
                key={tab.key}
                tab={tab}
                isActive={displayedTab === tab.key}
                colors={colors}
                onPress={handleTabPress}
                isUpdating={tab.key === 'Settings' && isDownloading}
                updatePhase={downloadPhase}
                updateProgress={downloadProgress}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activePill: {
    borderRadius: 20,
    height: '78%',
    left: 0,
    position: 'absolute',
    top: '11%',
  },
  container: { flex: 1 },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  floatingBar: {
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    paddingHorizontal: 15,
    position: 'relative',
    width: '70%',
    ...Platform.select({
      android: {
        elevation: 8,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
    }),
  },
  floatingBarExtraWide: {
    width: '94%',
  },
  floatingBarWide: {
    width: '84%',
  },
  floatingBarWrapper: {
    bottom: 0,
    // Carries the same elevation the gradient overlay uses, so the empty space
    // beside the pill keeps absorbing taps even above an elevated subpanel
    // (e.g. the Settings sub-screens). No backgroundColor, so this only affects
    // z-ordering on Android and casts no shadow.
    elevation: 8,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  screen: {
    height: '100%',
    width: SCREEN_WIDTH,
  },
  screenPlaceholder: {
    flex: 1,
  },
  screensContainer: {
    flex: 1,
    flexDirection: 'row',
    // Base width; overridden inline to SCREEN_WIDTH * TABS.length (5 or 6 tabs).
    width: SCREEN_WIDTH * 5,
  },
  tab: {
    flex: 1,
    minHeight: 60,
  },
  tabContent: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabGradientOverlay: {
    bottom: 0,
    // Match the elevation of the floating bar and the Settings subpanel overlay
    // so the gradient fade renders above an elevated subpanel (e.g. the Settings
    // sub-screens) the same way it does over the operations list. With equal
    // elevation, draw order falls back to document order: screen content <
    // gradient < floating bar. The overlay has no backgroundColor, so this does
    // not cast a shadow on Android — it only affects z-ordering.
    elevation: 8,
    height: TAB_OVERLAY_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  tabsRow: {
    flexDirection: 'row',
  },
});
