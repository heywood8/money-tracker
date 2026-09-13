import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, Pressable, BackHandler, Dimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalization } from '../../contexts/LocalizationContext';
import { OverlayPortal, useOverlayHost } from '../../contexts/OverlayHostContext';
import { measureAnchorRect } from '../../utils/overlayGeometry';
import { selectionTint } from '../../utils/colorUtils';
import { formatLocalDate, localDateWithOffset, relativeDayLabel } from '../../utils/dateUtils';
import { SPACING, BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, HEIGHTS } from '../../styles/designTokens';

/**
 * The quick-add form's date affordance.
 *
 * Quick-add always booked today, so yesterday's coffee — the most common
 * back-dated entry there is — meant opening the full OperationModal. This chip
 * sits at the end of the type-selector row and offers Today / Yesterday /
 * an arbitrary date, without costing the form a line of vertical space.
 *
 * `date === null` means "today, and keep meaning today" — the form may sit open
 * across midnight, and a date stamped at mount would then book the previous day.
 * The actual stamp happens at save time (see `performQuickAdd`).
 *
 * While the date IS today the chip is icon-only, so the three type buttons keep
 * nearly all of the row (at 11 languages, "Überweisung" needs it). A non-today
 * date widens the chip to carry its label and paints it in the selected colour:
 * the form stays on that date for the rest of the sitting, so it has to be
 * impossible to miss.
 *
 * The menu is drawn in the app-wide overlay layer (OverlayPortal), NOT in a core
 * `<Modal>`: a Modal is a separate native window, so a chip measured in the
 * app's coordinates and used to place something inside that window drifts by
 * whatever the two origins disagree on — a status bar's worth of offset on
 * edge-to-edge Android. See OverlayHostContext.
 */

// Wide enough for "Choose date…" in the longest of the shipped languages.
const MENU_WIDTH = 240;
const MENU_ROW_HEIGHT = HEIGHTS.listItem;
const MENU_HEIGHT = MENU_ROW_HEIGHT * 3 + SPACING.sm * 2;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Claims the touch so the backdrop's dismiss does not fire for a tap on the menu.
const returnTrue = () => true;
const swallowTap = () => {};

const MenuRow = memo(({ icon, label, selected, colors, onPress, testID }) => (
  <Pressable
    style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.selected }]}
    onPress={onPress}
    accessibilityRole="menuitem"
    accessibilityState={{ selected }}
    accessibilityLabel={label}
    testID={testID}
  >
    <Icon name={icon} size={20} color={selected ? colors.primary : colors.mutedText} />
    <Text style={[styles.menuRowText, { color: colors.text }]} numberOfLines={1}>{label}</Text>
    {selected && <Icon name="check" size={18} color={colors.primary} />}
  </Pressable>
));
MenuRow.displayName = 'MenuRow';
MenuRow.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  colors: PropTypes.object.isRequired,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

