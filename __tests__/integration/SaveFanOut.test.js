/**
 * Issue #1705: one save fanned out into dozens of queries.
 *
 * Every tab stays mounted for the whole session, and every screen's data hooks
 * listened to OPERATION_CHANGED, so a quick-add on the Operations tab ran the
 * balance history's net-worth pass, two trend series, the expense and income
 * donuts, two category drill-downs, the net-worth summary and the whole
 * plan-status walk — for screens nobody was looking at.
 *
 * This counts what each of those hooks actually asks the database for while its
 * tab is hidden, and what it asks for when the user arrives.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  TabFocusProvider,
  useSetActiveTab,
  useTabFocusedEvent,
} from '../../app/contexts/TabFocusContext';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.unmock('../../app/services/eventEmitter');

// Stands in for the Graphs/Budgets/Accounts data hooks: each is "some queries,
// fired on OPERATION_CHANGED".
const makeScreen = (tabKey, queryCount, db) => () => {
  const refresh = React.useCallback(async () => {
    for (let i = 0; i < queryCount; i += 1) db.query(tabKey);
  }, []);
  useTabFocusedEvent(tabKey, EVENTS.OPERATION_CHANGED, refresh);
};

describe('a save on the Operations tab', () => {
  const db = { query: jest.fn() };

  // Roughly what the issue counted: ten for the net-worth balance history, two
  // trend series, the two donuts and two drill-downs on Graphs; the plan-status
  // walk on Budgets; the month query on Accounts.
  const GRAPHS_QUERIES = 16;
  const BUDGET_QUERIES = 8;
  const ACCOUNTS_QUERIES = 1;

  const wrapper = ({ children }) => <TabFocusProvider>{children}</TabFocusProvider>;

  const renderApp = async () => await renderHook(() => {
    makeScreen('Graphs', GRAPHS_QUERIES, db)();
    makeScreen('Budget', BUDGET_QUERIES, db)();
    makeScreen('Accounts', ACCOUNTS_QUERIES, db)();
    return useSetActiveTab();
  }, { wrapper });

  beforeEach(() => { db.query.mockClear(); });

  it('issues no query for a hidden tab', async () => {
    await renderApp();

    await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

    expect(db.query).not.toHaveBeenCalled();
  });

  it('still issues none after a burst of saves', async () => {
    await renderApp();

    await act(async () => {
      for (let i = 0; i < 5; i += 1) appEvents.emit(EVENTS.OPERATION_CHANGED);
    });

    expect(db.query).not.toHaveBeenCalled();
  });

  it('refreshes only the tab the user opens, and only once', async () => {
    const { result } = await renderApp();

    await act(async () => {
      for (let i = 0; i < 5; i += 1) appEvents.emit(EVENTS.OPERATION_CHANGED);
    });
    await act(async () => { result.current('Graphs'); });

    await waitFor(() => expect(db.query).toHaveBeenCalledTimes(GRAPHS_QUERIES));
    expect(db.query.mock.calls.every(([tab]) => tab === 'Graphs')).toBe(true);

    // Budgets and Accounts are still untouched until the user goes there.
    await act(async () => { result.current('Budget'); });
    await waitFor(() => expect(db.query).toHaveBeenCalledTimes(GRAPHS_QUERIES + BUDGET_QUERIES));
  });

  it('refreshes a visible tab immediately, as before', async () => {
    const { result } = await renderApp();
    await act(async () => { result.current('Graphs'); });
    db.query.mockClear();

    await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

    expect(db.query).toHaveBeenCalledTimes(GRAPHS_QUERIES);
  });
});
