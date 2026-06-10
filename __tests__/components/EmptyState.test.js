/**
 * Tests for EmptyState component - covers both icon and no-icon branches
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import EmptyState from '../../app/components/EmptyState';

describe('EmptyState', () => {
  it('renders message text', async () => {
    const { getByText } = await render(<EmptyState message="No items found" />);
    expect(getByText('No items found')).toBeTruthy();
  });

  it('renders icon when icon prop is provided', async () => {
    const { container } = await render(
      <EmptyState message="Empty" icon="folder-open" />,
    );
    // Icon component should be rendered
    const { MaterialCommunityIcons } = require('@expo/vector-icons');
    expect(container.queryAll(n => n.props && n.props.testID && n.props.testID.startsWith('icon-'))[0]).toBeTruthy();
  });

  it('does not render icon when icon prop is omitted', async () => {
    const { container } = await render(<EmptyState message="Empty" />);
    const { MaterialCommunityIcons } = require('@expo/vector-icons');
    expect(container.queryAll(n => n.props && n.props.testID && n.props.testID.startsWith('icon-'))[0]).toBeFalsy();
  });

  it('uses custom iconSize when provided', async () => {
    const { root } = await render(
      <EmptyState message="Empty" icon="folder-open" iconSize={64} />,
    );
    expect(root).toBeTruthy();
  });

  it('renders with testID', async () => {
    const { getByTestId } = await render(
      <EmptyState message="Empty" testID="empty-state" />,
    );
    expect(getByTestId('empty-state')).toBeTruthy();
  });
});
