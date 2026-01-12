import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { OperationsDataProvider, useOperationsData } from './OperationsDataContext';
import { OperationsActionsProvider, useOperationsActions } from './OperationsActionsContext';

/**
 * DEPRECATED: This file provides backward compatibility wrappers.
 *
 * OperationsContext has been split into two separate contexts:
 * - OperationsDataContext (frequently-changing data)
 * - OperationsActionsContext (stable action functions)
 *
 * New code should import useOperationsData and useOperationsActions directly.
 * This wrapper is maintained for backward compatibility with existing tests.
 *
 * Migration guide:
 * Before:
 *   const { operations, loading, addOperation, updateOperation } = useOperations();
 *
 * After:
 *   const { operations, loading } = useOperationsData();
 *   const { addOperation, updateOperation } = useOperationsActions();
 */

/**
 * Deprecated hook that combines both data and actions.
 * Use useOperationsData() and useOperationsActions() separately instead.
 */
export const useOperations = () => {
  const data = useOperationsData();
  const actions = useOperationsActions();

  return {
    ...data,
    ...actions,
  };
};

/**
 * Deprecated provider that wraps both split contexts.
 * Use OperationsDataProvider and OperationsActionsProvider directly in App.js.
 */
export const OperationsProvider = ({ children }) => {
  return (
    <OperationsDataProvider>
      <OperationsActionsProvider>
        {children}
      </OperationsActionsProvider>
    </OperationsDataProvider>
  );
};

OperationsProvider.propTypes = {
  children: PropTypes.node,
};
