/**
 * Tests for UpdateAvailableModal component
 *
 * The modal is a compact, content-hugging card shown over any screen when a newer
 * release is found. It reuses the release-note parsing from UpdateContentPanel but
 * renders its own condensed layout (icon badge + title, meta line, bounded "What's
 * new" scroll region, and a Later / Update now action row).
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
    it('renders the latest version in the meta line', async () => {
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={baseUpdateData} />,
      );
      expect(getByText('v2.0.0')).toBeTruthy();
    });

    it('hugs its content — the card carries no fixed height', async () => {
      // Regression guard: the old modal pinned the shared full-screen panel to 80% of the
      // window, stranding a single card in a large void. The redesigned card must size to
      // its content, so the container must NOT declare a fixed numeric height.
      const { getByTestId } = await render(
        <UpdateAvailableModal {...baseProps} updateData={baseUpdateData} />,
      );
      const flat = RN.StyleSheet.flatten(getByTestId('update-modal-container').props.style);
      expect(flat.height).toBeUndefined();
    });

    it('bounds the "what\'s new" scroll region so long changelogs never grow the card', async () => {
      // Regression guard: the notes list can span several skipped versions. Only that region
      // scrolls (bounded maxHeight); the header and actions stay put and always visible.
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Some notes' }],
      };
      const { getByTestId } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      const flat = RN.StyleSheet.flatten(getByTestId('update-notes-scroll').props.style);
      expect(typeof flat.maxHeight).toBe('number');
      expect(flat.maxHeight).toBeGreaterThan(0);
    });

    it('dismisses when the close (×) icon is pressed', async () => {
      const onDismiss = jest.fn();
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} onDismiss={onDismiss} updateData={baseUpdateData} />,
      );
      // Ionicons renders its `name` as text in tests; the close affordance is the 'close' glyph.
      await fireEvent.press(getByText('close'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses when the Later button is pressed', async () => {
      const onDismiss = jest.fn();
      const { getByText } = await render(
        <UpdateAvailableModal {...baseProps} onDismiss={onDismiss} updateData={baseUpdateData} />,
      );
      await fireEvent.press(getByText('later'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onUpdate with the download URL when "Update now" is pressed', async () => {
      const onUpdate = jest.fn();
      const { getByLabelText } = await render(
        <UpdateAvailableModal {...baseProps} onUpdate={onUpdate} updateData={baseUpdateData} />,
      );
      await fireEvent.press(getByLabelText('update_now v2.0.0'));
      expect(onUpdate).toHaveBeenCalledWith('https://example.com/app.apk');
    });
  });

  describe('Without releaseNotes', () => {
    it('shows the generic availability message when releaseNotes is null', async () => {
      const { getByText, queryByText } = await render(
        <UpdateAvailableModal
          {...baseProps}
          updateData={{ ...baseUpdateData, releaseNotes: null }}
        />,
      );
      expect(getByText('update_available_message')).toBeTruthy();
      // No "What's new" section when there is nothing to show.
      expect(queryByText('whats_new')).toBeNull();
    });
  });

  describe('With releaseNotes', () => {
    it('shows the "what\'s new" section when releaseNotes is provided', async () => {
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

    it('renders a single release without a redundant in-list version label', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [{ version: '2.0.0', notes: 'Single release' }],
      };
      const { getByText, getAllByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // The version appears once (the meta line); a lone release doesn't repeat it in the body.
      expect(getAllByText('v2.0.0')).toHaveLength(1);
      expect(getByText('Single release')).toBeTruthy();
    });

    it('labels each release when there are multiple release notes', async () => {
      const updateData = {
        ...baseUpdateData,
        releaseNotes: [
          { version: '2.0.0', notes: 'New feature' },
          { version: '1.9.0', notes: 'Bug fix' },
        ],
      };
      const { getByText, getAllByText } = await render(
        <UpdateAvailableModal {...baseProps} updateData={updateData} />,
      );
      // Each release contributes its own version label; v2.0.0 also appears in the meta line.
      expect(getAllByText('v2.0.0').length).toBeGreaterThanOrEqual(1);
      expect(getByText('v1.9.0')).toBeTruthy();
      expect(getByText('New feature')).toBeTruthy();
      expect(getByText('Bug fix')).toBeTruthy();
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

  describe('Invisible state', () => {
    it('renders without crashing when visible=false (updateData still provided)', async () => {
      await render(
        <UpdateAvailableModal
          {...baseProps}
          visible={false}
          updateData={baseUpdateData}
        />,
      );
    });
  });
});
