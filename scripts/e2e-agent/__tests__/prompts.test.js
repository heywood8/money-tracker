import { buildPrompt, parseAction, SYSTEM_PROMPT } from '../src/agent/prompts.js';

describe('buildPrompt', () => {
  it('returns a string', () => {
    const prompt = buildPrompt({ name: 'Test', description: 'desc' }, [], [], '/tmp/frame.png');
    expect(typeof prompt).toBe('string');
  });

  it('references the screenshot path for the Read tool', () => {
    const prompt = buildPrompt({ name: 'T', description: 'd' }, [], [], '/abs/path/frame.png');
    expect(prompt).toContain('/abs/path/frame.png');
    expect(prompt).toContain('Read tool');
  });

  it('includes scenario name and goal', () => {
    const prompt = buildPrompt({ name: 'Add expense', description: 'tap the FAB' }, [], [], '/tmp/f.png');
    expect(prompt).toContain('Add expense');
    expect(prompt).toContain('tap the FAB');
  });

  it('serializes the UI elements', () => {
    const prompt = buildPrompt({ name: 'T', description: 'd' }, [], [{ text: 'Save', bounds: [1, 2, 3, 4] }], '/tmp/f.png');
    expect(prompt).toContain('Save');
  });

  it('inlines recent action history when present', () => {
    const prompt = buildPrompt({ name: 'T', description: 'd' }, ['tap — opened Accounts', 'back'], [], '/tmp/f.png');
    expect(prompt).toContain('RECENT ACTIONS');
    expect(prompt).toContain('opened Accounts');
  });

  it('omits the history section when there is none', () => {
    const prompt = buildPrompt({ name: 'T', description: 'd' }, [], [], '/tmp/f.png');
    expect(prompt).not.toContain('RECENT ACTIONS');
  });
});

describe('parseAction', () => {
  it('parses tap action', () => {
    expect(parseAction('{"action":"tap","bounds":[10,20,110,60]}')).toEqual({ action: 'tap', bounds: [10, 20, 110, 60] });
  });

  it('parses done:bug', () => {
    const a = parseAction('{"action":"done","result":"bug","description":"oops"}');
    expect(a.result).toBe('bug');
    expect(a.description).toBe('oops');
  });

  it('extracts JSON from prose', () => {
    expect(parseAction('I see the screen. {"action":"back"}')).toEqual({ action: 'back' });
  });

  it('throws when no JSON present', () => {
    expect(() => parseAction('no json')).toThrow();
  });
});

describe('SYSTEM_PROMPT', () => {
  it('contains package name', () => { expect(SYSTEM_PROMPT).toContain('com.heywood8.monkeep'); });
  it('mentions all 5 tabs', () => {
    ['Operations', 'Accounts', 'Categories', 'Graphs', 'Planned'].forEach(tab => {
      expect(SYSTEM_PROMPT).toContain(tab);
    });
  });
});
