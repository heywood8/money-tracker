import React, { useMemo, useCallback, useRef, useLayoutEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Dimensions, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableRipple, Text } from 'react-native-paper';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const SCREEN_TIMING = { duration: 300, easing: Easing.out(Easing.cubic) };
const PILL_TIMING = { duration: 200, easing: Easing.out(Easing.quad) };
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OperationsScreen from '../screens/OperationsScreen';
import GraphsScreen from '../screens/GraphsScreen';
import PlannedOperationsScreen from '../screens/PlannedOperationsScreen';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useOperationsData } from '../contexts/OperationsDataContext';
import Header from '../components/Header';
import SettingsScreen from '../screens/SettingsScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Append alpha channel to a hex color (hex 00-FF)
const withAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};

const TAB_ICONS = {
  Operations: 'swap-horizontal',
  Graphs: 'chart-line',
  Planned: 'calendar-clock',
  Settings: 'cog-outline',
};

// Memoized tab button with icon + label, pill active state
const TabButton = memo(({ tab, isActive, colors, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(tab.key);
  }, [onPress, tab.key]);

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
        <MaterialCommunityIcons
          name={TAB_ICONS[tab.key] || 'circle-outline'}
          size={22}
          color={isActive ? colors.primary : colors.mutedText}
        />
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
};

TabButton.defaultProps = {
  isActive: false,
  onPress: () => {},
};

/**
 * Renders the correct screen for a given tab key.
 * Used by the overlay during non-adjacent tab transitions.
 */
const ScreenContent = memo(({ tabKey, setSubPanelActive }) => {
  switch (tabKey) {
  case 'Operations': return <OperationsScreen />;
  case 'Graphs': return <GraphsScreen />;
  case 'Planned': return <PlannedOperationsScreen />;
  case 'Settings': return <SettingsScreen setSubPanelActive={setSubPanelActive} />;
  default: return null;
  }
});

ScreenContent.displayName = 'ScreenContent';

ScreenContent.propTypes = {
  tabKey: PropTypes.string.isRequired,
  setSubPanelActive: PropTypes.func.isRequired,
};

