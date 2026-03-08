export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const syms = ['BTCUSDT','XRPUSDT','FLRUSDT','FETUSDT'];
  
  try {
    // Try Binance first
    const url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=' + 
      encodeURIComponent(JSON.stringify(syms));
    
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!r.ok) throw new Error('Binance HTTP ' + r.status);
    const tickers = await r.json();
    if (!Array.isArray(tickers)) throw new Error('Onverwacht formaat');

    // Klines parallel - best effort
    const klineMap = {};
    await Promise.all(syms.map(async sym => {
      try {
        const kr = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=8`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const kdata = await kr.json();
        klineMap[sym] = kdata.map(d => ({
          o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]
        }));
      } catch(e) {
        klineMap[sym] = [];
      }
    }));

    const result = {};
    tickers.forEach(t => {
      const kl = klineMap[t.symbol] || [];
      const price = +t.lastPrice;
      result[t.symbol] = {
        price,
        ch24: +t.priceChangePercent,
        ch7: kl.length ? (price - kl[0].c) / kl[0].c * 100 : 0,
        high: kl.length ? kl[kl.length-1].h : +t.highPrice,
        low:  kl.length ? kl[kl.length-1].l : +t.lowPrice,
        vol:  +t.quoteVolume,
        klines: kl,
      };
    });

    return new Response(JSON.stringify({ ok: true, data: result }), { headers });

  } catch(e) {
    // Fallback: CoinGecko (geen CORS op server)
    try {
      const cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ripple,flare-network,fetch-ai&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true';
      const cgr = await fetch(cgUrl);
      const cg = await cgr.json();
      
      const MAP = {
        BTCUSDT: cg.bitcoin,
        XRPUSDT: cg.ripple,
        FLRUSDT: cg['flare-network'],
        FETUSDT: cg['fetch-ai'],
      };
      
      const result = {};
      Object.entries(MAP).forEach(([sym, coin]) => {
        if (!coin) return;
        const p = coin.usd;
        result[sym] = {
          price: p,
          ch24: coin.usd_24h_change || 0,
          ch7: 0,
          high: p * 1.02,
          low: p * 0.98,
          vol: coin.usd_24h_vol || 0,
          klines: [],
        };
      });
      
      return new Response(JSON.stringify({ ok: true, data: result, src: 'coingecko' }), { headers });
    } catch(e2) {
      return new Response(JSON.stringify({ ok: false, error: e.message + ' | CG: ' + e2.message }), { headers });
    }
  }
}
