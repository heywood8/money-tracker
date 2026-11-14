import { lightTheme, darkTheme } from '../contexts/ThemeColorsContext';
import PennySystemColors from '../../modules/penny-system-colors';

/**
 * The colours a home-screen widget is drawn in.
 *
 * On Android 12+ the widgets the system and Google ship take their colours
 * from the phone's palette ("Material You", made from the wallpaper), so a
 * home screen reads as one. Penny's widgets follow it the same way: the card,
 * the text, the line and the window's arrows come from the system palette
 * (modules/penny-system-colors), with the shades those widgets use (Glance's
 * dynamic scheme): the card in the secondary palette's tone 95 / 20, text and
 * secondary text in the neutral palettes, the accent in the primary palette.
 *
 * What carries meaning keeps Penny's colours: a rate's rise and fall, and a
 * forecast below zero, are green and red whatever the wallpaper.
 *
 * Without a palette (Android 11 and older, an OTA bundle on a build without the
 * module, a read that failed) the widgets keep Penny's own light and dark theme.
 *
 * Widgets are pictures, drawn with the colours of that moment: the module asks
 * every widget to redraw when the palette changes (PaletteWatcher).
 */

// [palette, shade] per role, light and dark.
export const PALETTE_ROLES = {
  light: {
    surface: ['accent2', 50],
    text: ['neutral1', 900],
    mutedText: ['neutral2', 700],
    primary: ['accent1', 600],
    border: ['neutral2', 200],
  },
  dark: {
    surface: ['accent2', 800],
    text: ['neutral1', 100],
    mutedText: ['neutral2', 200],
    primary: ['accent1', 200],
    border: ['neutral2', 700],
  },
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The system palette now, or null when there is none. Never throws: the widget
 * task runs headless, and a widget that fails to draw keeps its last picture.
 *
 * @returns {Object|null} { accent1, accent2, accent3, neutral1, neutral2 }, each
 *   shade ('0' … '1000') to '#rrggbb'
 */
export const readSystemPalette = () => {
  if (!PennySystemColors?.getPalette) return null;
  try {
    const palette = PennySystemColors.getPalette();
    return palette && typeof palette === 'object' ? palette : null;
  } catch (error) {
    console.warn('[widgets] Could not read the system palette:', error?.message);
    return null;
  }
};

/**
 * The colours for one variant of a widget: Penny's theme, with the roles the
 * palette gives taken from it. A palette missing any of them is not used at
 * all, so a widget is never drawn half in one scheme and half in the other.
 *
 * @param {'light'|'dark'} theme
 * @param {Object|null} [palette] - readSystemPalette's
 * @returns {Object} A colours object, as the app's themes have
 */
export const widgetColors = (theme, palette) => {
  const scheme = theme === 'dark' ? 'dark' : 'light';
  const base = (scheme === 'dark' ? darkTheme : lightTheme).colors;
  if (!palette) return base;
  const dynamic = {};
  for (const [role, [name, shade]] of Object.entries(PALETTE_ROLES[scheme])) {
    const value = palette[name]?.[shade];
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) return base;
    dynamic[role] = value;
  }
  return { ...base, ...dynamic };
};
