import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SearchBar from '../../../app/components/search/SearchBar';

describe('SearchBar', () => {
  const mockColors = {
    surface: '#FFFFFF',
    border: '#E0E0E0',
    text: '#000000',
    mutedText: '#999999',
    primary: '#007AFF',
  };

  const mockT = (key) => key;

  const defaultProps = {
    searchText: '',
    onSearchTextChange: jest.fn(),
    onToggleFilters: jest.fn(),
    onClose: jest.fn(),
    filterCount: 0,
    colors: mockColors,
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders search input with placeholder', () => {
    const { getByPlaceholderText } = render(<SearchBar {...defaultProps} />);
    expect(getByPlaceholderText('search_operations_placeholder')).toBeTruthy();
  });

  it('calls onSearchTextChange when typing', async () => {
    const { getByPlaceholderText } = render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    fireEvent.changeText(input, 'coffee');

    await waitFor(() => {
      expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('coffee');
    });
  });

  it('shows clear button when searchText is not empty', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} searchText="coffee" />);
    expect(getByTestId('clear-search-button')).toBeTruthy();
  });

  it('hides clear button when searchText is empty', () => {
    const { queryByTestId } = render(<SearchBar {...defaultProps} searchText="" />);
    expect(queryByTestId('clear-search-button')).toBeNull();
  });

  it('calls onSearchTextChange with empty string when clear button pressed', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} searchText="coffee" />);

    fireEvent.press(getByTestId('clear-search-button'));

    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('');
  });

  it('calls onToggleFilters when filters button pressed', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} />);

    fireEvent.press(getByTestId('filters-toggle-button'));

    expect(defaultProps.onToggleFilters).toHaveBeenCalled();
  });

  it('calls onClose when close button pressed', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} />);

    fireEvent.press(getByTestId('close-search-button'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows filter count badge when filterCount > 0', () => {
    const { getByText } = render(<SearchBar {...defaultProps} filterCount={3} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('does not show filter count badge when filterCount is 0', () => {
    const { queryByTestId } = render(<SearchBar {...defaultProps} filterCount={0} />);
    expect(queryByTestId('filter-count-badge')).toBeNull();
  });
});
