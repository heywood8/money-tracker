import { fetchGoogleQuotes } from '../../app/services/googleFinance';

// jest.setup.js stubs this module for every other test; this one tests it.
jest.unmock('../../app/services/marketRate');
jest.mock('../../app/services/googleFinance', () => ({ fetchGoogleQuotes: jest.fn() }));

const {
  clearMarketRateCache,
  fetchMarketRate,
  isNearReference,
  peekMarketRate,
  MARKET_RATE_TTL_MS,
} = jest.requireActual('../../app/services/marketRate');

const NOW = 1793014260000;
const quotes = (entries) => new Map(Object.entries(entries));

describe('marketRate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMarketRateCache();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    fetchGoogleQuotes.mockResolvedValue(quotes({ 'RUB-AMD': 4.4683 }));
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  it('fetches the quote and says when', async () => {
    await expect(fetchMarketRate('RUB', 'AMD')).resolves.toEqual({ rate: 4.4683, at: NOW });
    expect(fetchGoogleQuotes).toHaveBeenCalledWith([['RUB', 'AMD']]);
  });

  it('reuses a fresh quote, and asks again once it is old or when forced', async () => {
    await fetchMarketRate('RUB', 'AMD');
    await fetchMarketRate('rub', 'amd');
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(1);

    await fetchMarketRate('RUB', 'AMD', { force: true });
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(2);

    Date.now.mockReturnValue(NOW + MARKET_RATE_TTL_MS + 1);
    await fetchMarketRate('RUB', 'AMD');
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(3);
  });

  it('shares one request between callers asking at once', async () => {
    await Promise.all([fetchMarketRate('RUB', 'AMD'), fetchMarketRate('RUB', 'AMD')]);
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(1);
  });

  it('drops a quote too far from the reference', async () => {
    // Regression guard: Google's thin weekend quotes for RUB → AMD sat 5–8% off.
    fetchGoogleQuotes.mockResolvedValue(quotes({ 'RUB-AMD': 4.0433 }));

    await expect(fetchMarketRate('RUB', 'AMD', { reference: 4.35 })).resolves.toBeNull();
    await expect(fetchMarketRate('RUB', 'AMD', { reference: 4.10 })).resolves.toMatchObject({ rate: 4.0433 });
  });

  it('answers no quote for a pair Google does not quote, and remembers it', async () => {
    fetchGoogleQuotes.mockResolvedValue(quotes({}));
    await expect(fetchMarketRate('XXX', 'YYY')).resolves.toBeNull();
    await expect(fetchMarketRate('XXX', 'YYY')).resolves.toBeNull();
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(1);
    await expect(fetchMarketRate('USD', 'USD')).resolves.toBeNull();
  });

  it('stops asking for a pair for a minute after it failed, unless forced', async () => {
    fetchGoogleQuotes.mockRejectedValueOnce(new Error('offline'));

    await expect(fetchMarketRate('RUB', 'AMD')).resolves.toBeNull();
    await expect(fetchMarketRate('RUB', 'AMD')).resolves.toBeNull();
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(1);

    // Another pair is not held back by it.
    fetchGoogleQuotes.mockResolvedValueOnce(quotes({ 'USD-RUB': 80.62 }));
    await expect(fetchMarketRate('USD', 'RUB')).resolves.toMatchObject({ rate: 80.62 });

    await expect(fetchMarketRate('RUB', 'AMD', { force: true })).resolves.toMatchObject({ rate: 4.4683 });
  });

  it('isNearReference holds a rate to 3% of a reference, and rejects without one', () => {
    expect(isNearReference(4.4683, 4.4703)).toBe(true);
    expect(isNearReference(4.0433, 4.35)).toBe(false);
    expect(isNearReference(4.4683, undefined)).toBe(false);
  });

  it('peeks at a fetched quote without the network', async () => {
    expect(peekMarketRate('RUB', 'AMD')).toBeNull();
    await fetchMarketRate('RUB', 'AMD');

    Date.now.mockReturnValue(NOW + MARKET_RATE_TTL_MS * 10);
    expect(peekMarketRate('RUB', 'AMD')).toEqual({ rate: 4.4683, at: NOW });
    expect(peekMarketRate('RUB', 'AMD', { reference: 4.0 })).toBeNull();
    expect(fetchGoogleQuotes).toHaveBeenCalledTimes(1);
  });
});
