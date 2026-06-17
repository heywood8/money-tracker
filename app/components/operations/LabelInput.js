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
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../../styles/designTokens';
import { parseLabels, serializeLabels, addLabel, removeLabel, hasLabel } from '../../utils/labelUtils';

const MAX_SUGGESTION_CHIPS = 8;

// Characters that commit the typed text into a label as soon as they are entered.
const COMMIT_SPLIT = /[|,\n]/;

/**
 * LabelInput
 *
 * A tag-style editor for an operation's labels. The whole `description` field is
 * a delimited list of labels (see labelUtils), so this component reads/writes the
 * description string via the same `value` / `onChangeText` contract the previous
 * single-line field used — the form hook and DB layer need no changes.
 *
 * Existing labels render as removable chips; a trailing text input adds new ones
 * (on submit, on typing a delimiter/comma, or by tapping an autocomplete chip).
 */
const LabelInput = ({
  value = '',
  onChangeText,
  suggestions = [],
  placeholder = '',
  editable = true,
  colors,
  containerStyle,
  onFocus,
  t,
}) => {
  const labels = useMemo(() => parseLabels(value), [value]);
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [renderChips, setRenderChips] = useState(false);
  const blurTimerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);

  const commitLabels = useCallback((newLabels) => {
    onChangeText(serializeLabels(newLabels));
  }, [onChangeText]);

  const addFromText = useCallback((text) => {
    const next = addLabel(labels, text);
    if (next.length !== labels.length) {
      commitLabels(next);
    }
  }, [labels, commitLabels]);

  // Suggestions: not already applied, and substring-matching the current input.
  const filteredSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    const trimmed = input.trim().toLowerCase();
    return suggestions
      .filter(s => s && !hasLabel(labels, s))
      .filter(s => trimmed === '' || s.toLowerCase().includes(trimmed))
      .slice(0, MAX_SUGGESTION_CHIPS);
  }, [suggestions, labels, input]);

  const showSuggestions = isFocused && editable && filteredSuggestions.length > 0;

  useEffect(() => {
    if (showSuggestions) {
      setRenderChips(true);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setRenderChips(false);
      });
    }
  }, [showSuggestions, fadeAnim]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
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
    // Commit any pending text so a label isn't silently lost on blur.
    if (input.trim()) {
      addFromText(input);
      setInput('');
    }
    blurTimerRef.current = setTimeout(() => setIsFocused(false), 200);
  }, [input, addFromText]);

  const handleInputChange = useCallback((text) => {
    if (COMMIT_SPLIT.test(text)) {
      const parts = text.split(COMMIT_SPLIT);
      const remainder = parts.pop();
      let next = labels;
      parts.forEach((p) => { next = addLabel(next, p); });
      if (next.length !== labels.length) commitLabels(next);
      setInput(remainder);
    } else {
      setInput(text);
    }
  }, [labels, commitLabels]);

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      addFromText(input);
      setInput('');
    }
  }, [input, addFromText]);

  const handleRemove = useCallback((label) => {
    commitLabels(removeLabel(labels, label));
  }, [labels, commitLabels]);

  const handleSuggestionPress = useCallback((label) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    addFromText(label);
    setInput('');
    inputRef.current?.focus();
  }, [addFromText]);

  return (
    <View style={[styles.container, containerStyle]}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.inputBackground,
            borderColor: isFocused ? colors.primary : colors.inputBorder,
          },
          !editable && styles.disabled,
        ]}
      >
        {labels.map((label) => (
          <View
            key={label}
            style={[styles.chip, { backgroundColor: colors.altRow, borderColor: colors.border }]}
            testID={`label-chip-${label}`}
          >
            <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{label}</Text>
            {editable && (
              <TouchableOpacity
                onPress={() => handleRemove(label)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`${t ? t('remove') : 'remove'}: ${label}`}
                testID={`label-remove-${label}`}
              >
                <Icon name="close" size={14} color={colors.mutedText} />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {editable && (
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            value={input}
            onChangeText={handleInputChange}
            placeholder={labels.length === 0 ? placeholder : ''}
            placeholderTextColor={colors.mutedText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSubmitEditing={handleSubmit}
            blurOnSubmit={false}
            returnKeyType="done"
            editable={editable}
            testID="label-input-field"
          />
        )}
      </View>

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
            testID="label-suggestions-scroll"
          >
            {filteredSuggestions.map((label) => (
              <TouchableOpacity
                key={label}
                style={[styles.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleSuggestionPress(label)}
                activeOpacity={0.65}
                accessibilityRole="button"
                accessibilityLabel={`label: ${label}`}
                testID={`label-suggestion-${label}`}
              >
                <Icon name="plus" size={12} color={colors.primary} />
                <Text style={[styles.suggestionText, { color: colors.primary }]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
};

LabelInput.propTypes = {
  value: PropTypes.string,
  onChangeText: PropTypes.func.isRequired,
  suggestions: PropTypes.arrayOf(PropTypes.string),
  placeholder: PropTypes.string,
  editable: PropTypes.bool,
  colors: PropTypes.object.isRequired,
  containerStyle: PropTypes.object,
  onFocus: PropTypes.func,
  t: PropTypes.func,
};

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    maxWidth: 220,
  },
  chipsContent: {
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  chipsWrapper: {
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  container: {
    marginBottom: SPACING.md,
  },
  disabled: {
    opacity: 0.6,
  },
  field: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    minHeight: 48,
    padding: SPACING.sm,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 16,
    minWidth: 80,
    paddingVertical: SPACING.xs,
  },
  suggestionChip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginRight: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  suggestionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    maxWidth: 160,
  },
});

export default LabelInput;
