import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BalanceHistoryCalendarView from '../../../app/components/graphs/BalanceHistoryCalendarView';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));

const mockColors = {
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  border: '#e0e0e0',
  surface: '#fff',
  background: '#f5f5f5',
};

const makeEntry = (year, month, day, balance) => ({
  date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  displayDate: String(day),
  balance,
});

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  selectedYear: 2024,
  selectedMonth: 0, // January
  balanceHistoryTableData: [], // real data is sparse; only recorded days have entries
  editingBalanceRow: null,
  editingBalanceValue: '',
  onEditingBalanceValueChange: jest.fn(),
  onEditBalance: jest.fn(),
  onCancelEdit: jest.fn(),
  onSaveBalance: jest.fn(),
  onDeleteBalance: jest.fn(),
};

describe('BalanceHistoryCalendarView', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('Grid rendering', () => {
    it('renders all 7 day-of-week headers', async () => {
      const { getByText, getAllByText } = await render(<BalanceHistoryCalendarView {...defaultProps} />);
      expect(getByText('M')).toBeTruthy();
      const tHeaders = getAllByText('T');
      expect(tHeaders).toHaveLength(2); // Tuesday and Thursday
      expect(getByText('W')).toBeTruthy();
      expect(getByText('F')).toBeTruthy();
      expect(getByText('S')).toBeTruthy();
      expect(getByText('Su')).toBeTruthy();
    });

    it('renders a cell for every day of the month', async () => {
      const { getByTestId } = await render(<BalanceHistoryCalendarView {...defaultProps} />);
      // January has 31 days
      expect(getByTestId('day-cell-1')).toBeTruthy();
      expect(getByTestId('day-cell-31')).toBeTruthy();
    });

    it('shows formatted balance in cells that have an entry', async () => {
      const tableData = [
        makeEntry(2024, 0, 5, '532000'),  // day 5 → 532K
        makeEntry(2024, 0, 15, '1500000'), // day 15 → 1.5M
      ];
      const { getByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      expect(getByTestId('day-balance-5')).toBeTruthy();
      expect(getByTestId('day-balance-15')).toBeTruthy();
    });

    it('does not render a balance label for empty days', async () => {
      const { queryByTestId } = await render(<BalanceHistoryCalendarView {...defaultProps} />);
      expect(queryByTestId('day-balance-1')).toBeNull();
    });
  });

  describe('Day selection', () => {
    it('calls onEditBalance with correct date and empty string when tapping a day with no entry', async () => {
      const { getByTestId } = await render(<BalanceHistoryCalendarView {...defaultProps} />);
      await fireEvent.press(getByTestId('day-cell-10'));
      expect(defaultProps.onEditBalance).toHaveBeenCalledWith('2024-01-10', '');
    });

    it('calls onEditBalance with existing balance when tapping a day with an entry', async () => {
      const tableData = [makeEntry(2024, 0, 10, '1200.00')];
      const { getByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      await fireEvent.press(getByTestId('day-cell-10'));
      expect(defaultProps.onEditBalance).toHaveBeenCalledWith('2024-01-10', '1200.00');
    });

    it('shows the edit row after tapping a day', async () => {
      const { getByTestId, queryByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      expect(queryByTestId('calendar-edit-row')).toBeNull();
      await fireEvent.press(getByTestId('day-cell-5'));
      expect(getByTestId('calendar-edit-row')).toBeTruthy();
    });
  });

  describe('Inline edit row', () => {
    it('calls onSaveBalance with the correct date when Save is pressed', async () => {
      const { getByTestId } = await render(<BalanceHistoryCalendarView {...defaultProps} />);
      await fireEvent.press(getByTestId('day-cell-7'));
      await fireEvent.press(getByTestId('calendar-save-btn'));
      expect(defaultProps.onSaveBalance).toHaveBeenCalledWith('2024-01-07');
    });

    it('hides the edit row after Save is pressed', async () => {
      const { getByTestId, queryByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      await fireEvent.press(getByTestId('day-cell-7'));
      await fireEvent.press(getByTestId('calendar-save-btn'));
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });

    it('shows delete button only for days with an existing entry', async () => {
      const tableData = [makeEntry(2024, 0, 7, '999.00')]; // day 7 has entry
      const { getByTestId, queryByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      await fireEvent.press(getByTestId('day-cell-7'));
      expect(getByTestId('calendar-delete-btn')).toBeTruthy();
      await fireEvent.press(getByTestId('calendar-cancel-btn'));
      await fireEvent.press(getByTestId('day-cell-1'));
      expect(queryByTestId('calendar-delete-btn')).toBeNull();
    });

    it('calls onDeleteBalance with the correct date and hides edit row', async () => {
      const tableData = [makeEntry(2024, 0, 10, '500')]; // day 10
      const { getByTestId, queryByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      await fireEvent.press(getByTestId('day-cell-10'));
      await fireEvent.press(getByTestId('calendar-delete-btn'));
      expect(defaultProps.onDeleteBalance).toHaveBeenCalledWith('2024-01-10');
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });

    it('calls onCancelEdit and hides edit row when cancel is pressed', async () => {
      const { getByTestId, queryByTestId } = await render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      await fireEvent.press(getByTestId('day-cell-3'));
      await fireEvent.press(getByTestId('calendar-cancel-btn'));
      expect(defaultProps.onCancelEdit).toHaveBeenCalled();
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });
  });
});
