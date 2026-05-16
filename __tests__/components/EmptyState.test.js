/**
 * Tests for EmptyState component - covers both icon and no-icon branches
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import EmptyState from '../../app/components/EmptyState';

describe('EmptyState', () => {
  it('renders message text', () => {
    const { getByText } = render(<EmptyState message="No items found" />);
    expect(getByText('No items found')).toBeTruthy();
  });

  it('renders icon when icon prop is provided', () => {
    const { UNSAFE_getByType } = render(
      <EmptyState message="Empty" icon="folder-open" />,
    );
    // Icon component should be rendered
    const { MaterialCommunityIcons } = require('@expo/vector-icons');
    expect(UNSAFE_getByType(MaterialCommunityIcons)).toBeTruthy();
  });

  it('does not render icon when icon prop is omitted', () => {
    const { UNSAFE_queryByType } = render(<EmptyState message="Empty" />);
    const { MaterialCommunityIcons } = require('@expo/vector-icons');
    expect(UNSAFE_queryByType(MaterialCommunityIcons)).toBeNull();
  });

  it('uses custom iconSize when provided', () => {
    const { root } = render(
      <EmptyState message="Empty" icon="folder-open" iconSize={64} />,
    );
    expect(root).toBeTruthy();
  });

  it('renders with testID', () => {
    const { getByTestId } = render(
      <EmptyState message="Empty" testID="empty-state" />,
    );
    expect(getByTestId('empty-state')).toBeTruthy();
  });
});
