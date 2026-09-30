import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SkipCategoryBindingToggle from '../../app/components/SkipCategoryBindingToggle';

const COLORS = { primary: '#6200ee', text: '#000', mutedText: '#888' };
const t = (key) => key;

const renderToggle = (props = {}) => render(
  <SkipCategoryBindingToggle checked={false} onChange={jest.fn()} colors={COLORS} t={t} {...props} />,
);

describe('SkipCategoryBindingToggle', () => {
  it('toggles through onChange while unlocked', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await renderToggle({ onChange });
    await fireEvent.press(getByTestId('skip-category-binding'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reads as a ticked, disabled checkbox while locked, with the reason as its hint', async () => {
    const { getByTestId } = await renderToggle({ locked: true });
    const toggle = getByTestId('skip-category-binding');
    expect(toggle.props.accessibilityRole).toBe('checkbox');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ checked: true, disabled: true }));
    expect(toggle.props.accessibilityHint).toBe('bank_notifications_skip_category_locked_hint');
  });

  it('explains a locked box on tap instead of changing it', async () => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = await renderToggle({ locked: true, onChange });
    await fireEvent.press(getByTestId('skip-category-binding'));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByText('bank_notifications_skip_category_locked_hint')).toBeTruthy();
  });

  it('names the kind as the reason for a kind that never binds', async () => {
    const { getByTestId, getByText } = await renderToggle({ locked: true, lockReason: 'kind' });
    await fireEvent.press(getByTestId('skip-category-binding'));
    expect(getByText('bank_notifications_skip_category_kind_hint')).toBeTruthy();
  });

  it('drops the hint once unlocked, so a later re-lock starts without it', async () => {
    const utils = await renderToggle({ locked: true });
    await fireEvent.press(utils.getByTestId('skip-category-binding'));
    expect(utils.queryByTestId('skip-category-binding-hint')).toBeTruthy();

    await utils.rerender(
      <SkipCategoryBindingToggle checked={false} onChange={jest.fn()} colors={COLORS} t={t} />,
    );
    await utils.rerender(
      <SkipCategoryBindingToggle checked={false} locked onChange={jest.fn()} colors={COLORS} t={t} />,
    );
    expect(utils.queryByTestId('skip-category-binding-hint')).toBeNull();
  });
});
