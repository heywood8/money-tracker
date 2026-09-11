import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BalanceHistoryCalendarView from '../../../app/components/graphs/BalanceHistoryCalendarView';

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
      const { getAllByText } = await render(<BalanceHistoryCalendarView {...defaultProps} language="en" />);
      // Narrow weekday names, so the two T days and the two S days each repeat.
      expect(getAllByText('M')).toHaveLength(1);
      expect(getAllByText('T')).toHaveLength(2); // Tuesday and Thursday
      expect(getAllByText('W')).toHaveLength(1);
      expect(getAllByText('F')).toHaveLength(1);
      expect(getAllByText('S')).toHaveLength(2); // Saturday and Sunday
    });

    // Regression for issue #1710: the grid was Monday-first with English
    // letters for every locale, so a Russian user got "M T W T F S Su" over a
    // week their calendar does not start on.
    it('starts the week on Sunday for a Sunday-first language', async () => {
      const { getAllByText } = await render(
        <BalanceHistoryCalendarView {...defaultProps} language="en" />,
      );
      const headers = getAllByText(/^[A-Z]$/).map(node => node.props.children);
      expect(headers).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    });

    it('starts the week on Monday and names the days in the app language', async () => {
      const { getAllByText } = await render(
        <BalanceHistoryCalendarView {...defaultProps} language="ru" />,
      );
      const headers = getAllByText(/^[а-яА-Я]+$/).map(node => node.props.children);
      expect(headers).toHaveLength(7);
      // Monday-first: Russian narrow weekday names start at понедельник.
      expect(headers[0]).toBe(
        new Intl.DateTimeFormat('ru', { weekday: 'narrow', timeZone: 'UTC' })
          .format(new Date(Date.UTC(2024, 0, 1))),
      );
    });

    // Simplified Chinese is Monday-first in CLDR (zh-Hans-CN, firstDay=1) even
    // though the other CJK locales the app ships are not.
    it('keeps Chinese on a Monday-first week', async () => {
      const { getAllByText } = await render(
        <BalanceHistoryCalendarView {...defaultProps} language="zh" />,
      );
      const expected = Array.from({ length: 7 }, (_, i) => (
        new Intl.DateTimeFormat('zh', { weekday: 'narrow', timeZone: 'UTC' })
          .format(new Date(Date.UTC(2024, 0, 1 + i)))
      ));
      const headers = getAllByText(/./).slice(0, 7).map(node => node.props.children);
      expect(headers).toEqual(expected);
    });

    // The first cell of the grid must line up with the header that names it.
    it('offsets the first day of the month to the right weekday column', async () => {
      // 2024-01-01 was a Monday.
      const sunday = await render(
        <BalanceHistoryCalendarView {...defaultProps} language="en" />,
      );
      expect(sunday.getByTestId('day-cell-1')).toBeTruthy();
      const monday = await render(
        <BalanceHistoryCalendarView {...defaultProps} language="ru" />,
      );
      expect(monday.getByTestId('day-cell-1')).toBeTruthy();
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
