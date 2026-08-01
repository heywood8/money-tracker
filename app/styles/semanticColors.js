// app/styles/semanticColors.js
/**
 * Scheme-keyed semantic colours, as plain values.
 *
 * This is a leaf module — it imports nothing. ThemeColorsContext builds its
 * palettes from it, and the few consumers that cannot read a React context
 * import it directly:
 *
 *  - ErrorBoundary renders *because* the tree below it threw, so it must not
 *    depend on a provider that lives in that tree.
 *  - StyleSheets built at module scope, which run before any provider mounts.
 *
 * Everything else reads `colors.destructive` from ThemeColorsContext.
 */

/**
 * The one red. Every "this went wrong" or "this destroys something" resolves
 * here: validation text, delete affordances, error banners, Paper's `error`
 * role. The dark value is lifted off the light one to hold contrast against a
 * near-black surface — which is exactly the distinction the call sites that
 * hardcoded `#ff6b6b` were losing, since they rendered the dark red on both
 * schemes.
 */
export const DESTRUCTIVE = {
  light: '#d9534f',
  dark: '#ff6b6b',
};
