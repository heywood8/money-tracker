/* eslint-disable react/prop-types */
/**
 * Tests for the developer log viewer: the severity filter strip, the inverted
 * chat-style list, and the share/clear actions.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LogsPanel from '../../../app/components/settings/LogsPanel';

const mockClearLogs = jest.fn();
const mockGetExportText = jest.fn(() => 'exported log text');
const mockShareAsync = jest.fn(() => Promise.resolve());
const mockFileWrite = jest.fn();
const mockSetStringAsync = jest.fn();

// The hook filters server-side; the panel just passes the level down, so record
// what it asked for and answer with a fixed set.
const logState = {
  entries: [
    { id: 1, timestamp: '2026-08-01T10:15:30.000Z', level: 'error', message: 'boom' },
    { id: 2, timestamp: '2026-08-01T10:16:00.000Z', level: 'info', message: 'hello' },
  ],
  counts: { all: 2, error: 1, warn: 0, info: 1, debug: 0 },
  lastFilter: null,
};

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000', mutedText: '#888', border: '#ddd',
      primary: '#6200ee', destructive: '#d9534f',
    },
  }),
}));

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../../app/hooks/useLogEntries', () => ({
  useLogEntries: (filter) => {
    logState.lastFilter = filter;
    return {
      entries: logState.entries,
      counts: logState.counts,
      clearLogs: mockClearLogs,
      getExportText: mockGetExportText,
    };
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args) => mockSetStringAsync(...args),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: (...args) => mockShareAsync(...args),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: '/tmp/cache/penny-logs.txt',
    write: mockFileWrite,
  })),
  Paths: { cache: '/tmp/cache/' },
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

describe('LogsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logState.lastFilter = null;
  });

  describe('filter strip', () => {
    it('offers every severity plus "all", and starts on "all"', async () => {
      const { getByText } = await render(<LogsPanel />);

      ['log_level_all', 'log_level_error', 'log_level_warn', 'log_level_info', 'log_level_debug']
        .forEach(label => expect(getByText(label)).toBeTruthy());
      expect(logState.lastFilter).toBe('all');
    });

    it('passes the chosen level to the hook', async () => {
      const { getByText } = await render(<LogsPanel />);

      await act(async () => {
        fireEvent.press(getByText('log_level_error'));
      });

      expect(logState.lastFilter).toBe('error');
    });

    it('badges only the levels that have entries, and never "all"', async () => {
      const { getAllByText, queryByText } = await render(<LogsPanel />);

      // error: 1 and info: 1 are each badged; warn/debug are zero, and the
      // absence of a badge is what "none" looks like.
      expect(getAllByText('1')).toHaveLength(2);
      expect(queryByText('0')).toBeNull();
      // "all" carries a count of 2 in the data but is deliberately not badged.
      expect(queryByText('2')).toBeNull();
    });

    it('labels a badged chip with its count for screen readers', async () => {
      const { getByLabelText } = await render(<LogsPanel />);
      expect(getByLabelText('log_level_error, 1')).toBeTruthy();
    });
  });

  describe('entries', () => {
    it('renders each entry with its level and message', async () => {
      const { getByText } = await render(<LogsPanel />);

      expect(getByText('ERROR')).toBeTruthy();
      expect(getByText('boom')).toBeTruthy();
      expect(getByText('INFO')).toBeTruthy();
      expect(getByText('hello')).toBeTruthy();
    });

    it('shows a bare time until an entry is expanded, then the full stamp', async () => {
      const { getByText, queryByText } = await render(<LogsPanel />);

      expect(getByText('10:15:30')).toBeTruthy();
      expect(queryByText('2026-08-01 10:15:30')).toBeNull();

      await act(async () => {
        fireEvent.press(getByText('boom'));
      });

      expect(getByText('2026-08-01 10:15:30')).toBeTruthy();
    });

    it('copies an entry on long press', async () => {
      const { getByText } = await render(<LogsPanel />);

      await act(async () => {
        fireEvent(getByText('boom'), 'longPress');
      });

      expect(mockSetStringAsync).toHaveBeenCalledWith(
        '2026-08-01T10:15:30.000Z [ERROR] boom',
      );
    });

    it('shows the empty state when there are no entries', async () => {
      const saved = logState.entries;
      logState.entries = [];
      try {
        const { getByText } = await render(<LogsPanel />);
        expect(getByText('no_logs')).toBeTruthy();
      } finally {
        logState.entries = saved;
      }
    });
  });

  describe('actions', () => {
    it('writes the export to a dated file and opens the share sheet', async () => {
      const { getByText } = await render(<LogsPanel />);

      await act(async () => {
        fireEvent.press(getByText('share_logs'));
      });

      expect(mockGetExportText).toHaveBeenCalled();
      expect(mockFileWrite).toHaveBeenCalledWith('exported log text');
      expect(mockShareAsync).toHaveBeenCalledWith(
        '/tmp/cache/penny-logs.txt',
        { mimeType: 'text/plain' },
      );
    });

    it('swallows a share failure rather than crashing the panel', async () => {
      mockShareAsync.mockImplementationOnce(() => Promise.reject(new Error('no sharing')));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByText } = await render(<LogsPanel />);

      await act(async () => {
        fireEvent.press(getByText('share_logs'));
      });

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('clears the logs', async () => {
      const { getByText } = await render(<LogsPanel />);

      await act(async () => {
        fireEvent.press(getByText('clear_logs'));
      });

      expect(mockClearLogs).toHaveBeenCalled();
    });
  });
});
