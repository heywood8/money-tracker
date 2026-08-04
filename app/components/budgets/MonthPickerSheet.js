import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { SPACING, BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, ICON_SIZE } from '../../styles/designTokens';
import { MODAL_TITLE } from '../../styles/componentStyles';
import { currentMonthKey, monthKeyOf, monthIndexOf, yearOf, monthShortLabels } from '../../utils/monthUtils';

/**
 * The Budgets tab's month *jump*: a year of months on one surface, so moving to
 * a month is one tap instead of one tap per month travelled.
 *
 * The header's ‹ › arrows are a stepper, and a stepper is the right shape for
 * "last month" and "next month" — which is most of what the tab is used for.
 * It is the wrong shape for "last December": eight taps, each one re-rendering
 * and re-animating the entire plan on the way past. The month name between the
 * arrows was the only part of that header that did nothing when pressed, and it
 * is exactly the part a person reaches for when they want a different month.
 *
 * A grid of twelve, not a scrolling day calendar. The whole tab is scoped to a
 * month — there is no day here to pick, and a day grid would offer 28-31 targets
 * where only 12 mean anything. The year moves on its own stepper above the grid,
 * because a year is the one step out that a month grid cannot express.
 *
 * Selection is carried by shape as well as colour, matching CurrencySheet: the
 * chosen month is a filled tonal pill, today's month is outlined in the accent
 * when it is not the chosen one, everything else is a plain cell. That survives
 * both themes, where two fills of the same hue at different alphas do not.
 */

// Three across, four down. `flexBasis` below 33% with `flexGrow` is what fixes
// the count: a fourth cell cannot fit on a row, and the three that do share the
// leftover width, so the grid stays even at any font scale.
const CELL_BASIS = '28%';

const MonthPickerSheet = memo(({
  visible,
  monthKey,
  onSelect,
  onClose,
  colors,
  t,
  language,
  testIDPrefix = 'month-picker',
}) => {
  // The year the grid is showing, which is not the year of the selected month
  // once the user has stepped away from it — you browse a year before you
  // commit to a month in it.
  const [year, setYear] = useState(() => yearOf(monthKey));

  // Re-seed on every open. The sheet stays mounted between openings (Modal owns
  // its own visibility), so without this it would reopen on whatever year was
  // last browsed — including a year the user backed out of without picking.
  useEffect(() => {
    if (visible) setYear(yearOf(monthKey));
  }, [visible, monthKey]);

  const labels = useMemo(() => monthShortLabels(language), [language]);

  // Recomputed per render rather than held in state: the sheet can outlive
  // midnight on the turn of a month, and a stale "today" would outline the
  // wrong cell.
  const todayKey = currentMonthKey();

  const selectedYear = yearOf(monthKey);
  const selectedIndex = monthIndexOf(monthKey);

  const handlePrevYear = useCallback(() => setYear(y => y - 1), []);
  const handleNextYear = useCallback(() => setYear(y => y + 1), []);

  const handleSelect = useCallback((index) => {
    onSelect(monthKeyOf(year, index));
    onClose();
  }, [year, onSelect, onClose]);

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
            <Text style={[styles.title, { color: colors.text }]}>{t('select_month')}</Text>

            {/* The year stepper mirrors the header's month stepper it was opened
                from — same glyphs, same places — so the one control the grid
                cannot express reads as the same gesture one level out. */}
            <View style={styles.yearRow}>
              <Pressable
                onPress={handlePrevYear}
                hitSlop={8}
                style={styles.yearButton}
                android_ripple={{ color: colors.primary + '1F', borderless: true }}
                accessibilityRole="button"
                accessibilityLabel={t('previous_year')}
                testID={`${testIDPrefix}-prev-year`}
              >
                <Icon name="chevron-left" size={ICON_SIZE.base} color={colors.text} />
              </Pressable>
              <Text
                style={[styles.yearLabel, { color: colors.text }]}
                testID={`${testIDPrefix}-year`}
              >
                {String(year)}
              </Text>
              <Pressable
                onPress={handleNextYear}
                hitSlop={8}
                style={styles.yearButton}
                android_ripple={{ color: colors.primary + '1F', borderless: true }}
                accessibilityRole="button"
                accessibilityLabel={t('next_year')}
                testID={`${testIDPrefix}-next-year`}
              >
                <Icon name="chevron-right" size={ICON_SIZE.base} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.grid} accessibilityRole="radiogroup">
              {labels.map((label, index) => {
                const key = monthKeyOf(year, index);
                const selected = year === selectedYear && index === selectedIndex;
                const isToday = key === todayKey;
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleSelect(index)}
                    android_ripple={{ color: colors.primary + '1F' }}
                    style={[
                      styles.cell,
                      selected && { backgroundColor: colors.primary + '29' },
                      // Only when it is not already the selection: an outline
                      // under a fill of the same hue reads as a second state.
                      !selected && isToday && styles.cellToday,
                      !selected && isToday && { borderColor: colors.primary },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    // The abbreviation is what fits in the cell; the reader gets
                    // the month with the year it belongs to.
                    accessibilityLabel={`${label} ${year}`}
                    testID={`${testIDPrefix}-month-${key}`}
                  >
                    <Text
                      style={[styles.cellText, {
                        color: selected || isToday ? colors.primary : colors.text,
                        fontWeight: selected ? FONT_WEIGHT.bold : FONT_WEIGHT.medium,
                      }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

MonthPickerSheet.displayName = 'MonthPickerSheet';

MonthPickerSheet.propTypes = {
  visible: PropTypes.bool.isRequired,
  /** Currently scoped month, YYYY-MM. */
  monthKey: PropTypes.string.isRequired,
  /** Called with the picked YYYY-MM key. */
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  /** App language code (not the device locale) for the month names. */
  language: PropTypes.string,
  testIDPrefix: PropTypes.string,
};

const styles = StyleSheet.create({
  // Height 52 with a pill radius: `pill` clamps to half the height, so the
  // selected month is a stadium rather than a rounded rectangle.
  cell: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    flexBasis: CELL_BASIS,
    flexGrow: 1,
    height: 52,
    justifyContent: 'center',
    // The ripple is drawn on the view's own rectangle, so without this it
    // spills past the pill's rounded ends.
    overflow: 'hidden',
  },
  cellText: {
    fontSize: FONT_SIZE.base,
  },
  cellToday: {
    borderWidth: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  // M3's bottom-sheet drag handle. The sheet is not draggable, but the handle
  // is also what says "this came up from the bottom edge and goes back there".
  handle: {
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 4,
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
    width: 32,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingBottom: SPACING.xl,
  },
  title: {
    ...MODAL_TITLE,
    paddingHorizontal: SPACING.lg,
  },
  yearButton: {
    padding: SPACING.xs,
  },
  yearLabel: {
    fontSize: FONT_SIZE.lg,
    fontVariant: ['tabular-nums'],
    fontWeight: FONT_WEIGHT.bold,
    // Fixed so the row does not twitch sideways when the digits change width.
    minWidth: 72,
    textAlign: 'center',
  },
  yearRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
});

export default MonthPickerSheet;
