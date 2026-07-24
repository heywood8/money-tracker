import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import Calculator from '../Calculator';
import FormInput from '../FormInput';
import ModalBlurOverlay from '../ModalBlurOverlay';
import ModalHeader from '../ModalHeader';
import * as Currency from '../../services/currency';

/**
 * BudgetPlanLineModal — editor for a monthly plan's expected income (mode
 * 'income') or a single allocation line (mode 'line'). Follows the repo's
 * subpanel pattern (see CLAUDE.md): the tracking-target picker slides in over
 * the form inside the SAME modal — never a nested Modal.
 *
 * A line tracks EXACTLY ONE target: an expense category OR a destination account
 * (transfer). That invariant is enforced here (a target is required to save) and
 * again in BudgetPlansDB.
 */
export default function BudgetPlanLineModal({
  visible = false,
  mode = 'line',
  line = null,
  currency = 'USD',
  initialIncome = '0',
  expenseCategories = [],
  accounts = [],
  onSaveLine = () => {},
  onSaveIncome = () => {},
  onDeleteLine = () => {},
  onClose = () => {},
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();

  const isIncome = mode === 'income';
  const isEditingLine = mode === 'line' && line != null;

  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [comment, setComment] = useState('');
  // Exactly one of these is set (the "exactly one target" invariant).
  const [categoryId, setCategoryId] = useState(null);
  const [toAccountId, setToAccountId] = useState(null);
  const [error, setError] = useState(null);

  // Subpanel navigation for the target picker.
  const [activeSubPanel, setActiveSubPanel] = useState(null); // null | 'target'
  // Which kind of target the picker is currently showing.
  const [pickerKind, setPickerKind] = useState('category'); // 'category' | 'account'
  const mainAnim = useRef(new Animated.Value(0)).current;
  const subPanelAnim = useRef(new Animated.Value(0)).current;

  const accountsById = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(expenseCategories.map(c => [c.id, c])),
    [expenseCategories],
  );

  // Initialize form each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (isIncome) {
      setAmount(initialIncome != null ? String(initialIncome) : '');
      // Clear line-only fields so nothing bleeds in from a prior line-edit session.
      setLabel('');
      setComment('');
      setCategoryId(null);
      setToAccountId(null);
      return;
    }
    if (line) {
      setAmount(line.amount != null ? String(line.amount) : '');
      setLabel(line.label || '');
      setComment(line.comment || '');
      setCategoryId(line.categoryId ?? null);
      setToAccountId(line.toAccountId ?? null);
    } else {
      setAmount('');
      setLabel('');
      setComment('');
      setCategoryId(null);
      setToAccountId(null);
    }
  }, [visible, isIncome, line, initialIncome]);

  // Reset subpanel + animations whenever the modal is hidden.
  useEffect(() => {
    if (!visible) {
      setActiveSubPanel(null);
      mainAnim.setValue(0);
      subPanelAnim.setValue(0);
    }
  }, [visible, mainAnim, subPanelAnim]);

  const openSubPanel = useCallback(() => {
    Keyboard.dismiss();
    // Open the picker on the tab matching the current selection.
    setPickerKind(toAccountId != null ? 'account' : 'category');
    setActiveSubPanel('target');
    Animated.parallel([
      Animated.timing(mainAnim, {
        toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(subPanelAnim, {
        toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [mainAnim, subPanelAnim, toAccountId]);

  const closeSubPanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(subPanelAnim, {
        toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(mainAnim, {
        toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start(() => setActiveSubPanel(null));
  }, [subPanelAnim, mainAnim]);

  const handleSelectCategory = useCallback((cat) => {
    setCategoryId(cat.id);
    setToAccountId(null);
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  const handleSelectAccount = useCallback((acc) => {
    setToAccountId(acc.id);
    setCategoryId(null);
    setError(null);
    closeSubPanel();
  }, [closeSubPanel]);

  const amountIsValid = Currency.isValid(amount) && Currency.compare(amount, '0') > 0;
  const hasTarget = categoryId != null || toAccountId != null;

  const handleSave = useCallback(() => {
    Keyboard.dismiss();
    if (isIncome) {
      // Income may be zero; it just must be a valid non-negative number.
      if (!Currency.isValid(amount) || Currency.isNegative(amount)) {
        setError(t('amount_must_be_greater_than_zero'));
        return;
      }
      onSaveIncome(String(amount));
      return;
    }
    if (!hasTarget) {
      setError(t('allocation_needs_target'));
      return;
    }
    if (!amountIsValid) {
      setError(t('amount_must_be_greater_than_zero'));
      return;
    }
    onSaveLine({
      amount: String(amount),
      label: label.trim() || null,
      comment: comment.trim() || null,
      categoryId: categoryId ?? null,
      toAccountId: toAccountId ?? null,
    });
  }, [isIncome, amount, hasTarget, amountIsValid, label, comment, categoryId, toAccountId, onSaveLine, onSaveIncome, t]);

  const handleDelete = useCallback(() => {
    if (!isEditingLine) return;
    showDialog(
      t('delete_allocation'),
      t('delete_allocation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => onDeleteLine(line.id),
        },
      ],
    );
  }, [isEditingLine, showDialog, t, onDeleteLine, line]);

  const handleRequestClose = useCallback(() => {
    if (activeSubPanel) {
      closeSubPanel();
    } else {
      onClose();
    }
  }, [activeSubPanel, closeSubPanel, onClose]);

  // Selected-target summary for the picker row on the main form.
  const targetSummary = useMemo(() => {
    if (categoryId != null) {
      const cat = categoriesById.get(categoryId);
      return { icon: cat?.icon || 'shape-outline', name: cat?.name || t('allocation_unlinked') };
    }
    if (toAccountId != null) {
      const acc = accountsById.get(toAccountId);
      return { icon: 'bank-transfer', name: acc?.name || t('allocation_unlinked') };
    }
    return null;
  }, [categoryId, toAccountId, categoriesById, accountsById, t]);

  const panelWidth = Dimensions.get('window').width;
  const subPanelTranslateX = subPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });
  const mainTranslateX = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const mainOpacity = mainAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const renderTargetItem = useCallback(({ item }) => {
    const isCat = pickerKind === 'category';
    const selected = isCat ? categoryId === item.id : toAccountId === item.id;
    return (
      <Pressable
        onPress={() => (isCat ? handleSelectCategory(item) : handleSelectAccount(item))}
        style={({ pressed }) => [
          styles.pickerOption,
          { borderColor: colors.border },
          pressed && { backgroundColor: colors.selected },
          selected && { backgroundColor: colors.selected },
        ]}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        testID={`plan-target-option-${isCat ? 'cat' : 'acc'}-${item.id}`}
      >
        <Icon name={isCat ? (item.icon || 'shape-outline') : 'bank-transfer'} size={22} color={colors.text} />
        <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
    );
  }, [pickerKind, categoryId, toAccountId, colors, handleSelectCategory, handleSelectAccount]);

  const title = isIncome
    ? t('edit_income')
    : (isEditingLine ? t('edit_allocation') : t('add_allocation'));

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleRequestClose}
        testID="plan-line-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <Pressable style={styles.modalOverlay} onPress={onClose}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
              <Animated.View
                style={[styles.mainContent, { opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }]}
              >
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <ModalHeader title={title} />

                  {/* Tracking target (line mode only) */}
                  {!isIncome && (
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                        {t('tracking_target')}
                      </Text>
                      <Pressable
                        style={[styles.targetButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                        onPress={openSubPanel}
                        accessibilityRole="button"
                        accessibilityLabel={t('select_target')}
                        testID="plan-target-picker"
                      >
                        {targetSummary ? (
                          <View style={styles.targetValue}>
                            <Icon name={targetSummary.icon} size={20} color={colors.text} />
                            <Text style={[styles.text16, { color: colors.text }]} numberOfLines={1}>
                              {targetSummary.name}
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.text16, { color: colors.mutedText }]}>
                            {t('select_target')}
                          </Text>
                        )}
                        <Icon name="chevron-right" size={20} color={colors.mutedText} />
                      </Pressable>
                    </View>
                  )}

                  {/* Amount */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                      {t('amount')}
                    </Text>
                    <Calculator
                      value={amount}
                      onValueChange={setAmount}
                      colors={colors}
                      placeholder="0"
                      currencyCode={currency}
                      containerBackground={colors.card}
                    />
                  </View>

                  {/* Label + comment (line mode only) */}
                  {!isIncome && (
                    <>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                          {t('allocation_label')} · {t('optional')}
                        </Text>
                        <FormInput
                          value={label}
                          onChangeText={setLabel}
                          placeholder={targetSummary?.name || t('allocation_label')}
                          testID="plan-line-label"
                        />
                      </View>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                          {t('allocation_comment')} · {t('optional')}
                        </Text>
                        <FormInput
                          value={comment}
                          onChangeText={setComment}
                          placeholder={t('allocation_comment')}
                          multiline
                          numberOfLines={2}
                          testID="plan-line-comment"
                        />
                      </View>
                    </>
                  )}

                  {error && (
                    <Text style={[styles.error, { color: colors.danger }]} testID="plan-line-error">
                      {error}
                    </Text>
                  )}

                  {isEditingLine && (
                    <Pressable
                      style={[styles.deleteRow, { borderTopColor: colors.border }]}
                      onPress={handleDelete}
                      accessibilityRole="button"
                      accessibilityLabel={t('delete_allocation')}
                      testID="plan-line-delete"
                    >
                      <Icon name="delete-outline" size={20} color={colors.delete || colors.danger} />
                      <Text style={[styles.deleteText, { color: colors.delete || colors.danger }]}>
                        {t('delete_allocation')}
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>

                <View style={[styles.buttonRow, { backgroundColor: colors.card }]}>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.secondary }]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('cancel')}
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel={t('save')}
                    testID="plan-line-save"
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>{t('save')}</Text>
                  </Pressable>
                </View>
              </Animated.View>

              {/* Target picker subpanel (slides in over the form) */}
              {activeSubPanel === 'target' && (
                <Animated.View
                  testID="plan-target-subpanel"
                  style={[
                    styles.subPanel,
                    { backgroundColor: colors.card },
                    { opacity: subPanelAnim, transform: [{ translateX: subPanelTranslateX }] },
                  ]}
                >
                  <View style={styles.subPanelHeader}>
                    <Pressable
                      onPress={closeSubPanel}
                      style={styles.subPanelBack}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('back')}
                      testID="plan-target-back"
                    >
                      <Icon name="arrow-left" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.subPanelTitle, { color: colors.text }]}>{t('select_target')}</Text>
                  </View>

                  {/* Two-mode toggle: expense category OR destination account */}
                  <View style={styles.segment}>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        { borderColor: colors.border },
                        pickerKind === 'category' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setPickerKind('category')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pickerKind === 'category' }}
                      accessibilityLabel={t('category_target')}
                      testID="plan-target-tab-category"
                    >
                      <Text style={[styles.segmentText, { color: pickerKind === 'category' ? colors.text : colors.mutedText }]}>
                        {t('category_target')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        { borderColor: colors.border },
                        pickerKind === 'account' && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setPickerKind('account')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: pickerKind === 'account' }}
                      accessibilityLabel={t('transfer_target')}
                      testID="plan-target-tab-account"
                    >
                      <Text style={[styles.segmentText, { color: pickerKind === 'account' ? colors.text : colors.mutedText }]}>
                        {t('transfer_target')}
                      </Text>
                    </Pressable>
                  </View>

                  <FlatList
                    data={pickerKind === 'category' ? expenseCategories : accounts}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderTargetItem}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={(
                      <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                        {pickerKind === 'category' ? t('no_categories') : t('no_accounts')}
                      </Text>
                    )}
                  />
                </Animated.View>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

BudgetPlanLineModal.propTypes = {
  visible: PropTypes.bool,
  mode: PropTypes.oneOf(['line', 'income']),
  line: PropTypes.shape({
    id: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
    comment: PropTypes.string,
    categoryId: PropTypes.string,
    toAccountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  currency: PropTypes.string,
  initialIncome: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  expenseCategories: PropTypes.array,
  accounts: PropTypes.array,
  onSaveLine: PropTypes.func,
  onSaveIncome: PropTypes.func,
  onDeleteLine: PropTypes.func,
  onClose: PropTypes.func,
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  deleteRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    marginTop: 8,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  flex1: {
    flex: 1,
  },
  mainContent: {
    flexShrink: 1,
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    elevation: 5,
    flexDirection: 'column',
    maxHeight: '85%',
    minHeight: '55%',
    overflow: 'hidden',
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
  optionText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  pickerOption: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subPanel: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
  },
  subPanelBack: {
    marginRight: 8,
    padding: 4,
  },
  subPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  subPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  targetButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  targetValue: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  text16: {
    fontSize: 16,
  },
});
