import { renderHook, act } from '@testing-library/react-native';
import useSettingsPanelStack, {
  settingsPanelStackReducer,
  selectPanel,
  selectStep,
  selectParentStep,
  selectCanStepBack,
  selectStepOf,
  PANEL_ROOT_STEP,
  EMPTY_STACK,
} from '../../app/hooks/useSettingsPanelStack';

describe('settingsPanelStackReducer', () => {
  describe('open', () => {
    it('starts a panel with no nested steps at a null step', () => {
      const stack = settingsPanelStackReducer(EMPTY_STACK, { type: 'open', panel: 'logs' });
      expect(stack).toEqual([{ panel: 'logs', step: null }]);
    });

    it('starts a panel that has nested steps on its root step', () => {
      expect(settingsPanelStackReducer(EMPTY_STACK, { type: 'open', panel: 'import' }))
        .toEqual([{ panel: 'import', step: 'source' }]);
      expect(settingsPanelStackReducer(EMPTY_STACK, { type: 'open', panel: 'export' }))
        .toEqual([{ panel: 'export', step: 'list' }]);
      expect(settingsPanelStackReducer(EMPTY_STACK, { type: 'open', panel: 'notificationProcessing' }))
        .toEqual([{ panel: 'notificationProcessing', step: 'main' }]);
    });

    it('discards any previous stack rather than nesting one panel inside another', () => {
      const deep = [
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'local-list' },
      ];
      expect(settingsPanelStackReducer(deep, { type: 'open', panel: 'logs' }))
        .toEqual([{ panel: 'logs', step: null }]);
    });
  });

  describe('push', () => {
    it('steps into a nested view, carrying the current panel', () => {
      const opened = settingsPanelStackReducer(EMPTY_STACK, { type: 'open', panel: 'import' });
      const pushed = settingsPanelStackReducer(opened, { type: 'push', step: 'local-list' });
      expect(pushed).toEqual([
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'local-list' },
      ]);
    });

    it('is a no-op on an empty stack — there is no panel to step into', () => {
      expect(settingsPanelStackReducer(EMPTY_STACK, { type: 'push', step: 'local-list' }))
        .toBe(EMPTY_STACK);
    });
  });

  describe('pop', () => {
    it('steps back one level', () => {
      const stack = [
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'local-list' },
        { panel: 'import', step: 'confirm-local' },
      ];
      expect(settingsPanelStackReducer(stack, { type: 'pop' })).toEqual([
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'local-list' },
      ]);
    });

    it('leaves the root entry alone — dismissing the panel is the screen\'s call', () => {
      const root = [{ panel: 'import', step: 'source' }];
      expect(settingsPanelStackReducer(root, { type: 'pop' })).toBe(root);
    });
  });

  describe('popToRoot', () => {
    it('unwinds every nested step back to the panel root', () => {
      const stack = [
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'local-list' },
        { panel: 'import', step: 'confirm-local' },
      ];
      expect(settingsPanelStackReducer(stack, { type: 'popToRoot' }))
        .toEqual([{ panel: 'import', step: 'source' }]);
    });

    it('is a no-op on an empty stack', () => {
      expect(settingsPanelStackReducer(EMPTY_STACK, { type: 'popToRoot' })).toBe(EMPTY_STACK);
    });
  });

  describe('replace', () => {
    it('swaps the current view without deepening the stack', () => {
      const stack = [
        { panel: 'notificationProcessing', step: 'main' },
        { panel: 'notificationProcessing', step: 'templateEditor' },
      ];
      expect(settingsPanelStackReducer(stack, { type: 'replace', step: 'templates' })).toEqual([
        { panel: 'notificationProcessing', step: 'main' },
        { panel: 'notificationProcessing', step: 'templates' },
      ]);
    });
  });

  describe('swapPanel', () => {
    it('replaces the open panel wholesale, at the new panel\'s root step', () => {
      const stack = [
        { panel: 'import', step: 'source' },
        { panel: 'import', step: 'sheets-progress' },
      ];
      expect(settingsPanelStackReducer(stack, { type: 'swapPanel', panel: 'export' }))
        .toEqual([{ panel: 'export', step: 'list' }]);
    });
  });

  describe('close', () => {
    it('empties the stack', () => {
      const stack = [{ panel: 'logs', step: null }];
      expect(settingsPanelStackReducer(stack, { type: 'close' })).toEqual([]);
    });
  });

  it('ignores an unknown action', () => {
    const stack = [{ panel: 'logs', step: null }];
    expect(settingsPanelStackReducer(stack, { type: 'nonsense' })).toBe(stack);
  });
});

