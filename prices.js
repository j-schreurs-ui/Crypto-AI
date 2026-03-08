export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const syms = ['BTCUSDT','XRPUSDT','FLRUSDT','FETUSDT'];
    
    // Fetch 24hr tickers
    const tickerRes = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(syms)}`
    );
    const tickers = await tickerRes.json();
    
    // Fetch klines for each symbol (7 days)
    const klineData = {};
    await Promise.all(syms.map(async sym => {
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=8`
      );
      const data = await r.json();
      klineData[sym] = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]),
        l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      }));
    }));

    const result = {};
    tickers.forEach(t => {
      const kl = klineData[t.symbol] || [];
      const oldest = kl.length ? kl[0].c : parseFloat(t.lastPrice);
      result[t.symbol] = {
        price:    parseFloat(t.lastPrice),
        ch24:     parseFloat(t.priceChangePercent),
        ch7:      kl.length ? (parseFloat(t.lastPrice) - oldest) / oldest * 100 : 0,
        high:     kl.length ? kl[kl.length-1].h : parseFloat(t.highPrice),
        low:      kl.length ? kl[kl.length-1].l : parseFloat(t.lowPrice),
        vol:      parseFloat(t.quoteVolume),
        klines:   kl,
      };
    });
    
    res.status(200).json({ ok: true, data: result, ts: Date.now() });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
