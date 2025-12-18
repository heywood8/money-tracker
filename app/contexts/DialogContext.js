import React, { createContext, useContext, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import MaterialDialog from '../components/MaterialDialog';

const DialogContext = createContext();

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);

  /**
   * Show a dialog (replaces Alert.alert)
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Array} buttons - Array of button configs: { text, onPress, style }
   */
  const showDialog = useCallback((title, message, buttons = [{ text: 'OK' }]) => {
    setDialog({ title, message, buttons });
  }, []);

  const hideDialog = useCallback(() => {
    setDialog(null);
  }, []);

  return (
    <DialogContext.Provider value={{ showDialog, hideDialog }}>
      {children}
      {dialog && (
        <MaterialDialog
          visible={!!dialog}
          title={dialog.title}
          message={dialog.message}
          buttons={dialog.buttons}
          onDismiss={hideDialog}
        />
      )}
    </DialogContext.Provider>
  );
};

DialogProvider.propTypes = {
  children: PropTypes.node,
};
