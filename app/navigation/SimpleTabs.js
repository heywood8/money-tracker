import React, { useMemo, useCallback, memo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TouchableRipple, Text, Surface } from 'react-native-paper';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import OperationsScreen from '../screens/OperationsScreen';
import AccountsScreen from '../screens/AccountsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import GraphsScreen from '../screens/GraphsScreen';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import Header from '../components/Header';
import SettingsModal from '../modals/SettingsModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Memoized tab button component to prevent unnecessary re-renders
const TabButton = memo(({ tab, isActive, colors, onPress }) => {
  const textStyle = useMemo(() => ({
    fontWeight: isActive ? '700' : 'normal',
    color: isActive ? colors.primary : colors.mutedText,
  }), [isActive, colors.primary, colors.mutedText]);

  const handlePress = useCallback(() => {
    onPress(tab.key);
  }, [onPress, tab.key]);

  return (
    <TouchableRipple
      style={styles.tab}
      onPress={handlePress}
      rippleColor="rgba(0, 0, 0, .12)"
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={styles.tabContent}>
        <Text variant="labelMedium" style={textStyle}>
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
}
;
TabButton.defaultProps = {
  isActive: false,
  onPress: () => {},
}

;

export default function SimpleTabs() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const [active, setActive] = React.useState('Operations');
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);

  const TABS = useMemo(() => [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
    { key: 'Accounts', label: t('accounts') || 'Accounts' },
    { key: 'Categories', label: t('categories') || 'Categories' },
  ], [t]);

  // Animation shared values
  const translateX = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const tabBarWidthShared = useSharedValue(SCREEN_WIDTH);

  // Update activeIndex when active tab changes
  useEffect(() => {
    const index = TABS.findIndex(tab => tab.key === active);
    if (index !== -1) {
      activeIndex.value = index;
      translateX.value = withSpring(-index * SCREEN_WIDTH, {
        damping: 40,
        stiffness: 150,
      });
    }
  }, [active, TABS, activeIndex, translateX]);

  const handleTabPress = useCallback((tabKey) => {
    setActive(tabKey);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsVisible(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  // Navigate to next or previous tab
  const navigateToTab = useCallback((direction) => {
    const currentIndex = TABS.findIndex(tab => tab.key === active);
    let newIndex;

    if (direction === 'left') {
      // Swipe left = next tab
      newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      // Swipe right = previous tab
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }

    if (newIndex !== currentIndex) {
      setActive(TABS[newIndex].key);
    }
  }, [active, TABS]);

  // Pan gesture for swipe navigation with real-time feedback
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      // Only activate on horizontal movements, allow vertical scrolling
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

        // Clamp the translation to prevent over-scrolling
        translateX.value = Math.max(minTranslateX, Math.min(maxTranslateX, newTranslateX));
      })
      .onEnd((event) => {
        'worklet';
        const { translationX: gestureTranslationX, velocityX } = event;
        const SWIPE_THRESHOLD = 50;
        const VELOCITY_THRESHOLD = 500;

        const currentIndex = activeIndex.value;
        let newIndex = currentIndex;

        // Determine new index based on gesture
        if (gestureTranslationX < -SWIPE_THRESHOLD || velocityX < -VELOCITY_THRESHOLD) {
          newIndex = Math.min(currentIndex + 1, TABS.length - 1);
        } else if (gestureTranslationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD) {
          newIndex = Math.max(currentIndex - 1, 0);
        }

        // If index changed, update shared values on the UI thread and defer React state update
        if (newIndex !== currentIndex) {
          activeIndex.value = newIndex;
          const target = -newIndex * SCREEN_WIDTH;
          translateX.value = withSpring(target, {
            damping: 40,
            stiffness: 150,
          }, (isFinished) => {
            if (isFinished) {
              // Update React state on the JS thread after animation completes
              runOnJS(setActive)(TABS[newIndex].key);
            }
          });
        } else {
          // Snap back to current position if threshold not met
          translateX.value = withSpring(-currentIndex * SCREEN_WIDTH, {
            damping: 40,
            stiffness: 150,
          });
        }
      });
  }, [translateX, activeIndex, startTranslateX, TABS, setActive]);

  // Animated style for the sliding container
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Handler for tab bar layout measurement
  const handleTabBarLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTabBarWidth(width);
    tabBarWidthShared.value = width;
  }, [tabBarWidthShared]);

  // Animated style for the tab indicator
  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    // Calculate the current fractional index based on screen position
    const currentIndex = -translateX.value / SCREEN_WIDTH;

    // Calculate tab width in pixels using measured tab bar width
    const tabWidth = tabBarWidthShared.value / TABS.length;

    // Position in pixels
    const position = currentIndex * tabWidth;

    return {
      transform: [{ translateX: position }],
      width: tabWidth,
    };
  });

  // Render all screens side-by-side for smooth transitions
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
          <AccountsScreen />
        </View>
        <View style={styles.screen}>
          <CategoriesScreen />
        </View>
      </>
    );
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header onOpenSettings={handleOpenSettings} />
      <View style={styles.content}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.screensContainer, animatedStyle]}>
            {renderScreens()}
          </Animated.View>
        </GestureDetector>
      </View>
      <SettingsModal visible={settingsVisible} onClose={handleCloseSettings} />
      <Surface style={styles.tabBarSurface} elevation={3}>
        <SafeAreaView style={styles.tabBar} edges={['bottom']}>
          <View style={styles.tabsRow} onLayout={handleTabBarLayout}>
            {TABS.map(tab => (
              <TabButton
                key={tab.key}
                tab={tab}
                isActive={active === tab.key}
                colors={colors}
                onPress={handleTabPress}
              />
            ))}
          </View>
          <Animated.View style={[styles.indicator, { backgroundColor: colors.primary }, indicatorAnimatedStyle]} />
        </SafeAreaView>
      </Surface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  indicator: {
    height: 3,
    position: 'absolute',
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
    minHeight: 56,
  },
  tabBar: {
    position: 'relative',
  },
  tabBarSurface: {
    elevation: 3,
  },
  tabContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  tabsRow: {
    flexDirection: 'row',
  },
});
