/**
 * OperationsListPlaceholder Component Tests
 *
 * The skeleton stands in for the operations list while the database loads. It
 * has to cover whatever vertical space it is given: with the QuickAdd panel
 * hidden in settings it owns the entire screen, and a fixed number of rows left
 * the bottom half blank (the bug these tests pin down).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OperationsListPlaceholder from '../../../app/components/operations/OperationsListPlaceholder';

const WINDOW_HEIGHT = 800;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
}));

const defaultProps = {
  colors: { border: '#CCCCCC', surface: '#FFFFFF' },
  t: (key) => key,
};

// Geometry of the rendered skeleton, spelled out here rather than imported so a
// change to the component's own constants has to be justified against these.
const ROW_HEIGHT = 48;          // row minHeight (HEIGHTS.listItem)
const ROW_SEPARATOR = 1;        // hairline between two rows of the same day
const DATE_ROW = 28;            // date-separator row above each day card
const GROUP_MARGIN = 8;         // gap below each day card

// How tall the drawn skeleton actually is, counted from what it rendered. Rows
// alone would undercount: the date rows and the gaps between cards take vertical
// space too, so an assertion on rows × ROW_HEIGHT would drift the moment the
// day-card sizes change.
const skeletonHeight = (getAllByTestId) => {
  const groups = getAllByTestId('operations-placeholder-group').length;
  const rows = getAllByTestId('operations-placeholder-row').length;
  return rows * ROW_HEIGHT
    + (rows - groups) * ROW_SEPARATOR
    + groups * (DATE_ROW + GROUP_MARGIN);
};

// Fire the root container's onLayout with the given offset from the top of the
// list's content container, i.e. the height of the header sitting above it.
const layoutAt = async (getByTestId, y) => {
  await fireEvent(getByTestId('operations-list-placeholder'), 'layout', {
    nativeEvent: { layout: { x: 0, y, width: 400, height: 1000 } },
  });
};

describe('OperationsListPlaceholder', () => {
  describe('Vertical coverage', () => {
    it('draws enough rows to fill the window before it has been laid out', async () => {
      const { getAllByTestId } = await render(<OperationsListPlaceholder {...defaultProps} />);

      expect(skeletonHeight(getAllByTestId)).toBeGreaterThanOrEqual(WINDOW_HEIGHT);
    });

    it('keeps covering the whole screen when no header sits above it', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      await layoutAt(getByTestId, 0);

      expect(skeletonHeight(getAllByTestId)).toBeGreaterThanOrEqual(WINDOW_HEIGHT);
    });

    it('covers the space left below a tall QuickAdd header', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      const headerHeight = 360;
      await layoutAt(getByTestId, headerHeight);

      expect(skeletonHeight(getAllByTestId)).toBeGreaterThanOrEqual(WINDOW_HEIGHT - headerHeight);
    });

    it('trims the rows that a tall header pushed below the fold', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      const fullScreenRows = getAllByTestId('operations-placeholder-row').length;
      await layoutAt(getByTestId, 360);

      expect(getAllByTestId('operations-placeholder-row').length).toBeLessThan(fullScreenRows);
    });

    it('re-fills the screen when the header above it collapses away', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      await layoutAt(getByTestId, 360);
      await layoutAt(getByTestId, 0);

      expect(skeletonHeight(getAllByTestId)).toBeGreaterThanOrEqual(WINDOW_HEIGHT);
    });

    it('does not redraw for every frame of a collapsing header', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      // A Reanimated collapse sweeps the offset through every pixel on its way
      // down; the row count must not follow it frame by frame.
      await layoutAt(getByTestId, 360);
      const settled = getAllByTestId('operations-placeholder-row').length;

      for (const y of [352, 344, 336, 328, 320]) {
        await layoutAt(getByTestId, y);
        expect(getAllByTestId('operations-placeholder-row').length).toBe(settled);
      }
    });

    it('ignores a layout that leaves no room rather than dropping every row', async () => {
      const { getByTestId, getAllByTestId } = await render(
        <OperationsListPlaceholder {...defaultProps} />,
      );

      await layoutAt(getByTestId, WINDOW_HEIGHT + 100);

      expect(getAllByTestId('operations-placeholder-row').length).toBeGreaterThan(0);
    });
  });

  describe('Structure', () => {
    it('splits the rows across several day cards instead of one long card', async () => {
      const { getAllByTestId } = await render(<OperationsListPlaceholder {...defaultProps} />);

      expect(getAllByTestId('operations-placeholder-group').length).toBeGreaterThan(1);
    });

    it('exposes a single busy node to screen readers', async () => {
      const { getByTestId } = await render(<OperationsListPlaceholder {...defaultProps} />);

      const root = getByTestId('operations-list-placeholder');
      expect(root.props.accessibilityRole).toBe('progressbar');
      expect(root.props.accessibilityLabel).toBe('loading_operations');
      expect(root.props.accessibilityState).toEqual({ busy: true });
    });
  });
});
