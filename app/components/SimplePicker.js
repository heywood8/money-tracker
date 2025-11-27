import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform } from 'react-native';

/**
 * SimplePicker - A picker component for Android
 * Uses native HTML select on web, custom modal picker on Android
 */
const SimplePicker = ({ value, onValueChange, items, style, textStyle, colors }) => {
  const [modalVisible, setModalVisible] = useState(false);

  // Get label for current value
  const selectedItem = items.find(item => item.value === value);
  const selectedLabel = selectedItem ? selectedItem.label : '';

  // Web: Use native select element
  if (Platform.OS === 'web') {
    return (
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          color: colors.text,
          fontSize: 14,
          fontFamily: 'inherit',
          paddingLeft: 8,
          paddingRight: 8,
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          ...style,
        }}
      >
        {items.map(item => (
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
        <Text style={[styles.androidButtonText, textStyle, { color: colors.text }]} numberOfLines={1}>
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
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <FlatList
              data={items}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { borderBottomColor: colors.border },
                    item.value === value && { backgroundColor: colors.selected }
                  ]}
                  onPress={() => {
                    onValueChange(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>
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
    width: '100%',
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  androidButtonText: {
    fontSize: 14,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '60%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  modalItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  modalItemText: {
    fontSize: 16,
  },
});

export default SimplePicker;
