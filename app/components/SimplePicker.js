import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform } from 'react-native';
import { HORIZONTAL_PADDING } from '../styles/layout';

/**
 * SimplePicker - A picker component for Android
 * Uses native HTML select on web, custom modal picker on Android
 */
const SimplePicker = ({ value, onValueChange, items, style, textStyle, colors }) => {
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
      <TouchableOpacity
        style={[styles.androidButton, style]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.androidButtonText, textStyle, { color: safeColors.text }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: safeColors.surface }]}>
            <FlatList
              data={safeItems}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { borderBottomColor: safeColors.border },
                    item.value === value && { backgroundColor: safeColors.selected },
                  ]}
                  onPress={() => {
                    onValueChange(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: safeColors.text }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
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
  // Modal styles
  modalContent: {
    borderRadius: 8,
    maxHeight: '60%',
    overflow: 'hidden',
    width: '80%',
  },
  modalItem: {
    borderBottomWidth: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 16,
  },
  modalItemText: {
    fontSize: 16,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
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
    value: PropTypes.any,
  })),
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]),
  textStyle: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]),
  colors: PropTypes.shape({
    text: PropTypes.string,
    surface: PropTypes.string,
    border: PropTypes.string,
    selected: PropTypes.string,
  }),
};

SimplePicker.defaultProps = {
  items: [],
  colors: {
    text: '#000',
    surface: '#fff',
    border: '#e0e0e0',
    selected: '#f5f5f5',
  },
};

export default SimplePicker;
