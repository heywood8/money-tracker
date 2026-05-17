/**
 * Tests for LoadingView component - covers message and no-message branches
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingView from '../../app/components/LoadingView';

describe('LoadingView', () => {
  it('renders without crashing', () => {
    const { root } = render(<LoadingView />);
    expect(root).toBeTruthy();
  });

  it('renders message text when message prop is provided', () => {
    const { getByText } = render(<LoadingView message="Loading data..." />);
    expect(getByText('Loading data...')).toBeTruthy();
  });

  it('does not render message text when message prop is omitted', () => {
    const { queryByText } = render(<LoadingView />);
    // No message text should be present
    expect(queryByText(/loading/i)).toBeNull();
  });

  it('renders with testID', () => {
    const { getByTestId } = render(<LoadingView testID="loading-view" />);
    expect(getByTestId('loading-view')).toBeTruthy();
  });

  it('renders ActivityIndicator', () => {
    const { UNSAFE_getByType } = render(<LoadingView />);
    const { ActivityIndicator } = require('react-native-paper');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
