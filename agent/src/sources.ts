// Public, keyless price sources. Each returns USD price or throws.
type Source = { name: string; fetch: (base: string) => Promise<number> };

const j = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "potfeeds-agent" } });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json() as Promise<any>;
};

const CG: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", DOT: "polkadot", SOL: "solana" };

export const SOURCES: Source[] = [
  { name: "coinbase", fetch: async (b) => Number((await j(`https://api.coinbase.com/v2/prices/${b}-USD/spot`)).data.amount) },
  { name: "kraken", fetch: async (b) => {
      const pair = b === "BTC" ? "XBTUSD" : `${b}USD`;
      const r = await j(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const k = Object.keys(r.result)[0];
      return Number(r.result[k].c[0]);
    } },
  { name: "binance", fetch: async (b) => Number((await j(`https://api.binance.com/api/v3/ticker/price?symbol=${b}USDT`)).price) },
  { name: "coingecko", fetch: async (b) => {
      const id = CG[b]; if (!id) throw new Error("no cg id");
      return Number((await j(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`))[id].usd);
    } },
  { name: "bitstamp", fetch: async (b) => Number((await j(`https://www.bitstamp.net/api/v2/ticker/${b.toLowerCase()}usd/`)).last) },
];

export type Quote = { source: string; price: number };

export async function gather(base: string): Promise<Quote[]> {
  const res = await Promise.allSettled(SOURCES.map(async (s) => ({ source: s.name, price: await s.fetch(base) })));
  return res
    .filter((r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled" && Number.isFinite(r.value.price) && r.value.price > 0)
    .map((r) => r.value);
}

export const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Drop quotes more than `bps` away from the median; report spread. */
export function analyze(quotes: Quote[], bps: number) {
  const mid = median(quotes.map((q) => q.price));
  const kept = quotes.filter((q) => Math.abs(q.price - mid) / mid * 1e4 <= bps);
  const dropped = quotes.filter((q) => !kept.includes(q));
  const ps = quotes.map((q) => q.price);
  const spreadBps = ((Math.max(...ps) - Math.min(...ps)) / mid) * 1e4;
  return { mid: kept.length ? median(kept.map((q) => q.price)) : mid, kept, dropped, spreadBps };
}
