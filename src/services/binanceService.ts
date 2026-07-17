const BINANCE_API_URL = '/api/proxy/exchange-data/bn';
const BINANCE_DIRECT_URL = 'https://api.binance.com/api/v3';

export const fetchBinanceSummary = async (symbol: string) => {
  try {
    // 1. Try local proxy
    try {
      const res = await fetch(`${BINANCE_API_URL}/ticker/24hr?symbol=${symbol}`);
      const rawText = await res.clone().text();
      console.log(`[Binance Proxy] Raw summary for ${symbol}:`, rawText);
      const data: any = await res.json();
      console.log(`[Binance Proxy] Received data for ${symbol}:`, data);
      if (res.ok) {
        if (data && data.lastPrice) {
          return {
            instrument_name: symbol, // Return the original symbol
            last: parseFloat(data.lastPrice) || 0,
            high: parseFloat(data.highPrice) || 0,
            low: parseFloat(data.lowPrice) || 0,
            volume: parseFloat(data.volume) || 0,
            price_change: parseFloat(data.priceChangePercent) || 0,
            open_interest: 0,
          };
        }
      }
    } catch (proxyError) {
      console.warn(`[Binance Proxy] Failed to fetch summary for ${symbol}, trying direct fallback...`, proxyError);
    }

    // 2. Direct fallback (CORS-enabled)
    const directRes = await fetch(`${BINANCE_DIRECT_URL}/ticker/24hr?symbol=${symbol}`);
    const rawDirectText = await directRes.clone().text();
    console.log(`[Binance Direct] Raw summary for ${symbol}:`, rawDirectText);
    if (!directRes.ok) throw new Error(`Binance direct fetch returned status ${directRes.status}`);
    const data: any = await directRes.json();
    return {
      instrument_name: symbol, // Return the original symbol
      last: parseFloat(data.lastPrice) || 0,
      high: parseFloat(data.highPrice) || 0,
      low: parseFloat(data.lowPrice) || 0,
      volume: parseFloat(data.volume) || 0,
      price_change: parseFloat(data.priceChangePercent) || 0,
      open_interest: 0,
    };
  } catch (error) {
    console.error(`Error fetching Binance summary for ${symbol}:`, error);
    throw error;
  }
};

export const fetchBinanceCandles = async (symbol: string, interval: string = '15m', limit: number = 100) => {
  try {
    // 1. Try local proxy
    try {
      const url = `${BINANCE_API_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      const rawText = await res.clone().text();
      console.log(`[Binance Proxy] Raw candles for ${symbol}:`, rawText);
      if (res.ok) {
        const data = await res.json();
        return parseBinanceCandles(data);
      }
    } catch (proxyError) {
      console.warn(`[Binance Proxy] Failed to fetch candles for ${symbol}, trying direct fallback...`, proxyError);
    }

    // 2. Direct fallback
    const directUrl = `${BINANCE_DIRECT_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const directRes = await fetch(directUrl);
    const rawDirectText = await directRes.clone().text();
    console.log(`[Binance Direct] Raw candles for ${symbol}:`, rawDirectText);
    if (!directRes.ok) throw new Error(`Binance direct fetch returned status ${directRes.status}`);
    const data = await directRes.json();
    return parseBinanceCandles(data);
  } catch (error) {
    console.error(`Error fetching Binance candles for ${symbol}:`, error);
    throw error;
  }
};

const parseBinanceCandles = (data: any) => {
    const ticks: number[] = [];
    const open: number[] = [];
    const high: number[] = [];
    const low: number[] = [];
    const close: number[] = [];
    const volume: number[] = [];

    if (!Array.isArray(data)) {
      return { ticks, open, high, low, close, volume };
    }

    data.forEach((k: any) => {
      if (Array.isArray(k) && k.length >= 6) {
        ticks.push(k[0]);
        open.push(parseFloat(k[1]) || 0);
        high.push(parseFloat(k[2]) || 0);
        low.push(parseFloat(k[3]) || 0);
        close.push(parseFloat(k[4]) || 0);
        volume.push(parseFloat(k[5]) || 0);
      }
    });

    return {
      ticks,
      open,
      high,
      low,
      close,
      volume
    };
};

export const fetchBinanceOrderBook = async (symbol: string, limit: number = 50) => {
  try {
    // 1. Try local proxy
    try {
      const url = `${BINANCE_API_URL}/depth?symbol=${symbol}&limit=${limit}`;
      const res = await fetch(url);
      const rawText = await res.clone().text();
      console.log(`[Binance Proxy] Raw depth for ${symbol}:`, rawText);
      if (res.ok) {
        const data = await res.json();
        return parseOrderBook(data);
      }
    } catch (proxyError) {
      console.warn(`[Binance Proxy] Failed to fetch order book for ${symbol}, trying direct fallback...`, proxyError);
    }

    // 2. Direct fallback
    const directUrl = `${BINANCE_DIRECT_URL}/depth?symbol=${symbol}&limit=${limit}`;
    const directRes = await fetch(directUrl);
    const rawDirectText = await directRes.clone().text();
    console.log(`[Binance Direct] Raw depth for ${symbol}:`, rawDirectText);
    if (!directRes.ok) throw new Error(`Binance direct fetch returned status ${directRes.status}`);
    const data = await directRes.json();
    return parseOrderBook(data);
  } catch (error) {
    console.error(`Error fetching Binance order book for ${symbol}:`, error);
    throw error;
  }
};

const parseOrderBook = (data: any) => {
    if (!data || !Array.isArray(data.bids) || !Array.isArray(data.asks)) {
      return { bids: [], asks: [] };
    }
    return {
      bids: data.bids.map((b: any) => [parseFloat(b[0]) || 0, parseFloat(b[1]) || 0]),
      asks: data.asks.map((a: any) => [parseFloat(a[0]) || 0, parseFloat(a[1]) || 0]),
    };
};
