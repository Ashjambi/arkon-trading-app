import { deribitSocket } from "./deribitSocketService";
import { fetchBinanceSummary, fetchBinanceCandles, fetchBinanceOrderBook } from "./binanceService";
import { logStructured } from "../utils/logger";

const fetchWithTimeout = async (url: string, timeout = 5000, controller = new AbortController()) => {
  const id = setTimeout(() => controller.abort(new Error(`Fetch timeout for ${url}`)), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e: any) {
    clearTimeout(id);
    if (e.name === 'AbortError' && controller.signal.reason) {
      throw controller.signal.reason;
    }
    throw e;
  }
};

// Keep track of logged errors to avoid spamming
const loggedErrors = new Set<string>();
let isRateLimited = false;
let rateLimitResetTime = 0;

// Hybrid fetch: tries WS first, falls back to REST after a short delay if WS is slow
const hybridFetch = async (wsMethod: string, wsParams: any, restUrl: string, extractRestData: (data: any) => any) => {
  const controller = new AbortController();

  const wsPromise = deribitSocket.request(wsMethod, wsParams).then(res => {
    if (res === null || res === undefined) throw new Error("WS returned null");
    try { controller.abort(new Error("WS succeeded")); } catch(e) {}
    return res;
  });

  // Staggered REST fallback: wait 2 seconds before starting REST, or proceed immediately if WS fails
  const restPromise = new Promise(async (resolve, reject) => {
    let timeoutId: any;
    let proceed: () => void = () => {};
    const waitPromise = new Promise<void>(r => {
      proceed = r;
      timeoutId = setTimeout(r, 2000);
    });
    
    wsPromise.catch(() => {
      clearTimeout(timeoutId);
      proceed();
    });

    await waitPromise;

    if (controller.signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    
    if (isRateLimited && Date.now() < rateLimitResetTime) {
      reject(new Error("REST is rate limited"));
      return;
    }
    
    try {
        let res;
        try {
            res = await fetchWithTimeout(restUrl, 10000, controller);
            if (!res.ok) {
                throw new Error(`Proxy responded with status ${res.status}`);
            }
        } catch (proxyError) {
            console.warn(`[Deribit Proxy] Failed for ${restUrl}, trying direct fallback...`, proxyError);
            if (restUrl.startsWith('/api/proxy/market-data')) {
                try {
                    const urlObj = new URL(restUrl, window.location.origin);
                    const endpoint = urlObj.searchParams.get('endpoint');
                    if (endpoint) {
                        urlObj.searchParams.delete('endpoint');
                        const directUrl = `https://www.deribit.com/api/v2/public/${endpoint}${urlObj.search}`;
                        res = await fetchWithTimeout(directUrl, 10000, controller);
                    } else {
                        throw proxyError;
                    }
                } catch (fallbackErr) {
                    throw proxyError;
                }
            } else {
                throw proxyError;
            }
        }
        
        // Retry on 502, 503, 504 with exponential backoff
        let retries = 0;
        while ((res.status === 502 || res.status === 503 || res.status === 504) && retries < 2) {
            retries++;
            console.warn(`[HybridFetch] ${res.status} received, retry ${retries}...`);
            await new Promise(r => setTimeout(r, 2000 * retries));
            res = await fetchWithTimeout(res.url, 10000, controller);
        }

        if (res.status === 429) {
            isRateLimited = true;
            rateLimitResetTime = Date.now() + 60000; // Wait 1 minute before trying REST again
            throw new Error(`REST rate limited (429)`);
        }
        if (!res.ok) throw new Error(`REST failed with status ${res.status}`);
        const data: any = await res.json();
        if (data.error) throw new Error(`REST returned error: ${data.error}`);
        const extracted = extractRestData(data);
        if (extracted === null || extracted === undefined) throw new Error("REST returned null or invalid data");
        resolve(extracted);
    } catch (err) {
        reject(err);
    }
  });

  try {
    // Return whichever succeeds first
    return await Promise.any([wsPromise, restPromise]);
  } catch (error: any) {
    // Aggregate errors if all promises fail
    const errors = error.errors || [error];
    const errorMessages = errors.filter((e: any) => e.message !== "WS succeeded").map((e: any) => e.message || String(e)).join(", ");
    if (errorMessages && !loggedErrors.has(wsMethod)) {
        console.warn(`⚠️ [HybridFetch] Failed for ${wsMethod}. Errors: ${errorMessages} (Will use fallback data if available)`);
        loggedErrors.add(wsMethod);
    }
    return null;
  }
};

// --- Simple Cache Implementation ---
const cache = new Map<string, { data: any; timestamp: number }>();

const getCached = (key: string, maxAgeMs: number) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < maxAgeMs) {
    return cached.data;
  }
  return null;
};

