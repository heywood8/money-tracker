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

  it('fetches live rate from primary API', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        date: '2025-06-01',
        usd: { eur: 0.93, gbp: 0.80 },
      }),
    });

    const result = await fetchLiveExchangeRate('USD', 'EUR');

    expect(result).toEqual({ rate: '0.93', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('cdn.jsdelivr.net');
  });

  it('falls back to secondary API when primary fails', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          date: '2025-06-01',
          usd: { eur: 0.93 },
        }),
      });

    const result = await fetchLiveExchangeRate('USD', 'EUR');

    expect(result).toEqual({ rate: '0.93', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('currency-api.pages.dev');
  });

  it('falls back to offline rate when both APIs fail', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchLiveExchangeRate('USD', 'EUR');

    expect(result).toEqual({ rate: '0.92', source: 'offline' });
  });

  it('returns none when both APIs fail and no offline rate exists', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchLiveExchangeRate('USD', 'JPY');

    expect(result).toEqual({ rate: null, source: 'none' });
  });

  it('uses cache on subsequent calls', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        date: '2025-06-01',
        usd: { eur: 0.93, gbp: 0.80 },
      }),
    });

    // First call - fetches from API
    const result1 = await fetchLiveExchangeRate('USD', 'EUR');
    expect(result1).toEqual({ rate: '0.93', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - uses cache
    const result2 = await fetchLiveExchangeRate('USD', 'GBP');
    expect(result2).toEqual({ rate: '0.8', source: 'live' });
    expect(global.fetch).toHaveBeenCalledTimes(1); // No additional fetch
  });

  it('clears cache with clearExchangeRateCache', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        date: '2025-06-01',
        usd: { eur: 0.93 },
      }),
    });

    await fetchLiveExchangeRate('USD', 'EUR');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    clearExchangeRateCache();

    await fetchLiveExchangeRate('USD', 'EUR');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles non-ok HTTP response from primary, succeeds with fallback', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          date: '2025-06-01',
          usd: { eur: 0.93 },
        }),
      });

    const result = await fetchLiveExchangeRate('USD', 'EUR');
    expect(result).toEqual({ rate: '0.93', source: 'live' });
  });

  it('handles missing target currency in API response', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          date: '2025-06-01',
          usd: { gbp: 0.80 }, // No EUR
        }),
      })
      .mockRejectedValueOnce(new Error('Fallback also fails'));

    // USD->EUR not in API response, no offline rate for missing pair
    const result = await fetchLiveExchangeRate('USD', 'EUR');
    // Should fall back to offline since EUR is in offline rates
    expect(result).toEqual({ rate: '0.92', source: 'offline' });
  });

  describe('failed-lookup backoff', () => {
    // Regression: only successes were remembered, so with no working connection
    // every call paid the full two-URL timeout (5 s each). Bank-notification
    // ingestion converts in a loop, which turned an offline batch into minutes of
    // waiting for an answer the bundled offline table already had.
    const failBothUrls = () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));
    };

    it('still retries the network after a single failure', async () => {
      // One flaky request must not switch a batch onto the bundled offline
      // snapshot: the converted amount is written into an operation for good.
      failBothUrls();
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
      expect(global.fetch).toHaveBeenCalledTimes(2);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ date: '2025-06-01', usd: { eur: 0.93 } }),
      });
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('skips the network once the lookups have failed twice in a row', async () => {
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(4);

      // Third call answers from the offline table without touching the network.
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });
      expect(global.fetch).toHaveBeenCalledTimes(4);

      // …and so does a different pair off the same base currency.
      expect(await fetchLiveExchangeRate('USD', 'GBP')).toEqual({ rate: '0.79', source: 'offline' });
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('still tries the network for a different base currency', async () => {
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(4);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ date: '2025-06-01', eur: { usd: 1.11 } }),
      });
      expect(await fetchLiveExchangeRate('EUR', 'USD')).toEqual({ rate: '1.11', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('tries the network again once the backoff window has passed', async () => {
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(4);

      jest.advanceTimersByTime(60 * 1000 + 1);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ date: '2025-06-01', usd: { eur: 0.93 } }),
      });
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('does not back off when the table loaded but simply lacks the pair', async () => {
      // A base currency that answered is not a failed lookup — its table is
      // cached, and the missing pair is a fact about the data, not the network.
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ date: '2025-06-01', usd: { gbp: 0.80 } }),
        })
        .mockRejectedValueOnce(new Error('Fallback also fails'));
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.92', source: 'offline' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ date: '2025-06-01', usd: { eur: 0.93 } }),
      });
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
    });

    it('is cleared by clearExchangeRateCache', async () => {
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      failBothUrls();
      await fetchLiveExchangeRate('USD', 'EUR');
      expect(global.fetch).toHaveBeenCalledTimes(4);

      clearExchangeRateCache();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ date: '2025-06-01', usd: { eur: 0.93 } }),
      });
      expect(await fetchLiveExchangeRate('USD', 'EUR')).toEqual({ rate: '0.93', source: 'live' });
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });
  });

  it('converts currency codes to lowercase for API calls', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        date: '2025-06-01',
        usd: { eur: 0.93 },
      }),
    });

    await fetchLiveExchangeRate('USD', 'EUR');

    expect(global.fetch.mock.calls[0][0]).toContain('/usd.min.json');
  });
});
