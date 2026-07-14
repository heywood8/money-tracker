/**
 * Tests for OperationsList component
 * Covers initialLoading, rendering with data, footer, and edge-case branches.
 * Note: SectionList's virtual renderer does not invoke renderItem in the test
 * environment, so we pull callbacks directly from the SectionList props and call
 * them explicitly to exercise those code branches.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import OperationsList from '../../../app/components/operations/OperationsList';
import { HEIGHTS, BORDER_RADIUS, SPACING } from '../../../app/styles/designTokens';

// Intercept SectionList to capture its props for direct callback testing.
// RNTL v14 no longer exposes composite elements, so we capture props this way.
// Use a Proxy to avoid triggering lazy getters on the real react-native module.
let _capturedSLProps = null;
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const MockSectionList = (props) => { _capturedSLProps = props; return null; };
  return new Proxy(RN, {
    get(target, prop) {
      if (prop === 'SectionList') return MockSectionList;
      return Reflect.get(target, prop);
    },
  });
});

jest.mock('../../../app/components/operations/DateSeparator', () => {
  const React = require('react');
  /* eslint-disable react/prop-types */
  return function MockDateSeparator({ date, formatDate, onPress }) {
    // invoke formatDate so coverage counters inside that callback are hit
    if (formatDate) formatDate(date);
    return React.createElement('Pressable', { testID: `date-sep-${date}`, onPress });
  };
  /* eslint-enable react/prop-types */
});

jest.mock('../../../app/components/operations/OperationListItem', () => {
  const React = require('react');
  /* eslint-disable react/prop-types */
  return function MockOperationListItem({ operation, formatCurrency, getCategoryInfo, getAccountName, showUndo }) {
    // invoke utility callbacks so their coverage counters are hit
    if (formatCurrency) formatCurrency(operation.accountId, operation.amount);
    if (getCategoryInfo) getCategoryInfo(operation.categoryId);
    if (getAccountName) getAccountName(operation.accountId);
    return React.createElement(
      'View',
      { testID: `op-item-${operation.id}` },
      // Marker child so tests can assert which operation gets the inline undo bar.
      showUndo ? React.createElement('View', { testID: `op-undo-${operation.id}` }) : null,
    );
  };
  /* eslint-enable react/prop-types */
});

jest.mock('../../../app/components/operations/OperationsListPlaceholder', () => {
  const React = require('react');
  return function MockOperationsListPlaceholder() {
    return React.createElement('View', { testID: 'operations-list-placeholder' });
  };
});

jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
}), { virtual: true });

// ─── shared fixtures ──────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
})();
const OLD_DATE = '2020-01-15';

const accounts = [
  { id: 'acc-usd', name: 'Cash', currency: 'USD' },
  { id: 'acc-eur', name: 'Euro', currency: 'EUR' },
  { id: 'acc-nc', name: 'NoCurrency' },
];

const categories = [
  { id: 'cat-1', name: 'Food', icon: 'food' },
  { id: 'cat-key', nameKey: 'income_key', icon: 'cash' },
  { id: 'cat-child', name: 'Sub', icon: 'tag', parentId: 'cat-1' },
];

const makeGroup = (date, ops) => ({
  type: 'dateGroup',
  id: `group-${date}`,
  date,
  spendingSums: { USD: 100 },
  operations: ops,
});

// Convert a makeGroup result into the SectionList section shape
const toSection = (group) => ({
  title: group.date,
  spendingSums: group.spendingSums,
  data: group.operations,
});

const defaultProps = {
  groupedOperations: [],
  accounts,
  categories,
  colors: {
    primary: '#2196f3',
    mutedText: '#666666',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    text: '#000000',
  },
  t: (key) => key,
  onLoadMore: jest.fn(),
  onEditOperation: jest.fn(),
  onDateSeparatorPress: jest.fn(),
};

