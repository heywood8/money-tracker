/**
 * Layout Constants Tests
 *
 * Tests for layout.js (backward compatibility re-exports)
 * and designTokens.js (source of truth for design system)
 */

import {
  HORIZONTAL_PADDING,
  TOP_CONTENT_SPACING,
  SPACING,
  BORDER_RADIUS,
  HEIGHTS,
} from '../../app/styles/layout';

import {
  HORIZONTAL_PADDING as DT_HORIZONTAL_PADDING,
  TOP_CONTENT_SPACING as DT_TOP_CONTENT_SPACING,
  SPACING as DT_SPACING,
  BORDER_RADIUS as DT_BORDER_RADIUS,
  HEIGHTS as DT_HEIGHTS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  ELEVATION,
  OPACITY,
  DURATION,
  Z_INDEX,
} from '../../app/styles/designTokens';

describe('Layout Constants', () => {
  describe('Re-exports from designTokens', () => {
    it('HORIZONTAL_PADDING matches designTokens', () => {
      expect(HORIZONTAL_PADDING).toBe(DT_HORIZONTAL_PADDING);
    });

    it('TOP_CONTENT_SPACING matches designTokens', () => {
      expect(TOP_CONTENT_SPACING).toBe(DT_TOP_CONTENT_SPACING);
    });

    it('SPACING matches designTokens', () => {
      expect(SPACING).toBe(DT_SPACING);
    });

    it('BORDER_RADIUS matches designTokens', () => {
      expect(BORDER_RADIUS).toBe(DT_BORDER_RADIUS);
    });

    it('HEIGHTS matches designTokens', () => {
      expect(HEIGHTS).toBe(DT_HEIGHTS);
    });
  });

  describe('SPACING scale (4px grid)', () => {
    it('has all expected size keys', () => {
      expect(SPACING).toHaveProperty('xs');
      expect(SPACING).toHaveProperty('sm');
      expect(SPACING).toHaveProperty('md');
      expect(SPACING).toHaveProperty('lg');
      expect(SPACING).toHaveProperty('xl');
      expect(SPACING).toHaveProperty('xxl');
    });

    it('follows 4px grid system', () => {
      expect(SPACING.xs).toBe(4);
      expect(SPACING.sm).toBe(8);
      expect(SPACING.md).toBe(12);
      expect(SPACING.lg).toBe(16);
      expect(SPACING.xl).toBe(20);
      expect(SPACING.xxl).toBe(24);
    });

    it('all values are positive numbers', () => {
      Object.values(SPACING).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    it('all values are multiples of 4', () => {
      Object.values(SPACING).forEach(value => {
        expect(value % 4).toBe(0);
      });
    });
  });

  describe('BORDER_RADIUS', () => {
    it('has exactly 3 values', () => {
      const keys = Object.keys(BORDER_RADIUS);
      expect(keys.length).toBe(3);
    });

    it('has sm, md, lg keys', () => {
      expect(BORDER_RADIUS).toHaveProperty('sm');
      expect(BORDER_RADIUS).toHaveProperty('md');
      expect(BORDER_RADIUS).toHaveProperty('lg');
    });

    it('has correct values', () => {
      expect(BORDER_RADIUS.sm).toBe(4);
      expect(BORDER_RADIUS.md).toBe(8);
      expect(BORDER_RADIUS.lg).toBe(12);
    });

    it('values increase in order', () => {
      expect(BORDER_RADIUS.sm).toBeLessThan(BORDER_RADIUS.md);
      expect(BORDER_RADIUS.md).toBeLessThan(BORDER_RADIUS.lg);
    });
  });

  describe('HEIGHTS', () => {
    it('has all expected component height keys', () => {
      expect(HEIGHTS).toHaveProperty('input');
      expect(HEIGHTS).toHaveProperty('listItem');
      expect(HEIGHTS).toHaveProperty('calculator');
      expect(HEIGHTS).toHaveProperty('fab');
      expect(HEIGHTS).toHaveProperty('tabBar');
    });

    it('has correct values', () => {
      expect(HEIGHTS.input).toBe(48);
      expect(HEIGHTS.listItem).toBe(48);
      expect(HEIGHTS.calculator).toBe(44);
      expect(HEIGHTS.fab).toBe(56);
      expect(HEIGHTS.tabBar).toBe(80);
    });

    it('input height meets minimum touch target (48px)', () => {
      expect(HEIGHTS.input).toBeGreaterThanOrEqual(48);
    });

    it('list item height meets minimum touch target (48px)', () => {
      expect(HEIGHTS.listItem).toBeGreaterThanOrEqual(48);
    });
  });

  describe('Backward compatibility exports', () => {
    it('HORIZONTAL_PADDING equals SPACING.lg (16px)', () => {
      expect(HORIZONTAL_PADDING).toBe(SPACING.lg);
      expect(HORIZONTAL_PADDING).toBe(16);
    });

    it('TOP_CONTENT_SPACING equals SPACING.sm', () => {
      expect(TOP_CONTENT_SPACING).toBe(SPACING.sm);
    });
  });
});

describe('Design Tokens', () => {
  describe('FONT_SIZE', () => {
    it('has all expected size keys', () => {
      expect(FONT_SIZE).toHaveProperty('xs');
      expect(FONT_SIZE).toHaveProperty('sm');
      expect(FONT_SIZE).toHaveProperty('md');
      expect(FONT_SIZE).toHaveProperty('base');
      expect(FONT_SIZE).toHaveProperty('lg');
      expect(FONT_SIZE).toHaveProperty('xl');
      expect(FONT_SIZE).toHaveProperty('xxl');
    });

    it('has correct values', () => {
      expect(FONT_SIZE.xs).toBe(10);
      expect(FONT_SIZE.sm).toBe(12);
      expect(FONT_SIZE.md).toBe(14);
      expect(FONT_SIZE.base).toBe(16);
      expect(FONT_SIZE.lg).toBe(18);
      expect(FONT_SIZE.xl).toBe(20);
      expect(FONT_SIZE.xxl).toBe(24);
    });

    it('all values are positive numbers', () => {
      Object.values(FONT_SIZE).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    it('values increase in order', () => {
      expect(FONT_SIZE.xs).toBeLessThan(FONT_SIZE.sm);
      expect(FONT_SIZE.sm).toBeLessThan(FONT_SIZE.md);
      expect(FONT_SIZE.md).toBeLessThan(FONT_SIZE.base);
      expect(FONT_SIZE.base).toBeLessThan(FONT_SIZE.lg);
      expect(FONT_SIZE.lg).toBeLessThan(FONT_SIZE.xl);
      expect(FONT_SIZE.xl).toBeLessThan(FONT_SIZE.xxl);
    });
  });

  describe('FONT_WEIGHT', () => {
    it('has all expected weight keys', () => {
      expect(FONT_WEIGHT).toHaveProperty('regular');
      expect(FONT_WEIGHT).toHaveProperty('medium');
      expect(FONT_WEIGHT).toHaveProperty('semibold');
      expect(FONT_WEIGHT).toHaveProperty('bold');
    });

    it('has correct string values', () => {
      expect(FONT_WEIGHT.regular).toBe('400');
      expect(FONT_WEIGHT.medium).toBe('500');
      expect(FONT_WEIGHT.semibold).toBe('600');
      expect(FONT_WEIGHT.bold).toBe('700');
    });

    it('all values are numeric strings', () => {
      Object.values(FONT_WEIGHT).forEach(value => {
        expect(typeof value).toBe('string');
        expect(Number(value)).not.toBeNaN();
      });
    });
  });

  describe('ICON_SIZE', () => {
    it('has all expected size keys', () => {
      expect(ICON_SIZE).toHaveProperty('xs');
      expect(ICON_SIZE).toHaveProperty('sm');
      expect(ICON_SIZE).toHaveProperty('md');
      expect(ICON_SIZE).toHaveProperty('base');
      expect(ICON_SIZE).toHaveProperty('lg');
      expect(ICON_SIZE).toHaveProperty('xl');
    });

    it('has correct values', () => {
      expect(ICON_SIZE.xs).toBe(16);
      expect(ICON_SIZE.sm).toBe(18);
      expect(ICON_SIZE.md).toBe(22);
      expect(ICON_SIZE.base).toBe(24);
      expect(ICON_SIZE.lg).toBe(32);
      expect(ICON_SIZE.xl).toBe(48);
    });

    it('values increase in order', () => {
      expect(ICON_SIZE.xs).toBeLessThan(ICON_SIZE.sm);
      expect(ICON_SIZE.sm).toBeLessThan(ICON_SIZE.md);
      expect(ICON_SIZE.md).toBeLessThan(ICON_SIZE.base);
      expect(ICON_SIZE.base).toBeLessThan(ICON_SIZE.lg);
      expect(ICON_SIZE.lg).toBeLessThan(ICON_SIZE.xl);
    });
  });

  describe('ELEVATION', () => {
    it('has all expected elevation keys', () => {
      expect(ELEVATION).toHaveProperty('none');
      expect(ELEVATION).toHaveProperty('low');
      expect(ELEVATION).toHaveProperty('medium');
      expect(ELEVATION).toHaveProperty('high');
    });

    it('none has zero elevation', () => {
      expect(ELEVATION.none.elevation).toBe(0);
      expect(ELEVATION.none.shadowOpacity).toBe(0);
    });

    it('low has elevation 2', () => {
      expect(ELEVATION.low.elevation).toBe(2);
    });

    it('medium has elevation 3', () => {
      expect(ELEVATION.medium.elevation).toBe(3);
    });

    it('high has elevation 5', () => {
      expect(ELEVATION.high.elevation).toBe(5);
    });

    it('all elevations have required shadow properties', () => {
      Object.values(ELEVATION).forEach(el => {
        expect(el).toHaveProperty('shadowColor');
        expect(el).toHaveProperty('shadowOffset');
        expect(el).toHaveProperty('shadowOpacity');
        expect(el).toHaveProperty('shadowRadius');
        expect(el).toHaveProperty('elevation');
      });
    });

    it('shadowOffset has width and height', () => {
      Object.values(ELEVATION).forEach(el => {
        expect(el.shadowOffset).toHaveProperty('width');
        expect(el.shadowOffset).toHaveProperty('height');
      });
    });

    it('elevation values increase in order', () => {
      expect(ELEVATION.none.elevation).toBeLessThan(ELEVATION.low.elevation);
      expect(ELEVATION.low.elevation).toBeLessThan(ELEVATION.medium.elevation);
      expect(ELEVATION.medium.elevation).toBeLessThan(ELEVATION.high.elevation);
    });
  });

  describe('OPACITY', () => {
    it('has all expected opacity keys', () => {
      expect(OPACITY).toHaveProperty('disabled');
      expect(OPACITY).toHaveProperty('overlay');
      expect(OPACITY).toHaveProperty('subtle');
      expect(OPACITY).toHaveProperty('semiTransparent');
    });

    it('has correct values', () => {
      expect(OPACITY.disabled).toBe(0.5);
      expect(OPACITY.overlay).toBe(0.3);
      expect(OPACITY.subtle).toBe(0.6);
      expect(OPACITY.semiTransparent).toBe(0.12);
    });

    it('all values are between 0 and 1', () => {
      Object.values(OPACITY).forEach(value => {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('DURATION', () => {
    it('has all expected duration keys', () => {
      expect(DURATION).toHaveProperty('fastest');
      expect(DURATION).toHaveProperty('fast');
      expect(DURATION).toHaveProperty('normal');
      expect(DURATION).toHaveProperty('slow');
    });

    it('has correct values in milliseconds', () => {
      expect(DURATION.fastest).toBe(100);
      expect(DURATION.fast).toBe(200);
      expect(DURATION.normal).toBe(300);
      expect(DURATION.slow).toBe(500);
    });

    it('values increase in order', () => {
      expect(DURATION.fastest).toBeLessThan(DURATION.fast);
      expect(DURATION.fast).toBeLessThan(DURATION.normal);
      expect(DURATION.normal).toBeLessThan(DURATION.slow);
    });

    it('all values are positive numbers', () => {
      Object.values(DURATION).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe('Z_INDEX', () => {
    it('has all expected z-index keys', () => {
      expect(Z_INDEX).toHaveProperty('base');
      expect(Z_INDEX).toHaveProperty('dropdown');
      expect(Z_INDEX).toHaveProperty('sticky');
      expect(Z_INDEX).toHaveProperty('overlay');
      expect(Z_INDEX).toHaveProperty('modal');
      expect(Z_INDEX).toHaveProperty('popover');
      expect(Z_INDEX).toHaveProperty('toast');
    });

    it('has correct values', () => {
      expect(Z_INDEX.base).toBe(0);
      expect(Z_INDEX.dropdown).toBe(10);
      expect(Z_INDEX.sticky).toBe(20);
      expect(Z_INDEX.overlay).toBe(30);
      expect(Z_INDEX.modal).toBe(40);
      expect(Z_INDEX.popover).toBe(50);
      expect(Z_INDEX.toast).toBe(60);
    });

    it('values increase in proper stacking order', () => {
      expect(Z_INDEX.base).toBeLessThan(Z_INDEX.dropdown);
      expect(Z_INDEX.dropdown).toBeLessThan(Z_INDEX.sticky);
      expect(Z_INDEX.sticky).toBeLessThan(Z_INDEX.overlay);
      expect(Z_INDEX.overlay).toBeLessThan(Z_INDEX.modal);
      expect(Z_INDEX.modal).toBeLessThan(Z_INDEX.popover);
      expect(Z_INDEX.popover).toBeLessThan(Z_INDEX.toast);
    });

    it('toast has highest z-index for visibility', () => {
      const maxZIndex = Math.max(...Object.values(Z_INDEX));
      expect(Z_INDEX.toast).toBe(maxZIndex);
    });
  });
});
