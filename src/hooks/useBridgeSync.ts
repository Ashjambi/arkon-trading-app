/**
 * ARKON v50.0.0 — Custom Hook: مزامنة جسر MT5
 * استخراج منطق managed-trades polling و bridge status من App.tsx
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  checkBridgeStatus,
  fetchBridgeState,
  getEffectiveUrl,
} from "../services/webhookService";
import { executionSanityDiagnosticService } from "../services/ExecutionSanityDiagnosticService";

export function useBridgeSync(
  configWebhookUrl: string,
  addLog: (msg: string, type?: any, details?: any) => void,
) {
  const [bridgeStatus, setBridgeStatus] = useState<boolean | null>(null);
  const [managedTrades, setManagedTrades] = useState<any[]>([]);
  const [crlState, setCrlState] = useState<any>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);

  const managedTradesRef = useRef<any[]>([]);
  const crlStateRef = useRef<any>(null);
  const prevBridgeStatusRef = useRef<boolean | null>(null);
  const processedTradeIdsRef = useRef<Set<string>>(new Set());

  // Sync refs
  useEffect(() => {
    crlStateRef.current = crlState;
  }, [crlState]);

  useEffect(() => {
    managedTradesRef.current = managedTrades;
  }, [managedTrades]);

  // Bridge status polling
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const isOnline = await checkBridgeStatus(configWebhookUrl);
        setBridgeStatus(isOnline);
        if (prevBridgeStatusRef.current === true && isOnline === false) {
          addLog("⚠️ انقطع الاتصال بالجسر (Bridge Connection Lost)", "RISK");
        }
        prevBridgeStatusRef.current = isOnline;
      } catch {
        setBridgeStatus(false);
      }
    }, 30000);
    // Initial check
    checkBridgeStatus(configWebhookUrl).then(setBridgeStatus).catch(() => setBridgeStatus(false));
    return () => clearInterval(interval);
  }, [configWebhookUrl, addLog]);

  // MT5 errors fetch
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const effectiveUrl = getEffectiveUrl(configWebhookUrl);
        const res = await fetch(
          `${effectiveUrl.replace(/\/$/, "")}/api/mt5/errors`,
        );
        const errors = await res.json();
        if (errors && errors.length > 0) {
          errors.forEach((err: any) => {
            if (err.error === "BROKER_SYMBOL_NOT_RESOLVED") {
              executionSanityDiagnosticService.recordRejection(
                err.id,
                "execution_orchestrator",
                "BROKER_SYMBOL_NOT_RESOLVED",
                err.message,
              );
              addLog(`❌ MT5 Bridge Error: ${err.message}`, "ERROR");
            }
          });
        }
      } catch {
        // silent
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [configWebhookUrl, addLog]);

  // Bridge state fetch for closed trades
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const bridgeState = await fetchBridgeState(configWebhookUrl);
        if (bridgeState && bridgeState.closedTrades) {
          bridgeState.closedTrades.forEach((trade: any) => {
            const tradeId = String(trade.id || trade.ticket || "");
            if (
              tradeId &&
              !processedTradeIdsRef.current.has(tradeId)
            ) {
              processedTradeIdsRef.current.add(tradeId);
              setTradeHistory((prev: any[]) => [...prev, trade]);
            }
          });
        }
      } catch {
        // silent
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [configWebhookUrl]);

  // Managed trades polling
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout>;
    let activeController: AbortController | null = null;

    const pollManagedTrades = async () => {
      try {
        const effectiveUrl = getEffectiveUrl(configWebhookUrl);
        activeController = new AbortController();
        const id = setTimeout(() => {
          if (activeController) activeController.abort();
        }, 2500);

        const res = await fetch(
          `${effectiveUrl}/api/bridge/managed-trades`,
          { signal: activeController.signal },
        );
        clearTimeout(id);
        if (res.ok) {
          const data = await res.json();
          const trades = (data as any).trades || [];
          if (
            JSON.stringify(trades) !==
            JSON.stringify(managedTradesRef.current)
          ) {
            setManagedTrades(trades);
          }
          if ((data as any).crlState) {
            if (
              JSON.stringify((data as any).crlState) !==
              JSON.stringify(crlStateRef.current)
            ) {
              setCrlState((data as any).crlState);
            }
          }
        }
      } catch {
        // silent fail
      }
      timeoutRef = setTimeout(pollManagedTrades, 15000);
    };

    if (configWebhookUrl) {
      pollManagedTrades();
    }
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      if (activeController) activeController.abort();
    };
  }, [configWebhookUrl]);

  const updateTradeHistory = useCallback((newTrade: any) => {
    const tradeId = String(newTrade.id || newTrade.ticket || "");
    if (!tradeId || processedTradeIdsRef.current.has(tradeId)) return;
    processedTradeIdsRef.current.add(tradeId);
    setTradeHistory((prev) => [...prev, newTrade]);
  }, []);

  return {
    bridgeStatus,
    managedTrades,
    managedTradesRef,
    crlState,
    crlStateRef,
    tradeHistory,
    updateTradeHistory,
    setBridgeStatus,
    setManagedTrades,
  };
}

