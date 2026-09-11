import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { BORDER_RADIUS, FONT_SIZE, HEIGHTS, ICON_SIZE, SPACING } from '../../styles/designTokens';
import { withAlpha } from '../../utils/colorUtils';

// Which day the calendar week starts on. `Intl.Locale#getWeekInfo` would answer
// this, but Hermes does not ship it, so the app's eleven languages are listed
// out from CLDR (en-US, ja-JP, ko-KR and pt-BR start on Sunday; the other seven,
// Simplified Chinese included, on Monday) and anything unrecognised falls back
// to Monday (ISO-8601), which is what this grid hardcoded for every locale.
const SUNDAY_FIRST_LANGUAGES = new Set(['en', 'ja', 'ko', 'pt']);

const startsOnSunday = (language) => (
  SUNDAY_FIRST_LANGUAGES.has(String(language || 'en').slice(0, 2).toLowerCase())
);

// 2024-01-01 was a Monday and 2023-12-31 a Sunday, so one of these plus an
// offset walks a full week in the right order without any weekday arithmetic.
const FIRST_MONDAY = Date.UTC(2024, 0, 1);
const FIRST_SUNDAY = Date.UTC(2023, 11, 31);

/**
 * Single-letter weekday headers in the app's language, starting on the day that
 * language's week starts on. Falls back to the English letters if Intl cannot
 * format narrow weekdays (an older JSC, a stripped ICU build).
 */
