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
    it('returns null when updateData is not provided', async () => {
      const { toJSON } = await render(
        <UpdateAvailableModal {...baseProps} updateData={null} />,
      );
      expect(toJSON()).toBeNull();
    });

    it('returns null when updateData is undefined', async () => {
      const { toJSON } = await render(
        <UpdateAvailableModal {...baseProps} updateData={undefined} />,
      );
      expect(toJSON()).toBeNull();
    });
  });

  describe('Basic rendering', () => {
    it('renders version numbers when updateData is provided', async () => {
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={baseUpdateData} />,
      );
      expect(getByText('v2.0.0')).toBeTruthy();
    });

    it('renders dismiss button and calls onDismiss when pressed', async () => {
      const onDismiss = jest.fn();
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} onDismiss={onDismiss} updateData={baseUpdateData} />,
      );
      // The back button wraps an Ionicons 'arrow-back' icon; press it to trigger onDismiss
      await fireEvent.press(getByText('arrow-back'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onUpdate with downloadUrl and checksumUrl when update button pressed', async () => {
      const onUpdate = jest.fn();
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} onUpdate={onUpdate} updateData={baseUpdateData} />,
      );
      await fireEvent.press(getByText('update_now'));
      expect(onUpdate).toHaveBeenCalledWith('https://example.com/app.apk', undefined);
    });
  });

  describe('Without releaseNotes', () => {
    it('shows install hint text when releaseNotes is null', async () => {
      const { getByText } = await render(
        <UpdateAvailableModal
          {...baseProps}
          updateData={{ ...baseUpdateData, releaseNotes: null }}
        />,
      );
      // update_install_hint should be rendered as the fallback
      expect(getByText('update_install_hint')).toBeTruthy();
    });

    it('does not show the update hint below the button when releaseNotes is null', async () => {
      const { getAllByText } = await render(
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
    it('shows changelog section when releaseNotes is provided', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '**Bold feature** added' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('whats_new')).toBeTruthy();
    });

    it('strips markdown from release notes', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '**Bold** and *italic* text' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Bold and italic text')).toBeTruthy();
    });

    it('always shows version label in changelog entries', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Single release' }],
      };
      const { getAllByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // v2.0.0 appears in both the version header row and the changelog entry
      const v200elements = getAllByText('v2.0.0');
      expect(v200elements.length).toBeGreaterThanOrEqual(2);
    });

    it('shows version header when there are multiple release notes', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [
          { version: '2.0.0', notes: 'New feature' },
          { version: '1.9.0', notes: 'Bug fix' },
        ],
      };
      const { getAllByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // v2.0.0 should appear twice: once in header, once as changelog version
      const v200 = getAllByText('v2.0.0');
      expect(v200.length).toBeGreaterThanOrEqual(2);
    });

    it('shows changelog section instead of install hint when releaseNotes is provided', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'New stuff' }],
      };
      const { queryByText, getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // Changelog header shown, install hint not shown
      expect(getByText('whats_new')).toBeTruthy();
      expect(queryByText('update_install_hint')).toBeNull();
    });
  });

  describe('Invisible state', () => {
    it('renders without crashing when visible=false (updateData still provided)', async () => {
      // When visible=false but updateData is provided, the modal renders (hidden by Portal)
      await render(
        <UpdateAvailableModal
          {...baseProps}
          visible={false}
          updateData={baseUpdateData}
        />,
      );
    });
  });

  describe('stripMarkdown helper', () => {
    it('strips heading markers', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '## Heading\nContent' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Heading\nContent')).toBeTruthy();
    });

    it('converts list items to bullets', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '- item one' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('• item one')).toBeTruthy();
    });

    it('strips inline code backticks', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Use `code` here' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('Use code here')).toBeTruthy();
    });

    it('strips links to plain text', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: '[link text](https://example.com)' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      expect(getByText('link text')).toBeTruthy();
    });
  });
});
