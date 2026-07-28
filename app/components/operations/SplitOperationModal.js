import React, { useState, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SPACING, BORDER_RADIUS, HEIGHTS, FONT_SIZE } from '../../styles/designTokens';
import { DURATION_ENTER } from '../../utils/motion';
import { motionDuration } from '../../utils/reducedMotion';
import ModalBlurOverlay from '../ModalBlurOverlay';
import CategoryGridSelector from '../CategoryGridSelector';
import useKeyboardOffset from '../../hooks/useKeyboardOffset';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * SplitOperationModal Component
 *
 * Modal for splitting an existing operation into multiple parts.
 * User can specify an amount and category for the split portion.
 * The split amount is deducted from the original operation.
 *
 * Validation rules:
 * - Split amount must be > 0
 * - Split amount must be < original amount (can't split entire amount)
 * - Category must be selected
 */
export default function SplitOperationModal({
  visible,
  onClose,
  onConfirm,
  originalAmount,
  operationType,
  categories,
  colors,
  t,
}) {
  const keyboardOffset = useKeyboardOffset(visible);
  const [splitAmount, setSplitAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [error, setError] = useState('');

  // Category picker slides in as an in-modal subpanel (QoL-15): 0=hidden, 1=shown.
  const pickerAnim = useRef(new Animated.Value(0)).current;

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setSplitAmount('');
      setSelectedCategoryId('');
      setError('');
      setShowCategoryPicker(false);
      pickerAnim.setValue(0);
    }
  }, [visible, pickerAnim]);

  // Get selected category name for display
  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return t('select_category');
    const category = categories.find(cat => cat.id === selectedCategoryId);
    if (!category) return t('select_category');
    return category.nameKey ? t(category.nameKey) : category.name;
  }, [selectedCategoryId, categories, t]);

  // Validate split amount
  const validateSplitAmount = useCallback((amount) => {
    const numAmount = parseFloat(amount);
    const numOriginal = parseFloat(originalAmount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return t('valid_amount_required');
    }

    if (numAmount >= numOriginal) {
      return t('split_amount_error');
    }

    return null;
  }, [originalAmount, t]);

  // Handle amount change. Normalize a locale decimal comma to a dot — Android
  // decimal-pad keyboards emit "," in many locales, and downstream currency
  // parsing coerces comma strings to garbage (parseFloat("1,5") === 1, and
  // Decimal treats the comma string as 0), silently corrupting the split amount.
  const handleAmountChange = useCallback((text) => {
    const normalized = text.replace(',', '.');
    setSplitAmount(normalized);
    setError('');
  }, []);

  // Open the category picker subpanel over the split form (QoL-15). Entry uses
  // Easing.out(Easing.cubic) per the modal subpanel convention.
  const openCategoryPicker = useCallback(() => {
    setShowCategoryPicker(true);
    Animated.timing(pickerAnim, {
      toValue: 1,
      duration: motionDuration(DURATION_ENTER),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pickerAnim]);

  // Reverse the slide, then unmount the subpanel once it settles.
  const closeCategoryPicker = useCallback(() => {
    Animated.timing(pickerAnim, {
      toValue: 0,
      duration: motionDuration(180),
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setShowCategoryPicker(false));
  }, [pickerAnim]);

  // Handle category selection
  const handleCategorySelect = useCallback((categoryId) => {
    setSelectedCategoryId(categoryId);
    setError('');
    closeCategoryPicker();
  }, [closeCategoryPicker]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    // Validate amount
    const amountError = validateSplitAmount(splitAmount);
    if (amountError) {
      setError(amountError);
      return;
    }

    // Validate category
    if (!selectedCategoryId) {
      setError(t('category_required'));
      return;
    }

    onConfirm(splitAmount, selectedCategoryId);
  }, [splitAmount, selectedCategoryId, validateSplitAmount, onConfirm, t]);

  // Empty handler for preventing event propagation
  const handleStopPropagation = useCallback(() => {}, []);

  // Subpanel slides in from the right; the overlay opacity fades it in.
  const pickerTranslateX = pickerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0],
  });

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.fullFlex} edges={['top', 'bottom']}>
          {/* Keyboard avoidance as an explicit inset — a KeyboardAvoidingView
              here shrinks itself in a loop under edge-to-edge (see
              useKeyboardOffset). */}
          <Animated.View style={[styles.fullFlex, { paddingBottom: keyboardOffset }]}>
            <Pressable style={styles.modalOverlay} onPress={onClose}>
              <Pressable
                style={[styles.modalContent, { backgroundColor: colors.card }]}
                onPress={handleStopPropagation}
              >
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t('split_transaction')}
                </Text>

                {/* Current amount info */}
                <Text style={[styles.infoText, { color: colors.mutedText }]}>
                  {t('amount')}: {originalAmount}
                </Text>

                {/* Split Amount Input */}
                <Text style={[styles.label, { color: colors.text }]}>
                  {t('split_amount')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  value={splitAmount}
                  onChangeText={handleAmountChange}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="decimal-pad"
                  testID="split-amount-input"
                />

                {/* Category Picker Button */}
                <Text style={[styles.label, { color: colors.text }]}>
                  {t('select_category')}
                </Text>
                <Pressable
                  style={[
                    styles.pickerButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  onPress={openCategoryPicker}
                  testID="category-picker-button"
                >
                  <Text style={[styles.pickerButtonText, { color: selectedCategoryId ? colors.text : colors.mutedText }]}>
                    {selectedCategoryName}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.mutedText} />
                </Pressable>

                {/* Error Message */}
                {error ? (
                  <Text style={styles.errorText} testID="error-message">{error}</Text>
                ) : null}

                {/* Action Buttons */}
                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.secondary }]}
                    onPress={onClose}
                    testID="cancel-button"
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>
                      {t('cancel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={handleConfirm}
                    testID="confirm-button"
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>
                      {t('split')}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>

            {/* Category picker as an in-modal subpanel instead of a nested Modal
                (QoL-15): it slides in over the split form within the same Modal. */}
            {showCategoryPicker && (
              <Animated.View style={[styles.pickerSubPanelOverlay, { opacity: pickerAnim }]}>
                <Pressable
                  style={styles.pickerSubPanelBackdrop}
                  onPress={closeCategoryPicker}
                  testID="category-picker-backdrop"
                />
                <Animated.View
                  style={[
                    styles.pickerModalContent,
                    styles.pickerSubPanel,
                    { backgroundColor: colors.card, transform: [{ translateX: pickerTranslateX }] },
                  ]}
                >
                  <Text style={[styles.pickerTitle, { color: colors.text }]}>
                    {t('select_category')}
                  </Text>
                  {/* The app's shared category grid — categories nest, so the
                      picker drills through folders instead of flattening them
                      into a list of equals. */}
                  <ScrollView keyboardShouldPersistTaps="handled">
                    <CategoryGridSelector
                      categories={categories}
                      categoryType={operationType}
                      selectedCategoryId={selectedCategoryId || null}
                      onSelect={handleCategorySelect}
                      colors={colors}
                      t={t}
                      testIDPrefix="category-option"
                    />
                  </ScrollView>
                  <Pressable
                    style={styles.closeButton}
                    onPress={closeCategoryPicker}
                  >
                    <Text style={[styles.closeButtonText, { color: colors.primary }]}>
                      {t('close')}
                    </Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            )}
          </Animated.View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    marginHorizontal: SPACING.xs,
    minHeight: HEIGHTS.input,
    paddingVertical: SPACING.md,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  buttonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '500',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: HEIGHTS.input,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  closeButtonText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
  },
  fullFlex: {
    flex: 1,
  },
  infoText: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.lg,
  },
  input: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.md,
    minHeight: HEIGHTS.input,
    padding: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  modalContent: {
    borderRadius: BORDER_RADIUS.lg,
    elevation: 5,
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  pickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    minHeight: HEIGHTS.input,
    padding: SPACING.md,
  },
  pickerButtonText: {
    fontSize: FONT_SIZE.base,
  },
  pickerModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    maxHeight: '70%',
    padding: SPACING.md,
    width: '90%',
  },
  pickerSubPanel: {
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pickerSubPanelBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pickerSubPanelOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pickerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
});

SplitOperationModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  originalAmount: PropTypes.string.isRequired,
  operationType: PropTypes.oneOf(['expense', 'income']).isRequired,
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    nameKey: PropTypes.string,
    icon: PropTypes.string,
    categoryType: PropTypes.string,
    type: PropTypes.string,
    isShadow: PropTypes.bool,
  })).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};
