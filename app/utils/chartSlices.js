import { MAX_CATEGORY_SLICES, otherSliceColor } from '../styles/chartPalette';

/**
 * Fold everything past the palette's capacity into a single "Other" slice.
 *
 * Cycling the palette for a ninth category hands two different categories the
 * same colour in the same chart, which is worse than not colouring them apart at
 * all — the reader has no way to know the repeat is a repeat. The tail is
 * summed instead, and the legend still carries the exact figure.
 *
 * Expects `data` sorted by amount descending; returns it untouched when it fits.
 *
 * @param {Array} data - Slice objects ({ name, amount, color, ... })
 * @param {Object} colors - Theme colours (picks the neutral for the current mode)
 * @param {string} label - Translated label for the folded slice
 * @returns {Array} Slices, at most MAX_CATEGORY_SLICES of them
 */
export const foldSliceTail = (data, colors, label) => {
  if (data.length <= MAX_CATEGORY_SLICES) return data;

  const head = data.slice(0, MAX_CATEGORY_SLICES - 1);
  const tail = data.slice(MAX_CATEGORY_SLICES - 1);

  return [
    ...head,
    {
      name: label,
      amount: tail.reduce((sum, item) => sum + item.amount, 0),
      color: otherSliceColor(colors),
      legendFontColor: colors.text,
      legendFontSize: 13,
      icon: null,
      // No categoryId: "Other" is an aggregate, so it must not be drillable.
      foldedCount: tail.length,
    },
  ];
};
