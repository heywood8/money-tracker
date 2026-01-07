import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { BORDER_RADIUS, SPACING, HEIGHTS } from '../styles/designTokens';
import { hasOperation as checkHasOperation, evaluateExpression as evalExpr } from '../utils/calculatorUtils';

/**
 * Calculator button component - Memoized for performance
 * Executes on press down and repeats during long holds
 */
const CalcButton = memo(({ value, onPress, style, textStyle, icon, colors }) => {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const isPressedRef = useRef(false);
  const intervalActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const clearTimers = useCallback(() => {
    // If interval is active, request stop instead of clearing directly
    if (intervalActiveRef.current) {
      stopRequestedRef.current = true;
      return;
    }

    // Normal release (for short presses)
    isPressedRef.current = false;

    // Clear timeout if exists
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Clear interval if exists
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Press down - execute immediately for instant feedback
  const handlePressIn = useCallback(() => {
    isPressedRef.current = true;
    intervalActiveRef.current = false; // Reset interval flag
    stopRequestedRef.current = false; // Reset stop flag
    // Execute immediately on press down
    onPress(value);
  }, [onPress, value]);

  // Long press - start repeating after 500ms hold
  const handleLongPress = useCallback(() => {
    // Mark interval as active - this blocks onPressOut from interfering
    intervalActiveRef.current = true;
    isPressedRef.current = true;

    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Execute once immediately when long press triggers
    onPress(value);

    // Safety counter to prevent infinite loop if onPressOut never fires
    let tickCount = 0;
    const maxTicks = 200; // 20 seconds max (200 * 100ms)

    // Start repeating - checks stopRequestedRef to know when to stop
    intervalRef.current = setInterval(() => {
      tickCount++;

      // Check if stop was requested (user released button)
      if (stopRequestedRef.current) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        intervalActiveRef.current = false;
        stopRequestedRef.current = false;
        isPressedRef.current = false;
        return;
      }

      // Safety: auto-stop after max iterations
      if (tickCount >= maxTicks) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        intervalActiveRef.current = false;
        isPressedRef.current = false;
        return;
      }

      // Execute the action
      onPress(value);
    }, 100); // Repeat every 100ms
  }, [onPress, value]);

  const buttonStyle = useMemo(() => [
    styles.button,
    { borderColor: colors.border },
    style,
  ], [colors.border, style]);

  const finalTextStyle = useMemo(() => [
    styles.buttonText,
    textStyle,
  ], [textStyle]);

  return (
    <Pressable
      style={({ pressed }) => [
        buttonStyle,
        pressed && { opacity: 0.7 },
      ]}
      onPressIn={handlePressIn}
      onLongPress={handleLongPress}
      onPressOut={clearTimers}
      delayLongPress={500}
      unstable_pressDelay={0}
      android_disableSound={true}
      accessibilityRole="button"
      accessibilityLabel={value}
    >
      {icon ? (
        <Icon name={icon} size={24} color={textStyle?.color || colors.text} />
      ) : (
        <Text style={finalTextStyle}>{value}</Text>
      )}
    </Pressable>
  );
});
CalcButton.displayName = 'CalcButton';

CalcButton.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onPress: PropTypes.func,
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  textStyle: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  icon: PropTypes.string,
  colors: PropTypes.object,
};

CalcButton.defaultProps = {
  value: '',
  onPress: () => {},
  style: null,
  textStyle: null,
  icon: null,
  colors: {},
};

/**
 * Calculator component for amount input
 * Features:
 * - Numeric keypad (0-9)
 * - Basic operations (+, -, x, %)
 * - Decimal point support
 * - Backspace
 * - Shows "=" button when expression contains operations
 * - Evaluates expression and replaces with result
 */
