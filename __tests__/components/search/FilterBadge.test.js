import React from 'react';
import { render } from '@testing-library/react-native';
import FilterBadge from '../../../app/components/search/FilterBadge';

describe('FilterBadge', () => {
  const mockColors = {
    primary: '#007AFF',
    background: '#FFFFFF',
  };

  it('renders badge with count', () => {
    const { getByText } = render(<FilterBadge count={3} colors={mockColors} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('does not render when count is 0', () => {
    const { queryByTestId } = render(<FilterBadge count={0} colors={mockColors} />);
    expect(queryByTestId('filter-badge')).toBeNull();
  });

  it('does not render when count is null', () => {
    const { queryByTestId } = render(<FilterBadge count={null} colors={mockColors} />);
    expect(queryByTestId('filter-badge')).toBeNull();
  });

  it('applies primary color to badge background', () => {
    const { getByTestId } = render(<FilterBadge count={5} colors={mockColors} />);
    const badge = getByTestId('filter-badge');
    const styleArray = Array.isArray(badge.props.style)
      ? badge.props.style
      : [badge.props.style];
    const hasBackgroundColor = styleArray.some(
      (style) => style && style.backgroundColor === mockColors.primary,
    );
    expect(hasBackgroundColor).toBe(true);
  });
});
