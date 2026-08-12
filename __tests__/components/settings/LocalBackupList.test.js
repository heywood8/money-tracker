/* eslint-disable react/prop-types */
/**
 * Tests for the stored-backup list — the filename-to-date labelling, and the
 * in-place delete confirmation that keeps the user in the list they are reading.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LocalBackupList, { formatBackupLabel } from '../../../app/components/settings/LocalBackupList';

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee', destructive: '#d9534f' },
  }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const BACKUPS = [
  { uri: 'file:///daily_2026-08-01.json', filename: 'daily_2026-08-01.json', size: 2048 },
  { uri: 'file:///manual_2026-08-02_10-30.json', filename: 'manual_2026-08-02_10-30.json', size: 1024 },
];

describe('formatBackupLabel', () => {
  it('reads a daily backup as its date', () => {
    expect(formatBackupLabel('daily_2026-08-01.json')).toMatch(/2026/);
    expect(formatBackupLabel('daily_2026-08-01.json')).not.toContain('daily_');
  });

  it('reads a weekly backup as its week', () => {
    expect(formatBackupLabel('weekly_2026-31.json', (k) => k)).toBe('weekly 31, 2026');
  });

  it('reads a manual backup as its date and time', () => {
    expect(formatBackupLabel('manual_2026-08-02_10-30.json')).toContain('· 10:30');
  });

  it('falls back to the raw filename for anything it does not recognise', () => {
    expect(formatBackupLabel('something-else.json')).toBe('something-else.json');
  });
});

describe('LocalBackupList', () => {
  it('shows a loading placeholder while the list is being read', async () => {
    const { getByText } = await render(
      <LocalBackupList backups={[]} loading onRestore={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByText('Loading...')).toBeTruthy();
  });

  it('shows an empty state when there is nothing stored', async () => {
    const { getByText } = await render(
      <LocalBackupList backups={[]} onRestore={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByText('local_backups_empty')).toBeTruthy();
  });

  it('lists each backup with its size', async () => {
    const { getByText } = await render(
      <LocalBackupList backups={BACKUPS} onRestore={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByText(/2\.0 KB/)).toBeTruthy();
    expect(getByText(/1\.0 KB/)).toBeTruthy();
  });

  it('hands the chosen backup back for restoring', async () => {
    const onRestore = jest.fn();
    const { getAllByTestId } = await render(
      <LocalBackupList backups={BACKUPS} onRestore={onRestore} onDelete={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(getAllByTestId('icon-refresh-outline')[0]);
    });

    expect(onRestore).toHaveBeenCalledWith(BACKUPS[0]);
  });

  describe('delete', () => {
    it('asks in the row rather than over the list, and can be backed out of', async () => {
      const onDelete = jest.fn();
      const { getAllByTestId, getByText, queryByText } = await render(
        <LocalBackupList backups={BACKUPS} onRestore={jest.fn()} onDelete={onDelete} />,
      );

      await act(async () => {
        fireEvent.press(getAllByTestId('icon-trash-outline')[0]);
      });
      expect(getByText('delete_backup_confirm')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByText('cancel'));
      });
      expect(queryByText('delete_backup_confirm')).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('deletes only the row that was confirmed', async () => {
      const onDelete = jest.fn();
      const { getAllByTestId, getByText } = await render(
        <LocalBackupList backups={BACKUPS} onRestore={jest.fn()} onDelete={onDelete} />,
      );

      await act(async () => {
        fireEvent.press(getAllByTestId('icon-trash-outline')[1]);
      });
      await act(async () => {
        fireEvent.press(getByText('delete'));
      });

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(BACKUPS[1].uri);
    });

    it('confirms one row at a time', async () => {
      const { getAllByTestId, getAllByText } = await render(
        <LocalBackupList backups={BACKUPS} onRestore={jest.fn()} onDelete={jest.fn()} />,
      );

      await act(async () => {
        fireEvent.press(getAllByTestId('icon-trash-outline')[0]);
      });

      expect(getAllByText('delete_backup_confirm')).toHaveLength(1);
    });
  });
});
