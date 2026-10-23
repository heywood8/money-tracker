import { fetchLiveExchangeRate, clearExchangeRateCache } from '../../app/services/currency';

// We need to mock the exchange-rates.json import used by getExchangeRate
jest.mock('../../assets/exchange-rates.json', () => ({
  lastUpdated: '2025-01-26',
  rates: {
    USD: { EUR: 0.92, GBP: 0.79 },
    EUR: { USD: 1.09 },
  },
}));

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  GBP: { symbol: '£', decimal_digits: 2 },
}));

// The live table as Frankfurter v2 returns it: one row per quote, all off USD.
const usdTable = (quotes) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(
    Object.entries(quotes).map(([quote, rate]) => ({ date: '2026-10-23', base: 'USD', quote, rate })),
  ),
});

describe('fetchLiveExchangeRate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    clearExchangeRateCache();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.fetch;
  });

  it('returns rate 1.0 for same currency', async () => {
    const result = await fetchLiveExchangeRate('USD', 'USD');
    expect(result).toEqual({ rate: '1.0', source: 'live' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns none for null inputs', async () => {
    expect(await fetchLiveExchangeRate(null, 'EUR')).toEqual({ rate: null, source: 'none' });
    expect(await fetchLiveExchangeRate('USD', null)).toEqual({ rate: null, source: 'none' });
    expect(await fetchLiveExchangeRate(null, null)).toEqual({ rate: null, source: 'none' });
  });

  it('fetches the USD-based live table from Frankfurter', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93, GBP: 0.8 }));

    const result = await fetchLiveExchangeRate('USD', 'EUR');

    expect(result).toEqual({ rate: '0.93', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.frankfurter.dev/v2/rates?base=USD');
  });

  it('reads a pair without USD as a cross rate off the same table', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ RUB: 81.55, AMD: 361.0 }));

    const result = await fetchLiveExchangeRate('RUB', 'AMD');

    expect(result.source).toBe('live');
    expect(Number(result.rate)).toBeCloseTo(361.0 / 81.55, 8);
    // Still one request: the base of the conversion no longer picks the URL.
    expect(global.fetch.mock.calls[0][0]).toContain('base=USD');
  });

  it('keeps the precision a weak-to-strong pair loses when asked directly', async () => {
    // Regression guard: Frankfurter rounds AMD → USD to 0.00277 when AMD is the
    // base. Read off the USD table it keeps the digits a large transfer needs.
    global.fetch.mockResolvedValueOnce(usdTable({ AMD: 361.0 }));

    const result = await fetchLiveExchangeRate('AMD', 'USD');

    expect(result).toEqual({ rate: '0.002770083102', source: 'live' });
  });

  it('falls back to the offline rate when the API fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchLiveExchangeRate('USD', 'EUR');

    expect(result).toEqual({ rate: '0.92', source: 'offline' });
  });

  it('returns none when the API fails and no offline rate exists', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchLiveExchangeRate('USD', 'JPY');

    expect(result).toEqual({ rate: null, source: 'none' });
  });

  it('falls back to offline rates on a non-ok HTTP response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });

    expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
  });

  it('treats a response that is not a rate list as a failed lookup', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ usd: { eur: 0.93 } }) });

    expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
  });

  it('uses cache on subsequent calls, whatever the pair', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93, GBP: 0.8 }));

    expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
    expect(await fetchLiveExchangeRate('USD', 'GBP')).toEqual({ rate: '0.8', source: 'live' });
    expect((await fetchLiveExchangeRate('EUR', 'GBP')).source).toBe('live');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cached table is an hour old', async () => {
    global.fetch
      .mockResolvedValueOnce(usdTable({ EUR: 0.93 }))
      .mockResolvedValueOnce(usdTable({ EUR: 0.95 }));

    await fetchLiveExchangeRate('USD', 'EUR');
    jest.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.95', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93, GBP: 0.8 }));

    const [eur, gbp] = await Promise.all([
      fetchLiveExchangeRate('USD', 'EUR'),
      fetchLiveExchangeRate('USD', 'GBP'),
    ]);

    expect(eur).toEqual({ rate: '0.93', source: 'live' });
    expect(gbp).toEqual({ rate: '0.8', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('clears cache with clearExchangeRateCache', async () => {
    global.fetch.mockResolvedValue(usdTable({ EUR: 0.93 }));

    await fetchLiveExchangeRate('USD', 'EUR');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    clearExchangeRateCache();

    await fetchLiveExchangeRate('USD', 'EUR');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the offline rate when the table does not quote the pair', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ GBP: 0.8 })); // No EUR

    expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
    // The table loaded, so the next pair it does quote is answered from cache.
    expect(await fetchLiveExchangeRate('USD', 'GBP')).toEqual({ rate: '0.8', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  describe('failed-lookup backoff', () => {
    // Regression: only successes were remembered, so with no working connection
    // every call paid the full timeout. Bank-notification ingestion converts in
    // a loop, which turned an offline batch into minutes of waiting for an
    // answer the bundled offline table already had.
    const failOnce = () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
    };

    it('still retries the network after a single failure', async () => {
      // One flaky request must not switch a batch onto the bundled offline
      // snapshot: the converted amount is written into an operation for good.
      failOnce();
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('counts one failed request once, however many callers shared it', async () => {
      failOnce();
      await Promise.all([
        fetchLiveExchangeRate('USD', 'EUR'),
        fetchLiveExchangeRate('USD', 'GBP'),
        fetchLiveExchangeRate('EUR', 'USD'),
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Three callers, one failure: the backoff is not armed yet.
      global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('skips the network once the lookups have failed twice in a row', async () => {
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Third call answers from the offline table without touching the network.
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
      // …and so does any other pair, since one table serves them all.
      expect(await fetchLiveExchangeRate('USD', 'GBP')).toEqual({ rate: '0.79', source: 'offline' });
      expect(await fetchLiveExchangeRate('EUR', 'USD')).toEqual({ rate: '1.09', source: 'offline' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('tries the network again once the backoff window has passed', async () => {
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(60 * 1000 + 1);

      global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('does not back off when the table loaded but simply lacks the pair', async () => {
      // A table that answered is not a failed lookup — the missing pair is a
      // fact about the data, not the network.
      global.fetch.mockResolvedValueOnce(usdTable({ GBP: 0.8 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });

      jest.advanceTimersByTime(60 * 60 * 1000 + 1);
      global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
    });

    it('is cleared by clearExchangeRateCache', async () => {
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      failOnce();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      clearExchangeRateCache();

      global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  it('accepts lowercase currency codes', async () => {
    global.fetch.mockResolvedValueOnce(usdTable({ EUR: 0.93 }));

    expect(await fetchLiveExchangeRate('usd', 'eur')).toEqual({ rate: '0.93', source: 'live' });
  });
});
