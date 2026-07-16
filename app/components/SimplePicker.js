import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal, FlatList, Platform } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { HORIZONTAL_PADDING } from '../styles/layout';
import ModalBlurOverlay from './ModalBlurOverlay';

// Module-level so the default `colors` prop keeps a stable identity across
// renders (an inline object literal would break the safeColors useMemo).
const DEFAULT_COLORS = {
  text: '#000',
  surface: '#fff',
  border: '#e0e0e0',
  selected: '#f5f5f5',
};

/**
 * SimplePicker - A picker component for Android
 * Uses native HTML select on web, custom modal picker on Android
 */
const SimplePicker = ({ value, onValueChange, items = [], style, textStyle, colors = DEFAULT_COLORS, leftIcon, leftText, closeLabel = 'Close' }) => {
  const [modalVisible, setModalVisible] = useState(false);

  // Defensive check for undefined items with warning
  const safeItems = useMemo(() => {
    if (items === undefined || items === null) {
      console.warn('SimplePicker: items prop is undefined or null. Using empty array.');
      return [];
    }
    return items;
  }, [items]);

  // Defensive check for colors with fallback
  const safeColors = useMemo(() => {
    if (!colors || typeof colors !== 'object') {
      console.warn('SimplePicker: colors prop is missing or invalid. Using fallback colors.');
      return {
        text: '#000000',
        surface: '#ffffff',
        border: '#cccccc',
        selected: '#e0e0e0',
      };
    }
    return colors;
  }, [colors]);

  const webSelectStyle = ({
    ...baseWebSelectStyle,
    color: safeColors.text,
    ...(style || {}),
  });

  // Get label for current value
  const selectedItem = safeItems.find(item => item.value === value);
  const selectedLabel = selectedItem ? selectedItem.label : '';

  // Web: Use native select element
  if (Platform.OS === 'web') {
    return (
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        style={webSelectStyle}
      >
        {safeItems.map(item => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    );
  }

  // Android: Use custom modal picker for better control
  return (
    <>
      {(leftIcon || leftText) ? (
        <TouchableOpacity
          style={[styles.chipButton, style]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          {leftText ? (
            <Text style={[styles.leftText, { color: safeColors.mutedText ?? '#666666' }]}>{leftText}</Text>
          ) : (
            <Icon name={leftIcon} size={16} color={safeColors.mutedText ?? '#666666'} />
          )}
          <Text style={[styles.chipButtonText, textStyle, { color: safeColors.text }]} numberOfLines={1}>
            {selectedLabel}
          </Text>
          <Icon name="chevron-down" size={16} color={safeColors.mutedText ?? '#666666'} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.androidButton, style]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.androidButtonText, textStyle, { color: safeColors.text }]} numberOfLines={1}>
            {selectedLabel}
          </Text>
        </TouchableOpacity>
      )}


      {modalVisible && <ModalBlurOverlay />}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={[styles.modalContent, { backgroundColor: safeColors.card ?? safeColors.surface }]} onPress={() => {}}>
            <FlatList
              data={safeItems}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.modalItem,
                    { borderColor: safeColors.border },
                    pressed && { backgroundColor: safeColors.selected },
                  ]}
                  onPress={() => {
                    onValueChange(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: safeColors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.subLabel ? (
                    <Text style={[styles.modalItemSubText, { color: safeColors.mutedText }]} numberOfLines={1}>
                      {item.subLabel}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={[styles.closeButtonText, { color: safeColors.primary }]}>{closeLabel}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Android custom picker button
  androidButton: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: '100%',
  },
  androidButtonText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Chip-style button with left icon and right chevron
  chipButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    width: '100%',
  },
  chipButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  // Close button
  closeButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Left text label (currency symbol, etc.)
  leftText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 16,
    textAlign: 'center',
  },
  // Modal styles
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    width: '100%',
  },
  modalItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  modalItemSubText: {
    fontSize: 14,
    marginLeft: 8,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    marginRight: 4,
  },
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
});

const baseWebSelectStyle = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: 14,
  fontFamily: 'inherit',
  paddingLeft: 8,
  paddingRight: 8,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
};

SimplePicker.propTypes = {
  value: PropTypes.any,
  onValueChange: PropTypes.func,
  items: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string,
    subLabel: PropTypes.string,
    value: PropTypes.any,
  })),
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]),
  textStyle: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]),
  colors: PropTypes.shape({
    text: PropTypes.string,
    surface: PropTypes.string,
    border: PropTypes.string,
    selected: PropTypes.string,
    mutedText: PropTypes.string,
  }),
  leftIcon: PropTypes.string,
  leftText: PropTypes.string,
  closeLabel: PropTypes.string,
};

export default SimplePicker;
