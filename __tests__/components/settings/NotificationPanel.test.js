/* eslint-disable react/prop-types, react/display-name */
/**
 * Tests for the notification-processing subpanel. Its pages are separate content
 * panels already; what is under test is the tab navigation between them (which
 * page is the active one, what back does on each), and where the template editor
 * goes when it closes.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import NotificationPanel from '../../../app/components/settings/NotificationPanel';

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { mutedText: '#666666', primary: '#007AFF', text: '#000000' },
  }),
}));

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

// Each content panel is stubbed down to a marker that reports whether it is the
// showing tab, plus whatever callback the panel under test is expected to wire up.
const stubPanel = (name) => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ active }) => React.createElement(
    Text,
    { testID: `view-${name}` },
    active ? 'active' : 'inactive',
  );
};

jest.mock('../../../app/components/NotificationProcessingContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ active, onCreateTemplate }) => React.createElement(
    Text,
    { testID: 'view-feed', onPress: () => onCreateTemplate({ id: 'n1' }, []) },
    active ? 'active' : 'inactive',
  );
});
jest.mock('../../../app/components/NotificationFiltersContentPanel', () => stubPanel('filters'));
jest.mock('../../../app/components/NotificationBindingsContentPanel', () => stubPanel('bindings'));
jest.mock('../../../app/components/NotificationTemplatesContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ active, onEdit }) => React.createElement(
    Text,
    { testID: 'view-templates', onPress: () => onEdit({ id: 'tpl-1' }) },
    active ? 'active' : 'inactive',
  );
});
jest.mock('../../../app/components/NotificationTemplateEditorPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ onDone, template }) => React.createElement(
    Text,
    {
      testID: template ? 'view-editor-existing' : 'view-editor-new',
      onPress: () => onDone(true),
      onLongPress: () => onDone(false),
    },
    'editor',
  );
});

const noop = () => {};

const setup = (props = {}) => render(
  <NotificationPanel
    step="main"
    onPushStep={noop}
    onPopStep={noop}
    onRegisterBack={noop}
    {...props}
  />,
);

/** The tab whose page reports itself active. */
const activeView = (queryByTestId) => ['feed', 'bindings', 'templates', 'filters']
  .find((key) => queryByTestId(`view-${key}`)?.props.children === 'active') ?? null;

describe('NotificationPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('tabs', () => {
    it('opens on the notification feed', async () => {
      const { queryByTestId } = await setup();
      expect(activeView(queryByTestId)).toBe('feed');
    });

    it('offers a chip for each page', async () => {
      const { getByTestId } = await setup();
      ['feed', 'bindings', 'templates', 'filters'].forEach((key) => {
        expect(getByTestId(`notification-tab-${key}`)).toBeTruthy();
      });
    });

    it.each([
      ['bindings'],
      ['templates'],
      ['filters'],
    ])('switches to the %s page when its chip is tapped', async (key) => {
      const { getByTestId, queryByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId(`notification-tab-${key}`));
      });

      expect(activeView(queryByTestId)).toBe(key);
    });

    it('keeps every page mounted so a swipe reveals a drawn one', async () => {
      const { queryByTestId } = await setup();
      // The idle callback that mounts the background pages has run by now.
      ['feed', 'bindings', 'templates', 'filters'].forEach((key) => {
        expect(queryByTestId(`view-${key}`)).toBeTruthy();
      });
    });
  });

  describe('back navigation', () => {
    it('does not claim the gesture on the first tab', async () => {
      const onRegisterBack = jest.fn();
      await setup({ onRegisterBack });

      expect(onRegisterBack.mock.calls[0][0]()).toBe(false);
    });

    it('claims the gesture on any other tab and returns to the feed', async () => {
      const onRegisterBack = jest.fn();
      const { getByTestId, queryByTestId } = await setup({ onRegisterBack });

      await act(async () => {
        fireEvent.press(getByTestId('notification-tab-filters'));
      });

      const back = onRegisterBack.mock.calls[onRegisterBack.mock.calls.length - 1][0];
      let claimed;
      await act(async () => { claimed = back(); });

      expect(claimed).toBe(true);
      expect(activeView(queryByTestId)).toBe('feed');
    });

    it('tells the host when a back-swipe has somewhere to go inside the panel', async () => {
      const onCanStepBackChange = jest.fn();
      const { getByTestId } = await setup({ onCanStepBackChange });

      expect(onCanStepBackChange).toHaveBeenLastCalledWith(false);

      await act(async () => {
        fireEvent.press(getByTestId('notification-tab-bindings'));
      });

      expect(onCanStepBackChange).toHaveBeenLastCalledWith(true);
    });

    it('registers a back hook and drops it on unmount', async () => {
      const onRegisterBack = jest.fn();
      const { unmount } = await setup({ onRegisterBack });

      expect(typeof onRegisterBack.mock.calls[0][0]).toBe('function');
      await act(async () => { unmount(); });
      expect(onRegisterBack).toHaveBeenLastCalledWith(null);
    });
  });

  describe('opening the editor', () => {
    it('opens a new template from the feed, flagged as not editing', async () => {
      const onPushStep = jest.fn();
      const { getByTestId } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByTestId('view-feed'));
      });

      expect(onPushStep).toHaveBeenCalledWith('templateEditor', { editing: false });
    });

    it('opens an existing template from the list, flagged as editing', async () => {
      const onPushStep = jest.fn();
      const { getByTestId } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByTestId('notification-tab-templates'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('view-templates'));
      });

      expect(onPushStep).toHaveBeenCalledWith('templateEditor', { editing: true });
    });

    it('replaces the tabs while the editor is open', async () => {
      const { queryByTestId } = await setup({ step: 'templateEditor' });

      expect(queryByTestId('view-editor-new')).toBeTruthy();
      expect(queryByTestId('notification-tab-bar')).toBeNull();
    });
  });

  describe('leaving the editor', () => {
    it('lands a saved template on the templates tab', async () => {
      const onPopStep = jest.fn();
      const { getByTestId, queryByTestId, rerender } = await setup({
        step: 'templateEditor', onPopStep,
      });

      await act(async () => {
        fireEvent.press(getByTestId('view-editor-new'));
      });
      expect(onPopStep).toHaveBeenCalled();

      // The host pops the step it pushed, putting the tabs back.
      await act(async () => {
        rerender(
          <NotificationPanel
            step="main"
            onPushStep={noop}
            onPopStep={onPopStep}
            onRegisterBack={noop}
          />,
        );
      });

      expect(activeView(queryByTestId)).toBe('templates');
    });

    it('leaves the tab alone when the edit was cancelled', async () => {
      const onPopStep = jest.fn();
      const { getByTestId, queryByTestId, rerender } = await setup({
        step: 'templateEditor', onPopStep,
      });

      await act(async () => {
        fireEvent(getByTestId('view-editor-new'), 'longPress');
      });
      expect(onPopStep).toHaveBeenCalled();

      await act(async () => {
        rerender(
          <NotificationPanel
            step="main"
            onPushStep={noop}
            onPopStep={onPopStep}
            onRegisterBack={noop}
          />,
        );
      });

      expect(activeView(queryByTestId)).toBe('feed');
    });

    it('discards the draft when the editor is backed out of', async () => {
      const onRegisterBack = jest.fn();
      await setup({ step: 'templateEditor', onRegisterBack });

      // Never claims the gesture: the host pops the step it pushed.
      expect(onRegisterBack.mock.calls[0][0]()).toBe(false);
    });
  });
});
