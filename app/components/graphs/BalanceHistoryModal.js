import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { HORIZONTAL_PADDING } from '../../styles/layout';

/**
 * Modal component for displaying and editing balance history table
 * Allows inline editing of daily balances with save/cancel/delete actions
 */
const BalanceHistoryModal = ({
  visible,
  colors,
  t,
  onClose,
  balanceHistoryTableData,
  editingBalanceRow,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.modalHeaderLeft}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('balance_history_details') || 'Balance History Details'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Table */}
          <ScrollView style={styles.modalScrollView}>
            <View style={styles.balanceTable}>
              {/* Table Header */}
              <View style={[styles.balanceTableHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                  {t('date') || 'Date'}
                </Text>
                <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                  {t('balance') || 'Balance'}
                </Text>
                <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                  {t('actions') || 'Actions'}
                </Text>
              </View>

              {/* Table Rows */}
              {balanceHistoryTableData.map((row, index) => (
                <View
                  key={row.date}
                  style={[
                    styles.balanceTableRow,
                    index % 2 === 0 && { backgroundColor: colors.altRow },
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.balanceTableCell, { color: colors.text }]}>
                    {row.displayDate}
                  </Text>

                  {editingBalanceRow === row.date ? (
                    <>
                      <TextInput
                        style={[
                          styles.balanceTableInput,
                          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                        ]}
                        value={editingBalanceValue}
                        onChangeText={onEditingBalanceValueChange}
                        keyboardType="decimal-pad"
                        autoFocus
                      />
                      <View style={styles.balanceTableActions}>
                        <TouchableOpacity
                          style={[styles.balanceActionButton, { backgroundColor: colors.primary }]}
                          onPress={() => onSaveBalance(row.date)}
                        >
                          <Icon name="check" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.balanceActionButton, { backgroundColor: colors.mutedText }]}
                          onPress={onCancelEdit}
                        >
                          <Icon name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.balanceTableCell, { color: row.balance ? colors.text : colors.mutedText }]}>
                        {row.balance || '-'}
                      </Text>
                      <View style={styles.balanceTableActions}>
                        <TouchableOpacity
                          style={[styles.balanceActionButton, { backgroundColor: colors.primary }]}
                          onPress={() => onEditBalance(row.date, row.balance)}
                        >
                          <Icon name="pencil" size={16} color="#fff" />
                        </TouchableOpacity>
                        {row.balance && (
                          <TouchableOpacity
                            style={[styles.balanceActionButton, styles.deleteActionButtonBackground]}
                            onPress={() => onDeleteBalance(row.date)}
                          >
                            <Icon name="delete" size={16} color="#fff" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  balanceActionButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  balanceTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  balanceTableActions: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  balanceTableCell: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  balanceTableHeader: {
    borderBottomWidth: 2,
    flexDirection: 'row',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  balanceTableHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  balanceTableInput: {
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  balanceTableRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 4,
  },
  deleteActionButtonBackground: {
    backgroundColor: '#f44336',
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
  modalScrollView: {
    padding: HORIZONTAL_PADDING,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

BalanceHistoryModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  balanceHistoryTableData: PropTypes.array.isRequired,
  editingBalanceRow: PropTypes.string,
  editingBalanceValue: PropTypes.string.isRequired,
  onEditingBalanceValueChange: PropTypes.func.isRequired,
  onEditBalance: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveBalance: PropTypes.func.isRequired,
  onDeleteBalance: PropTypes.func.isRequired,
};

export default BalanceHistoryModal;
