import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';

const COMMON_ICONS = [
  // Money & Finance
  'cash', 'cash-multiple', 'credit-card', 'credit-card-outline', 'wallet', 'bank',
  'currency-usd', 'currency-eur', 'currency-gbp', 'chart-line', 'chart-bar',

  // Food & Dining
  'food', 'food-variant', 'silverware-fork-knife', 'coffee', 'coffee-outline',
  'cart', 'cart-outline', 'beer', 'glass-wine',

  // Transportation
  'car', 'car-side', 'bus', 'train', 'airplane', 'bike', 'walk',
  'gas-station', 'taxi', 'ferry', 'motorcycle',

  // Shopping
  'shopping', 'shopping-outline', 'hanger', 'tshirt-crew', 'watch',
  'laptop', 'phone', 'television', 'headphones',

  // Home & Bills
  'home', 'home-outline', 'lightning-bolt', 'water', 'wifi', 'cellphone',
  'file-document', 'file-document-outline', 'receipt',

  // Entertainment
  'movie', 'movie-open', 'gamepad-variant', 'controller', 'music',
  'basketball', 'football', 'tennis', 'dumbbell',

  // Health
  'heart-pulse', 'hospital-box', 'pill', 'medical-bag', 'doctor',
  'run', 'yoga', 'meditation',

  // Work & Business
  'briefcase', 'briefcase-outline', 'domain', 'office-building',
  'account-tie', 'laptop-account',

  // Education
  'school', 'book-open-variant', 'library', 'pencil',

  // Gifts & Others
  'gift', 'gift-outline', 'hand-coin', 'piggy-bank', 'sale',
  'percent', 'tag', 'calendar', 'clock-outline',

  // Categories & Organization
  'folder', 'folder-outline', 'folder-open', 'label', 'tag-outline',
  'bookmark', 'star', 'flag',
];

export default function IconPicker({ visible, onClose, onSelect, selectedIcon }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const iconSize = Math.floor((width - 64) / 6); // 6 icons per row with padding

  const handleSelect = (icon) => {
    onSelect(icon);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('select_icon')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.iconsGrid}>
              {COMMON_ICONS.map((iconName) => (
                <TouchableOpacity
                  key={iconName}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: colors.background,
                      width: iconSize,
                      height: iconSize,
                    },
                    selectedIcon === iconName && { backgroundColor: colors.primary, opacity: 0.3 },
                  ]}
                  onPress={() => handleSelect(iconName)}
                  accessibilityLabel={iconName}
                  accessibilityRole="button"
                >
                  <Icon
                    name={iconName}
                    size={28}
                    color={selectedIcon === iconName ? colors.primary : colors.text}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
  },
  iconsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
});
