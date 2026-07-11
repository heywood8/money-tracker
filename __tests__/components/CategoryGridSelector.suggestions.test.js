/**
 * Suggestions-mode tests for CategoryGridSelector — the QuickAdd-style grid the
 * notification binding card uses when `topCategoryIds` is supplied: an "All
 * categories" entry plus the most-frequent leaf shortcuts, with an in-place
 * parent hierarchy behind the entry.
 *
 * Kept in its own file (and every positive check waits via waitFor, which
 * flushes pending commits) to sidestep the react-test-renderer in-suite quirk
 * that leaves a render uncommitted after an earlier test's async act — see the
 * note atop CategoryGridSelector.test.js.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CategoryGridSelector from '../../app/components/CategoryGridSelector';

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
  primary: '#6200ee', surface: '#fff', inputBackground: '#f0f0f0',
};
const t = (k) => k;

// Ten expense leaves (e1..e9 + a nested one) so the >8 "All categories" threshold
// is met, plus a folder to drill into and one income leaf that must be excluded.
const MANY = [
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `e${i + 1}`, name: `E${i + 1}`, type: 'entry', categoryType: 'expense', parentId: null, isShadow: false,
  })),
  { id: 'fold', name: 'Folder', type: 'folder', categoryType: 'expense', parentId: null, isShadow: false },
  { id: 'nested', name: 'Nested', type: 'entry', categoryType: 'expense', parentId: 'fold', isShadow: false },
  { id: 'inc', name: 'Salary', type: 'entry', categoryType: 'income', parentId: null, isShadow: false },
];

const renderSuggest = (props = {}) => render(
  <CategoryGridSelector
    categories={MANY}
    categoryType="expense"
    onSelect={jest.fn()}
    colors={colors}
    t={t}
    topCategoryIds={['e3', 'e1', 'e2']}
    {...props}
  />,
);

describe('CategoryGridSelector — suggestions mode', () => {
  it('shows an "All categories" entry plus the frequency-ordered shortcuts', async () => {
    const { getByTestId, queryByTestId } = await renderSuggest();
    // History order first (e3, e1, e2), then fillers up to 7.
    await waitFor(() => expect(getByTestId('category-grid-e3')).toBeTruthy());
    expect(getByTestId('category-grid-all')).toBeTruthy();
    expect(getByTestId('category-grid-e1')).toBeTruthy();
    // Folders and the nested leaf are not surfaced as shortcuts, and nothing
    // beyond the 7th shortcut shows until the browser is opened.
    expect(queryByTestId('category-grid-fold')).toBeNull();
    expect(queryByTestId('category-grid-nested')).toBeNull();
    expect(queryByTestId('category-grid-e9')).toBeNull();
    // Income categories never appear in an expense grid.
    expect(queryByTestId('category-grid-inc')).toBeNull();
  });

  it('highlights the selected shortcut', async () => {
    const { getByTestId } = await renderSuggest({ selectedCategoryId: 'e3' });
    await waitFor(() => expect(getByTestId('category-grid-e3')).toBeTruthy());
    expect(getByTestId('category-grid-e3').props.accessibilityState.selected).toBe(true);
  });

  it('omits the "All categories" entry and shows every leaf when there are few (<=8)', async () => {
    const FEW = [
      { id: 'a', name: 'A', type: 'entry', categoryType: 'expense', parentId: null, isShadow: false },
      { id: 'b', name: 'B', type: 'entry', categoryType: 'expense', parentId: null, isShadow: false },
    ];
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector
        categories={FEW}
        categoryType="expense"
        onSelect={jest.fn()}
        colors={colors}
        t={t}
        topCategoryIds={[]}
      />,
    );
    await waitFor(() => expect(getByTestId('category-grid-a')).toBeTruthy());
    expect(getByTestId('category-grid-b')).toBeTruthy();
    expect(queryByTestId('category-grid-all')).toBeNull();
  });

  it('selects a shortcut leaf', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await renderSuggest({ onSelect });
    await waitFor(() => expect(getByTestId('category-grid-e3')).toBeTruthy());
    fireEvent.press(getByTestId('category-grid-e3'));
    expect(onSelect).toHaveBeenCalledWith('e3');
  });

  it('Back at the browse root returns to the shortcuts without selecting', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await renderSuggest({ onSelect });

    await waitFor(() => expect(getByTestId('category-grid-all')).toBeTruthy());
    fireEvent.press(getByTestId('category-grid-all'));
    await waitFor(() => expect(getByTestId('category-grid-back')).toBeTruthy());
    fireEvent.press(getByTestId('category-grid-back'));
    await waitFor(() => expect(getByTestId('category-grid-all')).toBeTruthy());
    expect(queryByTestId('category-grid-fold')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens the parent hierarchy from "All categories", drills a folder, selects a nested leaf', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await renderSuggest({ onSelect });

    // "All categories" reveals the parent grid: all root leaves + the folder + Back.
    await waitFor(() => expect(getByTestId('category-grid-all')).toBeTruthy());
    fireEvent.press(getByTestId('category-grid-all'));
    await waitFor(() => expect(getByTestId('category-grid-fold')).toBeTruthy());
    expect(getByTestId('category-grid-back')).toBeTruthy();
    expect(getByTestId('category-grid-e9')).toBeTruthy(); // now visible in the full grid
    expect(queryByTestId('category-grid-all')).toBeNull();
    // The nested leaf lives inside the folder, not at the browse root.
    expect(queryByTestId('category-grid-nested')).toBeNull();

    // Drill the folder, select the nested leaf.
    fireEvent.press(getByTestId('category-grid-fold'));
    await waitFor(() => expect(getByTestId('category-grid-nested')).toBeTruthy());
    fireEvent.press(getByTestId('category-grid-nested'));
    expect(onSelect).toHaveBeenCalledWith('nested');
    // Selecting collapses back to the shortcuts.
    await waitFor(() => expect(getByTestId('category-grid-all')).toBeTruthy());
  });
});
