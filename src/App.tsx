import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { logStructured } from "./utils/logger";
import {
  fetchMarketSummary,
  fetchCandles,
  fetchDVOL,
  fetchOptionsVolume,
  fetchOrderBook,
  fetchDailyCandles,
} from "./services/deribitService";
import { deribitSocket } from "./services/deribitSocketService";
import { btcTradeBuffer, ethTradeBuffer } from "./services/TradeBuffer";
import {
  fetchBinanceSummary,
  fetchBinanceCandles,
  fetchBinanceOrderBook,
} from "./services/binanceService";
import { binanceSocket } from "./services/binanceSocketService";
import { generateSignal } from "./services/tradingAlgo";
import { ExecutionOrchestrator } from "./services/ExecutionOrchestrator";
import {
  sendToWebhook,
  checkBridgeStatus,
  fetchBridgeState,
  clearRemoteBridge,
  getEffectiveUrl,
} from "./services/webhookService";
import {
  sendTestMessage,
  sendSignalToTelegram,
  sendSystemAlertToTelegram,
  sendTradeExecutionAlertToTelegram,
  sendNoSignalsAlertToTelegram,
} from "./services/telegramService";
import {
  TradingSignal,
  AppConfig,
  LogEntry,
  LogType,
  MarketAnalysisState,
  EconomicEvent,
  SignalDirection,
  SignalStrength,
  StrategyType,
  StrategyPerformance,
  StrategyGates,
} from "./types";
import { getMQL5Code } from "./utils/mqlCode";
import MarketStats from "./components/MarketStats";
import SignalCard from "./components/SignalCard";
import { TradePipeline } from "./components/TradePipeline";
import { LogsPanel } from "./components/LogsPanel";
import { EngineSettings } from "./components/EngineSettings";
import { RiskManagementSettings } from "./components/RiskManagementSettings";
import { TrailingChaseSettings } from "./components/TrailingChaseSettings";
import { HedgeSettings } from "./components/HedgeSettings";
// NewsSettings removed
import { Mql5Settings } from "./components/Mql5Settings";
import { DiagnosticsSettings } from "./components/DiagnosticsSettings";

import { calculatePerformance } from "./services/performanceService";
import { checkPortfolioRisk } from "./services/portfolioRisk";
import { executionDecisionTraceService } from "./services/ExecutionDecisionTraceService";
import { executionSanityDiagnosticService } from "./services/ExecutionSanityDiagnosticService";

const CURRENT_VERSION = "50.00-LOCAL";

const createDefaultPerf = (
  type: "SCALPING" | "SWING",
  isEnabled: boolean = true,
): StrategyPerformance => ({
  wins: 0,
  losses: 0,
  totalProfitPoints: 0,
  totalLossPoints: 0,
  successScore: 0,
  isEnabled,
  type,
  totalTrades: 0,
  winRate: 0,
  profitFactor: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  lastTradeTime: 0,
  consecutiveLosses: 0,
});

const DEFAULT_STRATEGY_PERFORMANCE: Record<StrategyType, StrategyPerformance> =
  {
    BTC_TREND: createDefaultPerf("SWING"),
    BTC_MEAN_REV: createDefaultPerf("SCALPING"),
    BTC_TREND_FOLLOWING: createDefaultPerf("SWING"),
    BTC_OFI: createDefaultPerf("SCALPING"),
    BTC_AVR: createDefaultPerf("SCALPING"),
    BTC_SCALPER: createDefaultPerf("SCALPING"),
    ETH_TREND: createDefaultPerf("SWING"),
    ETH_MEAN_REV: createDefaultPerf("SCALPING"),
    ETH_TREND_FOLLOWING: createDefaultPerf("SWING"),
    ETH_CORR_ARB: createDefaultPerf("SWING"),
    ETH_VOL_BREAK: createDefaultPerf("SWING"),
    ETH_SCALPER: createDefaultPerf("SCALPING"),
    PAIRS_TRADING: createDefaultPerf("SWING"),
    VOLATILITY_BREAKOUT: createDefaultPerf("SWING"),
    COINTEGRATION: createDefaultPerf("SWING"),
    NEWS_SHOCK: createDefaultPerf("SCALPING"),
    WAIT: createDefaultPerf("SWING"),
  };

