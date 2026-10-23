import {
  buildRatesUrl,
  fetchRates,
  parseRateRows,
  RateSourceError,
} from '../../app/services/frankfurter';

describe('frankfurter', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('buildRatesUrl leaves empty parameters out', () => {
    expect(buildRatesUrl({ base: 'USD', quotes: 'RUB', from: '2026-10-01', group: null }))
      .toBe('https://api.frankfurter.dev/v2/rates?base=USD&quotes=RUB&from=2026-10-01');
    expect(buildRatesUrl()).toBe('https://api.frankfurter.dev/v2/rates');
  });

  it('parseRateRows keeps only usable rates', () => {
    expect(parseRateRows({ rates: {} })).toEqual([]);
    expect(parseRateRows([
      { date: '2026-10-23', base: 'USD', quote: 'RUB', rate: 81.55 },
      { date: '2026-10-23', base: 'USD', quote: 'XXX', rate: 0 },
      { date: '2026-10-23', base: 'USD', quote: 'YYY', rate: '1' },
      null,
    ])).toEqual([{ date: '2026-10-23', base: 'USD', quote: 'RUB', rate: 81.55 }]);
  });

  it('fetchRates returns the parsed rows', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ date: '2026-10-23', base: 'USD', quote: 'RUB', rate: 81.55 }]),
    });

    await expect(fetchRates({ base: 'USD' })).resolves.toHaveLength(1);
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  it.each([
    ['a network failure', () => Promise.reject(new Error('offline')), 'network'],
    ['a server error', () => Promise.resolve({ ok: false, status: 503 }), 'network'],
    ['a refused currency', () => Promise.resolve({ ok: false, status: 422 }), 'unsupported'],
    ['malformed JSON', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('x')) }), 'invalid'],
    ['a non-list body', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 200 }) }), 'invalid'],
  ])('fetchRates reports %s as %s', async (_label, respond, code) => {
    global.fetch.mockImplementation(respond);

    const error = await fetchRates({ base: 'USD' }).catch((e) => e);
    expect(error).toBeInstanceOf(RateSourceError);
    expect(error.code).toBe(code);
  });
});
