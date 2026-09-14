import React from 'react';
import { render } from '@testing-library/react-native';
import OperationFormFields from '../../app/components/operations/OperationFormFields';
import { FONT_SIZE } from '../../app/styles/designTokens';

jest.mock('../../app/components/Calculator', () => 'Calculator');
jest.mock('../../app/components/modals/MultiCurrencyFields', () => 'MultiCurrencyFields');

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({ hideBalances: false }),
}));

/**
 * The type selector's three buttons (expense / income / transfer) share their
 * row with the quick-add date chip, so quick-add renders them in a `tight`
 * variant that gives up padding and steps the label down one size.
 *
 * The chip's first version made that step with `adjustsFontSizeToFit` plus a
 * `minimumFontScale` floor. Android under the New Architecture ignores the
 * floor and autosizes a flex-shrinking Text down to its own minimum, so all
 * three labels rendered as a few-pixel superscript pinned to the top of the
 * button — the row read as three bare icons. These tests pin the step to an
 * explicit font size, which measures the same on both platforms and here.
 *
 * A separate file rather than a block in OperationFormFields.test.js: that
 * suite's later renders do not find the type labels when they run after its
 * animation tests, and this behaviour deserves an unpolluted tree. The sibling
 * OperationFormFields.rerender.test.js splits off for the same reason.
 */

const colors = {
  text: '#000',
  primary: '#007AFF',
  border: '#ccc',
  background: '#fff',
  altRow: '#f5f5f5',
  inputBackground: '#fff',
  inputBorder: '#ddd',
  mutedText: '#666',
  selected: '#a8d0f5',
};

const TYPES = [
  { key: 'expense', label: 'Expense', icon: 'minus-circle' },
  { key: 'income', label: 'Income', icon: 'plus-circle' },
  { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
];

const accounts = [{ id: '1', name: 'USD Account', currency: 'USD', balance: '1000' }];

const defaultProps = {
  colors,
  t: (key) => key,
  values: {
    type: 'expense',
    amount: '100',
    accountId: '1',
    categoryId: 'cat1',
    toAccountId: '',
    exchangeRate: '',
    destinationAmount: '',
  },
  setValues: jest.fn(),
  accounts,
  categories: [],
  getAccountName: () => 'USD Account',
  getCategoryName: () => 'select_category',
  openPicker: jest.fn(),
  onAmountChange: jest.fn(),
  TYPES,
};

// `render` resolves asynchronously under this project's RNTL setup.
const renderFields = (props = {}) => render(<OperationFormFields {...defaultProps} {...props} />);

// The label Text is the only node in a type button carrying the label string.
const labelStyle = (getByText, label) => {
  const flat = [].concat(getByText(label).props.style).flat(Infinity).filter(Boolean);
  return Object.assign({}, ...flat);
};

describe('OperationFormFields type selector labels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders every type label as text', async () => {
      const { getByText } = await renderFields();

      TYPES.forEach(({ label }) => expect(getByText(label)).toBeTruthy());
    });

    it('renders the labels at the full font size without the date chip', async () => {
      const { getByText } = await renderFields();

      TYPES.forEach(({ label }) => {
        expect(labelStyle(getByText, label).fontSize).toBe(FONT_SIZE.md);
      });
    });

    it('steps the labels down one size when the date chip shares the row', async () => {
      const { getByText } = await renderFields({ showDateChip: true });

      TYPES.forEach(({ label }) => {
        expect(labelStyle(getByText, label).fontSize).toBe(FONT_SIZE.sm);
      });
    });
  });

  describe('Regression Tests', () => {
    it('never asks the platform to autosize the labels', async () => {
      const { getByText } = await renderFields({ showDateChip: true });

      TYPES.forEach(({ label }) => {
        const node = getByText(label);
        expect(node.props.adjustsFontSizeToFit).toBeFalsy();
        expect(node.props.minimumFontScale).toBeUndefined();
      });
    });

    it('keeps the labels on a single line with a tail ellipsis', async () => {
      const { getByText } = await renderFields({ showDateChip: true });

      TYPES.forEach(({ label }) => {
        const node = getByText(label);
        expect(node.props.numberOfLines).toBe(1);
        expect(node.props.ellipsizeMode).toBe('tail');
      });
    });

    // A label small enough to read as a superscript is the bug itself: whichever
    // variant renders, the type labels stay at a legible size.
    it('never renders a label below the smallest label size, chip absent', async () => {
      const { getByText } = await renderFields();

      TYPES.forEach(({ label }) => {
        expect(labelStyle(getByText, label).fontSize).toBeGreaterThanOrEqual(FONT_SIZE.sm);
      });
    });

    it('never renders a label below the smallest label size, chip present', async () => {
      const { getByText } = await renderFields({ showDateChip: true });

      TYPES.forEach(({ label }) => {
        expect(labelStyle(getByText, label).fontSize).toBeGreaterThanOrEqual(FONT_SIZE.sm);
      });
    });
  });
});
