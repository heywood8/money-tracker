import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { appEvents } from '../services/eventEmitter';

/**
 * Which tab is on screen.
 *
 * Every tab stays mounted for the whole session (see SimpleTabs — navigation
 * only moves the strip, so a screen must already be laid out before a swipe can
 * uncover it). That means every screen's data hooks were live at all times, and
 * an app-wide event like OPERATION_CHANGED fanned a quick-add on the Operations
 * tab out into dozens of queries for screens nobody was looking at: the balance
 * history's ten-query net-worth pass, two trend series, the expense and income
 * donuts, the category drill-downs, the net-worth summary.
 *
 * A hidden screen now remembers that it is stale and refetches when the user
 * arrives — see {@link useTabFocusedEvent}.
 *
 * Lives above every data provider (see App.js) rather than inside SimpleTabs,
 * because the providers that need it — BudgetPlansDataContext among them — wrap
 * the navigator rather than sitting inside a tab.
 */
const TabFocusContext = createContext(null);

export const TabFocusProvider = ({ children }) => {
  // Operations is the tab the app opens on, and the only one that is real on
  // the first frame.
  const [activeTab, setActiveTab] = useState('Operations');

  const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab]);

  return (
    <TabFocusContext.Provider value={value}>
      {children}
    </TabFocusContext.Provider>
  );
};

TabFocusProvider.propTypes = { children: PropTypes.node };

/**
 * Report which tab is showing. Called by the navigator; a no-op anywhere the
 * provider is absent (an isolated render in a test).
 */
export const useSetActiveTab = () => {
  const context = useContext(TabFocusContext);
  return context?.setActiveTab ?? noop;
};

const noop = () => {};

/**
 * Whether `tabKey` is the tab on screen.
 *
 * Without the provider — an isolated render, a screen rendered outside the
 * navigator — everything reads as focused, so a component keeps its original
 * always-live behaviour instead of silently never refreshing.
 */
export const useTabFocused = (tabKey) => {
  const context = useContext(TabFocusContext);
  if (!context) return true;
  return context.activeTab === tabKey;
};

/**
 * Subscribe to an app event, but only do the work while `tabKey` is on screen.
 *
 * An event that arrives while the tab is hidden is remembered, and `refresh`
 * runs once — when the user next opens the tab — however many events landed in
 * between. A screen that is already showing behaves exactly as before.
 *
 * @param {string} tabKey - The tab this subscriber belongs to.
 * @param {string|string[]} events - Event name(s) to listen for.
 * @param {Function} refresh - Called to bring the screen up to date. Should be
 *   stable (useCallback), like any effect dependency.
 */
export const useTabFocusedEvent = (tabKey, events, refresh) => {
  const focused = useTabFocused(tabKey);
  const staleRef = useRef(false);

  // Read through a ref inside the listener so the subscription is not torn down
  // and rebuilt every time the user switches tabs.
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // Keyed on the names themselves, so a caller may pass an array literal without
  // re-subscribing on every render.
  const eventKey = Array.isArray(events) ? events.join('|') : events;
  const eventNames = useMemo(() => eventKey.split('|'), [eventKey]);

  const handle = useCallback(() => {
    if (focusedRef.current) {
      refresh();
    } else {
      staleRef.current = true;
    }
  }, [refresh]);

  useEffect(() => {
    const unsubscribes = eventNames.map(name => appEvents.on(name, handle));
    return () => { unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [eventNames, handle]);

  useEffect(() => {
    if (!focused || !staleRef.current) return;
    staleRef.current = false;
    refresh();
  }, [focused, refresh]);
};
