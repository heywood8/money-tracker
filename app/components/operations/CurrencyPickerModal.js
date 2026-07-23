import React, { useState, useMemo, useEffect, memo } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable, TextInput } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { getTopSourceCurrencies } from '../../services/OperationsDB';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../../styles/designTokens';

const alphabeticalList = Object.entries(currencies).map(([code, data]) => ({
  code,
  name: data.name,
  symbol: data.symbol,
})).sort((a, b) => a.name.localeCompare(b.name));

const CurrencyPickerModal = memo(({ visible, onClose, onSelect, selectedCurrency = '', colors, t }) => {
  const [query, setQuery] = useState('');
  const [popularCodes, setPopularCodes] = useState([]);

  useEffect(() => {
    if (!visible) return;
    getTopSourceCurrencies(5)
      .then(codes => setPopularCodes(codes))
      .catch(() => setPopularCodes([]));
  }, [visible]);

  // Currencies sorted by popularity (pinned top), then alphabetically
  const sortedList = useMemo(() => {
    if (popularCodes.length === 0) return alphabeticalList;
    const popularSet = new Set(popularCodes);
    const popular = popularCodes
      .map(code => alphabeticalList.find(c => c.code === code))
      .filter(Boolean);
    const rest = alphabeticalList.filter(c => !popularSet.has(c.code));
    return [...popular, ...rest];
  }, [popularCodes]);

  const filtered = useMemo(() => {
    const base = query.trim() ? alphabeticalList : sortedList;
    if (!query.trim()) return base;
    const q = query.trim().toLowerCase();
    return alphabeticalList.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [query, sortedList]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (code) => {
    setQuery('');
    onSelect(code);
  };

  const renderItem = ({ item }) => {
    const isSelected = item.code === selectedCurrency;
    return (
      <Pressable
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => handleSelect(item.code)}
      >
        <View style={styles.rowLeft}>
          <Text style={[styles.symbol, { color: colors.primary }]}>{item.symbol}</Text>
          <Text style={[styles.code, { color: colors.text }]}>{item.code}</Text>
          <Text style={[styles.name, { color: colors.mutedText }]}>{item.name}</Text>
        </View>
        {isSelected && (
          <Icon name="check" size={18} color={colors.primary} />
        )}
      </Pressable>
    );
  };

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>{t('select_currency')}</Text>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Icon name="close" size={22} color={colors.mutedText} />
              </Pressable>
            </View>
            <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <Icon name="magnify" size={18} color={colors.mutedText} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder={t('search')}
                placeholderTextColor={colors.mutedText}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')}>
                  <Icon name="close-circle" size={16} color={colors.mutedText} />
                </Pressable>
              )}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

CurrencyPickerModal.displayName = 'CurrencyPickerModal';

CurrencyPickerModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedCurrency: PropTypes.string,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  closeButton: {
    padding: SPACING.xs,
  },
  code: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    width: 46,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  rowLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: SPACING.sm,
  },
  searchContainer: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    flexDirection: 'row',
    margin: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    paddingVertical: 4,
  },
  sheet: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '75%',
  },
  symbol: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    width: 28,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
});

export default CurrencyPickerModal;
