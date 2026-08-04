import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import MonthPickerSheet from '../../../app/components/budgets/MonthPickerSheet';
import { currentMonthKey, monthShortLabels } from '../../../app/utils/monthUtils';

jest.mock('../../../app/components/ModalBlurOverlay', () => () => null);

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
  card: '#fff', scrim: 'rgba(0,0,0,0.32)',
};
const t = (k) => k;

const setup = async (props = {}) => render(
  <MonthPickerSheet
    visible
    monthKey="2026-03"
    onSelect={jest.fn()}
    onClose={jest.fn()}
    colors={colors}
    t={t}
    language="en"
    {...props}
  />,
);

describe('MonthPickerSheet', () => {
  it('renders nothing while closed', async () => {
    const { queryByTestId } = await setup({ visible: false });
    expect(queryByTestId('month-picker-month-2026-03')).toBeNull();
  });

  it('shows the twelve months of the selected month year', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('month-picker-year')).toHaveTextContent('2026');
    for (let i = 1; i <= 12; i += 1) {
      const key = `2026-${String(i).padStart(2, '0')}`;
      expect(getByTestId(`month-picker-month-${key}`)).toBeTruthy();
    }
    // No thirteenth cell: the tab is scoped to a month, so the grid is twelve
    // targets and not a day calendar's twenty-eight-to-thirty-one.
    expect(within(getByTestId('month-picker-month-2026-01')).getByText(monthShortLabels('en')[0]))
      .toBeTruthy();
  });

  it('marks the scoped month as selected and leaves the others unselected', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('month-picker-month-2026-03').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('month-picker-month-2026-04').props.accessibilityState.selected).toBe(false);
  });

  it('reports the picked month and closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = await setup({ onSelect, onClose });
    await press(getByTestId('month-picker-month-2026-11'));
    expect(onSelect).toHaveBeenCalledWith('2026-11');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps the year without changing the selection', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await setup({ onSelect });
    await press(getByTestId('month-picker-prev-year'));

    expect(getByTestId('month-picker-year')).toHaveTextContent('2025');
    expect(queryByTestId('month-picker-month-2026-03')).toBeNull();
    // Browsing a year is not committing to it: nothing is reported until a
    // month in it is tapped.
    expect(onSelect).not.toHaveBeenCalled();
    expect(getByTestId('month-picker-month-2025-03').props.accessibilityState.selected).toBe(false);

    await press(getByTestId('month-picker-next-year'));
    await press(getByTestId('month-picker-next-year'));
    expect(getByTestId('month-picker-year')).toHaveTextContent('2027');
    await press(getByTestId('month-picker-month-2027-03'));
    expect(onSelect).toHaveBeenCalledWith('2027-03');
  });

  // Regression: the sheet stays mounted between openings (Modal owns its own
  // visibility), so a year the user browsed and then backed out of would be
  // what the next opening showed.
  it('re-seeds the browsed year on every open', async () => {
    const { getByTestId, rerender } = await setup();
    await press(getByTestId('month-picker-prev-year'));
    expect(getByTestId('month-picker-year')).toHaveTextContent('2025');

    const props = {
      monthKey: '2026-03',
      onSelect: jest.fn(),
      onClose: jest.fn(),
      colors,
      t,
      language: 'en',
    };
    await act(async () => {
      rerender(<MonthPickerSheet visible={false} {...props} />);
    });
    await act(async () => {
      rerender(<MonthPickerSheet visible {...props} />);
    });

    expect(getByTestId('month-picker-year')).toHaveTextContent('2026');
  });

  it('outlines the real current month so the grid has an anchor', async () => {
    const todayKey = currentMonthKey();
    const [year, month] = todayKey.split('-');
    // Scope the sheet to a different month of the same year so "today" and
    // "selected" cannot be the same cell.
    const other = month === '01' ? `${year}-02` : `${year}-01`;
    const { getByTestId } = await setup({ monthKey: other });

    const today = StyleSheet.flatten(getByTestId(`month-picker-month-${todayKey}`).props.style);
    expect(today.borderColor).toBe(colors.primary);
    expect(today.borderWidth).toBe(1);

    // The selection carries a fill instead, so the two states never read alike.
    const selected = StyleSheet.flatten(getByTestId(`month-picker-month-${other}`).props.style);
    expect(selected.backgroundColor).toBe(colors.primary + '29');
    expect(selected.borderWidth).toBeUndefined();
  });

  it('names months in the app language, not the device locale', async () => {
    const { getByTestId } = await setup({ language: 'ru', monthKey: '2026-01' });
    const ru = monthShortLabels('ru');
    expect(within(getByTestId('month-picker-month-2026-01')).getByText(ru[0])).toBeTruthy();
    expect(ru[0]).not.toBe(monthShortLabels('en')[0]);
  });

  describe('whole-year option (allowFullYear)', () => {
    it('is absent by default, so the Budgets grid stays twelve months', async () => {
      const { queryByTestId } = await setup();
      expect(queryByTestId('month-picker-full-year')).toBeNull();
    });

    it('offers the browsed year and reports it as a YYYY-full key', async () => {
      const onSelect = jest.fn();
      const onClose = jest.fn();
      const { getByTestId } = await setup({ allowFullYear: true, onSelect, onClose });

      await press(getByTestId('month-picker-full-year'));

      expect(onSelect).toHaveBeenCalledWith('2026-full');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // The stepper above the grid is what widens the browse, and the year cell
    // must follow it rather than the year of the current selection.
    it('follows the year stepper', async () => {
      const onSelect = jest.fn();
      const { getByTestId } = await setup({ allowFullYear: true, onSelect });

      await press(getByTestId('month-picker-prev-year'));
      await press(getByTestId('month-picker-full-year'));

      expect(onSelect).toHaveBeenCalledWith('2025-full');
    });

    it('marks a whole-year scope as the selection, and no month with it', async () => {
      const { getByTestId } = await setup({ allowFullYear: true, monthKey: '2026-full' });

      expect(getByTestId('month-picker-full-year').props.accessibilityState.selected).toBe(true);
      expect(getByTestId('month-picker-month-2026-03').props.accessibilityState.selected).toBe(false);
    });

    it('does not mark the year of a month scope as selected', async () => {
      const { getByTestId } = await setup({ allowFullYear: true, monthKey: '2026-03' });

      expect(getByTestId('month-picker-full-year').props.accessibilityState.selected).toBe(false);
      expect(getByTestId('month-picker-month-2026-03').props.accessibilityState.selected).toBe(true);
    });

    // A year browsed away from the selected one is not the selection either.
    it('does not mark another year as selected while one year is scoped', async () => {
      const { getByTestId } = await setup({ allowFullYear: true, monthKey: '2026-full' });

      await press(getByTestId('month-picker-prev-year'));

      expect(getByTestId('month-picker-full-year').props.accessibilityState.selected).toBe(false);
    });
  });

  it('dismisses on a tap outside the sheet', async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await setup({ onClose });
    await press(getByLabelText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
