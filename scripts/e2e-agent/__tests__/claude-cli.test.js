import { parseCliResult } from '../src/agent/claude-cli.js';

const ok = (result) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result });

describe('parseCliResult', () => {
  it('returns the result text on success', () => {
    expect(parseCliResult(ok('{"action":"tap"}'))).toBe('{"action":"tap"}');
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCliResult(`\n${ok('hello')}\n`)).toBe('hello');
  });

  it('throws on non-JSON output', () => {
    expect(() => parseCliResult('not json at all')).toThrow(/non-JSON/);
  });

  it('throws when is_error is true', () => {
    const out = JSON.stringify({ subtype: 'error_during_execution', is_error: true, result: 'boom' });
    expect(() => parseCliResult(out)).toThrow(/error/i);
  });

  it('throws when subtype is not success', () => {
    const out = JSON.stringify({ subtype: 'error_max_turns', is_error: false, result: 'x' });
    expect(() => parseCliResult(out)).toThrow(/error/i);
  });

  it('throws when the result text is missing', () => {
    const out = JSON.stringify({ subtype: 'success', is_error: false });
    expect(() => parseCliResult(out)).toThrow(/no result/i);
  });
});
