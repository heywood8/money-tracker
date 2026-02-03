import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback, ScrollView, PanResponder } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { HORIZONTAL_PADDING } from '../../styles/layout';
import SimplePicker from '../SimplePicker';
import ExpensePieChart from './ExpensePieChart';
import IncomePieChart from './IncomePieChart';

/**
 * Modal component for displaying expense or income charts with category navigation
 * Supports swipe gestures to navigate back to parent category
 */
const ChartModal = ({
  visible,
  modalType,
  colors,
  t,
  onClose,
  // Category navigation
  selectedCategory,
  selectedIncomeCategory,
  categoryItems,
  incomeCategoryItems,
  onCategoryChange,
  onIncomeCategoryChange,
  categories,
  // Expense chart props
  loading,
  chartData,
  selectedCurrency,
  onExpenseLegendItemPress,
  // Income chart props
  loadingIncome,
  incomeChartData,
  onIncomeLegendItemPress,
}) => {
  // Helper function to get parent category ID
  const getParentCategoryId = useCallback((categoryId) => {
    if (categoryId === 'all') return 'all';

    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return 'all';

    // If category has no parent, go back to 'all'
    if (category.parentId === null) return 'all';

    // Otherwise, return the parent ID
    return category.parentId;
  }, [categories]);

  // Handler to navigate back to parent category
  const handleBackToParent = useCallback(() => {
    if (modalType === 'expense') {
      const parentId = getParentCategoryId(selectedCategory);
      onCategoryChange(parentId);
    } else {
      const parentId = getParentCategoryId(selectedIncomeCategory);
      onIncomeCategoryChange(parentId);
    }
  }, [modalType, selectedCategory, selectedIncomeCategory, getParentCategoryId, onCategoryChange, onIncomeCategoryChange]);

  // Pan Responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes from the left edge when not viewing "All"
        const isExpenseMode = modalType === 'expense';
        const currentCategory = isExpenseMode ? selectedCategory : selectedIncomeCategory;
        return currentCategory !== 'all' && gestureState.dx > 20 && Math.abs(gestureState.dy) < 80;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Swipe right to go back to parent category
        if (gestureState.dx > 100) {
          handleBackToParent();
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose} testID="modal-overlay">
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}} testID="modal-content-wrapper">
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]} {...panResponder.panHandlers}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  {((modalType === 'expense' && selectedCategory !== 'all') ||
                (modalType === 'income' && selectedIncomeCategory !== 'all')) && (
                    <TouchableOpacity
                      onPress={handleBackToParent}
                      style={styles.backButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('back') || 'Back to parent category'}
                      accessibilityHint="Returns to parent category level"
                    >
                      <Icon name="arrow-left" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {modalType === 'expense' ? t('expenses_by_category') : t('income_by_category')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                >
                  <Text style={[styles.closeButtonText, { color: colors.primary }]}>
                    {t('close')}
                  </Text>
                </TouchableOpacity>
              </View>

              {modalType === 'expense' && (
                <>
                  {/* Expense Category Picker - Only show when not viewing "All" */}
                  {selectedCategory !== 'all' && (
                    <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <SimplePicker
                        value={selectedCategory}
                        onValueChange={onCategoryChange}
                        items={categoryItems}
                        colors={colors}
                      />
                    </View>
                  )}

                  <ScrollView style={styles.modalScrollView}>
                    <ExpensePieChart
                      colors={colors}
                      t={t}
                      loading={loading}
                      chartData={chartData}
                      selectedCurrency={selectedCurrency}
                      onLegendItemPress={onExpenseLegendItemPress}
                      selectedCategory={selectedCategory}
                    />
                  </ScrollView>
                </>
              )}

              {modalType === 'income' && (
                <>
                  {/* Income Category Picker - Only show when not viewing "All" */}
                  {selectedIncomeCategory !== 'all' && (
                    <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <SimplePicker
                        value={selectedIncomeCategory}
                        onValueChange={onIncomeCategoryChange}
                        items={incomeCategoryItems}
                        colors={colors}
                      />
                    </View>
                  )}

                  <ScrollView style={styles.modalScrollView}>
                    <IncomePieChart
                      colors={colors}
                      t={t}
                      loadingIncome={loadingIncome}
                      incomeChartData={incomeChartData}
                      selectedCurrency={selectedCurrency}
                      onLegendItemPress={onIncomeLegendItemPress}
                      selectedIncomeCategory={selectedIncomeCategory}
                    />
                  </ScrollView>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    marginRight: 12,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalPickerWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    marginBottom: 8,
    marginHorizontal: HORIZONTAL_PADDING + 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  modalScrollView: {
    padding: HORIZONTAL_PADDING,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

ChartModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  modalType: PropTypes.oneOf(['expense', 'income']).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  selectedCategory: PropTypes.string.isRequired,
  selectedIncomeCategory: PropTypes.string.isRequired,
  categoryItems: PropTypes.array.isRequired,
  incomeCategoryItems: PropTypes.array.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
  onIncomeCategoryChange: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
  loading: PropTypes.bool.isRequired,
  chartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onExpenseLegendItemPress: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  onIncomeLegendItemPress: PropTypes.func.isRequired,
};

export default ChartModal;
