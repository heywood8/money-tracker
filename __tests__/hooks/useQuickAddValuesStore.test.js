import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import {
  createQuickAddValuesStore,
  useQuickAddValues,
} from '../../app/hooks/useQuickAddValuesStore';

describe('quick-add values store', () => {
  describe('store', () => {
    it('applies a plain value and reads it back immediately', () => {
      const store = createQuickAddValuesStore({ amount: '', type: 'expense' });

      store.setValues({ amount: '10', type: 'expense' });

      expect(store.getSnapshot()).toEqual({ amount: '10', type: 'expense' });
    });

    it('applies an updater against the current snapshot, so writes compose', () => {
      const store = createQuickAddValuesStore({ amount: '', description: '' });

      store.setValues(v => ({ ...v, amount: '10' }));
      store.setValues(v => ({ ...v, description: 'coffee' }));

      expect(store.getSnapshot()).toEqual({ amount: '10', description: 'coffee' });
    });

    it('notifies subscribers on a change and stops after unsubscribe', () => {
      const store = createQuickAddValuesStore({ amount: '' });
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);

      store.setValues(v => ({ ...v, amount: '1' }));
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.setValues(v => ({ ...v, amount: '2' }));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify when the updater returns the same object', () => {
      const store = createQuickAddValuesStore({ amount: '' });
      const listener = jest.fn();
      store.subscribe(listener);

      store.setValues(v => v);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('render isolation', () => {
    // The whole point of the store: a character typed into the amount must
    // repaint the form and nothing above it. The form used to sit in the
    // Operations list header with its values as a prop, so every keystroke
    // re-rendered the screen and handed the SectionList a new header element.
    it('re-renders only the subscriber, not the component that owns the store', async () => {
      const store = createQuickAddValuesStore({ amount: '' });
      const ownerRenders = jest.fn();
      const formRenders = jest.fn();

      const Form = () => {
        const values = useQuickAddValues(store);
        formRenders();
        return <Text>{values.amount}</Text>;
      };

      // Memoised and given no changing props — exactly how the quick-add form is
      // mounted inside the memoised list header.
      const MemoForm = React.memo(Form);

      const Owner = () => {
        ownerRenders();
        return <MemoForm />;
      };

      const { findByText } = await render(<Owner />);

      expect(ownerRenders).toHaveBeenCalledTimes(1);
      expect(formRenders).toHaveBeenCalledTimes(1);

      await act(async () => { store.setValues(v => ({ ...v, amount: '4' })); });
      await act(async () => { store.setValues(v => ({ ...v, amount: '42' })); });

      expect(await findByText('42')).toBeTruthy();
      expect(formRenders).toHaveBeenCalledTimes(3);
      // Three characters typed, and the owner never re-rendered.
      expect(ownerRenders).toHaveBeenCalledTimes(1);
    });
  });
});
