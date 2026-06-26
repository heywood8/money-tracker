import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Keyboard, Platform, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING, SPACING } from '../../styles/layout';

// Both states share one pill of this height so the resting bar matches the
// Расход/Доход/Перевод type buttons and the open bar is exactly the same size.
const SEARCH_PILL_HEIGHT = 38;
const MORPH_DURATION = 260;

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

  // ---- width morph between collapsed (~70%) and open (100%) ----
  // Driven by RN's Animated with useNativeDriver:false so the width is a real
  // (percentage) layout value each frame — Yoga lays the content out correctly
  // at every step, which an animated transform/Reanimated width does not
  // guarantee for in-flow children. Content for each state is rendered
  // conditionally, so exactly one variant is mounted — always visible/tappable.
  const morph = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(morph, {
      toValue: collapsed ? 0 : 1,
      duration: MORPH_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [collapsed, morph]);

  const pillWidth = morph.interpolate({
    inputRange: [0, 1],
    outputRange: ['70%', '100%'],
  });

  const handleClear = useCallback(() => {
    setLocalText('');
    lastSentRef.current = '';
    onSearchTextChange('');
  }, [onSearchTextChange]);

  return (
    <View
      testID="search-bar-container"
      style={styles.container}
      pointerEvents="box-none"
    >
      <Animated.View
        testID="search-pill"
        style={[
          styles.pill,
          {
            width: pillWidth,
            backgroundColor: withAlpha(colors.surface, 0.87),
            borderColor: withAlpha(colors.border, 0.5),
          },
        ]}
      >
        {collapsed ? (
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
              {filterCount > 0 && (
                <View testID="filter-count-badge-collapsed" style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
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
          </View>
        )}
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
  openRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  pill: {
    alignSelf: 'center',
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
