import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import FilterBadge from '../../../app/components/search/FilterBadge';

describe('FilterBadge', () => {
  const mockColors = {
    primary: '#007AFF',
    primaryFill: '#0062CC',
    onPrimaryFill: '#ffffff',
    background: '#FFFFFF',
  };

  it('renders badge with count', async () => {
    const { getByText } = await render(<FilterBadge count={3} colors={mockColors} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('does not render when count is 0', async () => {
    const { queryByTestId } = await render(<FilterBadge count={0} colors={mockColors} />);
    expect(queryByTestId('filter-badge')).toBeNull();
  });

  it('does not render when count is null', async () => {
    const { queryByTestId } = await render(<FilterBadge count={null} colors={mockColors} />);
    expect(queryByTestId('filter-badge')).toBeNull();
  });

  // The fill is `primaryFill`, not `primary`: white on the accent measures
  // ~4.0:1 (light) / ~2.6:1 (dark), under WCAG AA for 10px bold text. See #1710.
  it('applies the filled-accent color to the badge background', async () => {
    const { getByTestId } = await render(<FilterBadge count={5} colors={mockColors} />);
    const badge = getByTestId('filter-badge');
    const badgeStyle = StyleSheet.flatten(badge.props.style);
    expect(badgeStyle.backgroundColor).toBe(mockColors.primaryFill);
  });

  it('paints the count in the colour that sits on that fill', async () => {
    const { getByText } = await render(<FilterBadge count={5} colors={mockColors} />);
    const countStyle = StyleSheet.flatten(getByText('5').props.style);
    expect(countStyle.color).toBe(mockColors.onPrimaryFill);
  });
});
