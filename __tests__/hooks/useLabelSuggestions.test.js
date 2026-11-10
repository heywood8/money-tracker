/**
 * Tests for useLabelSuggestions — the labels already in use, fed to the
 * secondary-label editors on the notification review cards and bindings.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import useLabelSuggestions from '../../app/hooks/useLabelSuggestions';
import { getDistinctLabels } from '../../app/services/OperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/OperationsDB', () => ({
  getDistinctLabels: jest.fn(),
}));

describe('useLabelSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDistinctLabels.mockResolvedValue(['Groceries', 'Rent']);
  });

  it('reads the labels in use, ranked by the given category', async () => {
    const { result } = await renderHook(() => useLabelSuggestions('c1'));
    await waitFor(() => expect(result.current).toEqual(['Groceries', 'Rent']));
    expect(getDistinctLabels).toHaveBeenCalledWith(30, 'c1');
  });

  it('reads nothing while disabled', async () => {
    const { result } = await renderHook(() => useLabelSuggestions(null, false));
    await act(async () => { await Promise.resolve(); });
    expect(getDistinctLabels).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it.each([
    ['an operation changes', EVENTS.OPERATION_CHANGED],
    ['a booking or restore reloads everything', EVENTS.RELOAD_ALL],
  ])('re-reads when %s', async (_, event) => {
    const { result } = await renderHook(() => useLabelSuggestions());
    await waitFor(() => expect(result.current).toEqual(['Groceries', 'Rent']));

    getDistinctLabels.mockResolvedValue(['Groceries', 'Rent', 'Weekly']);
    await act(async () => { appEvents.emit(event); });
    await waitFor(() => expect(result.current).toEqual(['Groceries', 'Rent', 'Weekly']));
  });

  it('keeps the last list when a read fails', async () => {
    const { result } = await renderHook(() => useLabelSuggestions());
    await waitFor(() => expect(result.current).toEqual(['Groceries', 'Rent']));

    getDistinctLabels.mockRejectedValue(new Error('db locked'));
    await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });
    await waitFor(() => expect(getDistinctLabels).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual(['Groceries', 'Rent']);
  });
});
