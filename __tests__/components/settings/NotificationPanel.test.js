/* eslint-disable react/prop-types, react/display-name */
/**
 * Tests for the notification-processing subpanel. Its five views are separate
 * content panels already; what is under test is which one shows, and where the
 * template editor goes when it closes.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import NotificationPanel from '../../../app/components/settings/NotificationPanel';

// Each content panel is stubbed down to a marker plus whatever callback the
// panel under test is expected to wire up.
jest.mock('../../../app/components/NotificationProcessingContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ onCreateTemplate }) => React.createElement(
    Text,
    { testID: 'view-main', onPress: () => onCreateTemplate({ id: 'n1' }, []) },
    'main',
  );
});
jest.mock('../../../app/components/NotificationFiltersContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => React.createElement(Text, { testID: 'view-filters' }, 'filters');
});
jest.mock('../../../app/components/NotificationBindingsContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => React.createElement(Text, { testID: 'view-bindings' }, 'bindings');
});
jest.mock('../../../app/components/NotificationTemplatesContentPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ onEdit }) => React.createElement(
    Text,
    { testID: 'view-templates', onPress: () => onEdit({ id: 'tpl-1' }) },
    'templates',
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
    onReplaceStep={noop}
    onRegisterBack={noop}
    {...props}
  />,
);

describe('NotificationPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('view switching', () => {
    it.each([
      ['main', 'view-main'],
      ['filters', 'view-filters'],
      ['bindings', 'view-bindings'],
      ['templates', 'view-templates'],
    ])('shows the %s view', async (step, testID) => {
      const { getByTestId } = await setup({ step });
      expect(getByTestId(testID)).toBeTruthy();
    });
  });

  describe('opening the editor', () => {
    it('opens a new template from the feed, flagged as not editing', async () => {
      const onPushStep = jest.fn();
      const { getByTestId } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByTestId('view-main'));
      });

      expect(onPushStep).toHaveBeenCalledWith('templateEditor', { editing: false });
    });

    it('opens an existing template from the list, flagged as editing', async () => {
      const onPushStep = jest.fn();
      const { getByTestId } = await setup({ step: 'templates', onPushStep });

      await act(async () => {
        fireEvent.press(getByTestId('view-templates'));
      });

      expect(onPushStep).toHaveBeenCalledWith('templateEditor', { editing: true });
    });
  });

  describe('leaving the editor', () => {
    it('lands a template saved from the feed on the templates list', async () => {
      const onReplaceStep = jest.fn();
      const onPopStep = jest.fn();
      const { getByTestId } = await setup({
        step: 'templateEditor', parentStep: 'main', onReplaceStep, onPopStep,
      });

      await act(async () => {
        fireEvent.press(getByTestId('view-editor-new'));
      });

      // Replaced, not pushed: back from the list still returns to the feed.
      expect(onReplaceStep).toHaveBeenCalledWith('templates');
      expect(onPopStep).not.toHaveBeenCalled();
    });

    it('pops back to the templates list when that is where it was opened from', async () => {
      const onReplaceStep = jest.fn();
      const onPopStep = jest.fn();
      const { getByTestId } = await setup({
        step: 'templateEditor', parentStep: 'templates', onReplaceStep, onPopStep,
      });

      await act(async () => {
        fireEvent.press(getByTestId('view-editor-new'));
      });

      expect(onPopStep).toHaveBeenCalled();
      expect(onReplaceStep).not.toHaveBeenCalled();
    });

    it('just steps back when the edit was cancelled', async () => {
      const onReplaceStep = jest.fn();
      const onPopStep = jest.fn();
      const { getByTestId } = await setup({
        step: 'templateEditor', parentStep: 'main', onReplaceStep, onPopStep,
      });

      await act(async () => {
        fireEvent(getByTestId('view-editor-new'), 'longPress');
      });

      expect(onPopStep).toHaveBeenCalled();
      expect(onReplaceStep).not.toHaveBeenCalled();
    });
  });

  describe('host handshake', () => {
    it('registers a back hook and drops it on unmount', async () => {
      const onRegisterBack = jest.fn();
      const { unmount } = await setup({ onRegisterBack });

      expect(typeof onRegisterBack.mock.calls[0][0]).toBe('function');
      await act(async () => { unmount(); });
      expect(onRegisterBack).toHaveBeenLastCalledWith(null);
    });

    it('never claims the back gesture', async () => {
      const onRegisterBack = jest.fn();
      await setup({ step: 'templateEditor', onRegisterBack });

      expect(onRegisterBack.mock.calls[0][0]()).toBe(false);
    });
  });
});
