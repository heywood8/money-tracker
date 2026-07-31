/**
 * Tests for the operations heatmap entry point (OperationsHeatmapCard) and the
 * lazy-loading contract of HeatmapMapModal: nothing — no DB query, no tile
 * cache touch — happens until the row is tapped; the fullscreen map loads the
 * selected period by default and switches to all-time via the header chip.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import OperationsHeatmapCard from '../../app/components/graphs/OperationsHeatmapCard';
import { getOperationCoordinates } from '../../app/services/OperationsDB';
import { pruneTileCache } from '../../app/services/MapTileCache';

jest.mock('../../app/services/OperationsDB', () => ({
  getOperationCoordinates: jest.fn(),
}));

jest.mock('../../app/services/MapTileCache', () => ({
  getTileUri: jest.fn().mockResolvedValue(null),
  pruneTileCache: jest.fn().mockResolvedValue(undefined),
}));

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  background: '#fff',
  surface: '#f7f7f7',
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  border: '#ddd',
  selected: '#eee',
  altRow: '#fafafa',
};

const t = (key) => key;

const defaultProps = {
  colors,
  t,
  selectedYear: 2026,
  selectedMonth: 6, // July
  periodLabel: 'July 2026',
};

describe('OperationsHeatmapCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOperationCoordinates.mockResolvedValue([
      { latitude: 40.1772, longitude: 44.5035 },
    ]);
  });

  it('renders the collapsed row without touching the DB or the tile cache', async () => {
    const { getByTestId, queryByTestId } = await render(
      <OperationsHeatmapCard {...defaultProps} />,
    );
    expect(getByTestId('operations-heatmap-card')).toBeTruthy();
    expect(queryByTestId('heatmap-map-modal')).toBeNull();
    expect(getOperationCoordinates).not.toHaveBeenCalled();
    expect(pruneTileCache).not.toHaveBeenCalled();
  });

  it('opens the fullscreen map on tap and loads the selected period', async () => {
    const { getByTestId } = await render(<OperationsHeatmapCard {...defaultProps} />);
    await press(getByTestId('operations-heatmap-card'));

    expect(getByTestId('heatmap-map-modal')).toBeTruthy();
    await waitFor(() => {
      // July 2026 spans the whole calendar month.
      expect(getOperationCoordinates).toHaveBeenCalledWith('2026-07-01', '2026-07-31');
    });
    expect(pruneTileCache).toHaveBeenCalled();
  });

  it('loads the whole year when the Graphs period is a full year', async () => {
    const { getByTestId } = await render(
      <OperationsHeatmapCard
        {...defaultProps}
        selectedMonth={null}
        periodLabel="full_year 2026"
      />,
    );
    await press(getByTestId('operations-heatmap-card'));
    await waitFor(() => {
      expect(getOperationCoordinates).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    });
  });

  it('switches to all time via the header chip', async () => {
    const { getByTestId } = await render(<OperationsHeatmapCard {...defaultProps} />);
    await press(getByTestId('operations-heatmap-card'));
    await waitFor(() => expect(getOperationCoordinates).toHaveBeenCalledTimes(1));

    await press(getByTestId('heatmap-all-time-toggle'));
    await waitFor(() => {
      expect(getOperationCoordinates).toHaveBeenLastCalledWith();
    });
  });

  it('shows the empty state when the period has no located operations', async () => {
    getOperationCoordinates.mockResolvedValue([]);
    const { getByTestId, getByText } = await render(
      <OperationsHeatmapCard {...defaultProps} />,
    );
    await press(getByTestId('operations-heatmap-card'));
    await waitFor(() => {
      expect(getByText('graphs_map_no_locations')).toBeTruthy();
    });
  });

  it('closes the map and unmounts it entirely', async () => {
    const { getByTestId, queryByTestId } = await render(
      <OperationsHeatmapCard {...defaultProps} />,
    );
    await press(getByTestId('operations-heatmap-card'));
    await waitFor(() => expect(getOperationCoordinates).toHaveBeenCalled());

    await press(getByTestId('heatmap-close-button'));
    await waitFor(() => {
      expect(queryByTestId('heatmap-map-modal')).toBeNull();
    });
  });
});
