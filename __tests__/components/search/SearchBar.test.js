import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import SearchBar from '../../../app/components/search/SearchBar';

describe('SearchBar', () => {
  const mockColors = {
    background: '#1f1f1f',
    surface: '#FFFFFF',
    border: '#E0E0E0',
    inputBorder: '#E0E0E0',
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

    it('button container has explicit width to prevent overlap', () => {
      const { UNSAFE_getAllByType } = render(<SearchBar {...defaultProps} />);
      const views = UNSAFE_getAllByType('View');
      const buttonContainer = views.find(v => {
        const style = StyleSheet.flatten(v.props.style);
        return style && style.width === 96;
      });

      expect(buttonContainer).toBeDefined();
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
    it('search input container has clean rounded style', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.borderBottomWidth).toBe(1);
      expect(containerStyle.borderWidth).toBeUndefined();
      expect(containerStyle.borderRadius).toBe(4);
      expect(containerStyle.height).toBe(44);
    });

    it('search input container has subtle background for visibility', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      // Solid dark background for clear visual definition
      expect(containerStyle.backgroundColor).toBe('#1f1f1f');
    });

    it('search input container has proper padding', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.paddingHorizontal).toBe(12);
      expect(containerStyle.gap).toBe(12);
    });
  });

  describe('SearchBar filter button active state', () => {
    it('filter button has transparent background when no filters active', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} filterCount={0} />);
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.backgroundColor).toBeUndefined();
    });

    it('filter button has subtle background tint when filters active', () => {
      const mockColors = {
        ...defaultProps.colors,
        primary: '#4da3ff',
      };
      const { getByTestId } = render(
        <SearchBar {...defaultProps} colors={mockColors} filterCount={2} />,
      );
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      // Should have background with primary color at 15% opacity (hex: 15 in decimal)
      expect(buttonStyle.backgroundColor).toMatch(/#4da3ff/i);
    });

    it('filter icon uses primary color when filterCount > 0', () => {
      const { getByTestId, UNSAFE_getAllByType } = render(
        <SearchBar {...defaultProps} filterCount={2} colors={{ ...mockColors, primary: '#FF3B30' }} />,
      );
      const button = getByTestId('filters-toggle-button');
      const icons = UNSAFE_getAllByType(require('@expo/vector-icons').MaterialCommunityIcons);
      // The first icon in the button is the filter-variant icon
      const filterIcon = icons.find(icon => icon.props.name === 'filter-variant');
      expect(filterIcon.props.color).toBe('#FF3B30');
    });

    it('filter icon uses text color when filterCount is 0', () => {
      const { getByTestId, UNSAFE_getAllByType } = render(
        <SearchBar {...defaultProps} filterCount={0} colors={{ ...mockColors, text: '#CCCCCC' }} />,
      );
      const button = getByTestId('filters-toggle-button');
      const icons = UNSAFE_getAllByType(require('@expo/vector-icons').MaterialCommunityIcons);
      const filterIcon = icons.find(icon => icon.props.name === 'filter-variant');
      expect(filterIcon.props.color).toBe('#CCCCCC');
    });
  });
});
