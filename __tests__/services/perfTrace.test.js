import { SLOW_PHASE_MS, startTrace, traceAsync } from '../../app/services/perfTrace';

describe('perfTrace', () => {
  let debugSpy;
  let nowSpy;
  let clock;

  // Drive Date.now() by hand so a phase's "duration" is exact rather than a
  // function of how fast the test machine happens to be.
  const advance = (ms) => { clock += ms; };

  beforeEach(() => {
    clock = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    nowSpy.mockRestore();
    debugSpy.mockRestore();
  });

  describe('traceAsync', () => {
    it('returns the wrapped value and stays silent when the call is fast', async () => {
      const result = await traceAsync('fast.thing', async () => 'value');
      expect(result).toBe('value');
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('logs the label and duration once the call trips the threshold', async () => {
      await traceAsync('slow.thing', async () => { advance(SLOW_PHASE_MS + 120); });
      expect(debugSpy).toHaveBeenCalledWith(`[perf] slow.thing ${SLOW_PHASE_MS + 120}ms`);
    });

    it('logs regardless of duration when asked to always log', async () => {
      await traceAsync('always.thing', async () => {}, { always: true });
      expect(debugSpy).toHaveBeenCalledWith('[perf] always.thing 0ms');
    });

    it('honours a caller-supplied threshold', async () => {
      await traceAsync('tuned.thing', async () => { advance(30); }, { threshold: 10 });
      expect(debugSpy).toHaveBeenCalledWith('[perf] tuned.thing 30ms');
    });

    it('re-throws the original error and still times the failed call', async () => {
      const boom = new Error('boom');
      await expect(
        traceAsync('failing.thing', async () => { advance(500); throw boom; }),
      ).rejects.toBe(boom);
      expect(debugSpy).toHaveBeenCalledWith('[perf] failing.thing 500ms threw');
    });
  });

  describe('startTrace', () => {
    it('logs a phase breakdown for a slow run', () => {
      const trace = startTrace('panel.open');
      advance(20);
      trace.mark('templates');
      advance(900);
      trace.mark('lists');
      trace.end('(items=3)');
      expect(debugSpy).toHaveBeenCalledWith(
        '[perf] panel.open total=920ms [templates=20ms lists=900ms] (items=3)',
      );
    });

    it('reports whatever ran after the last mark as a trailing phase', () => {
      // Otherwise the breakdown stops short of the total and the unnamed tail —
      // the part nobody thought to mark — reads as a gap to subtract by hand.
      const trace = startTrace('panel.open');
      advance(20);
      trace.mark('templates');
      advance(880);
      trace.end();
      expect(debugSpy).toHaveBeenCalledWith(
        '[perf] panel.open total=900ms [templates=20ms rest=880ms]',
      );
    });

    it('honours a threshold passed to end(), overriding the trace default', () => {
      const trace = startTrace('idle.pass');
      advance(400);
      trace.end('(nothing to do)', { threshold: 3000 });
      expect(debugSpy).not.toHaveBeenCalled();

      const slow = startTrace('idle.pass');
      advance(3200);
      slow.end('(nothing to do)', { threshold: 3000 });
      expect(debugSpy).toHaveBeenCalledWith('[perf] idle.pass total=3200ms (nothing to do)');
    });

    it('stays silent for a run that finishes under the threshold', () => {
      const trace = startTrace('panel.open');
      advance(10);
      trace.mark('templates');
      trace.end();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('returns the total so a caller can act on it', () => {
      const trace = startTrace('panel.open');
      advance(42);
      expect(trace.end()).toBe(42);
    });

    it('logs without a breakdown when no phase was marked', () => {
      const trace = startTrace('one.shot');
      advance(700);
      trace.end();
      expect(debugSpy).toHaveBeenCalledWith('[perf] one.shot total=700ms');
    });
  });
});
