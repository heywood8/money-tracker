import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CategoryGridSelector from '../../app/components/CategoryGridSelector';

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
    fireEvent.press(getByTestId('category-grid-food'));
    expect(onSelect).toHaveBeenCalledWith('food');
  });

  it('drills into a folder, selects a nested leaf, then navigates back out', async () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <CategoryGridSelector categories={CATEGORIES} categoryType="expense" onSelect={onSelect} colors={colors} t={t} />,
    );
    // Tapping a folder does not select; it reveals the nested category + a Back chip.
    fireEvent.press(getByTestId('category-grid-bills'));
    await waitFor(() => expect(getByTestId('category-grid-rent')).toBeTruthy());
    expect(getByTestId('category-grid-back')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    // The root entry is no longer visible while inside the folder.
    expect(queryByTestId('category-grid-food')).toBeNull();
    // Selecting the nested leaf reports its id.
    fireEvent.press(getByTestId('category-grid-rent'));
    expect(onSelect).toHaveBeenCalledWith('rent');
    // Back returns to the root level.
    fireEvent.press(getByTestId('category-grid-back'));
    await waitFor(() => expect(getByTestId('category-grid-food')).toBeTruthy());
    expect(queryByTestId('category-grid-rent')).toBeNull();
  });
});
