import { renderHook } from '@testing-library/react-native';
import { useMaterialTheme } from '../../app/hooks/useMaterialTheme';
import { useThemeConfig } from '../../app/contexts/ThemeConfigContext';
import { useThemeColors } from '../../app/contexts/ThemeColorsContext';

// Mock react-native-paper themes
jest.mock('react-native-paper', () => ({
  MD3LightTheme: {
    colors: {
      primary: '#0066cc',
      background: '#ffffff',
      surface: '#f5f5f5',
      onPrimary: '#ffffff',
      onBackground: '#000000',
      onSurface: '#000000',
    },
  },
  MD3DarkTheme: {
    colors: {
      primary: '#64b5f6',
      background: '#121212',
      surface: '#1e1e1e',
      onPrimary: '#ffffff',
      onBackground: '#ffffff',
      onSurface: '#ffffff',
    },
  },
}));

// Mock the context hooks
jest.mock('../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: jest.fn(),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: jest.fn(),
}));

describe('useMaterialTheme', () => {
  const mockLightColors = {
    primary: '#0066cc',
    secondary: '#666666',
    background: '#ffffff',
    text: '#000000',
    surface: '#f5f5f5',
    card: '#ffffff',
    border: '#e0e0e0',
    inputBorder: '#cccccc',
    altRow: '#f9f9f9',
    mutedText: '#666666',
    selected: '#e3f2fd',
    danger: '#d32f2f',
    expense: '#d32f2f',
    income: '#388e3c',
    transfer: '#1976d2',
    expenseBackground: '#ffebee',
    incomeBackground: '#e8f5e9',
    transferBackground: '#e3f2fd',
    delete: '#d32f2f',
    modalBackground: 'rgba(0,0,0,0.5)',
  };

  const mockDarkColors = {
    primary: '#64b5f6',
    secondary: '#aaaaaa',
    background: '#121212',
    text: '#ffffff',
    surface: '#1e1e1e',
    card: '#2c2c2c',
    border: '#333333',
    inputBorder: '#444444',
    altRow: '#1a1a1a',
    mutedText: '#aaaaaa',
    selected: '#1565c0',
    danger: '#f44336',
    expense: '#ef5350',
    income: '#66bb6a',
    transfer: '#42a5f5',
    expenseBackground: '#4a1a1a',
    incomeBackground: '#1a3a1a',
    transferBackground: '#1a2f4a',
    delete: '#f44336',
    modalBackground: 'rgba(0,0,0,0.8)',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Light Theme', () => {
    beforeEach(() => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });
    });

    it('should generate light theme with correct base', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.primary).toBe(mockLightColors.primary);
      expect(result.current.colors.background).toBe(mockLightColors.background);
      expect(result.current.colors.surface).toBe(mockLightColors.surface);
      expect(result.current.colors.onBackground).toBe(mockLightColors.text);
      expect(result.current.colors.onSurface).toBe(mockLightColors.text);
    });

    it('should map primary colors correctly', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.primary).toBe(mockLightColors.primary);
      expect(result.current.colors.primaryContainer).toBe('#c0e0ff');
      expect(result.current.colors.onPrimary).toBe('#ffffff');
      expect(result.current.colors.onPrimaryContainer).toBe('#001d35');
    });

    it('should map secondary colors correctly', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.secondary).toBe(mockLightColors.secondary);
      expect(result.current.colors.secondaryContainer).toBe('#e8e8e8');
      expect(result.current.colors.onSecondary).toBe(mockLightColors.text);
      expect(result.current.colors.onSecondaryContainer).toBe(mockLightColors.text);
    });

    it('should map error colors correctly', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.error).toBe(mockLightColors.danger);
      expect(result.current.colors.errorContainer).toBe('#ffdad6');
      expect(result.current.colors.onError).toBe('#ffffff');
      expect(result.current.colors.onErrorContainer).toBe('#410002');
    });

    it('should map outline colors correctly', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.outline).toBe(mockLightColors.border);
      expect(result.current.colors.outlineVariant).toBe(mockLightColors.inputBorder);
    });

    it('should include elevation levels', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.elevation.level0).toBe('transparent');
      expect(result.current.colors.elevation.level1).toBe(mockLightColors.surface);
      expect(result.current.colors.elevation.level2).toBe(mockLightColors.card);
    });

    it('should include custom colors', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.custom.expense).toBe(mockLightColors.expense);
      expect(result.current.colors.custom.income).toBe(mockLightColors.income);
      expect(result.current.colors.custom.transfer).toBe(mockLightColors.transfer);
      expect(result.current.colors.custom.expenseBackground).toBe(mockLightColors.expenseBackground);
      expect(result.current.colors.custom.incomeBackground).toBe(mockLightColors.incomeBackground);
      expect(result.current.colors.custom.transferBackground).toBe(mockLightColors.transferBackground);
      expect(result.current.colors.custom.selected).toBe(mockLightColors.selected);
      expect(result.current.colors.custom.altRow).toBe(mockLightColors.altRow);
      expect(result.current.colors.custom.mutedText).toBe(mockLightColors.mutedText);
      expect(result.current.colors.custom.delete).toBe(mockLightColors.delete);
    });

    it('should set backdrop color', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.backdrop).toBe(mockLightColors.modalBackground);
    });

    it('should set surface disabled colors', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.surfaceDisabled).toBe('rgba(0,0,0,0.12)');
      expect(result.current.colors.onSurfaceDisabled).toBe('rgba(0,0,0,0.38)');
    });
  });

  describe('Dark Theme', () => {
    beforeEach(() => {
      useThemeConfig.mockReturnValue({ colorScheme: 'dark' });
      useThemeColors.mockReturnValue({ colors: mockDarkColors });
    });

    it('should generate dark theme with correct base', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.primary).toBe(mockDarkColors.primary);
      expect(result.current.colors.background).toBe(mockDarkColors.background);
      expect(result.current.colors.surface).toBe(mockDarkColors.surface);
      expect(result.current.colors.onBackground).toBe(mockDarkColors.text);
      expect(result.current.colors.onSurface).toBe(mockDarkColors.text);
    });

    it('should map primary colors correctly for dark theme', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.primary).toBe(mockDarkColors.primary);
      expect(result.current.colors.primaryContainer).toBe('#004a77');
      expect(result.current.colors.onPrimary).toBe('#ffffff');
      expect(result.current.colors.onPrimaryContainer).toBe('#c0e0ff');
    });

    it('should map secondary colors correctly for dark theme', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.secondary).toBe(mockDarkColors.secondary);
      expect(result.current.colors.secondaryContainer).toBe('#444444');
    });

    it('should map error colors correctly for dark theme', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.error).toBe(mockDarkColors.danger);
      expect(result.current.colors.errorContainer).toBe('#93000a');
      expect(result.current.colors.onError).toBe('#ffffff');
      expect(result.current.colors.onErrorContainer).toBe('#ffdad6');
    });

    it('should set surface disabled colors for dark theme', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.surfaceDisabled).toBe('rgba(255,255,255,0.12)');
      expect(result.current.colors.onSurfaceDisabled).toBe('rgba(255,255,255,0.38)');
    });

    it('should include custom dark colors', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.colors.custom.expense).toBe(mockDarkColors.expense);
      expect(result.current.colors.custom.income).toBe(mockDarkColors.income);
      expect(result.current.colors.custom.transfer).toBe(mockDarkColors.transfer);
    });
  });

  describe('Theme Configuration', () => {
    beforeEach(() => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });
    });

    it('should set animation scale to 1.0', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.animation.scale).toBe(1.0);
    });

    it('should set roundness to 8', () => {
      const { result } = renderHook(() => useMaterialTheme());

      expect(result.current.roundness).toBe(8);
    });
  });

  describe('Memoization', () => {
    it('should memoize theme object', () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });

      const { result, rerender } = renderHook(() => useMaterialTheme());
      const firstTheme = result.current;

      rerender();
      const secondTheme = result.current;

      // Should be the same reference if inputs haven't changed
      expect(firstTheme).toBe(secondTheme);
    });

    it('should recreate theme when colorScheme changes', () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });

      const { result, rerender } = renderHook(() => useMaterialTheme());
      const lightTheme = result.current;

      useThemeConfig.mockReturnValue({ colorScheme: 'dark' });
      useThemeColors.mockReturnValue({ colors: mockDarkColors });

      rerender();
      const darkTheme = result.current;

      // Should be different references
      expect(lightTheme).not.toBe(darkTheme);
      expect(darkTheme.colors.primary).toBe(mockDarkColors.primary);
    });

    it('should recreate theme when colors change', () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });

      const { result, rerender } = renderHook(() => useMaterialTheme());
      const firstTheme = result.current;

      const modifiedColors = { ...mockLightColors, primary: '#ff0000' };
      useThemeColors.mockReturnValue({ colors: modifiedColors });

      rerender();
      const secondTheme = result.current;

      // Should be different references
      expect(firstTheme).not.toBe(secondTheme);
      expect(secondTheme.colors.primary).toBe('#ff0000');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing custom colors gracefully', () => {
      const minimalColors = {
        primary: '#0066cc',
        secondary: '#666666',
        background: '#ffffff',
        text: '#000000',
        surface: '#f5f5f5',
        card: '#ffffff',
        border: '#e0e0e0',
        inputBorder: '#cccccc',
        altRow: '#f9f9f9',
        mutedText: '#666666',
        selected: '#e3f2fd',
        danger: '#d32f2f',
        modalBackground: 'rgba(0,0,0,0.5)',
      };

      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: minimalColors });

      const { result } = renderHook(() => useMaterialTheme());

      // Should not crash, but custom colors will be undefined
      expect(result.current.colors.custom).toBeDefined();
    });
  });

  describe('Regression Tests', () => {
    it('should maintain consistent color structure', () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });

      const { result } = renderHook(() => useMaterialTheme());

      // Verify all expected top-level keys exist
      expect(result.current).toHaveProperty('colors');
      expect(result.current).toHaveProperty('animation');
      expect(result.current).toHaveProperty('roundness');

      // Verify colors object has all required Material Design keys
      expect(result.current.colors).toHaveProperty('primary');
      expect(result.current.colors).toHaveProperty('secondary');
      expect(result.current.colors).toHaveProperty('background');
      expect(result.current.colors).toHaveProperty('surface');
      expect(result.current.colors).toHaveProperty('error');
      expect(result.current.colors).toHaveProperty('elevation');
      expect(result.current.colors).toHaveProperty('custom');
    });

    it('should have all elevation levels', () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light' });
      useThemeColors.mockReturnValue({ colors: mockLightColors });

      const { result } = renderHook(() => useMaterialTheme());

      const elevation = result.current.colors.elevation;
      expect(elevation).toHaveProperty('level0');
      expect(elevation).toHaveProperty('level1');
      expect(elevation).toHaveProperty('level2');
      expect(elevation).toHaveProperty('level3');
      expect(elevation).toHaveProperty('level4');
      expect(elevation).toHaveProperty('level5');
    });
  });
});