export default function Calculator({ value, onValueChange, colors, placeholder = '0' }) {
  const [expression, setExpression] = useState(value || '');

  // Sync internal state with prop changes
  useEffect(() => {
    setExpression(value || '');
  }, [value]);

  // Check if expression contains a mathematical operation - Memoized
  const hasOperation = useMemo(() => checkHasOperation(expression), [expression]);

  // Get the last number in the expression - Memoized
  const getLastNumber = useCallback((expr) => {
    const match = expr.match(/[+\-×÷]?([0-9.]+)$/);
    return match ? match[1] : expr;
  }, []);

  // Handle button press - Wrapped with useCallback for performance
  const handlePress = useCallback((key) => {
    // Use functional setState to avoid stale closure issues during rapid updates
    setExpression((prevExpression) => {
      let newExpression = prevExpression;

      if (key === 'backspace') {
        newExpression = prevExpression.slice(0, -1);
      } else if (key === '=') {
        // Evaluate the expression
        const result = evalExpr(prevExpression);
        if (result !== null) {
          newExpression = result;
        }
      } else if (key === '.') {
        // Only allow one decimal point per number
        const lastNumber = getLastNumber(prevExpression);
        if (!lastNumber.includes('.')) {
          newExpression = prevExpression + key;
        }
      } else if (['+', '-', '×', '÷'].includes(key)) {
        // Don't allow operation at the start (except minus for negative numbers)
        if (prevExpression.length === 0 && key !== '-') {
          return prevExpression; // No change
        }
        // Don't allow consecutive operations
        if (/[+\-×÷]$/.test(prevExpression)) {
          newExpression = prevExpression.slice(0, -1) + key;
        } else {
          newExpression = prevExpression + key;
        }
      } else {
        // Numeric key
        newExpression = prevExpression + key;
      }

      // Call onValueChange with new expression
      onValueChange(newExpression);
      return newExpression;
    });
  }, [onValueChange, getLastNumber]);

  // Handle equals button press - Wrapped with useCallback
  const handleEqualsPress = useCallback(() => {
    handlePress('=');
  }, [handlePress]);

  // Memoize display text style
  const displayTextStyle = useMemo(() => [
    styles.displayText,
    { color: colors.text },
  ], [colors.text]);

  // Memoize equals button text style
  const equalsButtonTextStyle = useMemo(() => [
    styles.equalsButtonText,
    { color: colors.text },
  ], [colors.text]);

  // Memoize button styles for better performance
  // Use a single background for all calculator buttons
  const buttonBackground = colors.calcButtonBackground || colors.inputBackground || colors.background;

  const sharedButtonStyle = useMemo(() => ({
    backgroundColor: buttonBackground,
  }), [buttonBackground]);

  const operationTextStyle = useMemo(() => ({
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  }), [colors.primary]);

  const numberTextStyle = useMemo(() => ({
    color: colors.text,
    fontSize: 20,
  }), [colors.text]);

  const decimalTextStyle = useMemo(() => ({
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  }), [colors.text]);

  const deleteButtonStyle = useMemo(() => ({
    backgroundColor: colors.deleteBackground || buttonBackground,
  }), [colors.deleteBackground, buttonBackground]);

  return (
    // Use altRow so Calculator background matches the gray inner card
    <View style={[styles.container, { backgroundColor: colors.altRow }]}>
      {/* Display */}
      <View style={styles.display}>
        <Text style={displayTextStyle} numberOfLines={1}>
          {expression}
        </Text>
        {hasOperation && (
          <Pressable
            style={styles.equalsButton}
            onPress={handleEqualsPress}
            accessibilityRole="button"
            accessibilityLabel="equals"
          >
            <Text style={equalsButtonTextStyle}>=</Text>
          </Pressable>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {/* Row 1: + 1 2 3 */}
        <View style={styles.row}>
          <CalcButton
            value="+"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="1"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="2"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="3"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 2: - 4 5 6 */}
        <View style={styles.row}>
          <CalcButton
            value="-"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="4"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="5"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="6"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 3: × 7 8 9 */}
        <View style={styles.row}>
          <CalcButton
            value="×"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="7"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="8"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="9"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 4: ÷ . 0 <- */}
        <View style={styles.row}>
          <CalcButton
            value="÷"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="."
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={decimalTextStyle}
            colors={colors}
          />
          <CalcButton
            value="0"
            onPress={handlePress}
            style={sharedButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="backspace"
            onPress={handlePress}
            style={deleteButtonStyle}
            icon="backspace-outline"
            colors={colors}
          />
        </View>
      </View>
    </View>
  );
}

Calculator.displayName = 'Calculator';

Calculator.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onValueChange: PropTypes.func,
  colors: PropTypes.object.isRequired,
  placeholder: PropTypes.string,
};

Calculator.defaultProps = {
  value: '',
  onValueChange: () => {},
  placeholder: '0',
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    elevation: 2,
    flex: 1,
    height: HEIGHTS.calculator,
    justifyContent: 'center',
    shadowColor: '#7a7878ff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    marginBottom: SPACING.md,
    width: '100%',
  },
  display: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    minHeight: 40,
    paddingVertical: SPACING.sm,
    width: '100%',
  },
  displayText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  equalsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  equalsButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  keypad: {
    gap: SPACING.xs,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xs,
    width: '100%',
  },
});
