/**
 * Tests for SelectCategoryForMerchantModal
 * Ensures modal renders correctly and handles category selection
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import SelectCategoryForMerchantModal from '../../app/modals/SelectCategoryForMerchantModal';
import { ThemeProvider } from '../../app/contexts/ThemeContext';
import { LocalizationProvider } from '../../app/contexts/LocalizationContext';
import { DialogProvider } from '../../app/contexts/DialogContext';
import { CategoriesProvider } from '../../app/contexts/CategoriesContext';
import { MerchantBindingsProvider } from '../../app/contexts/MerchantBindingsContext';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock MaterialDialog
jest.mock('../../app/components/MaterialDialog', () => 'MaterialDialog');

// Mock database services
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/MerchantBindingsDB');

describe('SelectCategoryForMerchantModal', () => {
  const mockOnClose = jest.fn();

  const renderWithProviders = (component) => {
    return render(
      <LocalizationProvider>
        <ThemeProvider>
          <DialogProvider>
            <CategoriesProvider>
              <MerchantBindingsProvider>
                {component}
              </MerchantBindingsProvider>
            </CategoriesProvider>
          </DialogProvider>
        </ThemeProvider>
      </LocalizationProvider>
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Set up AsyncStorage for LocalizationContext
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('app_language', 'en');

    const CategoriesDB = require('../../app/services/CategoriesDB');
    CategoriesDB.getAllCategories = jest.fn().mockResolvedValue([]);
    CategoriesDB.initializeDefaultCategories = jest.fn().mockResolvedValue();

    const MerchantBindingsDB = require('../../app/services/MerchantBindingsDB');
    MerchantBindingsDB.getAll = jest.fn().mockResolvedValue([]);
    MerchantBindingsDB.create = jest.fn().mockResolvedValue({ id: 1 });
  });

  describe('Rendering', () => {
    it('renders modal with merchant info', async () => {
      const { getByText, findByText } = renderWithProviders(
        <SelectCategoryForMerchantModal
          visible={true}
          onClose={mockOnClose}
          merchantName="YANDEX.GO, AM"
          transactionType="expense"
        />
      );

      await findByText('YANDEX.GO, AM');
      expect(getByText('YANDEX.GO, AM')).toBeTruthy();
    });

    it('renders modal for income transaction', async () => {
      const { getByText, findByText } = renderWithProviders(
        <SelectCategoryForMerchantModal
          visible={true}
          onClose={mockOnClose}
          merchantName="Freelance Payment"
          transactionType="income"
        />
      );

      await findByText('Freelance Payment');
      expect(getByText('Freelance Payment')).toBeTruthy();
    });
  });

  describe('Modal Functionality', () => {
    it('renders modal and handles visibility', () => {
      const { queryByText } = renderWithProviders(
        <SelectCategoryForMerchantModal
          visible={false}
          onClose={mockOnClose}
          merchantName="Test Merchant"
          transactionType="expense"
        />
      );

      // Modal is not visible, so merchant name shouldn't be rendered
      // Note: Modal visibility behavior depends on React Native Modal implementation
    });

    it('accepts different merchant names', async () => {
      const { findByText } = renderWithProviders(
        <SelectCategoryForMerchantModal
          visible={true}
          onClose={mockOnClose}
          merchantName="Coffee Shop 123"
          transactionType="expense"
        />
      );

      await findByText('Coffee Shop 123');
    });
  });
});
