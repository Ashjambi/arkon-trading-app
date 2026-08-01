/**
 * ARKON v50.0.0 — Custom Hook: محرك الإشارات والتنفيذ
 * استخراج منطق generateSignal, handleSendSignal, margin checks من App.tsx
 */
import { useState, useRef, useCallback, useMemo, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import type { TradingSignal, MarketAnalysisState, AppConfig } from "../types";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator";
import { generateSignal } from "../services/tradingAlgo";
import {
  fetchMarketSummary,
  fetchDVOL,
  fetchOptionsVolume,
  fetchCandles,
  fetchDailyCandles,
  fetchOrderBook,
} from "../services/deribitService";
import { btcTradeBuffer, ethTradeBuffer } from "../services/TradeBuffer";
import { checkPortfolioRisk } from "../services/portfolioRisk";
import { executionDecisionTraceService } from "../services/ExecutionDecisionTraceService";
import { executionSanityDiagnosticService } from "../services/ExecutionSanityDiagnosticService";
import { enhancedExecutionEngine } from "../services/EnhancedExecutionEngine";
import { marginMonitor } from "../services/MarginMonitor";
import { MAX_SENT_SIGNALS_CACHE } from "../utils/constants";

export function useSignalEngine(
  config: AppConfig,
  bridgeStatus: boolean | null,
  addLog: (msg: string, type?: any, details?: any) => void,
  crlStateRef: MutableRefObject<any>,
  managedTradesRef: MutableRefObject<any[]>,
  updateTradeHistory: (trade: any) => void,
  setBtcAnalysis: Dispatch<SetStateAction<MarketAnalysisState | null>>,
  setEthAnalysis: Dispatch<SetStateAction<MarketAnalysisState | null>>,
  setGoldAnalysis: Dispatch<SetStateAction<MarketAnalysisState | null>>,
  btcDataRef: MutableRefObject<{ summary?: any; ticker?: any; book?: any }>,
  ethDataRef: MutableRefObject<{ summary?: any; ticker?: any; book?: any }>,
  goldDataRef: MutableRefObject<{ summary?: any; ticker?: any; book?: any }>,
) {
  const [signals, setSignals] = useState<TradingSignal[]>([]);

  const sendingRef = useRef<Record<string, boolean>>({});
  const sentSignalsRef = useRef<Set<string>>(new Set());
  const lastSignalTimeRef = useRef<number>(Date.now());
  const lastExecutedTimeRef = useRef<Record<string, number>>({});
  const noSignalsAlertSentRef = useRef(false);
  const connectionDisabledRef = useRef(false);

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
      const signalsToProcess = Array.isArray(signalsOrSignal)
        ? signalsOrSignal
        : [signalsOrSignal];
      const originalSignal = signalsToProcess[0];
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
        executionOrchestrator.updateState(config, bridgeStatus);

        const success = await executionOrchestrator.executePlan(
          signalsToProcess,
          analysis,
          actionType,
          crlStateRef.current,
        );

        if (
          success &&
          (actionType === "ENTRY" ||
            actionType === "SECURE" ||
            actionType === "HEDGE" ||
            actionType === "FLIP")
        ) {
          sentSignalsRef.current.add(originalSignal.id);
          if (sentSignalsRef.current.size > MAX_SENT_SIGNALS_CACHE) {
            const arr = Array.from(sentSignalsRef.current);
            sentSignalsRef.current = new Set(
              arr.slice(arr.length - MAX_SENT_SIGNALS_CACHE / 2),
            );
          }
        }
        return success;
      } finally {
        delete sendingRef.current[reqId];
      }
    },
    [config, bridgeStatus, addLog, executionOrchestrator, crlStateRef],
  );

  const processAsset = useCallback(
    async (asset: "BTC" | "ETH" | "GOLD") => {
      try {
        const liveData =
          asset === "BTC" ? btcDataRef.current : (asset === "ETH" ? ethDataRef.current : goldDataRef.current);
        const setAnalysis =
          asset === "BTC" ? setBtcAnalysis : (asset === "ETH" ? setEthAnalysis : setGoldAnalysis);

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

        if (!perp) {
          const fallbackAnalysis = createFallbackAnalysis(asset, sendingRef.current["DAILY_LOSS_LOG"] || false);
          setAnalysis((prev: any) =>
            prev
              ? { ...prev, primaryBlocker: "WAITING FOR DATA" }
              : (fallbackAnalysis as any),
          );
          return;
        }

        const assetName =
          perp.instrument_name ||
          (asset === "BTC" ? "BTC-PERPETUAL" : (asset === "ETH" ? "ETH-PERPETUAL" : "GOLD-PERPETUAL"));

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

        let orderBook = liveData.book;
        if (!orderBook) {
          try {
            orderBook = await fetchOrderBook(assetName);
          } catch {
            orderBook = { bids: [], asks: [] };
          }
        }

        const normalizedPerp = {
          ...perp,
          last: perp.last || perp.last_price || 0,
          instrument_name: assetName,
        };

        const allSummaries = [
          btcDataRef.current.summary || btcDataRef.current.ticker,
          ethDataRef.current.summary || ethDataRef.current.ticker,
          goldDataRef.current.summary || goldDataRef.current.ticker,
        ]
          .filter(Boolean)
          .map((s) => ({
            ...s,
            last: s.last || s.last_price || 0,
            instrument_name: s.instrument_name || "UNKNOWN",
          }));

        const {
          signals: rawSignals,
          signal: rawSignal,
          analysis,
        } = generateSignal(
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
          asset === "BTC"
            ? btcTradeBuffer.getRecentTrades()
            : (asset === "ETH" ? ethTradeBuffer.getRecentTrades() : []),
        );

        let signal = rawSignal;
        let signalsToProcess =
          rawSignals && rawSignals.length > 0
            ? rawSignals
            : signal
              ? [signal]
              : [];

        if (signalsToProcess.length > 0) {
          signalsToProcess.forEach((s: any, idx: number) => {
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

        setAnalysis((prev: any) => {
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
        });

        if (signal && !sentSignalsRef.current.has(signal.id)) {
          lastSignalTimeRef.current = Date.now();
          noSignalsAlertSentRef.current = false;
          sentSignalsRef.current.add(signal.id);
          if (sentSignalsRef.current.size > MAX_SENT_SIGNALS_CACHE) {
            const arr = Array.from(sentSignalsRef.current);
            sentSignalsRef.current = new Set(
              arr.slice(arr.length - MAX_SENT_SIGNALS_CACHE / 2),
            );
          }
          setSignals((prev) => [signal, ...prev].slice(0, 50));
          addLog(
            `🔍 محاولة معالجة إشارة: ${signal.asset} ${signal.direction} (Score: ${signal.qualityScore})`,
            "SYSTEM",
          );

          if (config.autoExecution && signal.qualityScore > 0) {
            await executeSignalStep(
              signal,
              signalsToProcess,
              enrichedAnalysis,
              config,
              managedTradesRef,
              crlStateRef,
              addLog,
              handleSendSignal,
              lastExecutedTimeRef,
            );
          }
        }
      } catch (e) {
        console.error(`Error processing asset ${asset}:`, e);
      }
    },
    [
      config,
      addLog,
      btcDataRef,
      ethDataRef,
      goldDataRef,
      managedTradesRef,
      crlStateRef,
      handleSendSignal,
      setBtcAnalysis,
      setEthAnalysis,
      setGoldAnalysis,
    ],
  );

  return {
    signals,
    setSignals,
    sendingRef,
    sentSignalsRef,
    lastSignalTimeRef,
    lastExecutedTimeRef,
    noSignalsAlertSentRef,
    connectionDisabledRef,
    processAsset,
    handleSendSignal,
  };
}

// ========== HELPER FUNCTIONS ==========

function createFallbackAnalysis(asset: string, isDailyLossPaused: boolean) {
  return {
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
    isDailyLossPaused,
    mtfStatus: {
      dailyTrend: "NEUTRAL" as const,
      h4Regime: "CHOPPY/NOISE",
      m15Trigger: false,
    },
    vwapDeviation: 0,
    vwapZScore: 0,
    vwapMain: 0,
    vwapUpper: 0,
    vwapLower: 0,
  };
}

async function executeSignalStep(
  signal: any,
  signalsToProcess: any[],
  enrichedAnalysis: any,
  config: AppConfig,
  managedTradesRef: MutableRefObject<any[]>,
  crlStateRef: MutableRefObject<any>,
  addLog: (msg: string, type?: any, details?: any) => void,
  handleSendSignal: (signals: any[], analysis: any, actionType: string) => Promise<boolean>,
  lastExecutedTimeRef: MutableRefObject<Record<string, number>>,
) {
  const asset = signal.asset;
  const mappedSymbol = asset === "BTC" ? "BTCUSD" : (asset === "ETH" ? "ETHUSD" : "XAUUSD");
  let shouldExecute = true;

  // Margin check
  const accountEquity =
    crlStateRef.current &&
    typeof crlStateRef.current.equity === "number" &&
    crlStateRef.current.equity > 0
      ? crlStateRef.current.equity
      : crlStateRef.current &&
          typeof crlStateRef.current.baseline === "number" &&
          crlStateRef.current.baseline > 0
        ? crlStateRef.current.baseline
        : 3000;

  const estimatedUsedMargin = Math.max(
    1,
    managedTradesRef.current.reduce((sum, t) => {
      const size = Number(
        t.size || t.volume || t.lotSize || t.initialVolume || 0,
      );
      const entry = Number(t.entryPrice || t.openPrice || 0);
      if (!Number.isFinite(size) || !Number.isFinite(entry)) return sum;
      return sum + Math.max(0, size * entry * 0.05);
    }, 0),
  );

  const bridgeMargin =
    crlStateRef.current &&
    typeof crlStateRef.current.margin === "number" &&
    Number.isFinite(crlStateRef.current.margin) &&
    crlStateRef.current.margin > 0
      ? Number(crlStateRef.current.margin)
      : undefined;

  const effectiveUsedMargin = bridgeMargin ?? estimatedUsedMargin;
  const marginLevel = (accountEquity / effectiveUsedMargin) * 100;

  const marginAlert = await marginMonitor.checkMarginLevels(
    { equity: accountEquity, margin: effectiveUsedMargin },
    { positions: managedTradesRef.current, signal },
  );

  if (marginAlert) {
    if (marginAlert.level === "LIQUIDATION_IMMINENT") {
      shouldExecute = false;
      addLog(
        `🚨 Margin ${marginAlert.level}: ${marginAlert.currentMargin.toFixed(1)}% | ${marginAlert.requiredAction}`,
        "RISK",
        { reductions: marginAlert.suggestedReductions },
      );
      executionDecisionTraceService.initTrace(signal, false);
      executionDecisionTraceService.recordPreTrade(
        false,
        marginAlert.requiredAction,
        "MARGIN_LIQUIDATION_IMMINENT",
      );
      executionDecisionTraceService.recordRiskBlocked({
        reasonCode: "MARGIN_LIQUIDATION_IMMINENT",
        reason: marginAlert.requiredAction,
        asset: signal?.asset || "UNKNOWN",
        blockType: "PRE_TRADE",
      });
      executionSanityDiagnosticService.recordTrace(
        executionDecisionTraceService.getLatestSnapshot(),
      );
    } else {
      const reductionPct = marginAlert.level === "CRITICAL" ? 0.5 : 0.75;
      signal.lotMultiplier = (signal.lotMultiplier || 1) * reductionPct;
      addLog(
        `⚠️ Margin ${marginAlert.level}: ${marginAlert.currentMargin.toFixed(1)}% | applying lot reduction x${reductionPct.toFixed(2)}`,
        "RISK",
        { reductions: marginAlert.suggestedReductions },
      );
    }
  }

  // Portfolio risk check
  const riskResult = checkPortfolioRisk(
    managedTradesRef.current,
    signal,
    config.maxOpenTrades,
    accountEquity,
    marginLevel,
  );

  if (!riskResult.isSafeToTrade) {
    shouldExecute = false;
    addLog(`🛑 Risk Engine BLOCKED Trade: ${riskResult.reason}`, "RISK");
    executionDecisionTraceService.initTrace(signal, false);
    executionDecisionTraceService.recordPreTrade(
      false,
      riskResult.reason,
      "PORTFOLIO_RISK",
    );
    executionDecisionTraceService.recordRiskBlocked({
      reasonCode: "PORTFOLIO_RISK",
      reason: riskResult.reason,
      asset: signal?.asset || "UNKNOWN",
      blockType: "PRE_TRADE",
    });
    executionSanityDiagnosticService.recordTrace(
      executionDecisionTraceService.getLatestSnapshot(),
    );
  } else {
    if (riskResult.suggestedLotMultiplier < 1.0) {
      addLog(
        `🛡️ Risk Engine Adjusted Position Size (Multiplier: ${riskResult.suggestedLotMultiplier.toFixed(2)}) to prevent overexposure.`,
        "RISK",
      );
      signal.lotMultiplier = riskResult.suggestedLotMultiplier;
    }

    if (shouldExecute) {
      shouldExecute = await checkAdvancedExecutionConditions(
        signal,
        enrichedAnalysis,
        config,
        managedTradesRef,
        mappedSymbol,
        accountEquity,
        addLog,
        lastExecutedTimeRef,
      );
    }

    if (shouldExecute) {
      let actionType = await determineActionType(
        signal,
        enrichedAnalysis,
        config,
        managedTradesRef,
        mappedSymbol,
        addLog,
      );

      if (shouldExecute) {
        const cooldownKey = `${signal.asset}-${signal.direction}`;
        lastExecutedTimeRef.current[cooldownKey] = Date.now();

        handleSendSignal(signalsToProcess, enrichedAnalysis, actionType).then(
          (success) => {
            if (!success) {
              lastExecutedTimeRef.current[cooldownKey] = 0;
              addLog(
                `⚠️ إشارة تم حظرها داخلياً في طبقة التنفيذ! (Compliance)`,
                "RISK",
              );
            } else {
              addLog(
                `✅ تم إرسال الإشارة بنجاح للجسر! (النوع: ${actionType})`,
                "EXEC",
              );
            }
          },
        );
      }
    }
  }
}

async function checkAdvancedExecutionConditions(
  signal: any,
  enrichedAnalysis: any,
  config: AppConfig,
  managedTradesRef: MutableRefObject<any[]>,
  mappedSymbol: string,
  accountEquity: number,
  addLog: (msg: string, type?: any, details?: any) => void,
  lastExecutedTimeRef: MutableRefObject<Record<string, number>>,
): Promise<boolean> {
  let shouldExecute = true;

  // Drawdown safe mode
  const totalActivePnL = managedTradesRef.current.reduce(
    (sum, t) => sum + (Number(t.pnl) || 0),
    0,
  );
  const currentEquity = accountEquity || 3000;
  const floatingDrawdownPercent =
    currentEquity > 0
      ? (Math.max(0, -totalActivePnL) / currentEquity) * 100
      : 0;

  let safetyLotMultiplier = 1.0;
  if (floatingDrawdownPercent >= 5.0) {
    shouldExecute = false;
    executionDecisionTraceService.initTrace(signal, false);
    executionDecisionTraceService.recordPreTrade(
      false,
      "Floating Drawdown >= 5%",
      "DRAWDOWN_LIMIT",
    );
    executionDecisionTraceService.recordRiskBlocked({
      reasonCode: "DRAWDOWN_LIMIT",
      reason: "Floating Drawdown >= 5%",
      asset: signal?.asset || "UNKNOWN",
      blockType: "PRE_TRADE",
    });
    executionSanityDiagnosticService.recordTrace(
      executionDecisionTraceService.getLatestSnapshot(),
    );
  } else if (floatingDrawdownPercent >= 3.0) {
    safetyLotMultiplier = 0.25;
  } else if (floatingDrawdownPercent >= 1.5) {
    safetyLotMultiplier = 0.5;
  }

  if (shouldExecute && safetyLotMultiplier < 1.0) {
    signal.lotMultiplier = (signal.lotMultiplier || 1.0) * safetyLotMultiplier;
  }

  // Cooldown check
  if (shouldExecute) {
    const cooldownKey = `${signal.asset}-${signal.direction}`;
    const lastExec = lastExecutedTimeRef.current[cooldownKey] || 0;
    const elapsedMins = (Date.now() - lastExec) / 60000;
    const requiredCooldown = Math.max(5, config.cooldownSameAssetMins || 15);

    if (elapsedMins < requiredCooldown) {
      shouldExecute = false;
    }
  }

  // Max trades per wave
  const isTradeMatchingDirection = (tradeDir: any, sigDir: any) => {
    const td = String(tradeDir).toUpperCase();
    const sd = String(sigDir).toUpperCase();
    if (sd === "LONG")
      return td === "LONG" || td === "BUY" || td === "0";
    if (sd === "SHORT")
      return td === "SHORT" || td === "SELL" || td === "1";
    return false;
  };

  const assetTrades = managedTradesRef.current.filter(
    (t) => t.asset === mappedSymbol,
  );
  const activeTrades = assetTrades.filter((t) =>
    isTradeMatchingDirection(t.direction, signal.direction),
  );

  if (shouldExecute && activeTrades.length >= (config.maxTradesPerWave || 15)) {
    shouldExecute = false;
  }

  // Pyramiding distance check
  if (shouldExecute && activeTrades.length > 0) {
    const currentPrice = signal.entry || enrichedAnalysis.price;
    const dvol = enrichedAnalysis.dvol || 50;
    const expectedDailyMovePercent = (dvol / 100) / Math.sqrt(365);
    const expectedDailyMoveUSD = currentPrice * expectedDailyMovePercent;
    const baseDistance =
      (config.dynamicVolSpacing || 0.25) * expectedDailyMoveUSD;

    let isPyramiding = false;
    let pyramidingDiscount = 1.0;

    if (activeTrades.length > 0) {
      const lastTrade = activeTrades.reduce((latest, current) => {
        return current.ticket > latest.ticket ? current : latest;
      }, activeTrades[0]);

      const isLong = signal.direction === "LONG";
      const profitDistance = isLong
        ? currentPrice - (lastTrade.entryPrice || lastTrade.openPrice || 0)
        : (lastTrade.entryPrice || lastTrade.openPrice || 0) - currentPrice;

      if (
        profitDistance > 0 &&
        (enrichedAnalysis.regime === "MOMENTUM_TREND" ||
          enrichedAnalysis.regime === "HIGH_VOLATILITY")
      ) {
        isPyramiding = true;
        pyramidingDiscount = 0.75;
      }
    }

    const progressiveMultiplier =
      1 + (activeTrades.length - 1) * (isPyramiding ? 0.3 : 0.5);
    const minDistanceAdjusted =
      baseDistance * progressiveMultiplier * pyramidingDiscount;

    for (const trade of activeTrades) {
      const tradeDistance = Math.abs(
        (trade.entryPrice || trade.openPrice || 0) - currentPrice,
      );
      if (tradeDistance < minDistanceAdjusted) {
        shouldExecute = false;
        executionDecisionTraceService.initTrace(signal, false);
        executionDecisionTraceService.recordPreTrade(
          false,
          `Too close to existing trade. Distance: ${tradeDistance.toFixed(2)}, Min: ${minDistanceAdjusted.toFixed(2)}`,
          "PYRAMIDING_DISTANCE",
        );
        executionDecisionTraceService.recordRiskBlocked({
          reasonCode: "PYRAMIDING_DISTANCE",
          reason: "Too close to existing trade",
          asset: signal?.asset || "UNKNOWN",
          blockType: "PRE_TRADE",
        });
        executionSanityDiagnosticService.recordTrace(
          executionDecisionTraceService.getLatestSnapshot(),
        );
        break;
      }
    }

    if (shouldExecute && isPyramiding) {
      const pyramidScale = Math.pow(0.6, activeTrades.length);
      signal.lotMultiplier =
        (signal.lotMultiplier || 1.0) * pyramidScale;
      addLog(
        `🔼 [PYRAMIDING] تعزيز هرمي في اتجاه الربح للزخم القوي. تم تقليص حجم العقد بمعامل ${pyramidScale.toFixed(2)} لحماية الأرباح.`,
        "STRATEGY_SWITCH",
      );
    }
  }

  return shouldExecute;
}

async function determineActionType(
  signal: any,
  enrichedAnalysis: any,
  config: AppConfig,
  managedTradesRef: MutableRefObject<any[]>,
  mappedSymbol: string,
  addLog: (msg: string, type?: any, details?: any) => void,
): Promise<string> {
  let actionType = "ENTRY";

  const isTradeMatchingDirection = (tradeDir: any, sigDir: any) => {
    const td = String(tradeDir).toUpperCase();
    const sd = String(sigDir).toUpperCase();
    if (sd === "LONG") return td === "LONG" || td === "BUY" || td === "0";
    if (sd === "SHORT") return td === "SHORT" || td === "SELL" || td === "1";
    return false;
  };

  const assetTrades = managedTradesRef.current.filter(
    (t) => t.asset === mappedSymbol,
  );

  if (assetTrades.length > 0) {
    const latestPosition = assetTrades.reduce((latest, current) => {
      const latestTime = Number(latest.openTime || latest.time || 0);
      const currentTime = Number(current.openTime || current.time || 0);
      if (currentTime > latestTime) return current;
      if (
        currentTime === latestTime &&
        Number(current.ticket || 0) > Number(latest.ticket || 0)
      )
        return current;
      return latest;
    }, assetTrades[0]);

    const mappedDirection = String(latestPosition.direction).toUpperCase();
    const currentDirection: "LONG" | "SHORT" =
      mappedDirection === "LONG" ||
      mappedDirection === "BUY" ||
      mappedDirection === "0"
        ? "LONG"
        : "SHORT";

    const currentPosition = {
      direction: currentDirection,
      volume: Math.max(
        0.01,
        Number(
          latestPosition.size ||
            latestPosition.volume ||
            latestPosition.lotSize ||
            1,
        ),
      ),
      strength: Math.max(
        1,
        Number(latestPosition.score || signal.qualityScore || 50),
      ),
      openTime: Number(latestPosition.openTime || latestPosition.time || Date.now()),
    };

    const signalVolume = Math.max(
      0.01,
      Number(signal.recommendedSize || signal.size || 1),
    );
    const signalConfidence = Math.max(
      0,
      Math.min(100, Number(signal.qualityScore || 0)),
    );

    const activeTrades = assetTrades.filter((t) =>
      isTradeMatchingDirection(t.direction, signal.direction),
    );

    const enhancedDecision = enhancedExecutionEngine.decideAction(
      currentPosition,
      {
        direction: signal.direction as "LONG" | "SHORT",
        strength: Math.max(1, Number(signal.qualityScore || 50)),
        volume: signalVolume,
        timestamp: Number(signal.timestamp || Date.now()),
        confidence: signalConfidence,
      },
      {
        volatility: Number(enrichedAnalysis.volatility || enrichedAnalysis.volRatio || 0),
        trendStrength: Math.max(
          0,
          Math.min(1, Number(enrichedAnalysis.qualityScore || 0) / 100),
        ),
        volumeProfile: Number(enrichedAnalysis.dvol || 0),
        reversalProbability: Number(enrichedAnalysis.reversalProbability || 0),
        vwapDeviation: Number(enrichedAnalysis.vwapDeviation || 0),
        currentBoostCount: activeTrades.length,
        maxBoosts: 3,
      },
    );

    if (enhancedDecision.action === "FLIP" && config.flipEnabled) {
      actionType = "FLIP";
      if (enhancedDecision.size && signalVolume > 0) {
        const boostScale = Math.max(
          0.2,
          Math.min(2.5, enhancedDecision.size / signalVolume),
        );
        signal.lotMultiplier = (signal.lotMultiplier || 1) * boostScale;
      }
      addLog(
        `🔄 [ENHANCED FLIP] ${enhancedDecision.reason} | confidence=${signalConfidence.toFixed(1)}%`,
        "STRATEGY_SWITCH",
      );
    } else if (enhancedDecision.action === "HEDGE" && config.autoHedgeEnabled) {
      actionType = "HEDGE";
      if (enhancedDecision.size && signalVolume > 0) {
        const hedgeScale = Math.max(
          0.2,
          Math.min(1.5, enhancedDecision.size / signalVolume),
        );
        signal.lotMultiplier = (signal.lotMultiplier || 1) * hedgeScale;
      }
      addLog(
        `🛡️ [ENHANCED HEDGE] ${enhancedDecision.reason} | confidence=${signalConfidence.toFixed(1)}%`,
        "HEDGE",
      );
    } else if (enhancedDecision.action === "BOOST") {
      actionType = "ENTRY";
      if (enhancedDecision.size && signalVolume > 0) {
        const momentumScale = Math.max(
          0.3,
          Math.min(2.5, enhancedDecision.size / signalVolume),
        );
        signal.lotMultiplier = (signal.lotMultiplier || 1) * momentumScale;
      }
      addLog(
        `⚡ [ENHANCED BOOST] ${enhancedDecision.reason} | boosts=${activeTrades.length}/${enhancedDecision.maxBoosts || 3}`,
        "BOOST",
      );
    } else if (enhancedDecision.action === "HOLD") {
      return "HOLD";
    }
  }

  // Legacy fallback for new positions
  if (assetTrades.length === 0) {
    if (
      config.flipEnabled &&
      enrichedAnalysis.reversalProbability >= (config.flipSensitivityScore || 85)
    ) {
      actionType = "FLIP";
      addLog(
        `🔄 تم تفعيل نظام الانعكاس (FLIP) - احتمالية الانعكاس: ${enrichedAnalysis.reversalProbability.toFixed(1)}%`,
        "STRATEGY_SWITCH",
      );
    } else if (
      config.autoHedgeEnabled &&
      signal.qualityScore < 85 &&
      Math.abs(enrichedAnalysis.vwapDeviation) > 0.02
    ) {
      actionType = "HEDGE";
      addLog(
        `🛡️ تم تفعيل نظام الهيدج (HEDGE) - تحوط بسبب الانحراف: ${(enrichedAnalysis.vwapDeviation * 100).toFixed(2)}%`,
        "HEDGE",
      );
    }
  }

  return actionType;
}