describe('selectors', () => {
  const stack = [
    { panel: 'import', step: 'source' },
    { panel: 'import', step: 'local-list' },
    { panel: 'import', step: 'confirm-local' },
  ];

  it('reads the current panel and step off the top entry', () => {
    expect(selectPanel(stack)).toBe('import');
    expect(selectStep(stack)).toBe('confirm-local');
  });

  it('reads the step that back will land on', () => {
    expect(selectParentStep(stack)).toBe('local-list');
    expect(selectParentStep([{ panel: 'import', step: 'source' }])).toBeNull();
  });

  it('reports nothing for an empty stack', () => {
    expect(selectPanel(EMPTY_STACK)).toBeNull();
    expect(selectStep(EMPTY_STACK)).toBeNull();
    expect(selectCanStepBack(EMPTY_STACK)).toBe(false);
  });

  it('can step back only below a nested step', () => {
    expect(selectCanStepBack(stack)).toBe(true);
    expect(selectCanStepBack([{ panel: 'import', step: 'source' }])).toBe(false);
  });

  describe('selectStepOf', () => {
    it('returns the live step for the open panel', () => {
      expect(selectStepOf(stack, 'import')).toBe('confirm-local');
    });

    it('returns the root step for a panel that is not open, so a closed panel reads as idle', () => {
      expect(selectStepOf(stack, 'export')).toBe('list');
      expect(selectStepOf(stack, 'notificationProcessing')).toBe('main');
      expect(selectStepOf(EMPTY_STACK, 'import')).toBe('source');
    });

    it('returns null for a panel with no nested steps', () => {
      expect(selectStepOf(EMPTY_STACK, 'logs')).toBeNull();
    });
  });
});

describe('useSettingsPanelStack', () => {
  it('starts closed', async () => {
    const { result } = await renderHook(() => useSettingsPanelStack());
    expect(result.current.panel).toBeNull();
    expect(result.current.canStepBack).toBe(false);
  });

  it('walks the import flow in and back out again', async () => {
    const { result } = await renderHook(() => useSettingsPanelStack());

    await act(() => result.current.open('import'));
    expect(result.current.panel).toBe('import');
    expect(result.current.step).toBe('source');
    expect(result.current.canStepBack).toBe(false);

    await act(() => result.current.push('local-list'));
    await act(() => result.current.push('confirm-local'));
    expect(result.current.step).toBe('confirm-local');
    expect(result.current.canStepBack).toBe(true);

    // Back from the confirmation lands on the list it was chosen from — the
    // stack remembers, so nothing has to map confirm-local → local-list.
    await act(() => result.current.pop());
    expect(result.current.step).toBe('local-list');

    await act(() => result.current.pop());
    expect(result.current.step).toBe('source');
    expect(result.current.canStepBack).toBe(false);
  });

  it('returns the template editor to whichever view opened it', async () => {
    const { result } = await renderHook(() => useSettingsPanelStack());

    // Opened from the feed.
    await act(() => result.current.open('notificationProcessing'));
    await act(() => result.current.push('templateEditor'));
    expect(result.current.parentStep).toBe('main');
    await act(() => result.current.pop());
    expect(result.current.step).toBe('main');

    // Opened from the templates list.
    await act(() => result.current.push('templates'));
    await act(() => result.current.push('templateEditor'));
    expect(result.current.parentStep).toBe('templates');
    await act(() => result.current.pop());
    expect(result.current.step).toBe('templates');
  });

  it('unwinds a deep flow straight to the panel root', async () => {
    const { result } = await renderHook(() => useSettingsPanelStack());
    await act(() => result.current.open('import'));
    await act(() => result.current.push('local-list'));
    await act(() => result.current.push('confirm-local'));
    await act(() => result.current.popToRoot());
    expect(result.current.step).toBe('source');
    expect(result.current.canStepBack).toBe(false);
  });

  it('closes back to nothing', async () => {
    const { result } = await renderHook(() => useSettingsPanelStack());
    await act(() => result.current.open('export'));
    await act(() => result.current.push('sheets-progress'));
    await act(() => result.current.close());
    expect(result.current.panel).toBeNull();
    // A closed panel reads as sitting on its root step, so the screen's step
    // checks stay false rather than going undefined.
    expect(result.current.stepOf('export')).toBe('list');
  });

  it('exposes every panel root step it knows about', () => {
    expect(PANEL_ROOT_STEP).toEqual({
      export: 'list',
      import: 'source',
      notificationProcessing: 'main',
    });
  });
});
