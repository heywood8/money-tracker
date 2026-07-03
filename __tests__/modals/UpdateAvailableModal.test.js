/**
 * Tests for UpdateAvailableModal component
 * Covers rendering branches: null updateData, with/without releaseNotes, single/multiple notes
 */

import React from 'react';
import * as RN from 'react-native';
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

    it('gives the dialog a bounded absolute height so its content is not empty', async () => {
      // Regression guard: paper's Modal wraps children in an auto-height Surface, so a
      // percentage height never resolves and the shared panel's flex:1 ScrollView
      // collapses to zero height — an empty dialog. The container must carry a concrete
      // numeric height (windowHeight * 0.8 = 640 here).
      const { getByTestId } = await render(
        <UpdateAvailableModal {...baseProps} updateData={baseUpdateData} />,
      );
      const flat = RN.StyleSheet.flatten(getByTestId('update-modal-container').props.style);
      // A concrete pixel height (not a percentage or undefined) is what keeps the shared
      // panel's flex:1 ScrollView from collapsing; the exact value tracks the window height.
      expect(typeof flat.height).toBe('number');
      expect(flat.height).toBeGreaterThan(0);
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

    it('calls onUpdate with downloadUrl, checksum and version when a release download button is pressed', async () => {
      const onUpdate = jest.fn();
      const { getByLabelText } = await render(
        <UpdateAvailableModal {...baseProps} onUpdate={onUpdate} updateData={baseUpdateData} />,
      );
      // The newest version is synthesized into a card so its per-release download button is reachable.
      await fireEvent.press(getByLabelText('Download version 2.0.0'));
      expect(onUpdate).toHaveBeenCalledWith('https://example.com/app.apk', undefined, '2.0.0');
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

    it('shows the release version label on each changelog entry', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Single release' }],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // The version now lives only on its release card (the single bottom header is gone).
      expect(getByText('v2.0.0')).toBeTruthy();
      expect(getByText('Single release')).toBeTruthy();
    });

    it('shows every release version when there are multiple release notes', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [
          { version: '2.0.0', notes: 'New feature' },
          { version: '1.9.0', notes: 'Bug fix' },
        ],
      };
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // Each release is its own card with its own version label.
      expect(getByText('v2.0.0')).toBeTruthy();
      expect(getByText('v1.9.0')).toBeTruthy();
      expect(getByText('New feature')).toBeTruthy();
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
