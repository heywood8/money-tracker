/**
 * Tests for UpdateAvailableModal component
 * Covers rendering branches: null updateData, with/without releaseNotes, single/multiple notes
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import UpdateAvailableModal from '../../app/modals/UpdateAvailableModal';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  BORDER_RADIUS: { md: 8, lg: 16 },
}));

const baseProps = {
  visible: true,
  onDismiss: jest.fn(),
  onUpdate: jest.fn(),
};

const baseUpdateData = {
  latestVersion: '2.0.0',
  currentVersion: '1.0.0',
  downloadUrl: 'https://example.com/app.apk',
  releaseNotes: null,
};

describe('UpdateAvailableModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Null guard', () => {
    it('returns null when updateData is not provided', () => {
      const { toJSON } = render(
        <UpdateAvailableModal {...baseProps} updateData={null} />,
      );
      expect(toJSON()).toBeNull();
    });

    it('returns null when updateData is undefined', () => {
      const { toJSON } = render(
        <UpdateAvailableModal {...baseProps} updateData={undefined} />,
      );
      expect(toJSON()).toBeNull();
    });
  });

  describe('Basic rendering', () => {
    it('renders version numbers when updateData is provided', () => {
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={baseUpdateData} />,
      );
      expect(getByText('v2.0.0')).toBeTruthy();
    });

    it('renders dismiss button and calls onDismiss when pressed', () => {
      const onDismiss = jest.fn();
      const { UNSAFE_getAllByType } = render(
        <UpdateAvailableModal {...baseProps} onDismiss={onDismiss} updateData={baseUpdateData} />,
      );
      const { TouchableOpacity } = require('react-native');
      const buttons = UNSAFE_getAllByType(TouchableOpacity);
      fireEvent.press(buttons[0]);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onUpdate with downloadUrl when update button pressed', () => {
      const onUpdate = jest.fn();
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} onUpdate={onUpdate} updateData={baseUpdateData} />,
      );
      fireEvent.press(getByText('update_now'));
      expect(onUpdate).toHaveBeenCalledWith('https://example.com/app.apk');
    });
  });

  describe('Without releaseNotes', () => {
    it('shows install hint text when releaseNotes is null', () => {
      const { getByText } = render(
        <UpdateAvailableModal
          {...baseProps}
          updateData={{ ...baseUpdateData, releaseNotes: null }}
        />,
      );
      // update_install_hint should be rendered as the fallback
      expect(getByText('update_install_hint')).toBeTruthy();
    });

    it('does not show the update hint below the button when releaseNotes is null', () => {
      const { getAllByText } = render(
        <UpdateAvailableModal
          {...baseProps}
          updateData={{ ...baseUpdateData, releaseNotes: null }}
        />,
      );
      // When no releaseNotes, the hint above the button is NOT rendered
      // Only the hint text in the else branch is shown (once)
      const hints = getAllByText('update_install_hint');
      expect(hints).toHaveLength(1);
    });
  });

  describe('With releaseNotes', () => {
    it('shows changelog section when releaseNotes is provided', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '**Bold feature** added' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('whats_new')).toBeTruthy();
    });

    it('strips markdown from release notes', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '**Bold** and *italic* text' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Bold and italic text')).toBeTruthy();
    });

    it('does NOT show version header when there is only one release note', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Single release' }],
      };
      const { queryByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // Version header (v2.0.0) should NOT appear as a separate element
      // Only the version number in the header row should show
      const v200elements = queryByText('v2.0.0');
      // It appears once (in the main header), not twice
      expect(v200elements).toBeTruthy();
    });

    it('shows version header when there are multiple release notes', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [
          { version: '2.0.0', notes: 'New feature' },
          { version: '1.9.0', notes: 'Bug fix' },
        ],
      };
      const { getAllByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // v2.0.0 should appear twice: once in header, once as changelog version
      const v200 = getAllByText('v2.0.0');
      expect(v200.length).toBeGreaterThanOrEqual(2);
    });

    it('shows install hint text above the update button when releaseNotes is provided', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'New stuff' }],
      };
      const { getAllByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // When releaseNotes exist, the hint appears above the button
      expect(getAllByText('update_install_hint').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Invisible state', () => {
    it('renders without crashing when visible=false (updateData still provided)', () => {
      // When visible=false but updateData is provided, the modal renders (hidden by Portal)
      expect(() => render(
        <UpdateAvailableModal
          {...baseProps}
          visible={false}
          updateData={baseUpdateData}
        />,
      )).not.toThrow();
    });
  });

  describe('stripMarkdown helper', () => {
    it('strips heading markers', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '## Heading\nContent' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Heading\nContent')).toBeTruthy();
    });

    it('converts list items to bullets', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '- item one' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('• item one')).toBeTruthy();
    });

    it('strips inline code backticks', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Use `code` here' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Use code here')).toBeTruthy();
    });

    it('strips links to plain text', () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '[link text](https://example.com)' }],
      };
      const { getByText } = render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('link text')).toBeTruthy();
    });
  });
});
