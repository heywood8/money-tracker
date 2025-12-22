/**
 * Penny Design System Tokens
 *
 * Central definition of all spacing, sizing, and layout values.
 * This file serves as the single source of truth for design consistency
 * across the application.
 *
 * Design principles:
 * - 4px grid system for all spacing
 * - Maximum 3 border radius values
 * - Semantic naming for clarity
 */

// ============ SPACING SCALE (4px grid system) ============
/**
 * All spacing values follow a 4px grid system for visual consistency
 * Use these tokens instead of hardcoded numbers in StyleSheet.create()
 */
export const SPACING = {
  xs: 4,    // Minimal spacing - icon gaps, tight layouts
  sm: 8,    // Small spacing - form element margins, button gaps
  md: 12,   // Medium spacing - section padding, card internal spacing
  lg: 16,   // Large spacing - screen horizontal padding, component separation
  xl: 20,   // Extra large - modal padding, section headers
  xxl: 24,  // Extra extra large - major section separation
};

// ============ BORDER RADIUS (3 values only) ============
/**
 * Standardized border radius values
 * Previously had 7 different values (4, 6, 8, 12, 16, 20, 24px)
 * Now consolidated to just 3 for consistency
 */
export const BORDER_RADIUS = {
  sm: 4,    // Inputs, small interactive elements, calculator buttons
  md: 8,    // Cards, buttons, most containers
  lg: 12,   // Modals, major containers
};

// ============ COMPONENT HEIGHTS ============
/**
 * Standardized heights for common components
 * Ensures consistent touch targets and visual rhythm
 */
export const HEIGHTS = {
  input: 48,           // All text inputs, pickers, buttons (min touch target)
  listItem: 56,        // ALL list item rows (accounts, operations, categories)
  calculator: 44,      // Calculator buttons (compact, intentional)
  fab: 56,             // Floating action button
  tabBar: 80,          // Bottom tab bar (includes 24px bottom padding)
};

// ============ TYPOGRAPHY ============
/**
 * Font sizes following a modular scale
 * Prefer using React Native Paper's Text variants when possible
 */
export const FONT_SIZE = {
  xs: 11,    // Very small labels, metadata
  sm: 12,    // Small labels, secondary text
  md: 14,    // Body text, form labels
  base: 16,  // Default body text
  lg: 18,    // Section headers, prominent text
  xl: 20,    // Screen titles, large headers
  xxl: 24,   // Display text, major headers
};

/**
 * Font weights for hierarchy
 * Use numeric values for cross-platform consistency
 */
export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// ============ LAYOUT CONSTANTS (backward compatibility) ============
/**
 * Re-export commonly used layout values for backward compatibility
 * These were previously defined in layout.js
 */
export const HORIZONTAL_PADDING = SPACING.lg; // 16px - screen horizontal gutters
export const TOP_CONTENT_SPACING = SPACING.md; // 12px - top margin for content

// ============ ICON SIZES ============
/**
 * Standardized icon sizes
 * Use these for Material Community Icons
 */
export const ICON_SIZE = {
  xs: 16,    // Very small icons, chevrons
  sm: 18,    // Small icons, expand indicators
  md: 22,    // Medium icons, category icons
  base: 24,  // Default icon size, general use
  lg: 32,    // Large icons, important actions
  xl: 48,    // Extra large, icon containers with background
};

// ============ ELEVATION/SHADOWS ============
/**
 * Shadow presets for elevation
 * Based on Material Design elevation system
 */
export const ELEVATION = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  low: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  high: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
};

// ============ OPACITY LEVELS ============
/**
 * Standard opacity values for interactive states
 */
export const OPACITY = {
  disabled: 0.5,     // Disabled elements
  overlay: 0.3,      // Modal overlays, backgrounds
  subtle: 0.6,       // Subtle highlights, hints
  semiTransparent: 0.12,  // Ripple effects, subtle backgrounds
};

// ============ ANIMATION DURATIONS ============
/**
 * Standard animation/transition durations in milliseconds
 * Based on Material Design motion guidelines
 */
export const DURATION = {
  fastest: 100,   // Instant feedback (ripple start)
  fast: 200,      // Quick transitions (modal open/close)
  normal: 300,    // Standard transitions
  slow: 500,      // Emphasized transitions
};

// ============ Z-INDEX LAYERS ============
/**
 * Z-index layering system
 * Ensures proper stacking of UI elements
 */
export const Z_INDEX = {
  base: 0,           // Default layer
  dropdown: 10,      // Dropdowns, pickers
  sticky: 20,        // Sticky headers
  overlay: 30,       // Overlays, backdrops
  modal: 40,         // Modals, dialogs
  popover: 50,       // Popovers, tooltips
  toast: 60,         // Toast notifications
};