const setCache = (key: string, data: any) => {
  cache.set(key, { data, timestamp: Date.now() });
};
// -----------------------------------

export const fetchMarketSummary = async (currency: string) => {
  const cacheKey = `marketSummary_${currency}`;
  const cached = getCached(cacheKey, 30000); // Cache for 30 seconds
  if (cached) return cached;

  let result = null;
  try {
    result = await hybridFetch(
      "public/get_book_summary_by_currency",
      { currency, kind: "future" },
      `/api/proxy/market-data?endpoint=get_book_summary_by_currency&currency=${currency}&kind=future`,
      (data) => data.result || []
    );
  } catch (e) {
    console.warn("Deribit hybridFetch failed for market summary:", e);
  }
  
  let finalResult = result;
  if (!result || result.length === 0) {
    try {
      const symbol = currency === 'BTC' ? 'BTCUSDT' : (currency === 'ETH' ? 'ETHUSDT' : null);
      if (symbol) {
        const binanceData = await fetchBinanceSummary(symbol);
        console.log(`[Binance Fallback] Data for ${symbol}:`, binanceData);
        if (binanceData) {
          finalResult = [{
            instrument_name: `${currency}-PERPETUAL`,
            last: binanceData.last,
            high: binanceData.high,
            low: binanceData.low,
            volume: binanceData.volume,
            price_change: binanceData.price_change,
            open_interest: 0
          }];
        }
      }
    } catch (e) {
      console.error("Binance fallback for summary failed:", e);
    }
  }
  
  if (finalResult && finalResult.length > 0) {
    setCache(cacheKey, finalResult);
  }
  
  return finalResult || [];
};

export const fetchCandles = async (
  instrument: string,
  resolution: string | number,
  start: number = Date.now() - 259200000, // 72 hours to be safe
  end: number = Date.now(),
) => {
  const cacheKey = `candles_${instrument}_${resolution}`;
  const cached = getCached(cacheKey, 120000); // Increase cache to 120 seconds
  if (cached) return cached;

  const currency = instrument.split('-')[0];

  let result = null;
  try {
    result = await hybridFetch(
      "public/get_tradingview_chart_data",
      {
        instrument_name: instrument,
        resolution: String(resolution),
        start_timestamp: Math.floor(start),
        end_timestamp: Math.floor(end),
      },
      `/api/proxy/market-data?endpoint=get_tradingview_chart_data&instrument_name=${instrument}&resolution=${resolution}&start_timestamp=${Math.floor(start)}&end_timestamp=${Math.floor(end)}`,
      (data) => (data.result && data.result.status === "ok" && Array.isArray(data.result.close)) ? data.result : null
    );
  } catch (e) {
    console.warn("Deribit hybridFetch failed for candles:", e);
  }
  
  if (result && result.status === "ok" && Array.isArray(result.close)) {
    setCache(cacheKey, result);
    return result;
  }
  
  // Fallback to Binance
  try {
    const symbol = currency === 'BTC' ? 'BTCUSDT' : (currency === 'ETH' ? 'ETHUSDT' : null);
    if (symbol) {
      let interval = '15m';
      if (resolution === '1D' || resolution === 'D' || resolution === 1440) interval = '1d';
      else if (resolution === '1h' || resolution === 60) interval = '1h';
      else if (resolution === '5' || resolution === 5) interval = '5m';
      else if (resolution === '1' || resolution === 1) interval = '1m';
      
      const binanceData = await fetchBinanceCandles(symbol, interval, 100);
      if (binanceData) {
        const mappedResult = { status: "ok", ...binanceData };
        setCache(cacheKey, mappedResult);
        return mappedResult;
      }
    }
  } catch (e) {
    console.error("Binance fallback for candles failed:", e);
  }
  
  return null;
};

