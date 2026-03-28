import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../styles/designTokens';

const MAX_CHIPS = 8;

/**
 * DescriptionAutocomplete
 *
 * A single-line TextInput that shows a horizontal row of suggestion chips when focused.
 * Chips are filtered by substring match against the current value.
 * Tapping a chip fills the input with that description.
 *
 * Props:
 *   value          - current text value
 *   onChangeText   - callback(text) when value changes
 *   suggestions    - string[] of past descriptions, ordered by frequency (most used first)
 *   placeholder    - input placeholder text
 *   editable       - whether the input is editable (default true)
 *   colors         - theme colors object from ThemeColorsContext
 *   containerStyle - optional style override for the outer container
 */
const DescriptionAutocomplete = ({
  value,
  onChangeText,
  suggestions,
  placeholder,
  editable,
  colors,
  containerStyle,
  onFocus,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [renderChips, setRenderChips] = useState(false);
  const blurTimerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);

  // Client-side filtered suggestions
  const filteredSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    const trimmed = value ? value.trim() : '';
    if (trimmed === '') {
      // No text: show top N suggestions
      return suggestions.slice(0, MAX_CHIPS);
    }
    const lower = trimmed.toLowerCase();
    return suggestions
      .filter(s => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower)
      .slice(0, MAX_CHIPS);
  }, [suggestions, value]);

  const showSuggestions = isFocused && filteredSuggestions.length > 0;

  // Animate chips panel in/out; unmount after fade-out to collapse layout space
  useEffect(() => {
    if (showSuggestions) {
      setRenderChips(true);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRenderChips(false);
      });
    }
  }, [showSuggestions, fadeAnim]);

  // Cleanup blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsFocused(true);
    if (onFocus) onFocus();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    // Delay so a chip tap can fire before we hide the suggestions
    blurTimerRef.current = setTimeout(() => {
      setIsFocused(false);
    }, 200);
  }, []);

  const handleChipPress = useCallback((chip) => {
    // Cancel the pending blur-hide so we control the timing
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    onChangeText(chip);
    setIsFocused(false);
    inputRef.current?.blur();
  }, [onChangeText]);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: isFocused ? colors.primary : colors.inputBorder,
          },
          !editable && styles.disabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        editable={editable}
        returnKeyType="done"
        testID="description-input"
      />

      {/* Animated suggestion chips row */}
      <Animated.View
        style={[styles.chipsWrapper, { opacity: fadeAnim }]}
        pointerEvents={renderChips ? 'auto' : 'none'}
      >
        {renderChips && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.chipsContent}
            testID="chips-scroll"
          >
            {filteredSuggestions.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.altRow,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => handleChipPress(chip)}
                activeOpacity={0.65}
                testID={`chip-${chip}`}
              >
                <Text
                  style={[styles.chipText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {chip}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
};

DescriptionAutocomplete.propTypes = {
  value: PropTypes.string,
  onChangeText: PropTypes.func.isRequired,
  suggestions: PropTypes.arrayOf(PropTypes.string),
  placeholder: PropTypes.string,
  editable: PropTypes.bool,
  colors: PropTypes.object.isRequired,
  containerStyle: PropTypes.object,
  onFocus: PropTypes.func,
};

DescriptionAutocomplete.defaultProps = {
  value: '',
  suggestions: [],
  placeholder: '',
  editable: true,
  containerStyle: undefined,
  onFocus: undefined,
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    marginRight: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    maxWidth: 160,
  },
  chipsContent: {
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  chipsWrapper: {
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
    minHeight: 30,
  },
  container: {
    marginBottom: SPACING.md,
  },
  disabled: {
    opacity: 0.6,
  },
  input: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    padding: SPACING.md,
  },
});

export default DescriptionAutocomplete;
