import { foldSliceTail } from '../../app/utils/chartSlices';
import { MAX_CATEGORY_SLICES, otherSliceColor } from '../../app/styles/chartPalette';

const colors = { surface: '#ffffff', text: '#111111' };

const makeSlices = (count) =>
  Array.from({ length: count }, (_, i) => ({
    name: `Category ${i}`,
    amount: (count - i) * 10,
    color: '#2a78d6',
    categoryId: `cat-${i}`,
  }));

describe('foldSliceTail', () => {
  it('leaves a list that fits the palette untouched', () => {
    const data = makeSlices(MAX_CATEGORY_SLICES);
    expect(foldSliceTail(data, colors, 'Other')).toBe(data);
  });

  it('leaves an empty list untouched', () => {
    expect(foldSliceTail([], colors, 'Other')).toEqual([]);
  });

  it('folds the tail into a single Other slice', () => {
    const result = foldSliceTail(makeSlices(MAX_CATEGORY_SLICES + 4), colors, 'Other');

    expect(result).toHaveLength(MAX_CATEGORY_SLICES);
    const last = result[result.length - 1];
    expect(last.name).toBe('Other');
    expect(last.color).toBe(otherSliceColor(colors));
    expect(last.foldedCount).toBe(5);
  });

  it('sums the folded amounts exactly', () => {
    const data = makeSlices(MAX_CATEGORY_SLICES + 3);
    const result = foldSliceTail(data, colors, 'Other');

    const foldedTotal = data.slice(MAX_CATEGORY_SLICES - 1).reduce((sum, item) => sum + item.amount, 0);
    expect(result[result.length - 1].amount).toBe(foldedTotal);

    const total = data.reduce((sum, item) => sum + item.amount, 0);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(total);
  });

  it('makes the Other slice non-drillable', () => {
    const result = foldSliceTail(makeSlices(MAX_CATEGORY_SLICES + 1), colors, 'Other');
    expect(result[result.length - 1].categoryId).toBeUndefined();
  });

  it('keeps the head slices and their colours as they were', () => {
    const data = makeSlices(MAX_CATEGORY_SLICES + 2);
    const result = foldSliceTail(data, colors, 'Other');
    expect(result.slice(0, MAX_CATEGORY_SLICES - 1)).toEqual(data.slice(0, MAX_CATEGORY_SLICES - 1));
  });
});
