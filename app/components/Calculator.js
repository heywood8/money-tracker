import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

/**
 * Calculator button component - Memoized for performance
 */
const CalcButton = memo(({ value, onPress, style, textStyle, icon, colors }) => {
  const handlePress = useCallback(() => {
    onPress(value);
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
    <TouchableOpacity
      style={buttonStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={value}
    >
      {icon ? (
        <Icon name={icon} size={24} color={textStyle?.color || colors.text} />
      ) : (
        <Text style={finalTextStyle}>{value}</Text>
      )}
    </TouchableOpacity>
  );
});

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
  const hasOperation = useMemo(() => /[+\-×÷]/.test(expression), [expression]);

  // Get the last number in the expression - Memoized
  const getLastNumber = useCallback((expr) => {
    const match = expr.match(/[+\-×÷]?([0-9.]+)$/);
    return match ? match[1] : expr;
  }, []);

  // Evaluate mathematical expression - Memoized
  const evaluateExpression = useCallback((expr) => {
    if (!expr || expr.trim() === '') return null;

    try {
      // Replace '×' with '*' for multiplication and '÷' with '/' for division
      let sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/');

      // Validate expression (only allow numbers, operators, and decimal points)
      if (!/^[0-9+\-*/.() ]+$/.test(sanitized)) {
        return null;
      }

      // Use Function constructor to safely evaluate (no access to external scope)
      // Note: This is safer than eval() but still requires validation above
      const result = Function('"use strict"; return (' + sanitized + ')')();

      if (isNaN(result) || !isFinite(result)) {
        return null;
      }

      // Round to 2 decimal places to avoid floating point issues
      return Math.round(result * 100) / 100;
    } catch (error) {
      return null;
    }
  }, []);

  // Handle button press - Wrapped with useCallback for performance
  const handlePress = useCallback((key) => {
    let newExpression = expression;

    if (key === 'backspace') {
      newExpression = expression.slice(0, -1);
    } else if (key === '=') {
      // Evaluate the expression
      try {
        const result = evaluateExpression(expression);
        if (result !== null) {
          newExpression = String(result);
        }
      } catch (error) {
        // If evaluation fails, keep the expression as is
        console.warn('Invalid expression:', expression);
      }
    } else if (key === '.') {
      // Only allow one decimal point per number
      const lastNumber = getLastNumber(expression);
      if (!lastNumber.includes('.')) {
        newExpression = expression + key;
      }
    } else if (['+', '-', '×', '÷'].includes(key)) {
      // Don't allow operation at the start (except minus for negative numbers)
      if (expression.length === 0 && key !== '-') {
        return;
      }
      // Don't allow consecutive operations
      if (/[+\-×÷]$/.test(expression)) {
        newExpression = expression.slice(0, -1) + key;
      } else {
        newExpression = expression + key;
      }
    } else {
      // Numeric key
      newExpression = expression + key;
    }

    setExpression(newExpression);
    onValueChange(newExpression);
  }, [expression, onValueChange, getLastNumber, evaluateExpression]);

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
  const operationButtonStyle = useMemo(() => ({
    backgroundColor: colors.operationBackground || colors.surface,
  }), [colors.operationBackground, colors.surface]);

  const operationTextStyle = useMemo(() => ({
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  }), [colors.primary]);

  const surfaceButtonStyle = useMemo(() => ({
    backgroundColor: colors.surface,
  }), [colors.surface]);

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
    backgroundColor: colors.deleteBackground || colors.surface,
  }), [colors.deleteBackground, colors.surface]);

  return (
    <View style={styles.container}>
      {/* Display */}
      <View style={styles.display}>
        <Text style={displayTextStyle} numberOfLines={1}>
          {expression}
        </Text>
        {hasOperation && (
          <TouchableOpacity
            style={styles.equalsButton}
            onPress={handleEqualsPress}
            accessibilityRole="button"
            accessibilityLabel="equals"
          >
            <Text style={equalsButtonTextStyle}>=</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {/* Row 1: + 1 2 3 */}
        <View style={styles.row}>
          <CalcButton
            value="+"
            onPress={handlePress}
            style={operationButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="1"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="2"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="3"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 2: - 4 5 6 */}
        <View style={styles.row}>
          <CalcButton
            value="-"
            onPress={handlePress}
            style={operationButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="4"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="5"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="6"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 3: × 7 8 9 */}
        <View style={styles.row}>
          <CalcButton
            value="×"
            onPress={handlePress}
            style={operationButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="7"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="8"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
          <CalcButton
            value="9"
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={numberTextStyle}
            colors={colors}
          />
        </View>

        {/* Row 4: ÷ . 0 <- */}
        <View style={styles.row}>
          <CalcButton
            value="÷"
            onPress={handlePress}
            style={operationButtonStyle}
            textStyle={operationTextStyle}
            colors={colors}
          />
          <CalcButton
            value="."
            onPress={handlePress}
            style={surfaceButtonStyle}
            textStyle={decimalTextStyle}
            colors={colors}
          />
          <CalcButton
            value="0"
            onPress={handlePress}
            style={surfaceButtonStyle}
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

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    elevation: 2,
    flex: 1,
    height: 44,
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
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  display: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
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
    marginLeft: 12,
    paddingHorizontal: 4,
  },
  equalsButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  keypad: {
    gap: 3,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
});
