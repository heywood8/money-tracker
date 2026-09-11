import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OperationFormFields from '../../app/components/operations/OperationFormFields';

jest.mock('../../app/components/Calculator', () => 'Calculator');
jest.mock('../../app/components/modals/MultiCurrencyFields', () => 'MultiCurrencyFields');

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({ hideBalances: false }),
}));

// Every icon the tree renders, by name. A memoised chip does not re-render, so
// its icon does not either — which is the only externally observable signal that
// the chip actually bailed out.
const iconRenders = [];
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const ReactLocal = require('react');
  return function MockIcon(props) {
    iconRenders.push(props.name);
    return ReactLocal.createElement('Icon', { testID: `icon-${props.name}` });
  };
});

/**
 * Issue #1708: the quick-add form repaints on every character typed into the
 * amount — it is the field being typed into — so the parts of it a keystroke
 * cannot change must bail out instead of rebuilding.
 *
 * Kept in its own file: the assertions turn on element identity across a
 * re-render, which is exactly what a shared render harness perturbs.
 */
describe('OperationFormFields — per-keystroke re-render cost', () => {
  const colors = {
    text: '#000000',
    primary: '#007AFF',
    primaryStrong: '#0055AA',
    border: '#cccccc',
    background: '#ffffff',
    altRow: '#f5f5f5',
    inputBackground: '#ffffff',
    inputBorder: '#dddddd',
    mutedText: '#666666',
    selected: '#eeeeee',
    destructive: '#ff0000',
  };

  const accounts = [{ id: 'acc-1', name: 'Cash', currency: 'USD', balance: '1000' }];

  const categories = [
    { id: 'chip-1', name: 'Food', icon: 'food', type: 'entry', categoryType: 'expense' },
    { id: 'chip-2', name: 'Transport', icon: 'car', type: 'entry', categoryType: 'expense' },
  ];

  const TYPES = [
    { key: 'expense', label: 'Expense', icon: 'minus-circle' },
    { key: 'income', label: 'Income', icon: 'plus-circle' },
    { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
  ];

  // A FRESH object on every call, exactly like the real getCategoryInfo. Passing
  // one straight through as a prop is what used to defeat the chip's memo.
  const getCategoryInfo = (id) => {
    const cat = categories.find(c => c.id === id);
    return { name: cat?.name || 'unknown', icon: cat?.icon || 'tag', parentName: null };
  };

  // Stable across renders, like the real callers': OperationsScreen hands down
  // useCallback'd handlers. A fresh function per render here would defeat the
  // memo through the test's own doing.
  const setValues = jest.fn();
  const openPicker = jest.fn();
  const onAmountChange = jest.fn();
  const onAdd = jest.fn();
  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || '—';
  const getAccountBalance = () => '$1000.00';
  const getCategoryName = () => 'select_category';

  const form = (amount, onAutoAddWithCategory) => (
    <OperationFormFields
      colors={colors}
      t={(key) => key}
      values={{
        type: 'expense',
        amount,
        accountId: 'acc-1',
        categoryId: '',
        toAccountId: '',
        exchangeRate: '',
        destinationAmount: '',
        operationCurrency: 'USD',
      }}
      setValues={setValues}
      accounts={accounts}
      categories={categories}
      topCategoriesForType={categories}
      getCategoryInfo={getCategoryInfo}
      getAccountName={getAccountName}
      getAccountBalance={getAccountBalance}
      getCategoryName={getCategoryName}
      openPicker={openPicker}
      onAmountChange={onAmountChange}
      onAdd={onAdd}
      onAutoAddWithCategory={onAutoAddWithCategory}
      TYPES={TYPES}
    />
  );

  // Proves the re-render actually committed. Without it, a query that silently
  // read the previous tree would make the identity assertions below vacuous.
  const renderedAmount = (container) =>
    container.queryAll(n => n.type === 'Calculator')[0].props.value;

  const countIcons = (name) => iconRenders.filter(n => n === name).length;

  beforeEach(() => { iconRenders.length = 0; });

  it('does not re-render the category chips when the amount changes', async () => {
    const onAutoAddWithCategory = jest.fn();
    const { container, rerender } = await render(form('1', onAutoAddWithCategory));

    // Both chips drew their icon on the first render.
    const foodBefore = countIcons('food');
    const carBefore = countIcons('car');
    expect(foodBefore).toBeGreaterThan(0);
    expect(carBefore).toBeGreaterThan(0);
    expect(renderedAmount(container)).toBe('1');

    await rerender(form('12', onAutoAddWithCategory));

    // The form repainted for the new amount...
    expect(renderedAmount(container)).toBe('12');
    // ...and the chips did not.
    expect(countIcons('food')).toBe(foodBefore);
    expect(countIcons('car')).toBe(carBefore);
  });

  it('still completes the operation with the amount as typed after the change', async () => {
    // The handler is stable because it reads the amount through a ref instead of
    // closing over it, so it must still see the LATEST amount at tap time.
    const onAutoAddWithCategory = jest.fn();
    const { container, rerender } = await render(form('', onAutoAddWithCategory));

    await rerender(form('42', onAutoAddWithCategory));
    expect(renderedAmount(container)).toBe('42');

    fireEvent.press(container.queryAll(n => n.props?.testID === 'category-shortcut-0')[0]);

    // An empty amount would have selected the category instead of adding.
    expect(onAutoAddWithCategory).toHaveBeenCalledTimes(1);
    expect(onAutoAddWithCategory).toHaveBeenCalledWith('chip-1');
  });

});
