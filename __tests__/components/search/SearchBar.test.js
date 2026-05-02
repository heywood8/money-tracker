import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders search input with placeholder', () => {
    const { getByPlaceholderText } = render(<SearchBar {...defaultProps} />);
    expect(getByPlaceholderText('search_operations_placeholder')).toBeTruthy();
  });

  it('calls onSearchTextChange after debounce when typing', () => {
    const { getByPlaceholderText } = render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    fireEvent.changeText(input, 'coffee');

    // Should not be called immediately
    expect(defaultProps.onSearchTextChange).not.toHaveBeenCalledWith('coffee');

    // Should be called after the 300ms debounce
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('coffee');
  });

  it('shows clear button when searchText prop initializes with text', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} searchText="coffee" />);
    expect(getByTestId('clear-search-button')).toBeTruthy();
  });

  it('shows clear button after typing text', () => {
    const { getByPlaceholderText, getByTestId } = render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    fireEvent.changeText(input, 'coffee');

    expect(getByTestId('clear-search-button')).toBeTruthy();
  });

  it('hides clear button when searchText is empty', () => {
    const { queryByTestId } = render(<SearchBar {...defaultProps} searchText="" />);
    expect(queryByTestId('clear-search-button')).toBeNull();
  });

  it('calls onSearchTextChange with empty string immediately when clear button pressed', () => {
    const { getByTestId } = render(<SearchBar {...defaultProps} searchText="coffee" />);

    fireEvent.press(getByTestId('clear-search-button'));

    // Clear is immediate, no debounce
    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('');
  });

  it('hides clear button after pressing clear', () => {
    const { getByTestId, queryByTestId } = render(<SearchBar {...defaultProps} searchText="coffee" />);

    fireEvent.press(getByTestId('clear-search-button'));

    expect(queryByTestId('clear-search-button')).toBeNull();
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

  it('debounces rapid typing and only calls onSearchTextChange once with final value', () => {
    const { getByPlaceholderText } = render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    fireEvent.changeText(input, 'c');
    fireEvent.changeText(input, 'co');
    fireEvent.changeText(input, 'cof');
    fireEvent.changeText(input, 'coff');
    fireEvent.changeText(input, 'coffe');
    fireEvent.changeText(input, 'coffee');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(defaultProps.onSearchTextChange).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('coffee');
  });

  describe('SearchBar layout', () => {
    it('search input container uses flex: 1 to take full available width', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.flex).toBe(1);
    });

    it('container has proper gap between elements', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      // Query parent container
      const searchBar = getByTestId('search-bar-container');

      const barStyle = StyleSheet.flatten(searchBar.props.style);
      expect(barStyle.gap).toBe(12);
    });
  });

  describe('SearchBar button sizing', () => {
    it('filter button has proper 44x44px touch target', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.width).toBe(44);
      expect(buttonStyle.height).toBe(44);
      expect(buttonStyle.alignItems).toBe('center');
      expect(buttonStyle.justifyContent).toBe('center');
    });

    it('close button has proper 44x44px touch target', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const button = getByTestId('close-search-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.width).toBe(44);
      expect(buttonStyle.height).toBe(44);
      expect(buttonStyle.alignItems).toBe('center');
      expect(buttonStyle.justifyContent).toBe('center');
    });
  });

  describe('SearchBar visual style', () => {
    it('search input container has underline only (borderBottomWidth: 1)', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.borderBottomWidth).toBe(1);
      expect(containerStyle.borderWidth).toBeUndefined();
      expect(containerStyle.borderRadius).toBeUndefined();
    });

    it('search input container has no background color in styles', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      // Should not have backgroundColor in StyleSheet (may be passed via props)
      expect(containerStyle.backgroundColor).toBeUndefined();
    });

    it('search input container has proper padding for underline style', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.paddingVertical).toBe(8);
      expect(containerStyle.paddingHorizontal).toBe(4);
    });
  });
});
