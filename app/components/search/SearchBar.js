import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Keyboard, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';
import { withAlpha } from '../../utils/colorUtils';
import FilterBadge from './FilterBadge';


// Both states share one pill of this height so the resting bar matches the
// Расход/Доход/Перевод type buttons and the open bar is exactly the same size.
const SEARCH_PILL_HEIGHT = 38;
// Resting pill spans ~70% of the available width; it grows to the full width
// when opened. The width is tweened (both ways) so one morphs into the other.
const COLLAPSED_WIDTH_RATIO = 0.7;
const MORPH_DURATION = 260;

// Append an alpha channel to a 6-digit hex color (alpha 0..1).
const SearchBar = ({
  searchText,
  onSearchTextChange,
  onToggleFilters,
  onClose,
  filterCount = 0,
  colors,
  t,
  collapsed = false,
  onCollapsedPress = undefined,
  statusLabel = null,
  onCancelStatus = undefined,
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

  // A background job (today: the Drive backup) borrows the pill to say what it is
  // doing. It takes over only the resting bar: a pill the user has opened is one
  // they are typing into, and a status that swallowed the query mid-word would
  // cost more than the notice is worth. The job is still running when they close
  // search, and the status appears then.
  const showStatus = Boolean(statusLabel) && collapsed;

  // ---- width morph between collapsed (~70%) and open (100%) ----
  // The width is animated in PIXELS (smooth numeric tween, both directions) via
  // Reanimated, so the tween runs on the UI thread and stays smooth even while
  // the JS thread is busy with filter/search work. The content sits in a
  // fixed-width holder that the pill clips with overflow:hidden, so the content
  // lays out exactly once — only the pill's visible width changes per frame,
  // which keeps open AND close animating identically (an animated percentage
  // re-flows the flex content every frame).
  // Seed only — onLayout below replaces it with the real measurement. Read live
  // rather than once at module load so a fold or rotation before the first
  // layout does not seed the width of the screen the app started on.
  const { width: screenWidth } = useWindowDimensions();
  const [available, setAvailable] = useState(() => Math.max(0, screenWidth - 2 * HORIZONTAL_PADDING));
  // Full width for the open bar and for a status line, which carries a label, a
  // spinner and a cancel button and would clip at the resting 70%.
  const expanded = !collapsed || showStatus;
  // 0 = collapsed (~70%), 1 = open (100%). Driven by withTiming on the UI thread.
  const morph = useSharedValue(expanded ? 1 : 0);

  // Only animate on actual open/close transitions, not on first mount — the bar
  // should appear in its current state without animating in.
  const morphMountedRef = useRef(false);
  useEffect(() => {
    if (!morphMountedRef.current) {
      morphMountedRef.current = true;
      morph.value = expanded ? 1 : 0;
      return;
    }
    morph.value = withTiming(expanded ? 1 : 0, {
      duration: MORPH_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, morph]);

  const handleContainerLayout = useCallback((e) => {
    setAvailable(Math.max(0, e.nativeEvent.layout.width - 2 * HORIZONTAL_PADDING));
  }, []);

  // Interpolate the pill width on the UI thread. Reanimated animates layout
  // props (width) directly, so the pill grows from the left just like before.
  const pillAnimatedStyle = useAnimatedStyle(() => {
    const collapsedWidth = available * COLLAPSED_WIDTH_RATIO;
    return {
      width: collapsedWidth + (available - collapsedWidth) * morph.value,
    };
  }, [available]);

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
          pillAnimatedStyle,
          {
            backgroundColor: withAlpha(colors.surface, 0.87),
            borderColor: withAlpha(colors.border, 0.5),
          },
        ]}
      >
        {/* Fixed-width content holder — laid out once at the full width and
            clipped by the (animating) pill, so only the pill's width changes. */}
        <View style={[styles.contentHolder, { width: available }]}>
          {showStatus ? (
            <View style={styles.statusRow} testID="search-bar-status">
              <ActivityIndicator size="small" color={colors.primary} />
              {/* Live region rather than a progressbar role: the phase changes
                  several times during a run, and TalkBack should read the new
                  line without the user having to go looking for it. */}
              <Text
                style={[styles.statusLabel, { color: colors.text }]}
                numberOfLines={1}
                accessibilityLiveRegion="polite"
              >
                {statusLabel}
              </Text>
              {!!onCancelStatus && (
                <TouchableOpacity
                  testID="cancel-status-button"
                  onPress={onCancelStatus}
                  style={styles.iconButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel')}
                >
                  <Icon name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          ) : collapsed ? (
            <TouchableOpacity
              testID="search-input-container"
              activeOpacity={0.6}
              onPress={onCollapsedPress}
              accessibilityRole="button"
              accessibilityLabel={t('search')}
              style={styles.collapsedTouchable}
            >
              <View style={styles.iconWrapper}>
                <Icon name="magnify" size={18} color={colors.text} />
                <FilterBadge count={filterCount} colors={colors} testID="filter-count-badge-collapsed" />
              </View>
              <Text style={[styles.collapsedLabel, { color: colors.mutedText }]} numberOfLines={1}>
                {t('search')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.openRow}>
              <View testID="search-input-container" style={styles.searchInputContainer}>
                <Icon name="magnify" size={20} color={colors.text} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  value={localText}
                  onChangeText={setLocalText}
                  placeholder={t('search_operations_placeholder')}
                  placeholderTextColor={colors.mutedText}
                  autoFocus
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
                    <FilterBadge count={filterCount} colors={colors} testID="filter-count-badge" />
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
            </View>
          )}
        </View>
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
  statusLabel: PropTypes.string,
  onCancelStatus: PropTypes.func,
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    width: 96, // 44 + 44 + 8
  },
  collapsedLabel: {
    fontSize: FONT_SIZE.md,
  },
  // Fills the holder so a tap anywhere on the resting pill opens search,
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
  contentHolder: {
    flexDirection: 'row',
    height: '100%',
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
  openRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  pill: {
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: SEARCH_PILL_HEIGHT,
    justifyContent: 'center',
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
    fontSize: FONT_SIZE.base,
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
  statusLabel: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  statusRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.xs,
  },
});

export default SearchBar;
