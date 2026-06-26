import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Keyboard, Platform, Dimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING, SPACING } from '../../styles/layout';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Both states share one pill of this height so the resting bar matches the
// Расход/Доход/Перевод type buttons and the open bar is exactly the same size.
const SEARCH_PILL_HEIGHT = 38;
// Resting pill spans ~70% of the available width; it grows to the full width
// when opened. The two are tweened so one morphs into the other.
const COLLAPSED_WIDTH_RATIO = 0.7;
const MORPH_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };

// Append an alpha channel to a 6-digit hex color (alpha 0..1).
// Mirrors the helper used by the bottom tab bar so the search pill picks up the
// same translucent surface treatment.
const withAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};

const SearchBar = ({
  searchText,
  onSearchTextChange,
  onToggleFilters,
  onClose,
  filterCount,
  colors,
  t,
  collapsed,
  onCollapsedPress,
}) => {
  const [localText, setLocalText] = useState(searchText);
  // Track the last value we sent to the parent so we can distinguish
  // "the parent just received our debounced update" (no-op) from
  // "the parent changed searchText externally" (e.g. clear-all).
  const lastSentRef = useRef(searchText);
  const localTextRef = useRef(localText);
  localTextRef.current = localText;
  const onChangeRef = useRef(onSearchTextChange);
  onChangeRef.current = onSearchTextChange;
  const inputRef = useRef(null);

  // Debounce local text into parent state.
  // Skip the initial mount call — there's nothing new to send.
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      lastSentRef.current = localText;
      onSearchTextChange(localText);
    }, 300);
    return () => clearTimeout(timer);
  }, [localText, onSearchTextChange]);

  // Sync local text when searchText changes externally (e.g. clear-all from outside).
  useEffect(() => {
    if (searchText !== lastSentRef.current) {
      lastSentRef.current = searchText;
      setLocalText(searchText);
    }
  }, [searchText]);

  // Flush any pending debounced change on unmount so closing the search bar
  // mid-typing doesn't discard the last keystrokes.
  useEffect(() => {
    return () => {
      if (lastSentRef.current !== localTextRef.current) {
        onChangeRef.current(localTextRef.current);
      }
    };
  }, []);

  // ---- morph between collapsed (0) and open (1) ----
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH);
  const progress = useSharedValue(collapsed ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(collapsed ? 0 : 1, MORPH_TIMING);
  }, [collapsed, progress]);

  // The input stays mounted in both states (so it can fade), so drive focus
  // explicitly instead of using autoFocus — otherwise it would grab the
  // keyboard while the bar is still collapsed.
  useEffect(() => {
    if (collapsed) {
      inputRef.current?.blur();
      return undefined;
    }
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [collapsed]);

  const handleContainerLayout = useCallback((e) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const available = Math.max(0, containerWidth - 2 * HORIZONTAL_PADDING);

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(
      progress.value,
      [0, 1],
      [available * COLLAPSED_WIDTH_RATIO, available],
      Extrapolation.CLAMP,
    ),
  }));

  // Asymmetric cross-fade: the leaving layer is gone by the halfway point and the
  // arriving layer only starts after it, so they never both read at full strength.
  const collapsedLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
  }));
  const openLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const handleClear = useCallback(() => {
    setLocalText('');
    lastSentRef.current = '';
    onSearchTextChange('');
  }, [onSearchTextChange]);

  return (
    <View
      testID="search-bar-container"
      style={styles.container}
      onLayout={handleContainerLayout}
      pointerEvents="box-none"
    >
      <Animated.View
        testID="search-pill"
        style={[
          styles.pill,
          pillStyle,
          {
            backgroundColor: withAlpha(colors.surface, 0.87),
            borderColor: withAlpha(colors.border, 0.5),
          },
        ]}
      >
        {/* Open/active layer */}
        <Animated.View
          style={[styles.openLayer, openLayerStyle]}
          pointerEvents={collapsed ? 'none' : 'auto'}
        >
          <View testID="search-input-container" style={styles.searchInputContainer}>
            <Icon name="magnify" size={20} color={colors.text} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.text }]}
              value={localText}
              onChangeText={setLocalText}
              placeholder={t('search_operations_placeholder')}
              placeholderTextColor={colors.mutedText}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {localText.length > 0 && (
              <TouchableOpacity
                testID="clear-search-button"
                onPress={handleClear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close-circle" size={20} color={colors.mutedText} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              testID="filters-toggle-button"
              onPress={() => { Keyboard.dismiss(); onToggleFilters(); }}
              style={[styles.iconButton, filterCount > 0 && { backgroundColor: `${colors.primary}15` }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <View style={styles.filterButtonContent}>
                <Icon name="filter-variant" size={22} color={filterCount > 0 ? colors.primary : colors.text} />
                {filterCount > 0 && (
                  <View testID="filter-count-badge" style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.filterBadgeText}>{filterCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="close-search-button"
              onPress={onClose}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Collapsed/resting layer */}
        <Animated.View
          style={[styles.collapsedLayer, collapsedLayerStyle]}
          pointerEvents={collapsed ? 'auto' : 'none'}
        >
          <TouchableOpacity
            testID="search-collapsed-button"
            activeOpacity={0.6}
            onPress={onCollapsedPress}
            accessibilityRole="button"
            accessibilityLabel={t('search')}
            style={styles.collapsedTouchable}
          >
            <View style={styles.iconWrapper}>
              <Icon name="magnify" size={18} color={colors.text} />
              {collapsed && filterCount > 0 && (
                <View testID="filter-count-badge-collapsed" style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.collapsedLabel, { color: colors.mutedText }]} numberOfLines={1}>
              {t('search')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

SearchBar.propTypes = {
  searchText: PropTypes.string.isRequired,
  onSearchTextChange: PropTypes.func.isRequired,
  onToggleFilters: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  filterCount: PropTypes.number,
  colors: PropTypes.shape({
    surface: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    mutedText: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
  collapsed: PropTypes.bool,
  onCollapsedPress: PropTypes.func,
};

SearchBar.defaultProps = {
  filterCount: 0,
  collapsed: false,
  onCollapsedPress: undefined,
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    width: 96, // 44 + 44 + 8
  },
  collapsedLabel: {
    fontSize: 14,
  },
  collapsedLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  // Fills the whole pill so a tap anywhere on the resting bar opens search,
  // with the icon + label centered inside.
  collapsedTouchable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.xs,
    width: '100%',
  },
  filterBadge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  filterButtonContent: {
    position: 'relative',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 36,
    justifyContent: 'center',
    width: 44,
  },
  iconWrapper: {
    position: 'relative',
  },
  openLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  pill: {
    alignItems: 'center',
    borderRadius: SEARCH_PILL_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: 'row',
    height: SEARCH_PILL_HEIGHT,
    overflow: 'hidden',
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
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    paddingVertical: 0,
  },
  searchInputContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    height: '100%',
  },
});

export default SearchBar;