const QuickAddDateChip = memo(({ date, onChange, colors, t, disabled = false }) => {
  const { language } = useLocalization() || {};
  const { hostRef } = useOverlayHost();

  const chipRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // The layer's own box, for keeping the menu inside it. The window is the right
  // first guess (the layer fills the screen) and the first onLayout corrects it.
  const [layer, setLayer] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });
  const handleLayerLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setLayer(prev => (
      width > 0 && height > 0 && (width !== prev.width || height !== prev.height)
        ? { width, height }
        : prev
    ));
  }, []);

  const today = localDateWithOffset(0);
  const yesterday = localDateWithOffset(-1);
  const effectiveDate = date || today;
  const isToday = effectiveDate === today;
  const label = relativeDayLabel(effectiveDate, { t, language, withWeekday: false, markOtherYears: true });

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Measure first, open second, so the menu's first painted frame is already at
  // the chip rather than jumping there once the measure lands. measureAnchorRect
  // calls back with null (synchronously) when there is nothing to measure
  // against — no overlay host, or a test renderer — and the menu then opens
  // centred rather than not at all.
  const openMenu = useCallback(() => {
    measureAnchorRect(chipRef.current, hostRef?.current, (rect) => {
      setAnchor(rect);
      setMenuOpen(true);
    });
  }, [hostRef]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]);

  const pickToday = useCallback(() => {
    setMenuOpen(false);
    // null, not today's string: see the note on `date === null` above.
    onChange(null);
  }, [onChange]);

  const pickYesterday = useCallback(() => {
    setMenuOpen(false);
    onChange(localDateWithOffset(-1));
  }, [onChange]);

  const openPicker = useCallback(() => {
    // The native picker is a platform dialog; let the menu go first so the two
    // never stack.
    setMenuOpen(false);
    setShowPicker(true);
  }, []);

  const handlePickerChange = useCallback((event, selectedDate) => {
    setShowPicker(false);
    if (event?.type === 'dismissed' || !selectedDate) return;
    const picked = formatLocalDate(selectedDate);
    onChange(picked === localDateWithOffset(0) ? null : picked);
  }, [onChange]);

  // The same selected treatment the category and account chips in this form
  // already use, so a back-dated quick-add reads as "something is switched on"
  // rather than as a fourth kind of highlight.
  const chipThemed = {
    backgroundColor: isToday ? colors.inputBackground : selectionTint(colors.primary, colors.inputBackground),
    borderColor: isToday ? colors.border : colors.primary,
  };
  const chipContentColor = isToday ? colors.mutedText : colors.primaryStrong;

  // Hung under the chip and pulled back inside the layer. Unanchored (nothing to
  // measure against) it is centred, which needs no arithmetic to be right.
  const menuPosition = anchor
    ? {
      left: clamp(anchor.x + anchor.width - MENU_WIDTH, SPACING.sm, layer.width - MENU_WIDTH - SPACING.sm),
      top: clamp(anchor.y + anchor.height + SPACING.xs, SPACING.sm, layer.height - MENU_HEIGHT - SPACING.sm),
    }
    : {
      left: Math.max(SPACING.sm, (layer.width - MENU_WIDTH) / 2),
      top: Math.max(SPACING.sm, (layer.height - MENU_HEIGHT) / 2),
    };

  return (
    <>
      <Pressable
        ref={chipRef}
        style={[styles.chip, isToday && styles.chipIconOnly, chipThemed, disabled && styles.chipDisabled]}
        onPress={openMenu}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: menuOpen }}
        accessibilityLabel={`${t('date')}: ${label}`}
        accessibilityHint={t('quick_add_date_hint')}
        testID="quick-add-date-chip"
      >
        <Icon name="calendar-outline" size={18} color={chipContentColor} />
        {!isToday && (
          <Text style={[styles.chipText, { color: chipContentColor }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Pressable>

      {menuOpen && (
        <OverlayPortal>
          <Pressable
            style={styles.backdrop}
            onPress={closeMenu}
            onLayout={handleLayerLayout}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            testID="quick-add-date-backdrop"
          >
            <View
              style={[
                styles.menu,
                { backgroundColor: colors.surface, borderColor: colors.border },
                menuPosition,
              ]}
              onStartShouldSetResponder={returnTrue}
              onResponderRelease={swallowTap}
              accessibilityRole="menu"
            >
              <MenuRow
                icon="calendar-today"
                label={t('today')}
                selected={effectiveDate === today}
                colors={colors}
                onPress={pickToday}
                testID="quick-add-date-today"
              />
              <MenuRow
                icon="calendar-arrow-left"
                label={t('yesterday')}
                selected={effectiveDate === yesterday}
                colors={colors}
                onPress={pickYesterday}
                testID="quick-add-date-yesterday"
              />
              <MenuRow
                icon="calendar-edit"
                label={t('select_date')}
                selected={effectiveDate !== today && effectiveDate !== yesterday}
                colors={colors}
                onPress={openPicker}
                testID="quick-add-date-pick"
              />
            </View>
          </Pressable>
        </OverlayPortal>
      )}

      {showPicker && (
        <DateTimePicker
          value={new Date(`${effectiveDate}T00:00:00`)}
          mode="date"
          display="default"
          onChange={handlePickerChange}
        />
      )}
    </>
  );
});

QuickAddDateChip.displayName = 'QuickAddDateChip';

QuickAddDateChip.propTypes = {
  /** Local `YYYY-MM-DD`, or null for "today, resolved at save time". */
  date: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    // The chip yields before the three type buttons it shares the row with: its
    // icon, its tint and its accessibility label all still say a back-date is
    // armed, while a squeezed "Expense" says nothing at all. The cap is what a
    // two-word label needs — a long locale date ellipsizes rather than eating
    // the row, and the menu shows the full value.
    flexShrink: 1,
    gap: SPACING.xs,
    justifyContent: 'center',
    maxWidth: 104,
    // Android's touch floor, and the issue's acceptance criterion.
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: SPACING.sm,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipIconOnly: {
    paddingHorizontal: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  menu: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    elevation: 6,
    paddingVertical: SPACING.sm,
    position: 'absolute',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    width: MENU_WIDTH,
  },
  menuRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    minHeight: MENU_ROW_HEIGHT,
    paddingHorizontal: SPACING.lg,
  },
  menuRowText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
});

export default QuickAddDateChip;