const weekdayHeaders = (language) => {
  const start = startsOnSunday(language) ? FIRST_SUNDAY : FIRST_MONDAY;
  try {
    const formatter = new Intl.DateTimeFormat(language || undefined, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
    const labels = Array.from({ length: 7 }, (_, i) => (
      formatter.format(new Date(start + i * 86400000))
    ));
    if (labels.every(label => label && label.length <= 3)) return labels;
  } catch {
    // fall through
  }
  const fallback = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return startsOnSunday(language) ? [fallback[6], ...fallback.slice(0, 6)] : fallback;
};

const getDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const formatBalanceCompact = (balance) => {
  const num = parseFloat(balance);
  if (isNaN(num)) return balance;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
};

const BalanceHistoryCalendarView = ({
  colors,
  t,
  language,
  selectedYear,
  selectedMonth,
  balanceHistoryTableData,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
  currency,
}) => {
  const decimalDigits = currencies[currency]?.decimal_digits ?? 2;

  const dayHeaders = useMemo(() => weekdayHeaders(language), [language]);
  const sundayFirst = startsOnSunday(language);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const weekday = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sunday
  const firstDayOffset = sundayFirst ? weekday : (weekday + 6) % 7;

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === selectedYear && now.getMonth() === selectedMonth;
  const todayDate = now.getDate();

  const [selectedDay, setSelectedDay] = useState(isCurrentMonth ? todayDate : null);

  const formatForInput = (balance) => {
    if (!balance) return '';
    const num = parseFloat(balance);
    if (isNaN(num)) return balance;
    return num.toFixed(decimalDigits);
  };

  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedRef.current || !isCurrentMonth || balanceHistoryTableData.length === 0) return;
    hasAutoSelectedRef.current = true;
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    const entry = balanceHistoryTableData.find((r) => r.date === dateStr);
    onEditBalance(dateStr, formatForInput(entry?.balance));
  }, [isCurrentMonth, todayDate, selectedYear, selectedMonth, balanceHistoryTableData, onEditBalance]);

  const getEntry = (day) => {
    const dateStr = getDateStr(selectedYear, selectedMonth, day);
    return balanceHistoryTableData.find((r) => r.date === dateStr) || null;
  };

  const handleDayPress = (day) => {
    const entry = getEntry(day);
    setSelectedDay(day);
    onEditBalance(getDateStr(selectedYear, selectedMonth, day), formatForInput(entry?.balance));
  };

  const handleSave = () => {
    if (selectedDay !== null) {
      onSaveBalance(getDateStr(selectedYear, selectedMonth, selectedDay));
      setSelectedDay(null);
    }
  };

  const handleDelete = () => {
    if (selectedDay !== null) {
      onDeleteBalance(getDateStr(selectedYear, selectedMonth, selectedDay));
      setSelectedDay(null);
    }
  };

  const handleCancel = () => {
    setSelectedDay(null);
    onCancelEdit();
  };

  const cells = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEntry = selectedDay !== null ? getEntry(selectedDay) : null;

  // `colors.primary + '22'` assumed the accent is a plain hex; withAlpha keeps
  // the tint working (and falls back to a real colour) for any palette where it
  // is not. Translucent on purpose here — unlike a chip, a day cell sits
  // directly on the card, so there is only one thing behind it to tint toward.
  const recordedTint = withAlpha(colors.primary, 0.13, colors.selected);
  const selectedTint = withAlpha(colors.primary, 0.27, colors.selected);

  return (
    <View>
      <View style={styles.headerRow}>
        {dayHeaders.map((label, i) => (
          <View key={i} style={styles.cell}>
            <Text style={[styles.dayHeader, { color: colors.mutedText }]}>{label}</Text>
          </View>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={styles.weekRow}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (day === null) {
              return <View key={col} style={styles.cell} />;
            }
            const entry = getEntry(day);
            const isToday = isCurrentMonth && day === todayDate;
            const isSelected = day === selectedDay;
            return (
              <TouchableOpacity
                key={col}
                testID={`day-cell-${day}`}
                style={[
                  styles.cell,
                  styles.dayCell,
                  entry && { backgroundColor: recordedTint },
                  isToday && [{ borderColor: colors.primary }, styles.todayBorder],
                  isSelected && { backgroundColor: selectedTint },
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={entry?.balance
                  ? `${day}, ${entry.balance}`
                  : String(day)}
              >
                <Text style={[styles.dayNumber, { color: entry ? colors.text : colors.mutedText }]}>
                  {day}
                </Text>
                {entry?.balance && (
                  <Text
                    testID={`day-balance-${day}`}
                    style={[styles.dayBalance, { color: colors.primaryStrong }]}
                    numberOfLines={1}
                  >
                    {formatBalanceCompact(entry.balance)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {selectedDay !== null && (
        <View
          testID="calendar-edit-row"
          style={[styles.editRow, { borderColor: colors.primary, backgroundColor: colors.surface }]}
        >
          <TouchableOpacity
            testID="calendar-cancel-btn"
            onPress={handleCancel}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          >
            <MaterialCommunityIcons name="keyboard-return" size={ICON_SIZE.sm} color={colors.mutedText} />
          </TouchableOpacity>
          <Text style={[styles.editDateLabel, { color: colors.mutedText }]}>
            {selectedDay}
          </Text>
          <TextInput
            testID="calendar-edit-input"
            style={[
              styles.editInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            value={editingBalanceValue}
            onChangeText={onEditingBalanceValueChange}
            keyboardType="decimal-pad"
            placeholder={(0).toFixed(decimalDigits)}
            placeholderTextColor={colors.mutedText}
            accessibilityLabel={t('balance')}
          />
          <TouchableOpacity
            testID="calendar-save-btn"
            style={styles.iconBtn}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={t('save')}
          >
            <View style={[styles.iconBtnFill, { backgroundColor: colors.primaryFill }]}>
              <MaterialCommunityIcons name="check" size={ICON_SIZE.sm} color={colors.onPrimaryFill} />
            </View>
          </TouchableOpacity>
          {selectedEntry?.balance && (
            <TouchableOpacity
              testID="calendar-delete-btn"
              style={styles.iconBtn}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel={t('delete')}
            >
              <View style={[styles.iconBtnFill, { backgroundColor: colors.destructive }]}>
                <MaterialCommunityIcons name="trash-can-outline" size={ICON_SIZE.sm} color={colors.onPrimaryFill} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

BalanceHistoryCalendarView.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  language: PropTypes.string,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number.isRequired,
  balanceHistoryTableData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      displayDate: PropTypes.string,
      balance: PropTypes.string,
    }),
  ).isRequired,
  editingBalanceValue: PropTypes.string.isRequired,
  onEditingBalanceValueChange: PropTypes.func.isRequired,
  onEditBalance: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveBalance: PropTypes.func.isRequired,
  onDeleteBalance: PropTypes.func.isRequired,
  currency: PropTypes.string,
};

const styles = StyleSheet.create({
  cell: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 2 },
  // FONT_SIZE.xs is the floor: the balance under a day number used to be 8px,
  // which no longer reads as text at arm's length.
  dayBalance: { fontSize: FONT_SIZE.xs, fontWeight: '600' },
  dayCell: { borderRadius: BORDER_RADIUS.sm, minHeight: 46, paddingVertical: 6 },
  dayHeader: { fontSize: FONT_SIZE.xs, fontWeight: '600' },
  dayNumber: { fontSize: FONT_SIZE.sm },
  editDateLabel: { fontSize: FONT_SIZE.sm, marginRight: SPACING.sm, minWidth: 24 },
  editInput: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    flex: 1,
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    textAlign: 'right',
  },
  editRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
  },
  headerRow: { flexDirection: 'row', marginBottom: SPACING.xs },
  // The button's touch target is HEIGHTS.input (48) even though its coloured
  // disc is smaller: these were 28dp glyphs with no role and no label, which
  // TalkBack could neither name nor reliably hit.
  iconBtn: {
    alignItems: 'center',
    height: HEIGHTS.input,
    justifyContent: 'center',
    minWidth: HEIGHTS.input,
  },
  iconBtnFill: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  todayBorder: { borderWidth: 1 },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
});

export default BalanceHistoryCalendarView;