export const fetchDailyCandles = async (instrument: string) => {
  const cacheKey = `dailyCandles_${instrument}`;
  const cached = getCached(cacheKey, 3600000); // Cache for 1 hour
  if (cached) return cached;

  const currency = instrument.split('-')[0];

  const end = Date.now();
  const start = end - 365 * 24 * 60 * 60 * 1000;
  
  let result = null;
  try {
    result = await hybridFetch(
      "public/get_tradingview_chart_data",
      {
        instrument_name: instrument,
        resolution: "1D",
        start_timestamp: Math.floor(start),
        end_timestamp: Math.floor(end),
      },
      `/api/proxy/market-data?endpoint=get_tradingview_chart_data&instrument_name=${instrument}&resolution=1D&start_timestamp=${Math.floor(start)}&end_timestamp=${Math.floor(end)}`,
      (data) => (data.result && data.result.status === "ok") ? data.result : null
    );
  } catch (e) {
    console.warn("Deribit hybridFetch failed for daily candles:", e);
  }
  
  if (result && result.status === "ok") {
    setCache(cacheKey, result);
    return result;
  }
  
  // Fallback to Binance
  try {
    const symbol = currency === 'BTC' ? 'BTCUSDT' : (currency === 'ETH' ? 'ETHUSDT' : null);
    if (symbol) {
      const binanceData = await fetchBinanceCandles(symbol, '1d', 365);
      if (binanceData) {
        const mappedResult = { status: "ok", ...binanceData };
        setCache(cacheKey, mappedResult);
        return mappedResult;
      }
    }
  } catch (e) {
    console.error("Binance fallback for daily candles failed:", e);
  }
  
  return null;
};

export const fetchDVOL = async (currency: string) => {
  const cacheKey = `dvol_${currency}`;
  const cached = getCached(cacheKey, 3600000); // Cache for 1 hour
  if (cached) return cached;

  // Fallback to a default DVOL if unavailable (e.g. 50 for BTC, 60 for ETH)
  const fallbackVal = currency === 'BTC' ? 50 : 60;
  
  logStructured('RISK', 'WARN', 'dvol_fallback', `Upstream DVOL data unavailable or unusable for asset=${currency}. Using fallback ${fallbackVal}`, {
    asset: currency,
    reason: 'Upstream DVOL data unavailable or unusable',
    fallback: fallbackVal,
    mode: 'DEGRADED_DATA'
  });
  
  setCache(cacheKey, fallbackVal);
  return fallbackVal;
};

export const fetchOptionsVolume = async (currency: string) => {
  const cacheKey = `optVol_${currency}`;
  const cached = getCached(cacheKey, 120000); // Cache for 2 minutes
  if (cached) return cached;

  return [];
};

export const fetchOrderBook = async (
  instrument: string,
  depth: number = 10,
) => {
  const cacheKey = `orderBook_${instrument}_${depth}`;
  const cached = getCached(cacheKey, 10000); // Increase cache to 10 seconds
  if (cached) return cached;

  const currency = instrument.split('-')[0];

  let result = null;
  try {
    result = await hybridFetch(
      "public/get_order_book",
      { instrument_name: instrument, depth },
      `/api/proxy/market-data?endpoint=get_order_book&instrument_name=${instrument}&depth=${depth}`,
      (data) => data.result || null
    );
  } catch (e) {
    console.warn("Deribit hybridFetch failed for order book:", e);
  }
  
  if (result) {
    setCache(cacheKey, result);
    return result;
  }
  
  // Fallback to Binance if Deribit fails
  try {
    const symbol = currency === 'BTC' ? 'BTCUSDT' : (currency === 'ETH' ? 'ETHUSDT' : null);
    if (symbol) {
      const binanceData = await fetchBinanceOrderBook(symbol, depth);
      if (binanceData) {
        setCache(cacheKey, binanceData);
        return binanceData;
      }
    }
  } catch (e) {
    console.error("Binance fallback for order book failed:", e);
  }
  
  return result || null;
};

export const fetchHistoricalContext = async (instrument: string) => {
  const currency = instrument.split("-")[0];
  const result = await hybridFetch(
    "public/get_historical_volatility",
    { currency },
    `/api/proxy/market-data?endpoint=get_historical_volatility&currency=${currency}`,
    (data) => data.result || null
  );
  return result || null;
};
