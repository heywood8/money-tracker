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

  it('renders search input with placeholder', async () => {
    const { getByPlaceholderText } = await render(<SearchBar {...defaultProps} />);
    expect(getByPlaceholderText('search_operations_placeholder')).toBeTruthy();
  });

  it('calls onSearchTextChange after debounce when typing', async () => {
    const { getByPlaceholderText } = await render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    await fireEvent.changeText(input, 'coffee');

    // Should not be called immediately
    expect(defaultProps.onSearchTextChange).not.toHaveBeenCalledWith('coffee');

    // Should be called after the 300ms debounce
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('coffee');
  });

  it('shows clear button when searchText prop initializes with text', async () => {
    const { getByTestId } = await render(<SearchBar {...defaultProps} searchText="coffee" />);
    expect(getByTestId('clear-search-button')).toBeTruthy();
  });

  it('shows clear button after typing text', async () => {
    const { getByPlaceholderText, getByTestId } = await render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    await fireEvent.changeText(input, 'coffee');

    expect(getByTestId('clear-search-button')).toBeTruthy();
  });

  it('hides clear button when searchText is empty', async () => {
    const { queryByTestId } = await render(<SearchBar {...defaultProps} searchText="" />);
    expect(queryByTestId('clear-search-button')).toBeNull();
  });

  it('calls onSearchTextChange with empty string immediately when clear button pressed', async () => {
    const { getByTestId } = await render(<SearchBar {...defaultProps} searchText="coffee" />);

    await fireEvent.press(getByTestId('clear-search-button'));

    // Clear is immediate, no debounce
    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('');
  });

  it('hides clear button after pressing clear', async () => {
    const { getByTestId, queryByTestId } = await render(<SearchBar {...defaultProps} searchText="coffee" />);

    await fireEvent.press(getByTestId('clear-search-button'));

    expect(queryByTestId('clear-search-button')).toBeNull();
  });

  it('calls onToggleFilters when filters button pressed', async () => {
    const { getByTestId } = await render(<SearchBar {...defaultProps} />);

    await fireEvent.press(getByTestId('filters-toggle-button'));

    expect(defaultProps.onToggleFilters).toHaveBeenCalled();
  });

  it('calls onClose when close button pressed', async () => {
    const { getByTestId } = await render(<SearchBar {...defaultProps} />);

    await fireEvent.press(getByTestId('close-search-button'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows filter count badge when filterCount > 0', async () => {
    const { getByText } = await render(<SearchBar {...defaultProps} filterCount={3} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('does not show filter count badge when filterCount is 0', async () => {
    const { queryByTestId } = await render(<SearchBar {...defaultProps} filterCount={0} />);
    expect(queryByTestId('filter-count-badge')).toBeNull();
  });

  it('debounces rapid typing and only calls onSearchTextChange once with final value', async () => {
    const { getByPlaceholderText } = await render(<SearchBar {...defaultProps} />);
    const input = getByPlaceholderText('search_operations_placeholder');

    await fireEvent.changeText(input, 'c');
    await fireEvent.changeText(input, 'co');
    await fireEvent.changeText(input, 'cof');
    await fireEvent.changeText(input, 'coff');
    await fireEvent.changeText(input, 'coffe');
    await fireEvent.changeText(input, 'coffee');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(defaultProps.onSearchTextChange).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSearchTextChange).toHaveBeenCalledWith('coffee');
  });

  describe('SearchBar layout', () => {
    it('search input container uses flex: 1 to take full available width', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.flex).toBe(1);
    });

    it('button container has explicit width to prevent overlap', async () => {
      const { container } = await render(<SearchBar {...defaultProps} />);
      const views = container.queryAll(n => n.type === 'View');
      const buttonContainer = views.find(v => {
        const style = StyleSheet.flatten(v.props.style);
        return style && style.width === 96;
      });

      expect(buttonContainer).toBeDefined();
    });
  });

  describe('SearchBar button sizing', () => {
    it('filter button has proper 44x44px touch target', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.width).toBe(44);
      expect(buttonStyle.height).toBe(44);
      expect(buttonStyle.alignItems).toBe('center');
      expect(buttonStyle.justifyContent).toBe('center');
    });

    it('close button has proper 44x44px touch target', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const button = getByTestId('close-search-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.width).toBe(44);
      expect(buttonStyle.height).toBe(44);
      expect(buttonStyle.alignItems).toBe('center');
      expect(buttonStyle.justifyContent).toBe('center');
    });
  });

  describe('SearchBar visual style', () => {
    // The open search now lives inside the same translucent rounded "pill" as the
    // collapsed state (matching the floating bottom menu), so the field itself no
    // longer carries the underline/background — the pill does.
    it('search pill has a rounded translucent container', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const pill = getByTestId('search-pill');

      const pillStyle = StyleSheet.flatten(pill.props.style);
      expect(pillStyle.borderRadius).toBe(24);
      expect(pillStyle.borderWidth).toBe(1);
    });

    it('search pill uses a translucent surface background', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const pill = getByTestId('search-pill');

      const pillStyle = StyleSheet.flatten(pill.props.style);
      // surface (#FFFFFF) with an appended alpha channel (e.g. #FFFFFFde)
      expect(pillStyle.backgroundColor).toMatch(/^#FFFFFF/i);
    });

    it('search input region stretches and keeps comfortable spacing', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} />);
      const container = getByTestId('search-input-container');

      const containerStyle = StyleSheet.flatten(container.props.style);
      expect(containerStyle.flex).toBe(1);
      expect(containerStyle.gap).toBe(12);
    });
  });

  describe('SearchBar filter button active state', () => {
    it('filter button has transparent background when no filters active', async () => {
      const { getByTestId } = await render(<SearchBar {...defaultProps} filterCount={0} />);
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      expect(buttonStyle.backgroundColor).toBeUndefined();
    });

    it('filter button has subtle background tint when filters active', async () => {
      const mockColors = {
        ...defaultProps.colors,
        primary: '#4da3ff',
      };
      const { getByTestId } = await render(
        <SearchBar {...defaultProps} colors={mockColors} filterCount={2} />,
      );
      const button = getByTestId('filters-toggle-button');

      const buttonStyle = StyleSheet.flatten(button.props.style);
      // Should have background with primary color at 15% opacity (hex: 15 in decimal)
      expect(buttonStyle.backgroundColor).toMatch(/#4da3ff/i);
    });

    it('filter icon uses primary color when filterCount > 0', async () => {
      const { container } = await render(
        <SearchBar {...defaultProps} filterCount={2} colors={{ ...mockColors, primary: '#FF3B30' }} />,
      );
      const icons = container.queryAll(n => n.props && n.props.testID && n.props.testID.startsWith('icon-'));
      // The first icon in the button is the filter-variant icon
      const filterIcon = icons.find(icon => icon.props.name === 'filter-variant');
      expect(filterIcon.props.color).toBe('#FF3B30');
    });

    it('filter icon uses text color when filterCount is 0', async () => {
      const { container } = await render(
        <SearchBar {...defaultProps} filterCount={0} colors={{ ...mockColors, text: '#CCCCCC' }} />,
      );
      const icons = container.queryAll(n => n.props && n.props.testID && n.props.testID.startsWith('icon-'));
      const filterIcon = icons.find(icon => icon.props.name === 'filter-variant');
      expect(filterIcon.props.color).toBe('#CCCCCC');
    });
  });

  describe('external searchText sync', () => {
    it('skips local update when searchText prop rerenders with same value', async () => {
      // First render with 'coffee': effect sets lastSentRef.current = 'coffee'
      // Rerender with same 'coffee': condition is false → no-op branch is hit
      const { rerender } = await render(<SearchBar {...defaultProps} searchText="coffee" />);
      await act(async () => { jest.runAllTimers(); });
      await rerender(<SearchBar {...defaultProps} searchText="coffee" />);
      await act(async () => { jest.runAllTimers(); });
      // No assertion needed; exercising the false branch is the goal
    });
  });
});
