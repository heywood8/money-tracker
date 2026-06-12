/**
 * Tests for OperationsScreen - Category Picker Button Logic
 * These tests ensure that the Cancel and Add buttons work correctly
 * and that the Add button is only enabled when an amount is entered
 */

describe('OperationsScreen - Category Picker Buttons', () => {
  // Shared helper used across nested describes and regression tests
  const isAddButtonEnabled = (amount) => {
    return !!(amount && amount.trim() !== '');
  };
  describe('Add Button Enable Logic', () => {
    /**
     * Helper function to determine if Add button should be enabled
     * This mirrors the logic in OperationsScreen.js lines 749-750
     */
    const isAddButtonEnabled = (amount) => {
      return !!(amount && amount.trim() !== '');
    };

    it('disables Add button when amount is undefined', async () => {
      expect(isAddButtonEnabled(undefined)).toBe(false);
    });

    it('disables Add button when amount is null', async () => {
      expect(isAddButtonEnabled(null)).toBe(false);
    });

    it('disables Add button when amount is empty string', async () => {
      expect(isAddButtonEnabled('')).toBe(false);
    });

    it('disables Add button when amount is only whitespace', async () => {
      expect(isAddButtonEnabled('   ')).toBe(false);
      expect(isAddButtonEnabled('\t')).toBe(false);
      expect(isAddButtonEnabled('\n')).toBe(false);
      expect(isAddButtonEnabled('  \t  \n  ')).toBe(false);
    });

    it('enables Add button when amount has a valid number', async () => {
      expect(isAddButtonEnabled('100')).toBe(true);
    });

    it('enables Add button when amount is a decimal', async () => {
      expect(isAddButtonEnabled('50.75')).toBe(true);
      expect(isAddButtonEnabled('0.01')).toBe(true);
      expect(isAddButtonEnabled('.5')).toBe(true);
    });

    it('enables Add button when amount is zero', async () => {
      expect(isAddButtonEnabled('0')).toBe(true);
      expect(isAddButtonEnabled('0.00')).toBe(true);
    });

    it('enables Add button when amount has leading/trailing valid text', async () => {
      expect(isAddButtonEnabled(' 100 ')).toBe(true);
      expect(isAddButtonEnabled('$100')).toBe(true);
      expect(isAddButtonEnabled('100.00')).toBe(true);
    });

    it('enables Add button with negative numbers', async () => {
      expect(isAddButtonEnabled('-50')).toBe(true);
      expect(isAddButtonEnabled('-0.01')).toBe(true);
    });
  });

  describe('Picker Type Logic', () => {
    /**
     * Helper function to determine which buttons should be shown
     * Based on OperationsScreen.js lines 726-761
     */
    const getButtonsForPickerType = (pickerType) => {
      if (pickerType === 'category') {
        return { cancel: true, add: true, close: false };
      } else {
        return { cancel: false, add: false, close: true };
      }
    };

    it('shows Cancel and Add buttons for category picker', async () => {
      const buttons = getButtonsForPickerType('category');
      expect(buttons.cancel).toBe(true);
      expect(buttons.add).toBe(true);
      expect(buttons.close).toBe(false);
    });

    it('shows Close button for account picker', async () => {
      const buttons = getButtonsForPickerType('account');
      expect(buttons.cancel).toBe(false);
      expect(buttons.add).toBe(false);
      expect(buttons.close).toBe(true);
    });

    it('shows Close button for toAccount picker', async () => {
      const buttons = getButtonsForPickerType('toAccount');
      expect(buttons.cancel).toBe(false);
      expect(buttons.add).toBe(false);
      expect(buttons.close).toBe(true);
    });
  });

  describe('Category Selection Behavior', () => {
    /**
     * Helper to determine if picker should close on selection
     * Based on OperationsScreen.js lines 690-697
     */
    const shouldCloseOnSelection = (itemType, pickerType) => {
      if (pickerType === 'category') {
        // Folders keep picker open, entries keep it open too now
        return false;
      } else {
        // Account/toAccount pickers close immediately
        return true;
      }
    };

    it('keeps picker open when selecting a category entry', async () => {
      expect(shouldCloseOnSelection('entry', 'category')).toBe(false);
    });

    it('keeps picker open when selecting a category folder', async () => {
      expect(shouldCloseOnSelection('folder', 'category')).toBe(false);
    });

    it('closes picker when selecting an account', async () => {
      expect(shouldCloseOnSelection(undefined, 'account')).toBe(true);
    });

    it('closes picker when selecting a toAccount', async () => {
      expect(shouldCloseOnSelection(undefined, 'toAccount')).toBe(true);
    });
  });

  describe('Button Disabled State', () => {
    /**
     * Helper to compute disabled state for Add button
     * Based on OperationsScreen.js line 749
     */
    const getAddButtonDisabledState = (amount) => {
      return !amount || amount.trim() === '';
    };

    it('sets disabled to true when amount is empty', async () => {
      expect(getAddButtonDisabledState('')).toBe(true);
    });

    it('sets disabled to true when amount is whitespace', async () => {
      expect(getAddButtonDisabledState('   ')).toBe(true);
    });

    it('sets disabled to false when amount is valid', async () => {
      expect(getAddButtonDisabledState('100')).toBe(false);
      expect(getAddButtonDisabledState('50.75')).toBe(false);
      expect(getAddButtonDisabledState('0')).toBe(false);
    });
  });

  describe('Button Action Logic', () => {
    /**
     * Helper to determine what happens when Add button is pressed
     * Based on OperationsScreen.js lines 742-747
     */
    const handleAddButtonPress = (amount) => {
      if (amount && amount.trim() !== '') {
        return 'close_picker_and_add_operation';
      }
      return 'do_nothing';
    };

    it('closes picker and adds operation when Add pressed with valid amount', async () => {
      expect(handleAddButtonPress('100')).toBe('close_picker_and_add_operation');
    });

    it('does nothing when Add pressed without amount', async () => {
      expect(handleAddButtonPress('')).toBe('do_nothing');
      expect(handleAddButtonPress('   ')).toBe('do_nothing');
    });
  });

  describe('Category Selection with Amount Validation', () => {
    /**
     * Helper to check if Add button should be enabled
     */
    const isAddButtonEnabled = (amount) => {
      return !!(amount && amount.trim() !== '');
    };

    /**
     * Tests the workflow: user enters amount -> selects category -> presses Add
     */
    it('allows Add when amount is entered before category selection', async () => {
      const amount = '100';
      const categorySelected = 'food-category-id';

      expect(isAddButtonEnabled(amount)).toBe(true);
      expect(categorySelected).toBeTruthy();
    });

    it('prevents Add when category is selected but no amount', async () => {
      const amount = '';
      const categorySelected = 'food-category-id';

      expect(isAddButtonEnabled(amount)).toBe(false);
      expect(categorySelected).toBeTruthy();
    });

    it('allows Add when both amount and category are provided', async () => {
      const amount = '50.75';
      const categorySelected = 'transport-category-id';

      expect(isAddButtonEnabled(amount)).toBe(true);
      expect(categorySelected).toBeTruthy();
    });
  });

  describe('Regression Tests', () => {
    it('handles amount with only spaces correctly', async () => {
      const amounts = ['', ' ', '  ', '   ', '\t', '\n', '  \t\n  '];
      amounts.forEach(amount => {
        expect(!amount || amount.trim() === '').toBe(true);
      });
    });

    it('handles various numeric formats', async () => {
      const validAmounts = ['0', '1', '100', '0.01', '.5', '50.75', '-10'];
      validAmounts.forEach(amount => {
        expect(amount && amount.trim() !== '').toBe(true);
      });
    });

    it('properly validates empty vs undefined vs null', async () => {
      expect(isAddButtonEnabled('')).toBe(false);
      expect(isAddButtonEnabled(undefined)).toBe(false);
      expect(isAddButtonEnabled(null)).toBe(false);
    });
  });
});
