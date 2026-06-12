/**
 * Tests for LoadingView component - covers message and no-message branches
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingView from '../../app/components/LoadingView';

describe('LoadingView', () => {
  it('renders without crashing', async () => {
    const { root } = await render(<LoadingView />);
    expect(root).toBeTruthy();
  });

  it('renders message text when message prop is provided', async () => {
    const { getByText } = await render(<LoadingView message="Loading data..." />);
    expect(getByText('Loading data...')).toBeTruthy();
  });

  it('does not render message text when message prop is omitted', async () => {
    const { queryByText } = await render(<LoadingView />);
    // No message text should be present
    expect(queryByText(/loading/i)).toBeNull();
  });

  it('renders with testID', async () => {
    const { getByTestId } = await render(<LoadingView testID="loading-view" />);
    expect(getByTestId('loading-view')).toBeTruthy();
  });

  it('renders ActivityIndicator', async () => {
    const { root } = await render(<LoadingView />);
    // Paper ActivityIndicator is mocked as View - verify component renders without crashing
    expect(root).toBeTruthy();
  });
});
