import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * NavigationContext provides programmatic tab navigation
 * Allows screens to navigate to other tabs programmatically
 */
const NavigationContext = createContext();

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

export const NavigationProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState('Operations');

  const navigateToTab = useCallback((tabName) => {
    setActiveTab(tabName);
  }, []);

  const value = useMemo(() => ({
    activeTab,
    navigateToTab,
    setActiveTab, // Exposed for SimpleTabs to set directly
  }), [activeTab, navigateToTab]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