const DEFAULT_STRATEGY_GATES: Record<StrategyType, StrategyGates> = {
  BTC_TREND: {
    hurst: 0.55,
    fisher: 1.2,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.7,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.2,
    volRatio: 1.2,
  },
  BTC_MEAN_REV: {
    hurst: 0.4,
    fisher: 1.5,
    rSquared: 0.2,
    dvol: 30,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.1,
    volRatio: 1.1,
  },
  BTC_TREND_FOLLOWING: {
    hurst: 0.6,
    fisher: 0.8,
    rSquared: 0.4,
    dvol: 45,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.2,
    ofi: 0.3,
    volRatio: 1.5,
  },
  BTC_OFI: {
    hurst: 0.5,
    fisher: 1.0,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.4,
    volRatio: 1.2,
  },
  BTC_AVR: {
    hurst: 0.5,
    fisher: 1.0,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.2,
    volRatio: 1.2,
  },
  BTC_SCALPER: {
    hurst: 0.4,
    fisher: 1.2,
    rSquared: 0.2,
    dvol: 30,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.1,
    volRatio: 1.1,
  },
  ETH_TREND: {
    hurst: 0.55,
    fisher: 1.5,
    rSquared: 0.4,
    dvol: 50,
    toxicity: 0.7,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  ETH_MEAN_REV: {
    hurst: 0.4,
    fisher: 2.0,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.5,
    ofi: 0.1,
    volRatio: 1.2,
  },
  ETH_TREND_FOLLOWING: {
    hurst: 0.6,
    fisher: 1.0,
    rSquared: 0.5,
    dvol: 60,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.3,
    volRatio: 1.8,
  },
  ETH_CORR_ARB: {
    hurst: 0.5,
    fisher: 1.0,
    rSquared: 0.4,
    dvol: 50,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  ETH_VOL_BREAK: {
    hurst: 0.6,
    fisher: 1.0,
    rSquared: 0.4,
    dvol: 70,
    toxicity: 0.9,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.4,
    volRatio: 2.0,
  },
  ETH_SCALPER: {
    hurst: 0.4,
    fisher: 1.5,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.5,
    ofi: 0.1,
    volRatio: 1.2,
  },
  PAIRS_TRADING: {
    hurst: 0.5,
    fisher: 1.5,
    rSquared: 0.5,
    dvol: 50,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  VOLATILITY_BREAKOUT: {
    hurst: 0.6,
    fisher: 1.0,
    rSquared: 0.4,
    dvol: 70,
    toxicity: 0.9,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.4,
    volRatio: 2.0,
  },
  COINTEGRATION: {
    hurst: 0.5,
    fisher: 1.5,
    rSquared: 0.5,
    dvol: 50,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  NEWS_SHOCK: {
    hurst: 0.7,
    fisher: 0.5,
    rSquared: 0.2,
    dvol: 80,
    toxicity: 1.0,
    slippage: 0.005,
    vwapZScore: 1.0,
    ofi: 0.5,
    volRatio: 2.5,
  },
  WAIT: {
    hurst: 0.5,
    fisher: 1.0,
    rSquared: 0.5,
    dvol: 50,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
};

const DEFAULT_CONFIG: AppConfig = {
  telegramBotToken: "",
  telegramChatId: "",
  enableTelegramAlerts: true,
  webhookUrl: "http://127.0.0.1:3000",
  webhookSecret: "ARKON_SECURE_2025",
  bridgeLatencyThreshold: 500,
  autoExecution: true,
  hunterMode: true,
  minSignalScore: 10, // Significantly lowered to increase trading opportunities
  cooldownHours: 0.1, // Significantly lowered
  cooldownSameAssetMins: 1, // Significantly lowered
  riskRewardRatio: 2.0, // Increased flexibility
  maxOpenTrades: 100, // Max total allowed active positions
  maxTradesPerWave: 50, // Max active trades per direction (Safe Grid)
  dynamicVolSpacing: 0.01, // Greatly reduced spacing to catch opportunities faster and build grids
  maxAllocationPerTradePercent: 2.0,
  fixedLotSizeBTC: 0.1, // Enhanced further
  fixedLotSizeETH: 0.2, // Enhanced further
  equityProtectionPercent: 10.0,
  dailyLossLimitUSD: 250,
  maxDrawdownDailyPercent: 3.5,
  forceClosePnL: 0.5,
  autoHedgeEnabled: true,
  hedgeRatio: 0.5,
  flipEnabled: false,
  flipSensitivityScore: 90,
  disableInitialSL: true,
  useVirtualSL: false,
  commissionRate: 0.0005,
  orderFlowConfig: {
    enabled: false,
    ofiThreshold: 0.3,
    imbalanceRatio: 3.0,
    minVolume: 100,
    vwapEnabled: true,
  },
  hurst: 0.55,
  fisher: 1.5,
  rSquared: 0.4,
  dvol: 50,
  toxicity: 0.7,
  slippage: 0.001,
  vwapZScore: 2.0,
  ofi: 0.2,
  volRatio: 1.5,
  enableTrendFollowing: true,
  trendFollowingThreshold: 0.8,
  avrVolatilityThreshold: 2.5,
  avrLookbackPeriod: 20,
  ofiImbalanceThreshold: 0.8,
  ofiSensitivity: 5,
  corrThreshold: 0.9,
  corrLookback: 50,
  strategyPerformance: DEFAULT_STRATEGY_PERFORMANCE,
  strategyGates: DEFAULT_STRATEGY_GATES,
  autoDisableThreshold: 0,
  dcaZones: [],
};

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem(`arkon_config_v${CURRENT_VERSION}`);
      let finalConfig;
      if (saved) {
        const parsed = JSON.parse(saved);
        // Deep merge strategyPerformance to ensure new fields exist
        const mergedPerf = { ...DEFAULT_CONFIG.strategyPerformance };
        if (parsed.strategyPerformance) {
          Object.keys(parsed.strategyPerformance).forEach((key) => {
            const stratKey = key as StrategyType;
            if (mergedPerf[stratKey]) {
              mergedPerf[stratKey] = {
                ...mergedPerf[stratKey],
                ...parsed.strategyPerformance[stratKey],
              };
            }
          });
        }
        finalConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          strategyPerformance: mergedPerf,
        };

        // FORCE SAFE DEFAULTS (Overriding dangerous aggressive settings, relaxed for flexibility)
        if (finalConfig.maxOpenTrades > 200) finalConfig.maxOpenTrades = 200;
        if (finalConfig.maxTradesPerWave > 100) finalConfig.maxTradesPerWave = 100;
        if (finalConfig.dynamicVolSpacing < 0.01) finalConfig.dynamicVolSpacing = 0.01;
        if (finalConfig.fixedLotSizeETH > 10.0) finalConfig.fixedLotSizeETH = 10.0;
        if (finalConfig.fixedLotSizeBTC > 5.0) finalConfig.fixedLotSizeBTC = 5.0;

      } else {
        finalConfig = DEFAULT_CONFIG;
      }

      return finalConfig;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  });

  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const processedTradeIdsRef = useRef<Set<string>>(new Set());
  const updateTradeHistory = useCallback((newTrade: any) => {
    const tradeId = String(newTrade.id || newTrade.ticket || "");
    if (!tradeId || processedTradeIdsRef.current.has(tradeId)) return;
    processedTradeIdsRef.current.add(tradeId);
    setTradeHistory((prev) => [...prev, newTrade]);
  }, []);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "start",
      timestamp: Date.now(),
      type: "SYSTEM",
      message: `ARKON v${CURRENT_VERSION} [TURBO MODE] ACTIVE.`,
    },
  ]);
  const [btcAnalysis, setBtcAnalysis] = useState<MarketAnalysisState | null>(
    null,
  );
  const [ethAnalysis, setEthAnalysis] = useState<MarketAnalysisState | null>(null);

  const btcDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});
  const ethDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});
  const [activeTab, setActiveTab] = useState<"DASHBOARD" | "HISTORY">(
    "DASHBOARD",
  );
  const performanceMetrics = useMemo(
    () => calculatePerformance(tradeHistory),
    [tradeHistory],
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // ... existing code ...
  const [settingsTab, setSettingsTab] = useState<
    "ENGINE" | "RISK_COMPLIANCE" | "STRATEGY" | "CHASE" | "SYSTEM" | "MQL5" | "DIAGNOSTICS"
  >("ENGINE");
  const [bridgeStatus, setBridgeStatus] = useState<boolean | null>(null);
  const prevBridgeStatusRef = useRef<boolean | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [managedTrades, setManagedTrades] = useState<any[]>([]);
  const [crlState, setCrlState] = useState<any>(null);
  const crlStateRef = useRef<any>(null);
  useEffect(() => {
     crlStateRef.current = crlState;
  }, [crlState]);
  const managedTradesRef = useRef<any[]>([]);
  const sendingRef = useRef<Record<string, boolean>>({});
  const sentSignalsRef = useRef<Set<string>>(new Set());
  const signalStrategyMapRef = useRef<Record<string, string>>({});
  const isProcessingRef = useRef(false);
  const lastSignalTimeRef = useRef<number>(Date.now());
  const lastExecutedTimeRef = useRef<Record<string, number>>({});
  const noSignalsAlertSentRef = useRef(false);
  const connectionDisabledRef = useRef(false);

  const addLog = useCallback(
    (message: string, type: LogType = "INFO", details?: string | object) => {
      let category: 'QUANT' | 'RISK' | 'EXEC' | 'COMPLIANCE' | 'SYSTEM' = 'SYSTEM';
      let level: 'INFO' | 'WARN' | 'ERROR' = 'INFO';

      if (type === 'RISK' || type === 'COOLDOWN' || type === 'HEDGE') {
        category = 'RISK';
        level = 'WARN';
      } else if (type === 'EXEC') {
        category = 'EXEC';
        level = 'INFO';
      } else if (type === 'ERROR') {
        category = 'SYSTEM';
        level = 'ERROR';
      } else if (type === 'QUANT') {
        category = 'QUANT';
        level = 'INFO';
      } else if (type === 'SYSTEM' || type === 'STRATEGY_SWITCH') {
        category = 'SYSTEM';
        level = 'WARN';
      }

      logStructured(category, level, `ui_${type.toLowerCase()}`, message, {
        details
      });

      setLogs((prev) =>
        [
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            type,
            message,
            details,
          },
          ...prev,
        ].slice(0, 200),
      );
    },
    [],
  );

  useEffect(() => {
    // Sync critical config like forceClosePnL to the backend bridge dynamically
    try {
      if (config.webhookUrl) {
        const effectiveUrl = getEffectiveUrl(config.webhookUrl);
        const finalUrl = effectiveUrl.replace(/\/$/, "") + "/api/bridge/settings";
        fetch(finalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forceClosePnL: config.forceClosePnL,
            enableTelegramAlerts: config.enableTelegramAlerts,
            telegramBotToken: config.telegramBotToken,
            telegramChatId: config.telegramChatId
          }),
        }).catch(() => {});
      }
    } catch (e) {}
  }, [
    config.forceClosePnL, 
    config.enableTelegramAlerts, 
    config.telegramBotToken, 
    config.telegramChatId, 
    config.webhookUrl
  ]);

  const executionOrchestrator = useMemo(
    () => new ExecutionOrchestrator(config, bridgeStatus, addLog),
    [config, bridgeStatus, addLog],
  );

  const handleSendSignal = useCallback(
    async (
      signalsOrSignal: any | any[],
      analysis: MarketAnalysisState,
      actionType: string = "ENTRY",
    ): Promise<boolean> => {
      const signalsToProcess = Array.isArray(signalsOrSignal) ? signalsOrSignal : [signalsOrSignal];
      const originalSignal = signalsToProcess[0];
      // Check for duplicate requests
      const reqId =
        (originalSignal.id ||
          originalSignal.signalId ||
          originalSignal.ticket ||
          Math.random()) + actionType;
      if (sendingRef.current[reqId]) {
        addLog(`⚠️ Signal Block: Duplicate request ${reqId}`, "SYSTEM");
        return false;
      }

      sendingRef.current[reqId] = true;

      try {
        // Update orchestrator state before execution
        executionOrchestrator.updateState(config, bridgeStatus);

        const success = await executionOrchestrator.executePlan(
          signalsToProcess,
          analysis,
          actionType,
          crlState
        );

        if (
          success &&
          (actionType === "ENTRY" ||
            actionType === "SECURE" ||
            actionType === "HEDGE" ||
            actionType === "FLIP")
        ) {
          sentSignalsRef.current.add(originalSignal.id);
          if (sentSignalsRef.current.size > 1000) {
            const arr = Array.from(sentSignalsRef.current);
            sentSignalsRef.current = new Set(arr.slice(arr.length - 500));
          }
        }
        return success;
      } finally {
        delete sendingRef.current[reqId];
      }
    },
    [config, bridgeStatus, addLog, executionOrchestrator],
  );

  useEffect(() => {
    const handleBtcSummary = (data: any) => {
      const perp = data.find((s: any) =>
        s?.instrument_name?.includes("BTC-PERPETUAL"),
      );
      if (perp) btcDataRef.current.summary = perp;
    };
    const handleEthSummary = (data: any) => {
      const perp = data.find((s: any) =>
        s?.instrument_name?.includes("ETH-PERPETUAL"),
      );
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
      deribitSocket.unsubscribe(`book.summary.BTC.future`, handleBtcSummary);
      deribitSocket.unsubscribe(`book.summary.ETH.future`, handleEthSummary);
            deribitSocket.unsubscribe(`ticker.BTC-PERPETUAL.raw`, handleBtcTicker);
      deribitSocket.unsubscribe(`ticker.ETH-PERPETUAL.raw`, handleEthTicker);
            deribitSocket.unsubscribe(
        `book.BTC-PERPETUAL.none.10.100ms`,
        handleBtcBook,
      );
      deribitSocket.unsubscribe(
        `book.ETH-PERPETUAL.none.10.100ms`,
        handleEthBook,
      );
      deribitSocket.unsubscribe(`trades.BTC-PERPETUAL.100ms`, handleBtcTrades);
      deribitSocket.unsubscribe(`trades.ETH-PERPETUAL.100ms`, handleEthTrades);
    };
  }, []);

  const updateMarketData = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      // Run bridge checks in parallel without blocking market data
      Promise.allSettled([
        checkBridgeStatus(config.webhookUrl).then((isOnline) => {
          setBridgeStatus(isOnline);
          if (prevBridgeStatusRef.current === true && isOnline === false) {
            addLog("⚠️ انقطع الاتصال بالجسر (Bridge Connection Lost)", "RISK");
          }
          prevBridgeStatusRef.current = isOnline;
        }),
        // Fetch MT5 Errors
        (async () => {
          try {
            const effectiveUrl = getEffectiveUrl(config.webhookUrl);
            const res = await fetch(`${effectiveUrl.replace(/\/$/, "")}/api/mt5/errors`);
            const errors = await res.json();
            if (errors && errors.length > 0) {
                 errors.forEach((err: any) => {
                     if (err.error === 'BROKER_SYMBOL_NOT_RESOLVED') {
                         executionSanityDiagnosticService.recordRejection(err.id, 'execution_orchestrator', 'BROKER_SYMBOL_NOT_RESOLVED', err.message);
                         addLog(`❌ MT5 Bridge Error: ${err.message}`, 'ERROR');
                     }
                 });
             }
          } catch(e) {}
        })(),

        fetchBridgeState(config.webhookUrl).then((bridgeState: any) => {
          if (bridgeState && bridgeState.closedTrades) {
            bridgeState.closedTrades.forEach((trade: any) => {
              updateTradeHistory(trade);
            });
          }
        }),
      ]);

      const processAsset = async (asset: "BTC" | "ETH") => {
        try {
          const liveData =
            asset === "BTC" ? btcDataRef.current : ethDataRef.current;

          // Fallback to REST if socket hasn't provided summary yet or if price is invalid
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
            console.log("REST Fallback used for", asset, "got:", perp);
          }

          if (perp) {
            const assetName =
              perp.instrument_name ||
              (asset === "BTC" ? "BTC-PERPETUAL" : "ETH-PERPETUAL");
            console.log(
              `🔍 [SignalDebug] Asset: ${asset}, Perp found: ${!!perp}, AssetName: ${assetName}`,
            );

            // Check SECURE logic against real managed trades from bridge
            // Trade management logic removed

            let dvol = 0;
            let optVol = 0;
            let candles = null;
            let dailyCandles = null;

            [dvol, optVol, candles, dailyCandles] = await Promise.all([
              fetchDVOL(asset).catch(() => 60),
              fetchOptionsVolume(asset).catch(() => []),
              fetchCandles(assetName, 15).catch(() => null),
              fetchDailyCandles(assetName).catch(() => null),
            ]);
            addLog(
              `DEBUG: Data fetched for ${asset}: price=${perp?.last || perp?.last_price}, dvol=${dvol}, optVol=${optVol}, candles=${!!candles}, dailyCandles=${!!dailyCandles}`,
              "SYSTEM",
            );
            console.log("ProcessAsset", asset, "Perp:", perp);


            let orderBook = liveData.book;
            if (!orderBook) {
              try {
                orderBook = await fetchOrderBook(assetName);
              } catch (e) {
                orderBook = { bids: [], asks: [] };
              }
            }

            // Normalize ticker data to match summary structure if needed
            const normalizedPerp = {
              ...perp,
              last: perp.last || perp.last_price || 0,
              instrument_name: assetName,
            };

            const allSummaries = [
              btcDataRef.current.summary || btcDataRef.current.ticker,
              ethDataRef.current.summary || ethDataRef.current.ticker,
            ]
              .filter(Boolean)
              .map((s) => ({
                ...s,
                last: s.last || s.last_price || 0,
                instrument_name: s.instrument_name || "UNKNOWN",
              }));

            const { signals: rawSignals, signal: rawSignal, analysis } = generateSignal(
              asset,
              normalizedPerp,
              allSummaries,
              undefined,
              candles,
              dailyCandles,
              orderBook,
              dvol,
              optVol,
              config,
              asset === "BTC" ? btcTradeBuffer.getRecentTrades() : ethTradeBuffer.getRecentTrades(),
            );
            let signal = rawSignal;
            let signalsToProcess = rawSignals && rawSignals.length > 0 ? rawSignals : (signal ? [signal] : []);
            
            if (signalsToProcess.length > 0) {
              signalsToProcess.forEach((s, idx) => {
                  const currentMinute = Math.floor(Date.now() / 60000);
                  const stratAssetId = `${s.strategy}-${s.asset}`;
                  s.id = `${stratAssetId}-${s.direction}-${currentMinute}-${idx}`;
              });
            }
            if (signal) {
              const currentMinute = Math.floor(Date.now() / 60000);
              const stratAssetId = `${signal.strategy}-${signal.asset}`;
              signal.id = `${stratAssetId}-${signal.direction}-${currentMinute}`;
            }

            const enrichedAnalysis = {
              ...analysis,
              isNewsPaused: false,
              isDailyLossPaused: sendingRef.current["DAILY_LOSS_LOG"] || false,
              activeEvent: undefined,
            };

            const updateState = (prev: MarketAnalysisState | null) => {
              if (
                enrichedAnalysis.qualityScore === 0 &&
                (enrichedAnalysis.primaryBlocker === "INSUFFICIENT DATA" ||
                  enrichedAnalysis.primaryBlocker === "WAITING FOR DATA")
              ) {
                if (prev && prev.price > 0) {
                  return { ...prev, primaryBlocker: enrichedAnalysis.primaryBlocker };
                }
                return enrichedAnalysis;
              }
              return enrichedAnalysis;
            };

            if (asset === "BTC") setBtcAnalysis(updateState);
            else setEthAnalysis(updateState);

            console.log(
              `🔍 [SignalDebug] Asset: ${asset}, Signal:`,
              signal,
              "HasID:",
              signal?.id,
              "AlreadySent:",
              signal ? sentSignalsRef.current.has(signal.id) : "N/A",
            );
            if (signal && !sentSignalsRef.current.has(signal.id)) {
              lastSignalTimeRef.current = Date.now();
              noSignalsAlertSentRef.current = false;
              sentSignalsRef.current.add(signal.id);
              if (sentSignalsRef.current.size > 1000) {
                const arr = Array.from(sentSignalsRef.current);
                sentSignalsRef.current = new Set(arr.slice(arr.length - 500));
              }
              setSignals((prev) => [signal, ...prev].slice(0, 50));

              addLog(
                `🔍 محاولة معالجة إشارة: ${signal.asset} ${signal.direction} (Score: ${signal.qualityScore})`,
                "SYSTEM",
              );

              console.log(
                `🔍 [ExecutionDebug] Asset: ${asset}, autoExecution: ${config.autoExecution}, isPaused: false, dailyLossLog: ${sendingRef.current["DAILY_LOSS_LOG"]}`,
              );
              if (config.autoExecution && !false) {
                const threshold = config.minSignalScore;
                console.log(
                  `🔍 [SignalCheck] Asset: ${signal.asset}, Score: ${signal.qualityScore}, Threshold: ${threshold}`,
                );

                // We trust the tradingAlgo's validation which already incorporates the executionThreshold
                // or strategy-specific overrides (like Cointegration).
                  if (signal.qualityScore > 0) {
                  console.log(`🚀 [CRITICAL] Executing signal:`, signal);
                  
                  let shouldExecute = true;
                  const mappedSymbol = asset === "BTC" ? "BTCUSD" : "ETHUSD";
                  
                  // 🔥 Advanced Anti-Margin Call Engine (Static Synchronous) 🔥
                  const marginLevel = 1000; // In a real environment, fetch this from MT5 bridge state
                  const accountEquity = (crlStateRef.current && typeof crlStateRef.current.equity === 'number' && crlStateRef.current.equity > 0) ? crlStateRef.current.equity : ((crlStateRef.current && typeof crlStateRef.current.baseline === 'number' && crlStateRef.current.baseline > 0) ? crlStateRef.current.baseline : 3000); // Dynamic from MT5 bridge
                  const riskResult = checkPortfolioRisk(managedTradesRef.current, signal, config.maxOpenTrades, accountEquity, marginLevel);
                  
                  if (!riskResult.isSafeToTrade) {
                      shouldExecute = false;
                      addLog(`🛑 Risk Engine BLOCKED Trade: ${riskResult.reason}`, "RISK");
                      executionDecisionTraceService.initTrace(signal, false);
                      executionDecisionTraceService.recordPreTrade(false, riskResult.reason, "PORTFOLIO_RISK");
                      executionDecisionTraceService.recordBlock("PRE_TRADE", riskResult.reason);
                      executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                  } else {
                      if (riskResult.suggestedLotMultiplier < 1.0) {
                          addLog(`🛡️ Risk Engine Adjusted Position Size (Multiplier: ${riskResult.suggestedLotMultiplier.toFixed(2)}) to prevent overexposure.`, "RISK");
                          // We apply this multiplier by adding it to the signal object payload
                          signal.lotMultiplier = riskResult.suggestedLotMultiplier;
                      }
                      
                      const isTradeMatchingDirection = (tradeDir: any, sigDir: any) => {
                          const td = String(tradeDir).toUpperCase();
                          const sd = String(sigDir).toUpperCase();
                          if (sd === 'LONG') {
                              return td === 'LONG' || td === 'BUY' || td === '0';
                          }
                          if (sd === 'SHORT') {
                              return td === 'SHORT' || td === 'SELL' || td === '1';
                          }
                          return false;
                      };
                      const activeTrades = managedTradesRef.current.filter(t => t.asset === mappedSymbol && isTradeMatchingDirection(t.direction, signal.direction));
                      
                      // 1. Adaptive Drawdown Safe Mode & Lot Scaling (Institutional Circuit Breaker)
                      const totalActivePnL = managedTradesRef.current.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
                      const currentEquity = accountEquity || 3000;
                      const floatingDrawdownPercent = currentEquity > 0 ? (Math.max(0, -totalActivePnL) / currentEquity) * 100 : 0;
                      
                      let safetyLotMultiplier = 1.0;
                      if (floatingDrawdownPercent >= 5.0) {
                          shouldExecute = false;
                          executionDecisionTraceService.initTrace(signal, false);
                          executionDecisionTraceService.recordPreTrade(false, "Floating Drawdown >= 5%", "DRAWDOWN_LIMIT");
                          executionDecisionTraceService.recordBlock("PRE_TRADE", "Floating Drawdown >= 5%");
                          executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                      } else if (floatingDrawdownPercent >= 3.0) {
                          safetyLotMultiplier = 0.25;
                      } else if (floatingDrawdownPercent >= 1.5) {
                          safetyLotMultiplier = 0.50;
                      }
                      
                      if (shouldExecute && safetyLotMultiplier < 1.0) {
                          signal.lotMultiplier = (signal.lotMultiplier || 1.0) * safetyLotMultiplier;
                      }

                      // 2. Cooldown check
                      if (shouldExecute) {
                          const cooldownKey = `${signal.asset}-${signal.direction}`;
                          const lastExec = lastExecutedTimeRef.current[cooldownKey] || 0;
                          const elapsedMins = (Date.now() - lastExec) / 60000;
                          const requiredCooldown = Math.max(5, config.cooldownSameAssetMins || 15);
                          
                          if (elapsedMins < requiredCooldown) {
                              shouldExecute = false;
                              // Spammy log removed
                          }
                      }
                      
                      if (shouldExecute && activeTrades.length >= (config.maxTradesPerWave || 15)) {
                          shouldExecute = false;
                          // Spammy log removed
                      }
                      
                      if (shouldExecute && activeTrades.length > 0) {
                          const currentPrice = signal.entry || enrichedAnalysis.price;
                          const dvol = enrichedAnalysis.dvol || 50; // Annualized volatility percentage
                          
                          // Calculate Expected Daily Move USD based on DVOL
                          const expectedDailyMovePercent = (dvol / 100) / Math.sqrt(365);
                          const expectedDailyMoveUSD = currentPrice * expectedDailyMovePercent;
                          
                          const baseDistance = (config.dynamicVolSpacing || 0.25) * expectedDailyMoveUSD;
                                                    // --- Smart Hierarchical Reinforcement (التعزيز الهرمي الذكي) ---
                          let isPyramiding = false;
                          let pyramidingDiscount = 1.0;
                          
                          // Check if we are in profit and momentum is strong (Pyramiding condition)
                          if (activeTrades.length > 0) {
                              const lastTrade = activeTrades.reduce((latest, current) => {
                                  return (current.ticket > latest.ticket) ? current : latest;
                              }, activeTrades[0]);
                              
                              const isLong = signal.direction === 'LONG';
                              const profitDistance = isLong ? (currentPrice - (lastTrade.entryPrice || lastTrade.openPrice || 0)) : ((lastTrade.entryPrice || lastTrade.openPrice || 0) - currentPrice);
                              
                              if (profitDistance > 0 && (enrichedAnalysis.regime === 'MOMENTUM_TREND' || enrichedAnalysis.regime === 'HIGH_VOLATILITY')) {
                                  isPyramiding = true;
                                  pyramidingDiscount = 0.75; // Allow slightly closer entries when riding a strong trend
                              }
                          }
                          
                          const progressiveMultiplier = 1 + (activeTrades.length - 1) * (isPyramiding ? 0.3 : 0.5);
                          const minDistanceAdjusted = baseDistance * progressiveMultiplier * pyramidingDiscount;

                          for (const trade of activeTrades) {
                              const tradeDistance = Math.abs((trade.entryPrice || trade.openPrice || 0) - currentPrice);
                              if (tradeDistance < minDistanceAdjusted) {
                                  shouldExecute = false;
                                  executionDecisionTraceService.initTrace(signal, false);
                                  executionDecisionTraceService.recordPreTrade(false, `Too close to existing trade. Distance: ${tradeDistance.toFixed(2)}, Min: ${minDistanceAdjusted.toFixed(2)}`, "PYRAMIDING_DISTANCE");
                                  executionDecisionTraceService.recordBlock("PRE_TRADE", "Too close to existing trade");
                                  executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                                  break;
                              }
                          }
                          
                          if (shouldExecute && isPyramiding) {
                               // Pyramiding reduces the lot size for the new entry to maintain a pyramid shape (largest at bottom)
                               // Apply a 0.6x multiplier for each subsequent entry
                               const pyramidScale = Math.pow(0.6, activeTrades.length);
                               signal.lotMultiplier = (signal.lotMultiplier || 1.0) * pyramidScale;
                               addLog(`🔼 [PYRAMIDING] تعزيز هرمي في اتجاه الربح للزخم القوي. تم تقليص حجم العقد بمعامل ${pyramidScale.toFixed(2)} لحماية الأرباح.`, 'STRATEGY_SWITCH');
                          }
                      }

                      if (shouldExecute) {
                        let actionType = "ENTRY";
                        // 1. Flip (Reversal) Logic
                        if (config.flipEnabled && enrichedAnalysis.reversalProbability >= (config.flipSensitivityScore || 85)) {
                          actionType = "FLIP";
                          addLog(`🔄 تم تفعيل نظام الانعكاس (FLIP) - احتمالية الانعكاس: ${enrichedAnalysis.reversalProbability.toFixed(1)}%`, 'STRATEGY_SWITCH');
                        } 
                        // 2. Hedge Logic (When uncertain or volatile)
                        else if (config.autoHedgeEnabled && signal.qualityScore < 85 && Math.abs(enrichedAnalysis.vwapDeviation) > 0.02) {
                          actionType = "HEDGE";
                          addLog(`🛡️ تم تفعيل نظام الهيدج (HEDGE) - تحوط بسبب الانحراف: ${(enrichedAnalysis.vwapDeviation * 100).toFixed(2)}%`, 'HEDGE');
                        }
      
                        const cooldownKey = `${signal.asset}-${signal.direction}`;
                        // Fast lock to prevent race conditions during async execution
                        lastExecutedTimeRef.current[cooldownKey] = Date.now();

                        // تنفيذ مباشر بعد المرور بخوارزمية التداول
                        handleSendSignal(
                          signalsToProcess,
                          enrichedAnalysis,
                          actionType
                        ).then(success => {
                            if (!success) {
                              // Revert fast lock on failure
                              lastExecutedTimeRef.current[cooldownKey] = 0;
                              addLog(
                                `⚠️ إشارة تم حظرها داخلياً في طبقة التنفيذ! (Compliance)`,
                                "RISK",
                              );
                            } else {
                              addLog(`✅ تم إرسال الإشارة بنجاح للجسر! (النوع: ${actionType})`, "EXEC");
                            }
                        });
                      }
                  }
                } else {
                  addLog(`⚠️ Signal Block: Invalid signal score 0`, "SYSTEM");
                }
              } else {
                console.log(
                  `🔍 [SignalBlock] Execution Blocked: autoExecution=${config.autoExecution}, isPaused=false, dailyLossPaused=${sendingRef.current["DAILY_LOSS_LOG"]}`,
                );
                addLog(
                  `⚠️ Execution Blocked: autoExecution=${config.autoExecution}, isPaused=false, dailyLossPaused=${sendingRef.current["DAILY_LOSS_LOG"]}`,
                  "SYSTEM",
                );
              }
            }
          } else {
            console.log(`🔍 [SignalDebug] Asset: ${asset}, Perp NOT found.`);
            const fallbackAnalysis = {
              asset,
              price: 0,
              trend: "NEUTRAL",
              volatility: 0,
              volume: 0,
              rSquared: 0,
              dvol: 0,
              hurst: 0.5,
              rsi: 50,
              volRatio: 1,
              yearlyHigh: 0,
              yearlyLow: 0,
              pricePositionRank: 50,
              regime: "CHOPPY/NOISE",
              qualityScore: 0,
              primaryBlocker: "WAITING FOR DATA",
              isCooldownActive: false,
              cooldownRemaining: 0,
              isCorrelatedBlocked: false,
              liquidityGap: 0,
              toxicityScore: 0,
              estimatedSlippage: 0,
              dataLatencyMs: 0,
              scoreBreakdown: [],
              dominantFactor: "NONE",
              reversalProbability: 0,
              trendStrength: 0,
              trendDirection: "NEUTRAL",
              fundingRate: 0,
              openInterest: 0,
              isNewsPaused: false,
              isDailyLossPaused: sendingRef.current["DAILY_LOSS_LOG"] || false,
              mtfStatus: {
                dailyTrend: "NEUTRAL",
                h4Regime: "CHOPPY/NOISE",
                m15Trigger: false,
              },
              vwapDeviation: 0,
              vwapZScore: 0,
              vwapMain: 0,
              vwapUpper: 0,
              vwapLower: 0,
            };
            const updateFallbackState = (prev: MarketAnalysisState | null) => {
              return prev
                ? { ...prev, primaryBlocker: "WAITING FOR DATA" }
                : (fallbackAnalysis as any);
            };
            if (asset === "BTC") setBtcAnalysis(updateFallbackState);
            else setEthAnalysis(updateFallbackState);
          }
        } catch (e) {
          console.error(`Error processing asset ${asset}:`, e);
        }
      };
      // Check for signal absence
      const timeSinceLastSignal = Date.now() - lastSignalTimeRef.current;
      // Removed 5-min and 15-min inactivity alerts per user request: markets can be quiet for long periods.

      // Process assets with staggering
      await processAsset("BTC");
      await new Promise((r) => setTimeout(r, 2000)); // 2s stagger
      await processAsset("ETH");
    } finally {
      isProcessingRef.current = false;
    }
  }, [config, handleSendSignal, addLog]);

  const updateMarketDataRef = useRef(updateMarketData);
  useEffect(() => {
    updateMarketDataRef.current = updateMarketData;
  }, [updateMarketData]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let timeoutRef: NodeJS.Timeout;
    let activeController: AbortController | null = null;
    const pollManagedTrades = async () => {
      try {
        const effectiveUrl = getEffectiveUrl(config.webhookUrl);
        activeController = new AbortController();
        const id = setTimeout(() => {
          if (activeController) activeController.abort();
        }, 2500);
        
        const res = await fetch(
          `${effectiveUrl}/api/bridge/managed-trades`,
          { signal: activeController.signal }
        );
        clearTimeout(id);
        if (res.ok) {
          const data = await res.json();
          const trades = (data as any).trades || [];
          if (JSON.stringify(trades) !== JSON.stringify(managedTradesRef.current)) {
            setManagedTrades(trades);
            managedTradesRef.current = trades;
          }
          if ((data as any).crlState) {
              if (JSON.stringify((data as any).crlState) !== JSON.stringify(crlStateRef.current)) {
                setCrlState((data as any).crlState);
              }
          }
        }
      } catch (e) {
        // silent fail
      }
      timeoutRef = setTimeout(pollManagedTrades, 15000);
    };
    if (config.webhookUrl) {
      pollManagedTrades();
    }
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      if (activeController) activeController.abort();
    };
  }, [config.webhookUrl]);

  const handleManualClose = useCallback(
    async (ticket: string) => {
      // Create a dummy signal to close specific ticket
      const closeSignal = {
        id: `MANUAL_CLOSE_${Date.now()}`,
        timestamp: Date.now(),
        asset: "",
        direction: SignalDirection.LONG,
        strength: SignalStrength.STANDARD,
        entry: 0,
        stopLoss: 0,
        takeProfit: 0,
        tp1: 0,
        tp2: 0,
        qualityScore: 100,
        reasoning: "Manual Close",
        strategy: "WAIT",
        ticket: ticket,
        action: "CLOSE",
        details: {
          volumeMultiplier: 1,
          fundingRate: 0,
          correlationScore: 0,
          fisher: 0,
          volatilityPremium: 0,
          statisticalEdge: 0,
          quantRegime: "",
          vwap: 0,
          vwapDeviation: 0,
          hurstExponent: 0,
        },
      };

      const analysis = { asset: "", price: 0 } as any;

      await handleSendSignal([closeSignal as any], analysis, "CLOSE");
      addLog(`تم طلب إغلاق يدوي للصفقة ${ticket}`, "EXEC");
    },
    [handleSendSignal, addLog],
  );

  useEffect(() => {
    let timeoutRef: NodeJS.Timeout;
    const runUpdate = async () => {
      if (connectionDisabledRef.current) return;
      await updateMarketDataRef.current();
      timeoutRef = setTimeout(runUpdate, 30000);
    };
    runUpdate();
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      `arkon_config_v${CURRENT_VERSION}`,
      JSON.stringify(config),
    );
  }, [config]);

  useEffect(() => {
    // Calculate performance metrics from tradeHistory and update config.strategyPerformance
    const newPerformance = { ...config.strategyPerformance };

    // Reset performance metrics
    Object.keys(newPerformance).forEach((key) => {
      newPerformance[key as StrategyType] = {
        ...newPerformance[key as StrategyType],
        wins: 0,
        losses: 0,
        totalProfitPoints: 0,
        totalLossPoints: 0,
        successScore: 0,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        lastTradeTime: 0,
        consecutiveLosses: 0,
      };
    });

    // Sort history by time to calculate consecutive losses and drawdown properly
    const sortedHistory = [...tradeHistory].sort(
      (a, b) => a.closeTime - b.closeTime,
    );

    const equityCurves: Record<string, number[]> = {};

    sortedHistory.forEach((trade) => {
      const strat = trade.strategy as StrategyType;
      if (newPerformance[strat]) {
        const pnl = trade.pnlPoints || 0;
        newPerformance[strat].totalTrades += 1;
        newPerformance[strat].lastTradeTime = Math.max(
          newPerformance[strat].lastTradeTime,
          trade.closeTime,
        );

        if (!equityCurves[strat]) equityCurves[strat] = [0];
        const currentEquity =
          equityCurves[strat][equityCurves[strat].length - 1] + pnl;
        equityCurves[strat].push(currentEquity);

        if (pnl > 0) {
          newPerformance[strat].wins += 1;
          newPerformance[strat].totalProfitPoints += pnl;
          newPerformance[strat].consecutiveLosses = 0;
        } else {
          newPerformance[strat].losses += 1;
          newPerformance[strat].totalLossPoints += Math.abs(pnl);
          newPerformance[strat].consecutiveLosses += 1;
        }
      }
    });

    // Calculate advanced metrics
    Object.keys(newPerformance).forEach((key) => {
      const strat = key as StrategyType;
      const perf = newPerformance[strat];

      if (perf.totalTrades > 0) {
        perf.winRate = perf.wins / perf.totalTrades;
        perf.profitFactor =
          perf.totalLossPoints !== 0
            ? perf.totalProfitPoints / perf.totalLossPoints
            : perf.totalProfitPoints > 0
              ? 2
              : 0;

        // Calculate Max Drawdown
        const curve = equityCurves[strat] || [0];
        let peak = curve[0];
        let maxDD = 0;
        for (const val of curve) {
          if (val > peak) peak = val;
          const dd = peak - val;
          if (dd > maxDD) maxDD = dd;
        }
        perf.maxDrawdown = maxDD;

        // Calculate Sharpe Ratio (simplified: avg trade / std dev of trades)
        const trades = sortedHistory
          .filter((t) => t.strategy === strat)
          .map((t) => t.pnlPoints || 0);
        if (trades.length > 1) {
          const avg = trades.reduce((a, b) => a + b, 0) / trades.length;
          const variance =
            trades.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
            (trades.length - 1);
          const stdDev = Math.sqrt(variance);
          perf.sharpeRatio =
            stdDev !== 0 ? (avg / stdDev) * Math.sqrt(trades.length) : 0; // Annualized-ish
        }

        // Success score: winRate * 100 * (profitFactor > 1 ? 1.2 : 0.8) - penalty for high DD
        let score = perf.winRate * 100 * (perf.profitFactor > 1 ? 1.2 : 0.8);
        if (perf.maxDrawdown > 1000) score -= 20; // Arbitrary penalty for high drawdown
        if (perf.consecutiveLosses >= 3) score -= 15; // Penalty for losing streak
        perf.successScore = Math.round(Math.max(0, Math.min(100, score)));

        // Auto-disable if score < threshold and strategy has trades
        if (
          config.autoDisableThreshold > 0 &&
          perf.successScore < config.autoDisableThreshold
        ) {
          perf.isEnabled = false;
        }
      }
    });

    if (
      JSON.stringify(newPerformance) !==
      JSON.stringify(config.strategyPerformance)
    ) {
      setConfig((prev) => ({ ...prev, strategyPerformance: newPerformance }));
    }
  }, [tradeHistory, config.autoDisableThreshold]);

  const totalPnL = 0;

  return (
    <div
      className="min-h-screen pb-12 px-6 pt-8 max-w-[1920px] mx-auto space-y-6 text-right font-sans bg-[#050507]"
      dir="rtl"
    >
      {/* Dynamic Settings Command Center */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/98 backdrop-blur-3xl">
          <div className="glass-card w-full max-w-7xl rounded-[3rem] border-zinc-800 p-0 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex h-[85vh] overflow-hidden">
            {/* Modal Navigation Sidebar */}
            <div className="w-80 bg-zinc-950/50 border-l border-zinc-900 p-10 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
              <div className="mb-10 text-center">
                <div className="w-20 h-20 bg-amber-500 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-6">
                  <i className="fas fa-terminal text-black text-3xl"></i>
                </div>
                <h3 className="text-white font-black text-xl italic uppercase tracking-tighter">
                  Command Node
                </h3>
                <p className="text-[10px] text-zinc-600 uppercase font-black tracking-widest mt-1">
                  v{CURRENT_VERSION}
                </p>
              </div>
              {[
                { id: "ENGINE", label: "الأساسيات (Engine)", icon: "bolt" },
                {
                  id: "RISK_COMPLIANCE",
                  label: "المخاطر والامتثال",
                  icon: "shield-halved",
                },
                { id: "STRATEGY", label: "استراتيجيات التداول", icon: "robot" },
                {
                  id: "CHASE",
                  label: "الملاحقة والتعطيل",
                  icon: "arrow-trend-up",
                },
                { id: "SYSTEM", label: "النظام والجسر", icon: "server" },
                { id: "MQL5", label: "كود الميتاتريدر (MQL5)", icon: "code" },
                { id: "DIAGNOSTICS", label: "التشخيص (Diagnostics)", icon: "stethoscope" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id as any)}
                  className={`flex items-center gap-5 px-6 py-5 rounded-2xl text-[11px] font-black transition-all ${settingsTab === tab.id ? "bg-white text-black translate-x-[-10px]" : "text-zinc-500 hover:bg-white/5"}`}
                >
                  <i className={`fas fa-${tab.icon} text-lg w-6`}></i>{" "}
                  {tab.label}
                </button>
              ))}
              <div className="mt-auto pt-10 border-t border-zinc-900">
                <button
                  onClick={() => {
                    if (window.confirm("إعادة ضبط كافة البروتوكولات؟"))
                      setConfig(DEFAULT_CONFIG);
                  }}
                  className="w-full text-rose-500 text-[10px] font-black uppercase tracking-widest hover:text-rose-400 transition-all flex items-center justify-center gap-3"
                >
                  <i className="fas fa-undo-alt"></i> استعادة الإعدادات الأصلية
                </button>
              </div>
            </div>

            {/* Modal Viewport */}
            <div className="flex-1 p-20 overflow-y-auto custom-scrollbar relative bg-zinc-950/20">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-10 left-10 w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all z-10 shadow-2xl"
              >
                <i className="fas fa-times text-2xl"></i>
              </button>

              <div className="max-w-4xl space-y-16 animate-in slide-in-from-left duration-500">
                {/* 1. ENGINE */}
                {settingsTab === "ENGINE" && (
                  <EngineSettings config={config} setConfig={setConfig} />
                )}

                {/* 2. RISK & COMPLIANCE */}
                {settingsTab === "RISK_COMPLIANCE" && (
                  <div className="space-y-12">
                    <h2 className="text-5xl font-black text-white italic tracking-tighter">
                      المخاطر والامتثال
                    </h2>
                    <RiskManagementSettings
                      config={config}
                      setConfig={setConfig}
                    />
                  </div>
                )}

                {/* 3. STRATEGIES */}
                {settingsTab === "STRATEGY" && (
                  <HedgeSettings config={config} setConfig={setConfig} />
                )}

                {/* 4. TRAILING CHASE */}
                {settingsTab === "CHASE" && (
                  <TrailingChaseSettings
                    config={config}
                    setConfig={setConfig}
                  />
                )}

                {/* 8. SYSTEM & BRIDGE */}
                {settingsTab === "SYSTEM" && (
                  <div className="space-y-12">
                    <h2 className="text-5xl font-black text-white italic tracking-tighter">
                      أمان الجسر وإعدادات التليجرام
                    </h2>
                    
                    {/* Telegram Configuration */}
                    <div className="space-y-8 p-8 bg-zinc-900/40 rounded-[2.5rem] border border-zinc-800 group hover:border-indigo-500/30 transition-all">
                      <div className="flex justify-between items-center">
                        <div>
                          <label className="text-xs font-black text-white block mb-1">
                            تفعيل إشعارات التليجرام
                          </label>
                          <p className="text-[10px] text-zinc-500">
                            إرسال الإشعارات والتقارير الفورية
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.enableTelegramAlerts}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              enableTelegramAlerts: e.target.checked,
                            })
                          }
                          className="w-8 h-8 accent-indigo-500 cursor-pointer"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            Bot Token
                          </label>
                          <input
                            type="password"
                            value={config.telegramBotToken}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                telegramBotToken: e.target.value,
                              })
                            }
                            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-indigo-500/50 outline-none"
                          />
                        </div>
                        <div className="space-y-4">
                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            Chat ID
                          </label>
                          <input
                            type="text"
                            value={config.telegramChatId}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                telegramChatId: e.target.value,
                              })
                            }
                            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-indigo-500/50 outline-none"
                          />
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await sendTestMessage(
                            config.telegramBotToken,
                            config.telegramChatId,
                            config.webhookUrl,
                          );
                          addLog(
                            res.success
                              ? "✅ تم إرسال إشعار الاختبار"
                              : "❌ فشل اختبار التليجرام",
                            res.success ? "SYSTEM" : "ERROR",
                          );
                        }}
                        className="w-full py-8 bg-indigo-500 text-white font-black rounded-3xl hover:bg-indigo-400 active:scale-95 transition-all text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-500/20"
                      >
                        اختبار اتصال التليجرام
                      </button>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            رابط الـ Webhook الخاص بـ MT5
                          </label>
                          <span className="text-[10px] text-zinc-500 font-bold">
                            {config.webhookUrl.includes("127.0.0.1") || config.webhookUrl.includes("localhost") ? "🔌 وضع محلي نشط" : "🌐 وضع سحابي نشط"}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={config.webhookUrl}
                          onChange={(e) =>
                            setConfig({ ...config, webhookUrl: e.target.value })
                          }
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-zinc-500/50 outline-none"
                        />
                        
                        {/* Quick Connection Presets */}
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setConfig(prev => ({ ...prev, webhookUrl: "http://127.0.0.1:3000" }));
                              addLog("🔌 تم تغيير الرابط إلى السيرفر المحلي: http://127.0.0.1:3000", "SYSTEM");
                            }}
                            className={`flex-1 py-4 px-6 rounded-2xl text-[11px] font-black tracking-wider transition-all border cursor-pointer ${
                              config.webhookUrl.includes("127.0.0.1") || config.webhookUrl.includes("localhost")
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                                : "bg-zinc-900/40 border-zinc-900 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                            }`}
                          >
                            💻 تشغيل محلي (Local: 3000)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfig(prev => ({ ...prev, webhookUrl: window.location.origin }));
                              addLog(`🌐 تم تغيير الرابط إلى السيرفر السحابي: ${window.location.origin}`, "SYSTEM");
                            }}
                            className={`flex-1 py-4 px-6 rounded-2xl text-[11px] font-black tracking-wider transition-all border cursor-pointer ${
                              !config.webhookUrl.includes("127.0.0.1") && !config.webhookUrl.includes("localhost")
                                ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                                : "bg-zinc-900/40 border-zinc-900 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                            }`}
                          >
                            ☁️ تشغيل سحابي (Cloud Run)
                          </button>
                        </div>
                        
                        <p className="text-[10px] text-zinc-500 leading-relaxed bg-zinc-950/40 p-4 rounded-2xl border border-zinc-900">
                          ℹ️ <strong>ملاحظة هامة:</strong> الرابط الافتراضي للمنصة هو المحلي (http://127.0.0.1:3000). وإذا تم تحميل الإعدادات السحابية سابقاً، يرجع ذلك إلى حفظ المتصفح لآخر رابط في الذاكرة التخزينية (LocalStorage) للنطاق السحابي الحالي. يمكنك نقر الزر أعلاه للتحويل الفوري والتخزين المحلي.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                          مفتاح التشفير السري (Secret Key)
                        </label>
                        <input
                          type="password"
                          value={config.webhookSecret}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              webhookSecret: e.target.value,
                            })
                          }
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-zinc-500/50 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "هل أنت متأكد من تصفير حالة الجسر؟",
                              )
                            ) {
                              const res = await clearRemoteBridge(
                                config.webhookUrl,
                                config.webhookSecret,
                              );
                              if (res.success) {
                                addLog(
                                  "✅ تم تصفير حالة الجسر بنجاح",
                                  "SYSTEM",
                                );
                              } else {
                                addLog("❌ فشل تصفير حالة الجسر", "ERROR");
                              }
                            }
                          }}
                          className="col-span-2 py-6 bg-rose-500 text-white font-black rounded-3xl hover:bg-rose-600 transition-all text-sm uppercase tracking-[0.2em] shadow-2xl shadow-rose-500/20"
                        >
                          تصفير حالة الجسر
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "سيتم تصفير كافة السجلات والصفقات في الجسر حالاً. هل أنت متأكد؟",
                              )
                            ) {
                              const res = await clearRemoteBridge(
                                config.webhookUrl,
                                config.webhookSecret,
                              );
                              addLog(
                                res.success
                                  ? "✅ تم تصفير بيانات الجسر"
                                  : "❌ فشل تصفير الجسر",
                                "SYSTEM",
                              );
                            }
                          }}
                          className="py-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black rounded-3xl hover:bg-rose-500 hover:text-white transition-all text-xs uppercase tracking-widest"
                        >
                          تصفير ذاكرة الجسر
                        </button>
                        <button
                          onClick={async () => {
                            addLog("📦 جاري تحضير وتجميع كود المشروع بالكامل في أرشيف مضغوط...", "SYSTEM");
                            try {
                              const response = await fetch(`${window.location.origin}/api/download-source`);
                              if (!response.ok) throw new Error("استجابة غير صالحة من الخادم");
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = "arkon-trading-app.zip";
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                              addLog("✅ تم تنزيل الملف المضغوط arkon-trading-app.zip بنجاح ويحتوي على الكود النقي!", "SYSTEM");
                            } catch (error: any) {
                              addLog(`❌ فشل تحميل الملف المضغوط: ${error?.message || error}`, "SYSTEM");
                            }
                          }}
                          className="w-full bg-blue-600/20 hover:bg-blue-500/30 text-blue-400 font-bold py-6 rounded-3xl transition-all duration-300 transform active:scale-95 flex flex-col justify-center items-center gap-2 text-center items-center justify-center cursor-pointer"
                        >
                          تحميل الكود بالكامل (ZIP)
                        </button>
                        <button
                          onClick={async () => {
                            const isOnline = await checkBridgeStatus(
                              config.webhookUrl,
                            );
                            setBridgeStatus(isOnline);
                            addLog(
                              isOnline
                                ? "✅ الجسر متصل ومستقر"
                                : "❌ لا يمكن الوصول للجسر",
                              "SYSTEM",
                            );
                          }}
                          className="py-8 bg-zinc-800 text-white font-black rounded-3xl hover:bg-zinc-700 transition-all text-xs uppercase tracking-widest"
                        >
                          تحقق من الاتصال
                        </button>
                        <button
                          onClick={() => {
                            import("./utils/mqlCode").then((m) => {
                              navigator.clipboard.writeText(
                                m.getMQL5Code(
                                  config.webhookUrl,
                                  config.webhookSecret,
                                  config.maxOpenTrades
                                ),
                              );
                              addLog(
                                "📋 تم نسخ كود MQL5 إلى الحافظة",
                                "SYSTEM",
                              );
                            });
                          }}
                          className="py-8 bg-indigo-600 text-white font-black rounded-3xl hover:bg-indigo-500 transition-all text-xs uppercase tracking-widest"
                        >
                          نسخ كود الميتاتريدر
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 9. MQL5 CODE */}
                {settingsTab === "MQL5" && (
                  <Mql5Settings config={config} addLog={addLog} />
                )}

                {/* 10. DIAGNOSTICS */}
                {settingsTab === "DIAGNOSTICS" && (
                  <DiagnosticsSettings />
                )}
              </div>

              {/* Global Save Button */}
              <div className="mt-20 pt-10 border-t border-zinc-900 flex justify-end">
                <button
                  onClick={() => {
                    localStorage.setItem(
                      `arkon_config_v${CURRENT_VERSION}`,
                      JSON.stringify(config),
                    );
                    setIsSettingsOpen(false);
                    addLog("💾 تم تطبيق البروتوكول الجديد بنجاح", "SYSTEM");
                  }}
                  className="px-24 py-8 bg-white text-black font-black rounded-3xl uppercase tracking-[0.4em] hover:bg-amber-500 hover:scale-105 transition-all shadow-2xl shadow-white/5 active:scale-95"
                >
                  حفظ وتنشيط الإعدادات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Header */}
      <header className="flex justify-between items-center mb-10 px-4">
        <div className="flex items-center gap-10">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl group cursor-pointer hover:rotate-12 transition-all">
            <span className="text-black font-black text-3xl">A</span>
          </div>
          <div>
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">
              ARKON <span className="text-amber-500">QUANT</span>{" "}
              <span className="text-zinc-800 not-italic ml-2 text-sm uppercase">
                ELITE v{CURRENT_VERSION}
              </span>
            </h1>
            <div className="flex items-center gap-5 mt-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${bridgeStatus ? "bg-emerald-500 shadow-[0_0_12px_#10b981]" : "bg-rose-500 shadow-[0_0_12px_#f43f5e]"}`}
              ></div>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">
                {bridgeStatus ? "Bridge Relay Connected" : "Relay Disconnected"}
              </span>
              <span className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.3em]">
                | High-Latency Protected
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="group bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 px-8 py-5 rounded-2xl transition-all flex items-center gap-4 shadow-xl"
          >
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              إدارة البروتوكولات
            </span>
            <i className="fas fa-sliders text-amber-500 group-hover:rotate-90 transition-all"></i>
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12 space-y-10">
          {activeTab === "DASHBOARD" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                <MarketStats
                  title="BTC/USD ALGO"
                  state={btcAnalysis}
                  config={config}
                />
                <MarketStats
                  title="ETH/USD ALGO"
                  state={ethAnalysis}
                  config={config}
                />
                {/* Active Trades Panel moved here to utilize space */}
                <div className="glass-card rounded-[4rem] p-8 border border-zinc-900 bg-zinc-950/20 shadow-2xl">
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 pb-4 border-b border-zinc-900/50">
                    Active Managed Trades
                  </h3>
                  <div className="space-y-4 overflow-y-auto max-h-[300px] custom-scrollbar">
                    {managedTrades.length === 0 ? (
                      <div className="text-center text-zinc-600 text-[10px] italic py-10">
                        No active positions synced
                      </div>
                    ) : (
                      managedTrades.map((trade) => (
                        <div
                          key={trade.ticket || trade.signalId}
                          className="p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-white">
                              {trade.asset.replace("USD", "")}
                            </span>
                            <span
                              className={
                                trade.direction === SignalDirection.LONG
                                  ? "text-emerald-500"
                                  : "text-rose-500"
                              }
                            >
                              {trade.direction}
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                            <span>
                              PnL:{" "}
                              {trade.pnl !== undefined && trade.pnl !== null
                                ? `$${trade.pnl.toFixed(2)}`
                                : "..."}
                            </span>
                            <button
                              onClick={() => handleManualClose(trade.ticket)}
                              className="text-rose-500 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-[4rem] p-12 border border-zinc-900 bg-zinc-950/20 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-12 border-b border-zinc-900/50 pb-8">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                    تدفق الإشارات (Quantum Stream)
                  </h3>
                  <div className="flex gap-4 items-center">
                    <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">
                      {signals.length} ACTIVE AUDITS
                    </span>
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {signals.length === 0 ? (
                    <div className="col-span-full py-24 text-center opacity-10 flex flex-col items-center">
                      <i className="fas fa-radar text-7xl mb-6"></i>
                      <p className="text-xs font-black uppercase tracking-[0.5em]">
                        Scanning Block Structure...
                      </p>
                    </div>
                  ) : (
                    signals.map((sig) => (
                      <SignalCard
                        key={sig.id}
                        signal={sig}
                        onSend={handleSendSignal}
                        sending={sendingRef.current[sig.id + "ENTRY"] || false}
                        userRiskCap={config.maxAllocationPerTradePercent}
                        isSystemLocked={false}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <TradePipeline 
              signals={signals} 
              managedTrades={managedTrades} 
              tradeHistory={tradeHistory} 
            />
          )}
        </div>
      </main>

      {/* Footer Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-3xl border-t border-zinc-900 py-6 px-12 flex justify-center items-center gap-20 z-[100] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <button
          onClick={() => setActiveTab("DASHBOARD")}
          className={`group flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeTab === "DASHBOARD" ? "text-amber-500 scale-110" : "text-zinc-700 hover:text-zinc-400"}`}
        >
          <i className="fas fa-chart-line text-lg"></i>
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab("HISTORY")}
          className={`group flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeTab === "HISTORY" ? "text-amber-500 scale-110" : "text-zinc-700 hover:text-zinc-400"}`}
        >
          <i className="fas fa-stream text-lg"></i>
          <span>مسار الصفقات</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
