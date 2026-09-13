/**
 * QuickAddDateChip tests.
 *
 * The chip is the quick-add form's only way to book anything but today, so what
 * matters here is that "Yesterday" means the LOCAL previous day, that "today" is
 * reported as null (resolved at save time rather than at mount), and that the
 * chip stays a ≥ 44 dp labelled target.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import QuickAddDateChip from '../../../app/components/operations/QuickAddDateChip';
import {
  OverlayHostProvider,
  OverlayOutlet,
} from '../../../app/contexts/OverlayHostContext';
import { localDateWithOffset } from '../../../app/utils/dateUtils';

// The global mock renders a bare host element and drops its props; this one
// hands the change handler back so the picker branch can be exercised.
let pickerProps = null;
jest.mock('@react-native-community/datetimepicker', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: (props) => {
      pickerProps = props;
      return ReactLib.createElement('DateTimePicker');
    },
  };
});

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ language: 'en' }),
}));

const colors = {
  text: '#000000',
  mutedText: '#666666',
  border: '#cccccc',
  surface: '#ffffff',
  primary: '#1a73e8',
  primaryStrong: '#0b4ea2',
  inputBackground: '#ffffff',
  selected: '#a8d0f5',
};

const t = (key) => key;

const harnessStyles = StyleSheet.create({ fill: { flex: 1 } });

// Mirrors App.js: the chip renders inside the content view, its menu lands in the
// outlet next to it — one shared parent, one coordinate space. Without the host
// the portal has nowhere to mount and the menu would never appear.
// `render` resolves asynchronously under this project's RNTL setup.
const renderChip = (props = {}) => render(
  <OverlayHostProvider>
    <View style={harnessStyles.fill}>
      <View style={harnessStyles.fill}>
        <QuickAddDateChip date={null} onChange={jest.fn()} colors={colors} t={t} {...props} />
      </View>
      <OverlayOutlet />
    </View>
  </OverlayHostProvider>,
);

describe('QuickAddDateChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pickerProps = null;
  });

  describe('Chip', () => {
    it('reads as today when no date is set', async () => {
      const { getByTestId } = await renderChip();

      expect(getByTestId('quick-add-date-chip').props.accessibilityLabel).toBe('date: today');
    });

    it('names the chosen day once the form is back-dated', async () => {
      const { getByTestId } = await renderChip({ date: localDateWithOffset(-1) });

      expect(getByTestId('quick-add-date-chip').props.accessibilityLabel).toBe('date: yesterday');
    });

    it('names the year for a day in another one', async () => {
      // The chip is the only thing reporting what the next entry will be booked
      // as, and the date is sticky, so "Sep 4" alone would hide a year-old slip
      // from the picker wheel.
      const { getByTestId } = await renderChip({ date: '2020-09-04' });

      expect(getByTestId('quick-add-date-chip').props.accessibilityLabel).toContain('2020');
    });

    it('keeps a 44 dp target', async () => {
      const { getByTestId } = await renderChip();
      const style = getByTestId('quick-add-date-chip').props.style.flat();

      expect(style.some(s => s && s.minHeight === 44)).toBe(true);
      expect(style.some(s => s && s.minWidth === 44)).toBe(true);
    });

    it('carries an accessible hint', async () => {
      const { getByTestId } = await renderChip();

      expect(getByTestId('quick-add-date-chip').props.accessibilityHint).toBe('quick_add_date_hint');
    });

    it('does not open the menu while disabled', async () => {
      const { getByTestId, queryByTestId } = await renderChip({ disabled: true });

      await fireEvent.press(getByTestId('quick-add-date-chip'));

      expect(queryByTestId('quick-add-date-today')).toBeNull();
    });
  });

  describe('Menu', () => {
    it('opens on a tap and offers today, yesterday and a picker', async () => {
      const { getByTestId } = await renderChip();

      await fireEvent.press(getByTestId('quick-add-date-chip'));

      expect(getByTestId('quick-add-date-today')).toBeTruthy();
      expect(getByTestId('quick-add-date-yesterday')).toBeTruthy();
      expect(getByTestId('quick-add-date-pick')).toBeTruthy();
    });

    it('books the LOCAL previous day for yesterday', async () => {
      const onChange = jest.fn();
      const { getByTestId } = await renderChip({ onChange });

      await fireEvent.press(getByTestId('quick-add-date-chip'));
      await fireEvent.press(getByTestId('quick-add-date-yesterday'));

      expect(onChange).toHaveBeenCalledWith(localDateWithOffset(-1));
    });

    it('reports today as null rather than as a stamped date', async () => {
      const onChange = jest.fn();
      const { getByTestId } = await renderChip({ date: localDateWithOffset(-1), onChange });

      await fireEvent.press(getByTestId('quick-add-date-chip'));
      await fireEvent.press(getByTestId('quick-add-date-today'));

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('marks the active day', async () => {
      const { getByTestId } = await renderChip({ date: localDateWithOffset(-1) });

      await fireEvent.press(getByTestId('quick-add-date-chip'));

      expect(getByTestId('quick-add-date-yesterday').props.accessibilityState.selected).toBe(true);
      expect(getByTestId('quick-add-date-today').props.accessibilityState.selected).toBe(false);
    });

    it('still opens when there is no overlay host to measure against', async () => {
      // A chip rendered outside the provider (an isolated screen, a test) has
      // nothing to anchor to. The menu must still open — centred — rather than
      // swallow the tap.
      const { getByTestId } = await render(
        <QuickAddDateChip date={null} onChange={jest.fn()} colors={colors} t={t} />,
      );

      await fireEvent.press(getByTestId('quick-add-date-chip'));

      expect(getByTestId('quick-add-date-chip').props.accessibilityState.expanded).toBe(true);
    });

    it('closes the menu before the native picker opens, so the two never stack', async () => {
      const { getByTestId, queryByTestId } = await renderChip();

      await fireEvent.press(getByTestId('quick-add-date-chip'));
      await fireEvent.press(getByTestId('quick-add-date-pick'));

      expect(queryByTestId('quick-add-date-today')).toBeNull();
      expect(pickerProps).not.toBeNull();
    });
  });

  describe('Native picker', () => {
    const openPicker = async () => {
      const utils = await renderChip({ onChange: utils_onChange });
      await fireEvent.press(utils.getByTestId('quick-add-date-chip'));
      await fireEvent.press(utils.getByTestId('quick-add-date-pick'));
      return utils;
    };
    let utils_onChange;

    beforeEach(() => { utils_onChange = jest.fn(); });

    it('reports the picked day as a local YYYY-MM-DD', async () => {
      await openPicker();

      // 23:30 local on the 4th: a UTC-based conversion would report the 5th
      // anywhere east of Greenwich.
      pickerProps.onChange({ type: 'set' }, new Date(2026, 8, 4, 23, 30));

      expect(utils_onChange).toHaveBeenCalledWith('2026-09-04');
    });

    it('collapses a picked today back to null', async () => {
      await openPicker();

      pickerProps.onChange({ type: 'set' }, new Date());

      expect(utils_onChange).toHaveBeenCalledWith(null);
    });

    it('changes nothing when the picker is dismissed', async () => {
      await openPicker();

      pickerProps.onChange({ type: 'dismissed' }, undefined);

      expect(utils_onChange).not.toHaveBeenCalled();
    });
  });
});
