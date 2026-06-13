import { buildMessages, parseAction, SYSTEM_PROMPT } from '../src/agent/prompts.js';

describe('buildMessages', () => {
  it('returns array ending with user message', () => {
    const msgs = buildMessages({ name: 'Test', description: 'desc' }, [], [], 'img');
    expect(msgs[msgs.length - 1].role).toBe('user');
  });

  it('includes image block with provided base64', () => {
    const msgs = buildMessages({ name: 'T', description: 'd' }, [], [], 'abc123');
    const img = msgs[msgs.length - 1].content.find(b => b.type === 'image');
    expect(img.source.data).toBe('abc123');
    expect(img.source.media_type).toBe('image/png');
  });

  it('includes scenario name in text block', () => {
    const msgs = buildMessages({ name: 'Add expense', description: 'test' }, [], [], 'img');
    const text = msgs[msgs.length - 1].content.find(b => b.type === 'text');
    expect(text.text).toContain('Add expense');
  });

  it('prepends conversation history', () => {
    const history = [
      { role: 'user', content: [{ type: 'text', text: 'prev' }] },
      { role: 'assistant', content: '{"action":"back"}' },
    ];
    const msgs = buildMessages({ name: 'T', description: 'd' }, history, [], 'img');
    expect(msgs).toHaveLength(3);
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
