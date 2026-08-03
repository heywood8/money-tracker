import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencies from '../../assets/currencies.json';
import ModalBlurOverlay from './ModalBlurOverlay';
import { SPACING, BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT } from '../styles/designTokens';
import { MODAL_TITLE } from '../styles/componentStyles';

/**
 * The app's currency *choice* surface: a Material 3 bottom sheet listing a known,
 * short set of currencies — the ones the user actually holds accounts in.
 *
 * It exists because that choice used to be posed as a dialog's action buttons
 * (`showDialog(t('currency'), null, currencies.map(...))`). MaterialDialog lays
 * its buttons out right-aligned with `flexWrap`, so seven currencies arrived as
 * two ragged rows of bare accent-blue codes with "Cancel" sitting in the middle
 * of them — a set of options wearing the clothes of a set of actions. M3 is
 * explicit that a dialog's buttons are for *acts* ("Delete", "Save") and that a
 * choice between values belongs in a list, where each option gets a row, a name
 * and a selected state.
 *
 * Shape carries the selection rather than colour alone: the chosen row is a
 * fully-rounded tonal container (M3 Expressive's shape-as-emphasis), the others
 * are plain rows on the sheet. That reads at a glance and survives both themes,
 * where a same-hue-different-alpha fill on its own does not.
 *
 * Distinct from `components/operations/CurrencyPickerModal`, which picks from all
 * ~23 currencies in the catalogue and therefore needs a search field and
 * most-used pinning. Here the list is closed and typically 2-7 long: searching
 * it would be furniture over a list you can already see.
 */

// The sheet stops at 70% of the screen and the list inside it scrolls — the set
// is short in practice but it is the user's account currencies, not a fixed
// number, and a plain column would silently clip the last rows on a long one
// (nine currencies already overrun a 640dp screen's 70%).
const SHEET_MAX_HEIGHT = '70%';

const CurrencySheet = memo(({
  visible,
  codes,
  selectedCurrency = '',
  onSelect,
  onClose,
  colors,
  t,
  title,
  convertAll,
  onToggleConvert,
  testIDPrefix = 'currency-sheet',
}) => {
  const handleSelect = useCallback((code) => {
    onSelect(code);
    onClose();
  }, [onSelect, onClose]);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
        testID={`${testIDPrefix}-modal`}
      >
        <Pressable
          style={[styles.overlay, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityLabel={t('cancel')}
        >
          {/* Swallows the press so a tap inside the sheet does not dismiss it. */}
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]}>
              {title || t('select_currency')}
            </Text>
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.list}
              accessibilityRole="radiogroup"
            >
              {codes.map((code) => {
                const meta = currencies[code];
                const selected = code === selectedCurrency;
                return (
                  <Pressable
                    key={code}
                    onPress={() => handleSelect(code)}
                    android_ripple={{ color: colors.primary + '1F' }}
                    style={[
                      styles.row,
                      selected && { backgroundColor: colors.primary + '1F' },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={meta?.name ? `${code} · ${meta.name}` : code}
                    testID={`${testIDPrefix}-option-${code}`}
                  >
                    {/* The symbol, not an icon: it is the mark the amounts on the
                        screen behind are printed in, so it identifies the row
                        faster than the code does. Where the catalogue has no
                        symbol — or lists the code as the symbol, which it does
                        for CHF and others — the generic currency glyph stands in
                        rather than the code, which the row already prints an inch
                        to the right. */}
                    <View style={[styles.symbolWrap, {
                      backgroundColor: selected ? colors.primary + '29' : colors.glassSurfaceStrong,
                    }]}
                    >
                      {meta?.symbol && meta.symbol !== code ? (
                        <Text
                          style={[styles.symbol, { color: selected ? colors.primary : colors.text }]}
                          numberOfLines={1}
                        >
                          {meta.symbol}
                        </Text>
                      ) : (
                        <Icon
                          name="currency-sign"
                          size={18}
                          color={selected ? colors.primary : colors.mutedText}
                        />
                      )}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.code, { color: selected ? colors.primary : colors.text }]}>
                        {code}
                      </Text>
                      {!!meta?.name && (
                        <Text style={[styles.name, { color: colors.mutedText }]} numberOfLines={1}>
                          {meta.name}
                        </Text>
                      )}
                    </View>
                    {selected && <Icon name="check" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* "Convert the other currencies into this one" is a property of the
                choice above, not a separate screen control: it only means
                anything once there is more than one currency, and what it
                converts *to* is whatever this sheet last picked. It used to be
                an outlined disc in the header beside the chip, where nothing
                said which of the two it belonged to. Outside the ScrollView, so
                it stays put while a long list scrolls, and it deliberately does
                not dismiss the sheet — it is a setting, not a choice. */}
            {!!onToggleConvert && (
              <Pressable
                onPress={onToggleConvert}
                android_ripple={{ color: colors.primary + '1F' }}
                style={[styles.convertRow, { borderTopColor: colors.border }]}
                accessibilityRole="switch"
                accessibilityState={{ checked: !!convertAll }}
                accessibilityLabel={t('graphs_convert_currencies')}
                testID={`${testIDPrefix}-convert`}
              >
                <Icon
                  name="cash-sync"
                  size={20}
                  color={convertAll ? colors.primary : colors.mutedText}
                />
                <Text style={[styles.convertLabel, { color: colors.text }]}>
                  {t('graphs_convert_currencies')}
                </Text>
                <View style={[styles.switchTrack, {
                  backgroundColor: convertAll ? colors.primary : colors.border,
                }]}
                >
                  <View style={[styles.switchThumb, {
                    transform: [{ translateX: convertAll ? 18 : 2 }],
                  }]}
                  />
                </View>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

CurrencySheet.displayName = 'CurrencySheet';

CurrencySheet.propTypes = {
  visible: PropTypes.bool.isRequired,
  codes: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedCurrency: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  title: PropTypes.string,
  // Both or neither: the row is only rendered when the host supplies a handler.
  convertAll: PropTypes.bool,
  onToggleConvert: PropTypes.func,
  testIDPrefix: PropTypes.string,
};

const styles = StyleSheet.create({
  code: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  convertLabel: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  convertRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.lg,
  },
  // M3's bottom-sheet drag handle. The sheet is not draggable, but the handle is
  // also what says "this came up from the bottom edge and goes back down there".
  handle: {
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 4,
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
    width: 32,
  },
  list: {
    gap: SPACING.xs,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  name: {
    fontSize: FONT_SIZE.sm,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Height 56 with a pill radius: `pill` clamps to half the height, so the
  // selected row is a stadium rather than a rounded rectangle — the shape
  // difference is what marks the selection at a glance, with the tonal fill
  // and the check confirming it.
  row: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    flexDirection: 'row',
    gap: SPACING.md,
    height: 56,
    overflow: 'hidden',
    paddingHorizontal: SPACING.sm,
  },
  rowText: {
    flex: 1,
  },
  // Grows no further than its rows, but yields to the convert row below it when
  // the sheet is up against its own maximum.
  scrollBody: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheet: {
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: SHEET_MAX_HEIGHT,
    paddingBottom: SPACING.xl,
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.pill,
    height: 16,
    width: 16,
  },
  switchTrack: {
    borderRadius: BORDER_RADIUS.pill,
    height: 20,
    justifyContent: 'center',
    width: 36,
  },
  symbol: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
  },
  symbolWrap: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    ...MODAL_TITLE,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
});

export default CurrencySheet;
