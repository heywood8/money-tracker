import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

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

  // Check if expression contains a mathematical operation
  const hasOperation = /[+\-×÷]/.test(expression);

  // Handle button press
  const handlePress = (key) => {
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
  };

  // Get the last number in the expression (after the last operation)
  const getLastNumber = (expr) => {
    const match = expr.match(/[+\-×÷]?([0-9.]+)$/);
    return match ? match[1] : expr;
  };

  // Evaluate mathematical expression
  const evaluateExpression = (expr) => {
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
  };

  // Calculator button component
  const CalcButton = ({ value, onPress, style, textStyle, icon }) => (
    <TouchableOpacity
      style={[styles.button, { borderColor: colors.border }, style]}
      onPress={() => onPress(value)}
      accessibilityRole="button"
      accessibilityLabel={value}
    >
      {icon ? (
        <Icon name={icon} size={24} color={textStyle?.color || colors.text} />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>{value}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Display */}
      <View style={styles.display}>
        <Text style={[styles.displayText, { color: colors.text }]} numberOfLines={1}>
          {expression}
        </Text>
        {hasOperation && (
          <TouchableOpacity
            style={styles.equalsButton}
            onPress={() => handlePress('=')}
            accessibilityRole="button"
            accessibilityLabel="equals"
          >
            <Text style={[styles.equalsButtonText, { color: colors.text }]}>=</Text>
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
            style={{ backgroundColor: colors.operationBackground || colors.surface }}
            textStyle={{ color: colors.primary, fontSize: 24, fontWeight: 'bold' }}
          />
          <CalcButton
            value="1"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="2"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="3"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
        </View>

        {/* Row 2: - 4 5 6 */}
        <View style={styles.row}>
          <CalcButton
            value="-"
            onPress={handlePress}
            style={{ backgroundColor: colors.operationBackground || colors.surface }}
            textStyle={{ color: colors.primary, fontSize: 24, fontWeight: 'bold' }}
          />
          <CalcButton
            value="4"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="5"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="6"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
        </View>

        {/* Row 3: × 7 8 9 */}
        <View style={styles.row}>
          <CalcButton
            value="×"
            onPress={handlePress}
            style={{ backgroundColor: colors.operationBackground || colors.surface }}
            textStyle={{ color: colors.primary, fontSize: 24, fontWeight: 'bold' }}
          />
          <CalcButton
            value="7"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="8"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="9"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
        </View>

        {/* Row 4: ÷ . 0 <- */}
        <View style={styles.row}>
          <CalcButton
            value="÷"
            onPress={handlePress}
            style={{ backgroundColor: colors.operationBackground || colors.surface }}
            textStyle={{ color: colors.primary, fontSize: 24, fontWeight: 'bold' }}
          />
          <CalcButton
            value="."
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 24, fontWeight: 'bold' }}
          />
          <CalcButton
            value="0"
            onPress={handlePress}
            style={{ backgroundColor: colors.surface }}
            textStyle={{ color: colors.text, fontSize: 20 }}
          />
          <CalcButton
            value="backspace"
            onPress={handlePress}
            style={{ backgroundColor: colors.deleteBackground || colors.surface }}
            icon="backspace-outline"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  display: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 4,
    minHeight: 40,
  },
  displayText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  equalsButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    paddingHorizontal: 4,
  },
  equalsButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  keypad: {
    width: '100%',
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  button: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#7a7878ff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
