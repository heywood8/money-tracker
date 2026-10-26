import {
  buildQuoteRequestBody,
  fetchGoogleQuotes,
  parseQuoteResponse,
  GOOGLE_FINANCE_RPC,
} from '../../app/services/googleFinance';

// A quote row as Google Finance returns it (fields 5 and 21 are read).
const quoteRow = (pair, price) => {
  const quote = new Array(25).fill(null);
  quote[0] = '/g/11bvvzkchk';
  quote[2] = pair.replace('-', ' / ');
  quote[5] = [price, -0.0278, -0.62, 4, 4, 2];
  quote[7] = price * 1.006;
  quote[11] = [1793014260];
  quote[21] = pair;
  return [quote];
};

// The answer's envelope: an anti-JSON prefix, then the RPC's result as a
// JSON string inside a JSON array, as the page receives it.
const answer = (rows) => `)]}'\n\n${JSON.stringify([
  ['wrb.fr', 'xh8wxf', JSON.stringify([rows]), null, null, null, 'generic'],
  ['di', 154],
  ['af.httprm', 153, '3804181085268072520', 0],
])}`;

describe('googleFinance', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('asks for every pair in one request', () => {
    const body = buildQuoteRequestBody([['RUB', 'AMD'], ['USD', 'RUB']]);
    expect(body.startsWith('f.req=')).toBe(true);
    const [[[rpc, args]]] = JSON.parse(decodeURIComponent(body.slice('f.req='.length)));
    expect(rpc).toBe('xh8wxf');
    expect(JSON.parse(args)).toEqual([[[null, null, ['RUB', 'AMD']], [null, null, ['USD', 'RUB']]], 1]);
  });

  describe('parseQuoteResponse', () => {
    it('reads each pair’s price, skipping one Google does not quote', () => {
      const quotes = parseQuoteResponse(answer([
        quoteRow('RUB-AMD', 4.4682892989),
        [null],
        quoteRow('USD-RUB', 80.623965),
      ]));
      expect([...quotes.entries()]).toEqual([['RUB-AMD', 4.4682892989], ['USD-RUB', 80.623965]]);
    });

    it('reads nothing from an answer of another shape', () => {
      expect(parseQuoteResponse('<html>consent</html>').size).toBe(0);
      expect(parseQuoteResponse(")]}'\n\n[[\"wrb.fr\",\"xh8wxf\",null,null,null,[5],\"generic\"]]").size).toBe(0);
      expect(parseQuoteResponse(answer([quoteRow('RUB-AMD', -1), quoteRow('bad', 4)])).size).toBe(0);
    });
  });

  describe('fetchGoogleQuotes', () => {
    it('posts the form and returns the quotes', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => answer([quoteRow('RUB-AMD', 4.4683)]) });

      const quotes = await fetchGoogleQuotes([['RUB', 'AMD']]);

      expect(quotes.get('RUB-AMD')).toBe(4.4683);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe(`${GOOGLE_FINANCE_RPC}?rpcids=xh8wxf&hl=en`);
      expect(init).toMatchObject({ method: 'POST', body: buildQuoteRequestBody([['RUB', 'AMD']]) });
    });

    it('fails as a network error when there is no answer or a bad status', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: false, status: 429 });

      await expect(fetchGoogleQuotes([['RUB', 'AMD']])).rejects.toMatchObject({ code: 'network' });
      await expect(fetchGoogleQuotes([['RUB', 'AMD']])).rejects.toMatchObject({ code: 'network' });
    });
  });
});
