/**
 * ARKON v50.0.0 — Custom Hook: بيانات السوق (Market Data)
 * إدارة WebSocket + REST Polling + بيانات Deribit/Binance
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { MarketAnalysisState } from "../types";
import {
  fetchMarketSummary,
  fetchCandles,
  fetchDVOL,
  fetchOptionsVolume,
  fetchOrderBook,
  fetchDailyCandles,
} from "../services/deribitService";
import { deribitSocket } from "../services/deribitSocketService";
import { btcTradeBuffer, ethTradeBuffer } from "../services/TradeBuffer";
import { getEffectiveUrl } from "../services/webhookService";
import {
  MARKET_POLL_INTERVAL_MS,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  PROCESS_ASSET_STAGGER_MS,
} from "../utils/constants";

interface MarketDataSnapshot {
  summary?: any;
  ticker?: any;
  book?: any;
}

export function useMarketData(
  configWebhookUrl: string,
  addLog: (msg: string, type?: any, details?: any) => void,
) {
  // ========== STATE ==========
  const [btcAnalysis, setBtcAnalysis] = useState<MarketAnalysisState | null>(null);
  const [ethAnalysis, setEthAnalysis] = useState<MarketAnalysisState | null>(null);
  const [goldAnalysis, setGoldAnalysis] = useState<MarketAnalysisState | null>(null);
  const [marketWsConnected, setMarketWsConnected] = useState(false);
  const [marketWsUrl, setMarketWsUrl] = useState("");
  const [wsReconnectAttempts, setWsReconnectAttempts] = useState(0);
  const [wsReconnectNonce, setWsReconnectNonce] = useState(0);

  // ========== REFS ==========
  const btcDataRef = useRef<MarketDataSnapshot>({});
  const ethDataRef = useRef<MarketDataSnapshot>({});
  const goldDataRef = useRef<MarketDataSnapshot>({});
  const marketWsRef = useRef<WebSocket | null>(null);
  const wsMarketConnectedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const updateMarketDataRef = useRef<((btcAnalysis?: any) => void) | null>(null);

  // ========== DERIBIT SUBSCRIPTIONS ==========
  useEffect(() => {
    const handleBtcSummary = (data: any) => {
      const perp = Array.isArray(data)
        ? data.find((s: any) => s?.instrument_name?.includes("BTC-PERPETUAL"))
        : data;
      if (perp) btcDataRef.current.summary = perp;
    };
    const handleEthSummary = (data: any) => {
      const perp = Array.isArray(data)
        ? data.find((s: any) => s?.instrument_name?.includes("ETH-PERPETUAL"))
        : data;
      if (perp) ethDataRef.current.summary = perp;
    };
    const handleBtcTicker = (data: any) => {
      btcDataRef.current.ticker = data;
    };
    const handleEthTicker = (data: any) => {
      ethDataRef.current.ticker = data;
    };
    const handleBtcBook = (data: any) => {
      btcDataRef.current.book = data;
    };
    const handleEthBook = (data: any) => {
      ethDataRef.current.book = data;
    };
    const handleBtcTrades = (trades: any[]) => {
      btcTradeBuffer.addTrades(trades);
    };
    const handleEthTrades = (trades: any[]) => {
      ethTradeBuffer.addTrades(trades);
    };

    deribitSocket.subscribeBookSummary("BTC", "future", handleBtcSummary);
    deribitSocket.subscribeBookSummary("ETH", "future", handleEthSummary);
    deribitSocket.subscribeTicker("BTC-PERPETUAL", handleBtcTicker);
    deribitSocket.subscribeTicker("ETH-PERPETUAL", handleEthTicker);
    deribitSocket.subscribeOrderBook("BTC-PERPETUAL", handleBtcBook);
    deribitSocket.subscribeOrderBook("ETH-PERPETUAL", handleEthBook);
    deribitSocket.subscribeTrades("BTC-PERPETUAL", handleBtcTrades);
    deribitSocket.subscribeTrades("ETH-PERPETUAL", handleEthTrades);

    return () => {
      deribitSocket.unsubscribe("book.summary.BTC.future", handleBtcSummary);
      deribitSocket.unsubscribe("book.summary.ETH.future", handleEthSummary);
      deribitSocket.unsubscribe("ticker.BTC-PERPETUAL.raw", handleBtcTicker);
      deribitSocket.unsubscribe("ticker.ETH-PERPETUAL.raw", handleEthTicker);
      deribitSocket.unsubscribe("book.BTC-PERPETUAL.none.10.100ms", handleBtcBook);
      deribitSocket.unsubscribe("book.ETH-PERPETUAL.none.10.100ms", handleEthBook);
      deribitSocket.unsubscribe("trades.BTC-PERPETUAL.100ms", handleBtcTrades);
      deribitSocket.unsubscribe("trades.ETH-PERPETUAL.100ms", handleEthTrades);
    };
  }, []);

  // ========== MARKET DATA POLLING ==========
  const fetchAssetData = useCallback(
    async (asset: "BTC" | "ETH") => {
      try {
        const liveData = asset === "BTC" ? btcDataRef.current : ethDataRef.current;
        let perp = liveData.summary || liveData.ticker;
        let currentPrice = perp ? perp.last || perp.last_price : 0;

        if (!perp || !currentPrice || isNaN(currentPrice)) {
          const summaries = await fetchMarketSummary(asset);
          perp = summaries.find((s: any) =>
            s?.instrument_name?.includes("PERPETUAL"),
          );
          if (perp) {
            liveData.summary = perp;
            currentPrice = perp.last || perp.last_price || 0;
          }
        }

        return { perp, currentPrice, liveData };
      } catch (e) {
        console.error(`Error fetching market data for ${asset}:`, e);
        return { perp: null, currentPrice: 0, liveData: null };
      }
    },
    [],
  );

  // ========== WEBSOCKET CONNECTION ==========
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let localReconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 20;

    const updateMarketFromWs = (symbol: string, payload: any) => {
      const normalizedSymbol = String(
        symbol || payload?.instrument_name || "",
      ).toUpperCase();
      const normalized = {
        ...payload,
        instrument_name: payload?.instrument_name || normalizedSymbol,
        last: payload?.last || payload?.last_price || 0,
        last_price: payload?.last_price || payload?.last || 0,
      };

      if (normalizedSymbol.includes("BTC")) {
        btcDataRef.current.ticker = normalized;
        if (!btcDataRef.current.summary || normalized.last > 0) {
          btcDataRef.current.summary = normalized;
        }
      } else if (normalizedSymbol.includes("ETH")) {
        ethDataRef.current.ticker = normalized;
        if (!ethDataRef.current.summary || normalized.last > 0) {
          ethDataRef.current.summary = normalized;
        }
      } else if (normalizedSymbol.includes("XAU") || normalizedSymbol.includes("GOLD")) {
        goldDataRef.current.ticker = normalized;
        if (!goldDataRef.current.summary || normalized.last > 0) {
          goldDataRef.current.summary = normalized;
        }
      }
    };

    const connect = () => {
      if (isDisposed) return;
      try {
        const effective = getEffectiveUrl(
          configWebhookUrl || window.location.origin,
        );
        const base = new URL(effective);
        const protocol = base.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${base.hostname}:3001`;
        setMarketWsUrl(wsUrl);

        const ws = new WebSocket(wsUrl);
        marketWsRef.current = ws;

        ws.onopen = () => {
          wsMarketConnectedRef.current = true;
          setMarketWsConnected(true);
          localReconnectAttempts = 0;
          setWsReconnectAttempts(0);
          addLog("🔌 WebSocket Market Feed متصل (Realtime)", "SYSTEM");
          ws.send(
            JSON.stringify({
              type: "SUBSCRIBE_MARKET_DATA",
              payload: { symbol: "BTC-PERPETUAL" },
            }),
          );
          ws.send(
            JSON.stringify({
              type: "SUBSCRIBE_MARKET_DATA",
              payload: { symbol: "ETH-PERPETUAL" },
            }),
          );
          ws.send(
            JSON.stringify({
              type: "SUBSCRIBE_MARKET_DATA",
              payload: { symbol: "XAUUSD" },
            }),
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data || "{}"));
            if (msg?.type === "MARKET_UPDATE" && msg?.data) {
              const symbol =
                msg.data.symbol || msg.data.instrument_name || "";
              updateMarketFromWs(symbol, msg.data);
            }
          } catch {
            // ignore
          }
        };

        ws.onerror = () => {};

        ws.onclose = () => {
          const hadConnection = wsMarketConnectedRef.current;
          wsMarketConnectedRef.current = false;
          setMarketWsConnected(false);
          localReconnectAttempts += 1;

          // Cap reconnect attempts to prevent infinite spam
          if (localReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            if (hadConnection) {
              addLog(
                "⚠️ WebSocket Market Feed: تم تجاوز حد إعادة الاتصال، تم التبديل إلى polling",
                "RISK",
              );
            }
            return; // Stop retrying — fallback to REST polling
          }

          if (hadConnection) {
            addLog(
              "⚠️ انقطاع WebSocket Market Feed، تم التحويل إلى fallback polling",
              "RISK",
            );
          }
          if (!isDisposed) {
            // Exponential backoff with jitter
            const delay = Math.min(
              WS_RECONNECT_BASE_DELAY_MS * Math.pow(1.5, localReconnectAttempts),
              WS_RECONNECT_MAX_DELAY_MS,
            ) + Math.random() * 1000;
            reconnectTimer = setTimeout(connect, delay);
          }
        };
      } catch {
        wsMarketConnectedRef.current = false;
        setMarketWsConnected(false);
        localReconnectAttempts += 1;
        if (localReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        const delay = Math.min(
          WS_RECONNECT_BASE_DELAY_MS * Math.pow(1.5, localReconnectAttempts),
          WS_RECONNECT_MAX_DELAY_MS,
        ) + Math.random() * 1000;
        reconnectTimer = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      isDisposed = true;
      wsMarketConnectedRef.current = false;
      setMarketWsConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (marketWsRef.current) {
        try {
          marketWsRef.current.close();
        } catch {
          // no-op
        }
        marketWsRef.current = null;
      }
    };
  }, [configWebhookUrl, addLog, wsReconnectNonce]);

  const manualReconnect = useCallback(() => {
    if (marketWsRef.current) {
      try {
        marketWsRef.current.close();
      } catch {
        // no-op
      }
    }
    setWsReconnectNonce((prev) => prev + 1);
    addLog("🔄 تم طلب إعادة اتصال WebSocket يدويًا", "SYSTEM");
  }, [addLog]);

  return {
    btcAnalysis,
    setBtcAnalysis,
    ethAnalysis,
    setEthAnalysis,
    goldAnalysis,
    setGoldAnalysis,
    btcDataRef,
    ethDataRef,
    goldDataRef,
    marketWsConnected,
    marketWsUrl,
    wsReconnectAttempts,
    marketWsRef,
    wsMarketConnectedRef,
    isProcessingRef,
    fetchAssetData,
    manualReconnect,
    updateMarketDataRef,
  };
}

