/**
 * Tests for the notification panel's tab strip.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import NotificationTabBar from '../../../app/components/settings/NotificationTabBar';

const colors = { mutedText: '#666666', primary: '#007AFF' };

const TABS = [
  { key: 'feed', label: 'Notifications' },
  { key: 'bindings', label: 'Bindings' },
  { key: 'templates', label: 'Templates' },
  { key: 'filters', label: 'Filters' },
];

const element = (props = {}) => (
  <NotificationTabBar
    colors={colors}
    index={0}
    onSelect={() => {}}
    progress={{ value: 0 }}
    tabs={TABS}
    {...props}
  />
);

const setup = (props = {}) => render(element(props));

describe('NotificationTabBar', () => {
  it('renders a chip per tab', async () => {
    const { getByTestId } = await setup();
    TABS.forEach((tab) => {
      expect(getByTestId(`notification-tab-${tab.key}`)).toBeTruthy();
    });
  });

  it('reports the tapped chip by index', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await setup({ onSelect });

    await act(async () => {
      fireEvent.press(getByTestId('notification-tab-templates'));
    });

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('marks only the active chip as selected', async () => {
    const { getByTestId } = await setup({ index: 3 });

    expect(getByTestId('notification-tab-filters').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('notification-tab-feed').props.accessibilityState.selected).toBe(false);
  });

  it('survives chip and strip measurements arriving before a tab change', async () => {
    const { getByTestId, rerender } = await setup();

    await act(async () => {
      fireEvent(getByTestId('notification-tab-bar'), 'layout', {
        nativeEvent: { layout: { width: 300 } },
      });
      fireEvent(getByTestId('notification-tab-filters'), 'layout', {
        nativeEvent: { layout: { width: 100, x: 400 } },
      });
    });

    await act(async () => {
      rerender(element({ index: 3, progress: { value: 3 } }));
    });

    expect(getByTestId('notification-tab-filters').props.accessibilityState.selected).toBe(true);
  });
});
