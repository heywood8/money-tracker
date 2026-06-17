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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OperationsScreen from '../screens/OperationsScreen';
import GraphsScreen from '../screens/GraphsScreen';
import PlannedOperationsScreen from '../screens/PlannedOperationsScreen';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
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
const TabButton = memo(({ tab, isActive, colors, onPress, isUpdating, updatePhase, updateProgress }) => {
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

TabButton.defaultProps = {
  isActive: false,
  onPress: () => {},
  isUpdating: false,
  updatePhase: null,
  updateProgress: null,
};

// Pre-computed gradient steps: transparent → very dark black overlay
// Cubic ease-in gives a natural-looking gradient
const TAB_OVERLAY_HEIGHT = 130;
const GRADIENT_STEPS = 20;
const gradientStepColors = Array.from({ length: GRADIENT_STEPS }, (_, i) => {
  const t = i / (GRADIENT_STEPS - 1);
  const easedT = t * t * t; // cubic ease-in
  const opacity = (easedT * 0.82).toFixed(3);
  return `rgba(0, 0, 0, ${opacity})`;
});

// Covers the tab bar region, blocks accidental touches falling through
// to the list content below, and shows a darkening gradient as a visual cue.
// Rendered before floatingBarWrapper so tab buttons (higher z-order) remain clickable.
const TabGradientBlocker = memo(() => {
  const stepHeight = TAB_OVERLAY_HEIGHT / GRADIENT_STEPS;
  return (
    <View style={styles.tabGradientOverlay}>
      {gradientStepColors.map((color, i) => (
        <View key={i} style={{ height: stepHeight, backgroundColor: color }} />
      ))}
    </View>
  );
});

TabGradientBlocker.displayName = 'TabGradientBlocker';

export default function SimpleTabs() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { isDownloading, downloadProgress, downloadPhase } = useUpdateDownload();
  const [active, setActive] = React.useState('Operations');
  const [subPanelActive, setSubPanelActive] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);
  // Track which tab indices have been visited so we lazy-mount their screens.
  // Index 0 (Operations) is pre-visited so it renders immediately on cold start.
  const [visited, setVisited] = React.useState(() => ({ 0: true }));

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
  // Opacity per screen — intermediates are zeroed during non-adjacent transitions
  // so they don't bleed through when the target overlaps their strip position.
  const screenOpacity0 = useSharedValue(1);
  const screenOpacity1 = useSharedValue(1);
  const screenOpacity2 = useSharedValue(1);
  const screenOpacity3 = useSharedValue(1);

  const screenAdjustedStyle0 = useAnimatedStyle(() => ({ opacity: screenOpacity0.value, transform: [{ translateX: screenAdjust0.value }] }));
  const screenAdjustedStyle1 = useAnimatedStyle(() => ({ opacity: screenOpacity1.value, transform: [{ translateX: screenAdjust1.value }] }));
  const screenAdjustedStyle2 = useAnimatedStyle(() => ({ opacity: screenOpacity2.value, transform: [{ translateX: screenAdjust2.value }] }));
  const screenAdjustedStyle3 = useAnimatedStyle(() => ({ opacity: screenOpacity3.value, transform: [{ translateX: screenAdjust3.value }] }));

  const handleTabPress = useCallback((tabKey) => {
    const newIndex = TABS.findIndex(tab => tab.key === tabKey);
    const oldIndex = TABS.findIndex(tab => tab.key === active);
    if (newIndex === -1 || newIndex === oldIndex) return;

    // Mark target tab visited so the screen mounts.
    setVisited(prev => prev[newIndex] ? prev : { ...prev, [newIndex]: true });
    setActive(tabKey);
    activeIndex.value = newIndex;

    // Switch instantly — no slide animation. The strip and pill jump straight
    // to the target position on the worklet thread so there is no perceived
    // delay between tapping a tab and the new screen appearing. Any per-screen
    // offset/opacity left over from a prior swipe is reset to its resting state.
    pillPosition.value = newIndex;
    translateX.value = -newIndex * SCREEN_WIDTH;
    screenAdjust0.value = 0;
    screenAdjust1.value = 0;
    screenAdjust2.value = 0;
    screenAdjust3.value = 0;
    screenOpacity0.value = 1;
    screenOpacity1.value = 1;
    screenOpacity2.value = 1;
    screenOpacity3.value = 1;
  }, [TABS, active, activeIndex, translateX, pillPosition,
    screenAdjust0, screenAdjust1, screenAdjust2, screenAdjust3,
    screenOpacity0, screenOpacity1, screenOpacity2, screenOpacity3]);

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
          runOnJS(setVisited)((prev) => prev[newIndex] ? prev : { ...prev, [newIndex]: true });
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
          {visited[0] ? <OperationsScreen /> : null}
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle1]}>
          {visited[1] ? <GraphsScreen /> : null}
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle2]}>
          {visited[2] ? <PlannedOperationsScreen /> : null}
        </Animated.View>
        <Animated.View style={[styles.screen, screenAdjustedStyle3]}>
          {visited[3] ? <SettingsScreen setSubPanelActive={setSubPanelActive} /> : null}
        </Animated.View>
      </>
    );
  }, [visited, setSubPanelActive, screenAdjustedStyle0, screenAdjustedStyle1, screenAdjustedStyle2, screenAdjustedStyle3]);

  const displayedTab = active;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header />
      <View style={styles.content}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.screensContainer, animatedStyle]}>
            {renderScreens()}
          </Animated.View>
        </GestureDetector>
      </View>
      {/* Gradient touch blocker — rendered before floatingBarWrapper so the
          tab buttons (higher z-order, box-none wrapper) remain clickable while
          the empty space around the pill catches accidental taps */}
      <TabGradientBlocker />
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
                  isUpdating={tab.key === 'Settings' && isDownloading}
                  updatePhase={downloadPhase}
                  updateProgress={downloadProgress}
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
  tabGradientOverlay: {
    bottom: 0,
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
