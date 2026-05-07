import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'Su'];

const formatBalanceCompact = (balance) => {
  const num = parseFloat(balance);
  if (isNaN(num)) return balance;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
};

const getDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const BalanceHistoryCalendarView = ({
  colors,
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

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOffset = (new Date(selectedYear, selectedMonth, 1).getDay() + 6) % 7;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <View>
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((label, i) => (
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
                  entry && { backgroundColor: colors.primary + '22' },
                  isToday && [{ borderColor: colors.primary }, styles.todayBorder],
                  isSelected && { backgroundColor: colors.primary + '44' },
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNumber, { color: entry ? colors.text : colors.mutedText }]}>
                  {day}
                </Text>
                {entry?.balance && (
                  <Text
                    testID={`day-balance-${day}`}
                    style={[styles.dayBalance, { color: colors.primary }]}
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
            autoFocus
            placeholder={(0).toFixed(decimalDigits)}
            placeholderTextColor={colors.mutedText}
          />
          <TouchableOpacity
            testID="calendar-save-btn"
            style={[styles.editBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={styles.editBtnText}>✓</Text>
          </TouchableOpacity>
          {selectedEntry?.balance && (
            <TouchableOpacity
              testID="calendar-delete-btn"
              style={[styles.editBtn, styles.deleteBtn]}
              onPress={handleDelete}
            >
              <Text style={styles.editBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="calendar-cancel-btn" onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedText }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

BalanceHistoryCalendarView.propTypes = {
  colors: PropTypes.object.isRequired,
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
  cancelBtn: { padding: 4 },
  cancelBtnText: { fontSize: 18 },
  cell: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 2 },
  dayBalance: { fontSize: 8, fontWeight: '600' },
  dayCell: { borderRadius: 4, minHeight: 46, paddingVertical: 6 },
  dayHeader: { fontSize: 10, fontWeight: '600' },
  dayNumber: { fontSize: 11 },
  deleteBtn: { backgroundColor: '#f44336' },
  editBtn: { alignItems: 'center', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  editDateLabel: { fontSize: 12, marginRight: 8, minWidth: 24 },
  editInput: { borderRadius: 4, borderWidth: 1, flex: 1, fontSize: 13, marginRight: 8, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right' },
  editRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: 10, padding: 8 },
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  todayBorder: { borderWidth: 1 },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
});

export default BalanceHistoryCalendarView;
