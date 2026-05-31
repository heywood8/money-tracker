import React, { useMemo, useCallback, useRef, memo } from 'react';
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

export default function SimpleTabs() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const operationsData = useOperationsData();
  const [active, setActive] = React.useState('Operations');
  const [subPanelActive, setSubPanelActive] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);

  // Guard ref — updated synchronously so handleTabPress never reads stale state.
  const isTransitioningRef = useRef(false);
  // Shared value mirror — readable on the worklet thread inside panGesture
  // callbacks without making any React state a useMemo dep (which would
  // reinstall the native gesture recognizer mid-animation and cause jitter).
  const isTransitioningShared = useSharedValue(false);

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
  // adjacent, and non-adjacent transitions.
  const pillPosition = useSharedValue(0);

  // Per-screen horizontal offset for non-adjacent transitions.
  // During a non-adjacent tap A→D we instantly reposition the target screen to
  // be adjacent to the source (worklet thread, no React render), animate the
  // strip exactly 1 screen width (same as adjacent), then snap strip to the
  // real resting position and zero the offset — both on the worklet thread so
  // there is no visible jump. All 4 screens stay pre-mounted; no overlay needed.
  const screenAdjust0 = useSharedValue(0);
  const screenAdjust1 = useSharedValue(0);
  const screenAdjust2 = useSharedValue(0);
  const screenAdjust3 = useSharedValue(0);

  const screenAdjustedStyle0 = useAnimatedStyle(() => ({ transform: [{ translateX: screenAdjust0.value }] }));
  const screenAdjustedStyle1 = useAnimatedStyle(() => ({ transform: [{ translateX: screenAdjust1.value }] }));
  const screenAdjustedStyle2 = useAnimatedStyle(() => ({ transform: [{ translateX: screenAdjust2.value }] }));
  const screenAdjustedStyle3 = useAnimatedStyle(() => ({ transform: [{ translateX: screenAdjust3.value }] }));

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

    setActive(tabKey);
    activeIndex.value = newIndex;
    pillPosition.value = withTiming(newIndex, PILL_TIMING);

    if (distance === 1) {
      translateX.value = withTiming(-newIndex * SCREEN_WIDTH, SCREEN_TIMING);
      return;
    }

    // ---- Non-adjacent tab ----
    // Reposition the target screen to sit immediately adjacent to the source
    // on the worklet thread (zero React overhead). The strip then animates
    // exactly 1 screen width — identical feel to adjacent. On completion the
    // strip snaps to the real resting position and the per-screen offset is
    // zeroed simultaneously, both on the worklet thread — no visual jump.
    const direction = newIndex > oldIndex ? 1 : -1;
    // How far to shift the target so it appears one screen width past the source.
    const adjacentOffset = (oldIndex + direction - newIndex) * SCREEN_WIDTH;
    const adjSharedValues = [screenAdjust0, screenAdjust1, screenAdjust2, screenAdjust3];
    const targetAdjust = adjSharedValues[newIndex];

    isTransitioningShared.value = true;
    isTransitioningRef.current = true;

    targetAdjust.value = adjacentOffset; // instant reposition on worklet thread
    translateX.value = withTiming(-(oldIndex + direction) * SCREEN_WIDTH, SCREEN_TIMING, (finished) => {
      'worklet';
      if (!finished) return;
      // Snap strip and zero offset simultaneously — no React render, no flash.
      translateX.value = -newIndex * SCREEN_WIDTH;
      targetAdjust.value = 0;
      isTransitioningShared.value = false;
      runOnJS(clearTransitioningRef)();
    });
  }, [TABS, active, activeIndex, translateX, pillPosition, isTransitioningShared,
    screenAdjust0, screenAdjust1, screenAdjust2, screenAdjust3, clearTransitioningRef]);

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

  const renderScreens = useCallback(() => {
    return (
      <>
        <Animated.View style={[styles.screen, screenAdjustedStyle0]}>
          <OperationsScreen />
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle1]}>
          <GraphsScreen />
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle2]}>
          <PlannedOperationsScreen />
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle3]}>
          <SettingsScreen setSubPanelActive={setSubPanelActive} />
        </Animated.View>
      </>
    );
  }, [setSubPanelActive, screenAdjustedStyle0, screenAdjustedStyle1, screenAdjustedStyle2, screenAdjustedStyle3]);

  const displayedTab = active;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header activeScreen={displayedTab} operationsData={operationsData} />
      <View style={styles.content}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.screensContainer, animatedStyle]}>
            {renderScreens()}
          </Animated.View>
        </GestureDetector>
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