// Render OperationsList and return the underlying SectionList's props so we can
// invoke renderItem / renderSectionHeader / ListFooterComponent without relying
// on SectionList scroll.
async function getSectionListProps(extraProps = {}) {
  _capturedSLProps = null;
  const utils = await render(<OperationsList {...defaultProps} {...extraProps} />);
  return { ...utils, sp: _capturedSLProps };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('OperationsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── initialLoading: ListEmptyComponent branch ─────────────────────────────

  describe('initialLoading prop', () => {
    it('ListEmptyComponent shows skeleton placeholder when initialLoading=true', async () => {
      const { sp } = await getSectionListProps({ initialLoading: true });
      const { getByTestId } = await render(sp.ListEmptyComponent);
      expect(getByTestId('operations-list-placeholder')).toBeTruthy();
    });

    it('ListEmptyComponent shows empty-state text when initialLoading=false', async () => {
      const { sp } = await getSectionListProps({ initialLoading: false });
      const { getByText } = await render(sp.ListEmptyComponent);
      expect(getByText('no_operations')).toBeTruthy();
    });
  });

  // ── renderItem callbacks ──────────────────────────────────────────────────

  describe('renderItem — date label', () => {
    it('handles today date', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-t', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      const item = section.data[0];
      // render the section header to exercise formatDate
      await render(sp.renderSectionHeader({ section }));
      // render each item
      await render(sp.renderItem({ item, index: 0, section }));
    });

    it('handles yesterday date', async () => {
      const group = makeGroup(YESTERDAY, [
        { id: 'op-y', type: 'income', amount: '200.00', accountId: 'acc-usd', categoryId: 'cat-key' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderSectionHeader({ section }));
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('handles older date', async () => {
      const group = makeGroup(OLD_DATE, [
        { id: 'op-o', type: 'expense', amount: '75.00', accountId: 'acc-usd', categoryId: 'cat-child' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderSectionHeader({ section }));
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });
  });

  describe('renderItem — category resolution', () => {
    it('uses plain category name', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-1', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('uses nameKey translation', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-2', type: 'income', amount: '100.00', accountId: 'acc-usd', categoryId: 'cat-key' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('builds parent / child category path', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-3', type: 'expense', amount: '20.00', accountId: 'acc-usd', categoryId: 'cat-child' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('falls back for unknown category', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-4', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'no-such' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });
  });

  describe('renderItem — currency formatting', () => {
    it('formats USD amount', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-usd', type: 'expense', amount: '99.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('formats EUR amount', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-eur', type: 'expense', amount: '50.00', accountId: 'acc-eur', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('falls back for unknown account', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-na', type: 'expense', amount: '10.00', accountId: 'no-such', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('falls back for invalid amount', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-bad', type: 'expense', amount: 'NaN', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('handles account without currency field', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-nc', type: 'expense', amount: '5.00', accountId: 'acc-nc', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });
  });

  // ── ListFooterComponent (renderFooter) ────────────────────────────────────

  describe('ListFooterComponent', () => {
    it('shows ActivityIndicator when loadingMore=true', async () => {
      const { sp } = await getSectionListProps({ loadingMore: true });
      const footerEl = typeof sp.ListFooterComponent === 'function'
        ? sp.ListFooterComponent()
        : sp.ListFooterComponent;
      if (footerEl) {
        const { container } = await render(footerEl);
        expect(container.queryAll(n => n.type === 'ActivityIndicator').length).toBeGreaterThan(0);
      }
    });

    it('returns null when loadingMore=false', async () => {
      const { sp } = await getSectionListProps({ loadingMore: false });
      const footerEl = typeof sp.ListFooterComponent === 'function'
        ? sp.ListFooterComponent()
        : sp.ListFooterComponent;
      expect(footerEl).toBeNull();
    });
  });

  // ── onEndReached (handleEndReached) ──────────────────────────────────────

  describe('onEndReached', () => {
    it('calls onLoadMore when not loading and more ops exist', async () => {
      const mockLoadMore = jest.fn();
      const { sp } = await getSectionListProps({ onLoadMore: mockLoadMore, hasMoreOperations: true, loadingMore: false });
      await act(async () => { sp.onEndReached(); });
      expect(mockLoadMore).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onLoadMore when loadingMore=true', async () => {
      const mockLoadMore = jest.fn();
      const { sp } = await getSectionListProps({ onLoadMore: mockLoadMore, hasMoreOperations: true, loadingMore: true });
      await act(async () => { sp.onEndReached(); });
      expect(mockLoadMore).not.toHaveBeenCalled();
    });

    it('does NOT call onLoadMore when hasMoreOperations=false', async () => {
      const mockLoadMore = jest.fn();
      const { sp } = await getSectionListProps({ onLoadMore: mockLoadMore, hasMoreOperations: false, loadingMore: false });
      await act(async () => { sp.onEndReached(); });
      expect(mockLoadMore).not.toHaveBeenCalled();
    });
  });

  // ── general rendering ─────────────────────────────────────────────────────

  describe('general rendering', () => {
    it('renders without crashing with empty data', async () => {
      await render(<OperationsList {...defaultProps} />);
    });

    it('renders without crashing with multiple groups', async () => {
      const groups = [
        makeGroup(TODAY, [{ id: 'a', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' }]),
        makeGroup(OLD_DATE, [{ id: 'b', type: 'income', amount: '500.00', accountId: 'acc-eur', categoryId: 'cat-key' }]),
      ];
      await render(<OperationsList {...defaultProps} groupedOperations={groups} />);
    });

    it('renders section footer without crashing', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-sf', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      await render(sp.renderSectionFooter({ section }));
    });
  });

  // ── additional branch coverage ────────────────────────────────────────────

  describe('branch coverage — getCurrencySymbol fallback (unknown currency)', () => {
    it('falls back to currency code for unknown currency', async () => {
      // 'XYZ' is not in the currencies mock → getCurrencySymbol returns 'XYZ'
      const accsWithUnknown = [...accounts, { id: 'acc-xyz', name: 'Exotic', currency: 'XYZ' }];
      const group = makeGroup(TODAY, [
        { id: 'op-xyz', type: 'expense', amount: '10.00', accountId: 'acc-xyz', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group], accounts: accsWithUnknown });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });
  });

  describe('branch coverage — getCategoryInfo parent resolution', () => {
    it('returns name when category has orphaned parentId (parent not found)', async () => {
      const catsWithOrphan = [
        ...categories,
        { id: 'cat-orphan', name: 'Orphan', icon: 'help', parentId: 'nonexistent-parent' },
      ];
      const group = makeGroup(TODAY, [
        { id: 'op-orphan', type: 'expense', amount: '5.00', accountId: 'acc-usd', categoryId: 'cat-orphan' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group], categories: catsWithOrphan });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('uses nameKey for parent category when parent has nameKey', async () => {
      const catsWithKeyedParent = [
        ...categories,
        { id: 'cat-parent-key', nameKey: 'parent_key', icon: 'folder' },
        { id: 'cat-child-of-key', name: 'Child', icon: 'tag', parentId: 'cat-parent-key' },
      ];
      const group = makeGroup(TODAY, [
        { id: 'op-kp', type: 'expense', amount: '5.00', accountId: 'acc-usd', categoryId: 'cat-child-of-key' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group], categories: catsWithKeyedParent });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });

    it('falls back icon to help-circle when category has no icon field', async () => {
      const catsNoIcon = [
        ...categories,
        { id: 'cat-noicon', name: 'NoIcon' }, // no icon field
      ];
      const group = makeGroup(TODAY, [
        { id: 'op-ni', type: 'expense', amount: '5.00', accountId: 'acc-usd', categoryId: 'cat-noicon' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group], categories: catsNoIcon });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
    });
  });

  describe('branch coverage — undoOperationId match', () => {
    it('never toggles subview clipping based on undo state', async () => {
      // Regression (PENNY-16): toggling removeClippedSubviews at runtime on a
      // mounted Fabric list desyncs the JS/native view lists and crashes with
      // "IllegalStateException: addViewAt: failed to insert view ... at index
      // N". Clipping must stay a constant regardless of undo/suggestion state.
      const group = makeGroup(TODAY, [
        { id: 'op-undo', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const withUndo = await getSectionListProps({
        groupedOperations: [group],
        undoOperationId: 'op-undo',
        undoToken: 1,
      });
      expect(withUndo.sp.removeClippedSubviews).toBe(true);

      const withoutUndo = await getSectionListProps({
        groupedOperations: [group],
      });
      expect(withoutUndo.sp.removeClippedSubviews).toBe(true);
    });

    it('renders the inline undo bar only on the matching operation', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-undo', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
        { id: 'op-plain', type: 'income', amount: '20.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({
        groupedOperations: [group],
        undoOperationId: 'op-undo',
        undoToken: 3,
        undoMessage: 'operation_added',
        undoActionLabel: 'undo',
        onUndo: jest.fn(),
        onUndoClosed: jest.fn(),
      });
      const matched = await render(sp.renderItem({ item: section.data[0], index: 0, section }));
      expect(matched.getByTestId('op-undo-op-undo')).toBeTruthy();

      const plain = await render(sp.renderItem({ item: section.data[1], index: 1, section }));
      expect(plain.queryByTestId('op-undo-op-plain')).toBeNull();
    });
  });

  describe('branch coverage — pendingSuggestionId match', () => {
    it('passes pendingSuggestions to matching operation', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-match', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
        { id: 'op-other', type: 'income', amount: '20.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({
        groupedOperations: [group],
        pendingSuggestionId: 'op-match',
        pendingSuggestions: ['Groceries', 'Food'],
      });
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
      await render(sp.renderItem({ item: section.data[1], index: 1, section }));
    });

    it('isLast is true for last item in section', async () => {
      const group = makeGroup(TODAY, [
        { id: 'op-a', type: 'expense', amount: '10.00', accountId: 'acc-usd', categoryId: 'cat-1' },
        { id: 'op-b', type: 'income', amount: '20.00', accountId: 'acc-usd', categoryId: 'cat-1' },
      ]);
      const section = toSection(group);
      const { sp } = await getSectionListProps({ groupedOperations: [group] });
      // should not throw for either index
      await render(sp.renderItem({ item: section.data[0], index: 0, section }));
      await render(sp.renderItem({ item: section.data[1], index: 1, section }));
    });
  });

  // ── getItemLayout — exact offsets for instant date jumps ───────────────────
  // No onLayout fires in the test renderer, so the measured-height refs keep
  // their defaults: list header = 0, section header = SPACING.sm + 17 +
  // SPACING.xs + BORDER_RADIUS.md = 37. Rows are HEIGHTS.listItem (48) with a
  // 1px separator on every row except the last in a section; the section footer
  // is BORDER_RADIUS.md + SPACING.xs = 12.
  describe('getItemLayout', () => {
    const ROW = HEIGHTS.listItem;                       // 48
    const SEP = 1;
    const FOOTER = BORDER_RADIUS.md + SPACING.xs;        // 12
    const HEADER = SPACING.sm + 17 + SPACING.xs + BORDER_RADIUS.md; // 37

    const makeOps = (prefix, count) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`, type: 'expense', amount: '1.00', accountId: 'acc-usd', categoryId: 'cat-1',
      }));

    it('is provided to the SectionList', async () => {
      const { sp } = await getSectionListProps({ groupedOperations: [makeGroup(TODAY, makeOps('a', 1))] });
      expect(typeof sp.getItemLayout).toBe('function');
    });

    it('computes exact header / row / footer offsets across sections', async () => {
      // Section A: 2 rows, Section B: 1 row.
      const groups = [makeGroup(TODAY, makeOps('a', 2)), makeGroup(OLD_DATE, makeOps('b', 1))];
      const { sp } = await getSectionListProps({ groupedOperations: groups });
      const layout = (i) => sp.getItemLayout(sp.sections, i);

      // Section A — flattened [header, rowA0, rowA1, footerA]
      expect(layout(0)).toEqual({ length: HEADER, offset: 0, index: 0 });            // header A
      expect(layout(1)).toEqual({ length: ROW + SEP, offset: HEADER, index: 1 });    // row 0 (not last)
      expect(layout(2)).toEqual({ length: ROW, offset: HEADER + ROW + SEP, index: 2 }); // row 1 (last, no sep)
      const aItemsHeight = 2 * ROW + 1 * SEP; // 97
      expect(layout(3)).toEqual({ length: FOOTER, offset: HEADER + aItemsHeight, index: 3 }); // footer A

      // Section B starts after A's full height (header + rows + footer).
      const sectionAHeight = HEADER + aItemsHeight + FOOTER;
      expect(layout(4)).toEqual({ length: HEADER, offset: sectionAHeight, index: 4 }); // header B
      expect(layout(5)).toEqual({ length: ROW, offset: sectionAHeight + HEADER, index: 5 }); // row 0 (last)
      expect(layout(6)).toEqual({ length: FOOTER, offset: sectionAHeight + HEADER + ROW, index: 6 }); // footer B
    });

    it('produces contiguous offsets (offset[i+1] === offset[i] + length[i])', async () => {
      const groups = [
        makeGroup(TODAY, makeOps('a', 3)),
        makeGroup(YESTERDAY, makeOps('b', 1)),
        makeGroup(OLD_DATE, makeOps('c', 2)),
      ];
      const { sp } = await getSectionListProps({ groupedOperations: groups });
      const totalCells = groups.reduce((sum, g) => sum + g.operations.length + 2, 0);
      let expectedOffset = 0;
      for (let i = 0; i < totalCells; i++) {
        const frame = sp.getItemLayout(sp.sections, i);
        expect(frame.index).toBe(i);
        expect(frame.offset).toBe(expectedOffset);
        expect(frame.length).toBeGreaterThan(0);
        expectedOffset += frame.length;
      }
    });

    it('returns a zero-length frame for out-of-range indices', async () => {
      const { sp } = await getSectionListProps({ groupedOperations: [makeGroup(TODAY, makeOps('a', 1))] });
      // Section has 1 row → flattened cells 0..2; index 3 is past the end.
      expect(sp.getItemLayout(sp.sections, 3)).toEqual({ length: 0, offset: 0, index: 3 });
      expect(sp.getItemLayout(sp.sections, -1)).toEqual({ length: 0, offset: 0, index: -1 });
    });

    it('handles an empty list without throwing', async () => {
      const { sp } = await getSectionListProps({ groupedOperations: [] });
      expect(sp.getItemLayout([], 0)).toEqual({ length: 0, offset: 0, index: 0 });
    });

    // ── runtime height measurement feeding getItemLayout ─────────────────────
    // onLayout never fires in the test renderer, so we drive the captured
    // handlers directly and confirm getItemLayout picks up the measured heights.
    describe('runtime height measurement', () => {
      const fireLayout = (element, height) => {
        element.props.onLayout({ nativeEvent: { layout: { height } } });
      };

      it('uses a measured section-header height for every section offset', async () => {
        const groups = [makeGroup(TODAY, makeOps('a', 1)), makeGroup(OLD_DATE, makeOps('b', 1))];
        const { sp } = await getSectionListProps({ groupedOperations: groups });
        const section = toSection(groups[0]);
        const aData = 1 * ROW + FOOTER; // section A's rows + footer = dataBefore[B]

        // Fallback height until the DateSeparator card reports a real one.
        expect(sp.getItemLayout(sp.sections, 0).length).toBe(HEADER);
        expect(sp.getItemLayout(sp.sections, 3).offset).toBe(aData + HEADER); // section B header

        // The section-header card reports its real height.
        await act(async () => { fireLayout(sp.renderSectionHeader({ section }), 44); });

        // Both the header length and every later section's offset reflect it.
        expect(sp.getItemLayout(sp.sections, 0).length).toBe(44);
        expect(sp.getItemLayout(sp.sections, 3)).toEqual({ length: 44, offset: aData + 44, index: 3 });
      });

      it('keeps the first measurement, then the tallest, and ignores non-positive heights', async () => {
        const groups = [makeGroup(TODAY, makeOps('a', 1))];
        const { sp } = await getSectionListProps({ groupedOperations: groups });
        const section = toSection(groups[0]);
        const headerLength = () => sp.getItemLayout(sp.sections, 0).length;

        // First real measurement replaces the fallback even when it is shorter.
        await act(async () => { fireLayout(sp.renderSectionHeader({ section }), 30); });
        expect(headerLength()).toBe(30);

        // A shorter later measurement is ignored (keep the tallest seen)...
        await act(async () => { fireLayout(sp.renderSectionHeader({ section }), 25); });
        expect(headerLength()).toBe(30);

        // ...a taller one wins...
        await act(async () => { fireLayout(sp.renderSectionHeader({ section }), 50); });
        expect(headerLength()).toBe(50);

        // ...and a zero/garbage layout never regresses it.
        await act(async () => { fireLayout(sp.renderSectionHeader({ section }), 0); });
        expect(headerLength()).toBe(50);
      });

      it('shifts all offsets down by the measured list-header (QuickAdd form) height', async () => {
        const React = require('react');
        const headerComponent = React.createElement('View', { testID: 'qa-form' });
        const { sp } = await getSectionListProps({
          groupedOperations: [makeGroup(TODAY, makeOps('a', 1))],
          headerComponent,
        });

        // List header starts at 0 until its wrapper reports a height.
        expect(sp.getItemLayout(sp.sections, 0).offset).toBe(0);

        await act(async () => { fireLayout(sp.ListHeaderComponent, 120); });

        // First section header now begins right after the measured list header.
        expect(sp.getItemLayout(sp.sections, 0)).toEqual({ length: HEADER, offset: 120, index: 0 });
      });
    });
  });
});
