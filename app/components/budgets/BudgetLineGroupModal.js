import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Keyboard,
} from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import useKeyboardOffset from '../../hooks/useKeyboardOffset';
import FormInput from '../FormInput';
import ModalBlurOverlay from '../ModalBlurOverlay';
import ModalHeader from '../ModalHeader';
import * as Currency from '../../services/currency';

// The overlay carries the keyboard inset, so it has to be animatable.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * BudgetLineGroupModal — editor for a GROUP of budget lines (migration 0022).
 *
 * A group has two properties worth editing and nothing else: its name, and
 * whether its budget is DERIVED (the sum of the lines inside it, which is the
 * default and needs no input at all) or an explicit figure the user sets. The
 * derived sum is printed next to the toggle so the override is typed with the
 * number it replaces in view.
 *
 * Membership is not edited here — a line joins a group from the line's own
 * editor, where the rest of what that line is already lives. Deleting the group
 * therefore only dissolves the envelope: every line inside it survives, ungrouped,
 * which is what the confirmation says.
 */
export default function BudgetLineGroupModal({
  visible = false,
  group = null,
  currency = 'USD',
  currencyOptions = [],
  derivedTotal = null,
  saving = false,
  onSave = () => {},
  onDelete = () => {},
  onClose = () => {},
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  // Lifts the card above the keyboard. NOT a KeyboardAvoidingView — see the
  // hook's own note for what that one does inside a Modal under edge-to-edge.
  const keyboardOffset = useKeyboardOffset(visible);

  const isEditing = group != null;

  const [label, setLabel] = useState('');
  const [customBudget, setCustomBudget] = useState(false);
  const [amount, setAmount] = useState('');
  const [groupCurrency, setGroupCurrency] = useState(currency);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (group) {
      setLabel(group.label || '');
      setCustomBudget(!group.isDerived);
      setAmount(group.amount != null ? String(group.amount) : '');
      setGroupCurrency(group.currency || currency);
    } else {
      setLabel('');
      setCustomBudget(false);
      setAmount('');
      setGroupCurrency(currency);
    }
  }, [visible, group, currency]);

  // The plan's own currency is always offered even when no account uses it, and
  // an existing group keeps its own in the list — the same rule the line editor
  // follows, for the same reason (an account may since have been closed).
  const currencies = useMemo(() => {
    const set = new Set(currencyOptions);
    if (currency) set.add(currency);
    if (group?.currency) set.add(group.currency);
    return [...set];
  }, [currencyOptions, currency, group]);

  const handleAmountChange = useCallback((text) => {
    // Android decimal-pad keyboards emit "," in most locales; every amount field
    // in the app normalizes it the same way.
    setAmount(text.replace(/,/g, '.'));
    setError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (saving) return;
    Keyboard.dismiss();
    if (!label.trim()) {
      setError(t('group_name_required'));
      return;
    }
    if (customBudget) {
      if (!Currency.isValid(amount)) {
        setError(t('valid_amount_required'));
        return;
      }
      if (Currency.compare(amount, '0') <= 0) {
        setError(t('amount_must_be_greater_than_zero'));
        return;
      }
    }
    onSave({
      label: label.trim(),
      // null puts the group back on its derived total — and clears the stored
      // currency with it (see BudgetPlansDB.updateLineGroup).
      amount: customBudget ? String(amount) : null,
      currency: customBudget ? groupCurrency : null,
    });
  }, [saving, label, customBudget, amount, groupCurrency, onSave, t]);

  const handleDelete = useCallback(() => {
    if (!isEditing) return;
    showDialog(
      t('delete_group'),
      t('delete_group_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => onDelete(group.id) },
      ],
    );
  }, [isEditing, showDialog, t, onDelete, group]);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
        testID="plan-group-modal"
      >
        <AnimatedPressable
          style={[styles.modalOverlay, { paddingBottom: keyboardOffset }]}
          onPress={onClose}
        >
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <ModalHeader title={isEditing ? t('edit_group') : t('new_group')} />

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                  {t('group_name')}
                </Text>
                <FormInput
                  value={label}
                  onChangeText={(text) => { setLabel(text); setError(null); }}
                  placeholder={t('group_name')}
                  testID="plan-group-name"
                />
              </View>

              {/* Derived by default: the group is worth what its lines are
                  worth, and that figure keeps itself up to date. The toggle is
                  for the case where the envelope has a size of its own. */}
              <Pressable
                style={[styles.toggleRow, { borderColor: colors.border }]}
                onPress={() => { setCustomBudget(v => !v); setError(null); }}
                accessibilityRole="switch"
                accessibilityState={{ checked: customBudget }}
                accessibilityLabel={t('custom_group_budget')}
                testID="plan-group-custom-toggle"
              >
                <View style={styles.toggleLabel}>
                  <Icon name="pencil-outline" size={20} color={colors.text} />
                  <Text style={[styles.text16, { color: colors.text }]}>
                    {t('custom_group_budget')}
                  </Text>
                </View>
                <View style={[styles.switchTrack, { backgroundColor: customBudget ? colors.primary : colors.border }]}>
                  <View style={[styles.switchThumb, { transform: [{ translateX: customBudget ? 18 : 2 }] }]} />
                </View>
              </Pressable>

              {!customBudget && (
                <Text style={[styles.fieldHint, { color: colors.mutedText }]} testID="plan-group-derived-hint">
                  {t('group_budget_derived_hint')}
                  {derivedTotal != null ? ` · ${Currency.formatAmount(derivedTotal, currency)} ${currency}` : ''}
                </Text>
              )}

              {customBudget && (
                <>
                  {currencies.length > 0 && (
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>{t('currency')}</Text>
                      <View style={styles.currencyRow}>
                        {currencies.map((code) => (
                          <Pressable
                            key={code}
                            style={[
                              styles.currencyChip,
                              { borderColor: colors.border },
                              groupCurrency === code && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setGroupCurrency(code)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: groupCurrency === code }}
                            accessibilityLabel={code}
                            testID={`plan-group-currency-${code}`}
                          >
                            <Text style={[styles.currencyChipText, { color: colors.text }]}>{code}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>
                      {t('amount')}{groupCurrency ? ` · ${groupCurrency}` : ''}
                    </Text>
                    <FormInput
                      value={amount}
                      onChangeText={handleAmountChange}
                      placeholder={derivedTotal != null ? String(derivedTotal) : '0'}
                      keyboardType="decimal-pad"
                      testID="plan-group-amount"
                    />
                    <Text style={[styles.fieldHint, { color: colors.mutedText }]}>
                      {t('group_budget_override_hint')}
                    </Text>
                  </View>
                </>
              )}

              {error && (
                <Text style={[styles.error, { color: colors.danger }]} testID="plan-group-error">
                  {error}
                </Text>
              )}

              {isEditing && (
                <Pressable
                  style={[styles.deleteRow, { borderTopColor: colors.border }]}
                  onPress={handleDelete}
                  accessibilityRole="button"
                  accessibilityLabel={t('delete_group')}
                  testID="plan-group-delete"
                >
                  <Icon name="delete-outline" size={20} color={colors.delete || colors.danger} />
                  <Text style={[styles.deleteText, { color: colors.delete || colors.danger }]}>
                    {t('delete_group')}
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
                style={[styles.button, { backgroundColor: colors.primary }, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('save')}
                accessibilityState={{ disabled: saving, busy: saving }}
                testID="plan-group-save"
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>{t('save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </AnimatedPressable>
      </Modal>
    </>
  );
}

BudgetLineGroupModal.propTypes = {
  visible: PropTypes.bool,
  group: PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string,
    amount: PropTypes.string,
    currency: PropTypes.string,
    isDerived: PropTypes.bool,
  }),
  currency: PropTypes.string,
  currencyOptions: PropTypes.arrayOf(PropTypes.string),
  derivedTotal: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  saving: PropTypes.bool,
  onSave: PropTypes.func,
  onDelete: PropTypes.func,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  currencyChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  error: {
    fontSize: 13,
    marginTop: 8,
  },
  field: {
    marginBottom: 16,
  },
  fieldHint: {
    fontSize: 11,
    marginBottom: 12,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  modalContent: {
    borderRadius: 12,
    elevation: 5,
    maxHeight: '85%',
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
  scrollContent: {
    padding: 20,
    paddingBottom: 12,
  },
  switchThumb: {
    backgroundColor: '#fff',
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  switchTrack: {
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 36,
  },
  text16: {
    fontSize: 16,
  },
  toggleLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  toggleRow: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 12,
  },
});
