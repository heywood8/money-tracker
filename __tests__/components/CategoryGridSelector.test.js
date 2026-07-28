import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CategoryGridSelector from '../../app/components/CategoryGridSelector';

// A bare fireEvent leaves the state flush outside act, which in this suite leaves
// LATER tests rendering nothing at all. Every press goes through here.
const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
  primary: '#6200ee', surface: '#fff', inputBackground: '#f0f0f0',
};
const t = (k) => k;

const CATEGORIES = [
  { id: 'food', name: 'Food', type: 'entry', categoryType: 'expense', parentId: null, icon: 'food', isShadow: false },
  { id: 'bills', name: 'Bills', type: 'folder', categoryType: 'expense', parentId: null, icon: 'folder', isShadow: false },
  { id: 'rent', name: 'Rent', type: 'entry', categoryType: 'expense', parentId: 'bills', icon: 'home', isShadow: false },
  { id: 'salary', name: 'Salary', type: 'entry', categoryType: 'income', parentId: null, icon: 'cash', isShadow: false },
  { id: 'ghost', name: 'Ghost', type: 'entry', categoryType: 'expense', parentId: null, icon: 'ghost', isShadow: true },
];

describe('CategoryGridSelector', () => {
  // Kept first: this minimal, chip-less render must commit before the press-heavy
  // tests below run, otherwise a react-test-renderer in-suite quirk leaves it
  // uncommitted (toJSON null) and the query can't find the message.
  it('shows an empty message when no categories match', async () => {
    const { getByTestId } = await render(
      <CategoryGridSelector categories={[]} categoryType="expense" onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('category-grid-empty')).toBeTruthy();
  });

  it('renders only non-shadow categories of the requested type at root', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('category-grid-food')).toBeTruthy();
    expect(getByTestId('category-grid-bills')).toBeTruthy();
    // Shadow category hidden, income category excluded, nested category not shown at root.
    expect(queryByTestId('category-grid-ghost')).toBeNull();
    expect(queryByTestId('category-grid-salary')).toBeNull();
    expect(queryByTestId('category-grid-rent')).toBeNull();
  });

  it('restricts the grid to the income type when asked', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="income" onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('category-grid-salary')).toBeTruthy();
    expect(queryByTestId('category-grid-food')).toBeNull();
  });

  it('selects a leaf category', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={onSelect} colors={colors} t={t} />,
    );
    await press(getByTestId('category-grid-food'));
    expect(onSelect).toHaveBeenCalledWith('food');
  });

  it('drills into a folder, selects a nested leaf, then navigates back out', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={onSelect} colors={colors} t={t} />,
    );
    // Tapping a folder does not select; it reveals the nested category + a Back chip.
    await press(getByTestId('category-grid-bills'));
    await waitFor(() => expect(getByTestId('category-grid-rent')).toBeTruthy());
    expect(getByTestId('category-grid-back')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    // The root entry is no longer visible while inside the folder.
    expect(queryByTestId('category-grid-food')).toBeNull();
    // Selecting the nested leaf reports its id.
    await press(getByTestId('category-grid-rent'));
    expect(onSelect).toHaveBeenCalledWith('rent');
    // Back returns to the root level.
    await press(getByTestId('category-grid-back'));
    await waitFor(() => expect(getByTestId('category-grid-food')).toBeTruthy());
    expect(queryByTestId('category-grid-rent')).toBeNull();
  });

  it('names the folder it is standing in, and only then', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(queryByTestId('category-grid-breadcrumb')).toBeNull();
    await press(getByTestId('category-grid-bills'));
    await waitFor(() => expect(getByTestId('category-grid-breadcrumb')).toBeTruthy());
    expect(getByTestId('category-grid-breadcrumb')).toHaveTextContent('Bills');
  });

  it('lets a host keep its own chip testIDs', async () => {
    const { getByTestId } = await render(
      <CategoryGridSelector
        categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()}
        colors={colors} t={t} testIDPrefix="plan-target-option-cat"
      />,
    );
    expect(getByTestId('plan-target-option-cat-food')).toBeTruthy();
  });

  describe('Multi-select', () => {
    it('marks every selected chip and reports each tap for the host to toggle', async () => {
      const onSelect = jest.fn();
      const { getByTestId } = await render(
        <CategoryGridSelector
          categories={CATEGORIES} categoryType="expense"
          selectedCategoryIds={['food']} onSelect={onSelect} colors={colors} t={t}
        />,
      );
      const chip = getByTestId('category-grid-food');
      // Checkbox rather than button — a multi-select chip toggles, it does not replace.
      expect(chip.props.accessibilityRole).toBe('checkbox');
      expect(chip.props.accessibilityState.checked).toBe(true);
      await press(chip);
      // Tapping a selected chip still reports it; dropping it is the host's call.
      expect(onSelect).toHaveBeenCalledWith('food');
    });
  });

  describe('Selectable folders', () => {
    it('offers the folder itself as a target from inside it', async () => {
      const onSelect = jest.fn();
      const { getByTestId, queryByTestId } = await render(
        <CategoryGridSelector
          categories={CATEGORIES} categoryType="expense" selectableFolders
          selectedCategoryIds={[]} onSelect={onSelect} colors={colors} t={t}
        />,
      );
      // Not at the root: a folder chip there is still the way in, not a target.
      expect(queryByTestId('category-grid-whole-bills')).toBeNull();
      await press(getByTestId('category-grid-bills'));
      await waitFor(() => expect(getByTestId('category-grid-whole-bills')).toBeTruthy());
      await press(getByTestId('category-grid-whole-bills'));
      expect(onSelect).toHaveBeenCalledWith('bills');
    });

    it('keeps the whole-category chip out of a grid that cannot use it', async () => {
      const { getByTestId, queryByTestId } = await render(
        <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()} colors={colors} t={t} />,
      );
      await press(getByTestId('category-grid-bills'));
      await waitFor(() => expect(getByTestId('category-grid-rent')).toBeTruthy());
      expect(queryByTestId('category-grid-whole-bills')).toBeNull();
    });
  });

  describe('Search', () => {
    it('reaches across the whole tree, not just the open level', async () => {
      const { getByTestId, queryByTestId } = await render(
        <CategoryGridSelector
          categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()}
          colors={colors} t={t} query="rent" onQueryChange={jest.fn()}
        />,
      );
      // 'Rent' lives inside the Bills folder and still surfaces at the root.
      expect(getByTestId('category-grid-rent')).toBeTruthy();
      expect(queryByTestId('category-grid-food')).toBeNull();
      // A search stands outside the hierarchy, so there is nothing to go back to.
      expect(queryByTestId('category-grid-back')).toBeNull();
    });

    it('says nothing was found rather than showing an empty grid', async () => {
      const { getByTestId } = await render(
        <CategoryGridSelector
          categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()}
          colors={colors} t={t} query="zzz" onQueryChange={jest.fn()}
        />,
      );
      expect(getByTestId('category-grid-empty')).toHaveTextContent('no_results');
    });

    it('clears the search when a folder result takes over the navigation', async () => {
      const onQueryChange = jest.fn();
      const { getByTestId } = await render(
        <CategoryGridSelector
          categories={CATEGORIES} categoryType="expense" onSelect={jest.fn()}
          colors={colors} t={t} query="bills" onQueryChange={onQueryChange}
        />,
      );
      await press(getByTestId('category-grid-bills'));
      // Otherwise the filter would hide the very children the tap asked to see.
      expect(onQueryChange).toHaveBeenCalledWith('');
    });
  });
});