export default function SimpleTabs() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const operationsData = useOperationsData();
  const [active, setActive] = React.useState('Operations');
  const [subPanelActive, setSubPanelActive] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);

  // Ref holding pending overlay animation params — consumed by useLayoutEffect
  // after React commits the overlay mount, guaranteeing the View exists.
  const pendingOverlayRef = useRef(null);

  // Overlay state for non-adjacent tab press transitions.
  // An overlay renders the target screen on top of the strip and slides in
  // while the strip simultaneously slides the current screen out in the
  // opposite direction — like two adjacent screens. No intermediate screens
  // are ever visible because the overlay fully covers them.
  const [overlay, setOverlay] = React.useState(null); // { key: string } | null
  // Ref mirror of overlay — always current, avoids stale closure in handleTabPress.
  // React state updates are async; reading overlay inside a useCallback reads
  // the value captured at creation time. The ref is updated synchronously
  // alongside every setOverlay call so handleTabPress never sees stale state.
  const overlayRef = useRef(null);
  const overlayTranslateX = useSharedValue(SCREEN_WIDTH);

  const TABS = useMemo(() => [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
    { key: 'Planned', label: t('planned') || 'Planned' },
    { key: 'Settings', label: t('settings') || 'Settings' },
  ], [t]);

  // ---- shared animation values ----
  const translateX = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const tabBarWidthShared = useSharedValue(SCREEN_WIDTH);
  // Dedicated pill position — animated independently so it works for swipe,
  // adjacent spring, and overlay timing transitions.
  const pillPosition = useSharedValue(0);

  // NOTE: there is intentionally NO useEffect driving translateX from `active`.
  // That pattern caused the useEffect to clobber ongoing spring animations.
  // translateX is set exclusively by: handleTabPress, swipe onEnd, and
  // completeOverlayTransition.

  // Finalize an overlay transition: snap strip to new position, update React
  // state, and remove the overlay in the same render cycle.
  // NOTE: translateX is already snapped on the worklet thread before this
  // runs, so there is no visual flash from removing the overlay synchronously.
  // The previous requestAnimationFrame deferral created a 1-2 frame window
  // where active had updated but overlay was still set, causing handleTabPress
  // to ignore taps during that window.
  const completeOverlayTransition = useCallback((tabKey) => {
    console.log(`[DBG:tabs] completeOverlayTransition tabKey=${tabKey} ts=${Date.now()}`);
    const newIndex = TABS.findIndex(tab => tab.key === tabKey);
    translateX.value = -newIndex * SCREEN_WIDTH;
    activeIndex.value = newIndex;
    overlayRef.current = null; // clear ref immediately — handleTabPress reads this
    setActive(tabKey);
    console.log(`[DBG:tabs] overlay clearing synchronously ts=${Date.now()}`);
    setOverlay(null);
  }, [TABS, translateX, activeIndex]);

  const handleTabPress = useCallback((tabKey) => {
    console.log(`[DBG:tabs] handleTabPress tabKey=${tabKey} active=${active} overlayRef=${overlayRef.current ? overlayRef.current.key : 'null'} ts=${Date.now()}`);
    if (overlayRef.current) {
      console.log(`[DBG:tabs] handleTabPress IGNORED — overlayRef active (${overlayRef.current.key})`);
      return; // ignore during an active overlay transition
    }
    const newIndex = TABS.findIndex(tab => tab.key === tabKey);
    const oldIndex = TABS.findIndex(tab => tab.key === active);
    if (newIndex === -1 || newIndex === oldIndex) return;

    const distance = Math.abs(newIndex - oldIndex);

    if (distance === 1) {
      // Adjacent tab — animate the strip with a spring (no intermediates possible)
      setActive(tabKey);
      activeIndex.value = newIndex;
      pillPosition.value = withTiming(newIndex, PILL_TIMING);
      translateX.value = withTiming(-newIndex * SCREEN_WIDTH, SCREEN_TIMING);
      return;
    }

    // ---- Non-adjacent tab ----
    // Telegram-style: current screen slides out, target screen slides in,
    // both moving at the same speed like two adjacent screens.
    const direction = newIndex > oldIndex ? 1 : -1; // +1 = target is to the right

    // 1) Position overlay offscreen, store animation params, and mount.
    //    useLayoutEffect fires after React commits the overlay View.
    overlayTranslateX.value = direction * SCREEN_WIDTH;
    pendingOverlayRef.current = { oldIndex, newIndex, direction, tabKey };
    overlayRef.current = { key: tabKey }; // set ref immediately alongside state
    setOverlay({ key: tabKey });
  }, [TABS, active, activeIndex, translateX, overlayTranslateX, pillPosition, completeOverlayTransition]);

  // Start overlay animations after React has committed the overlay mount.
  useLayoutEffect(() => {
    if (!overlay || !pendingOverlayRef.current) return;
    const { oldIndex, newIndex, direction, tabKey } = pendingOverlayRef.current;
    pendingOverlayRef.current = null;

    console.log(`[DBG:tabs] useLayoutEffect starting overlay anim tabKey=${tabKey} oldIndex=${oldIndex} newIndex=${newIndex} direction=${direction} ts=${Date.now()}`);

    const stripExit = (-oldIndex * SCREEN_WIDTH) - direction * SCREEN_WIDTH;

    translateX.value = withTiming(stripExit, SCREEN_TIMING);
    overlayTranslateX.value = withTiming(0, SCREEN_TIMING, () => {
      'worklet';
      runOnJS(completeOverlayTransition)(tabKey);
    });
    pillPosition.value = withTiming(newIndex, PILL_TIMING);
  }, [overlay, translateX, overlayTranslateX, pillPosition, completeOverlayTransition]);

  // Android hardware back button navigates to Operations from any other tab
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (active !== 'Operations' && !overlay) {
        handleTabPress('Operations');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [active, overlay, handleTabPress]);

  // Pan gesture for swipe navigation with real-time feedback
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(!subPanelActive && !overlay)
      .activeOffsetX([-10, 10])
      .failOffsetY([-10, 10])
      .onStart(() => {
        'worklet';
        startTranslateX.value = translateX.value;
      })
      .onUpdate((event) => {
        'worklet';
        const newTranslateX = startTranslateX.value + event.translationX;
        const maxTranslateX = 0;
        const minTranslateX = -(TABS.length - 1) * SCREEN_WIDTH;
        translateX.value = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));
        // Keep pill tracking the drag
        pillPosition.value = -translateX.value / SCREEN_WIDTH;
      })
      .onEnd((event) => {
        'worklet';
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
          const target = -newIndex * SCREEN_WIDTH;
          pillPosition.value = withTiming(newIndex, PILL_TIMING);
          translateX.value = withTiming(target, SCREEN_TIMING, (isFinished) => {
            if (isFinished) {
              runOnJS(setActive)(TABS[newIndex].key);
            }
          });
        } else {
          pillPosition.value = withTiming(currentIndex, PILL_TIMING);
          translateX.value = withTiming(-currentIndex * SCREEN_WIDTH, SCREEN_TIMING);
        }
      });
  }, [translateX, activeIndex, startTranslateX, TABS, setActive, subPanelActive, overlay, pillPosition]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: overlayTranslateX.value }],
  }));

  const handleTabBarLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTabBarWidth(width);
    tabBarWidthShared.value = width;
  }, [tabBarWidthShared]);

  // Pill indicator — driven by pillPosition which is animated for every
  // transition type (swipe drag, adjacent spring, non-adjacent timing).
  const pillAnimatedStyle = useAnimatedStyle(() => {
    const tabWidth = tabBarWidthShared.value / TABS.length;
    const barPadding = 15;
    const position = pillPosition.value * tabWidth + barPadding;

    return {
      transform: [{ translateX: position }],
      width: tabWidth,
    };
  });

  const renderScreens = useCallback(() => {
    return (
      <>
        <View style={styles.screen}>
          <OperationsScreen />
        </View>
        <View style={styles.screen}>
          <GraphsScreen />
        </View>
        <View style={styles.screen}>
          <PlannedOperationsScreen />
        </View>
        <View style={styles.screen}>
          <SettingsScreen setSubPanelActive={setSubPanelActive} />
        </View>
      </>
    );
  }, [setSubPanelActive]);

  // Determine which tab key is visually active (for header + tab highlight)
  const displayedTab = overlay ? overlay.key : active;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header activeScreen={displayedTab} operationsData={operationsData} />
      <View style={styles.content}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.screensContainer, animatedStyle]}>
            {renderScreens()}
          </Animated.View>
        </GestureDetector>

        {/* Overlay for non-adjacent tab press — slides the target screen in
            on top of the strip while the strip slides the current screen out
            in the opposite direction. The overlay fully covers any
            intermediate screens that would otherwise flash through. */}
        {overlay && (
          <Animated.View style={[styles.overlayScreen, { backgroundColor: colors.background }, overlayAnimatedStyle]}>
            <ScreenContent tabKey={overlay.key} setSubPanelActive={setSubPanelActive} />
          </Animated.View>
        )}
      </View>
      {/* Floating bar overlays content so screen shows through behind it */}
      <SafeAreaView edges={['bottom']} style={styles.floatingBarWrapper} pointerEvents="box-none">
        <View
          pointerEvents="box-none"
          style={styles.floatingBarPositioner}
        >
          <View style={[
            styles.floatingBar,
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
                />
              ))}
            </View>
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
  floatingBarPositioner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  floatingBarWrapper: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  overlayScreen: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  screen: {
    height: '100%',
    width: SCREEN_WIDTH,
  },
  screensContainer: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * 4,
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
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  tabsRow: {
    flexDirection: 'row',
  },
});
