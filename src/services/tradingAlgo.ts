import { executionQualityEngine, ExecutionQualityInput } from './ExecutionQualityEngine';
import { BaseStrategy } from "./strategies/BaseStrategy";
import { logStructured } from "../utils/logger";
import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  DeribitBookSummary,
  DeribitCandleData,
  DeribitOrderBook,
  MarketAnalysisState,
  AppConfig,
  StrategyType,
  CVDData,
  LiquidityData,
} from "../types";
import { StrategyOrchestrator } from "./StrategyOrchestrator";
import { getStrategyInstance } from "./strategies/StrategyRegistry";
import { detectRegime } from "./regimeDetector";
import { checkPortfolioRisk } from "./portfolioRisk";
import { mean, stdDev } from "./trading/mathUtils";
import { calculateEMA, calculateFisherTransform, calculateGarmanKlassVolatility, calculateHurst, calculateVWAP, calculateVWAPBands, detectLiquiditySweep as detectSweepAdvanced, calculateADR } from "./trading/indicators";
import { statisticalSignificanceTest, calculateKelly, detectRSIDivergence, detectFVG, detectLiquiditySweep } from "./trading/signalUtils";
import { analyzeOrderFlow, MarketData } from "./orderFlowEngine";
import { diagnosticsService } from "./DiagnosticsService";
import { evaluateSignalQuality } from "./SignalQualityService";
import { stressScenarioService } from "./StressScenarioService";
import { multiStrategySignalCoordinatorService } from "./MultiStrategySignalCoordinatorService";
import { tradingControlService } from "./TradingControlService";

/**
 * ARKON Quant Terminal - Institutional Grade Trading Algorithm
 * Version: 2.0.0-INSTITUTIONAL
 *
 * This module implements an advanced quantitative trading strategy for crypto derivatives.
 * It uses a multi-gate validation system, statistical significance tests, and market regime detection.
 */

const globalCandleCache: Record<string, DeribitCandleData> = {};
const COINT_WINDOW = 50;
const MIN_COINT_HISTORY = 30;
const COINT_EPSILON = 1e-8;

// --- Institutional Strategy Calculations ---

import { Trade } from './TradeBuffer';

export const calculateCVD = (prevCVD: number, buyVol: number, sellVol: number): CVDData => {
    const delta = buyVol - sellVol;
    const currentCVD = prevCVD + delta;
    const trend = currentCVD > prevCVD ? 'RISING' : currentCVD < prevCVD ? 'FALLING' : 'FLAT';
    return { currentCVD, previousCVD: prevCVD, delta, trend };
};

export const calculateLiquidityImbalance = (bidVol: number, askVol: number): LiquidityData => {
    const imbalance = (bidVol - askVol) / (bidVol + askVol || 1);
    const signal = imbalance > 0.2 ? 'BUY' : imbalance < -0.2 ? 'SELL' : 'NEUTRAL';
    return { orderBookImbalance: imbalance, liquidityPools: [], signal };
};

export const calculateMeanReversion = (price: number, ma: number): number => {
    return (price - ma) / ma;
};

export const generateSignal = (
  asset: string,
  summary: DeribitBookSummary,
  allSummaries: DeribitBookSummary[],
  activeEvent: any | null,
  candles15M: DeribitCandleData | null,
  candles1D: DeribitCandleData | null,
  orderBook: DeribitOrderBook | null,
  dvol: number,
  optionsVolume: number,
  config: AppConfig,
  recentTrades: Trade[] = [],
): { signals: TradingSignal[]; signal: TradingSignal | null; analysis: MarketAnalysisState } => {

  const price = summary.last || 0;
  
  // DIAGNOSTICS: Market Data Health
  const hasOrderBook = orderBook !== null;
  const hasTradeFlow = !!(orderBook && (orderBook as any).bids && (orderBook as any).asks); // Basic check or check if recentTrades exist

  const isDegraded = orderBook === null || recentTrades.length === 0 || !!config.hunterMode;
  diagnosticsService.recordMarketDataHealth(summary.instrument_name, hasOrderBook, recentTrades.length > 0, isDegraded);
  
  if (isDegraded && !config.hunterMode) {
      tradingControlService.recordDegradedData(summary.instrument_name || asset);
  }


  const fundingRate = summary.funding_8h || 0;

  // 1. Data Preparation
  const dailyCloses = (candles1D && Array.isArray(candles1D.close)) ? candles1D.close : [];
  const m15Closes = (candles15M && Array.isArray(candles15M.close)) ? candles15M.close : [];
  const m15Opens = (candles15M && Array.isArray(candles15M.open)) ? candles15M.open : m15Closes;
  const m15Highs = (candles15M && Array.isArray(candles15M.high)) ? candles15M.high : [];
  const m15Lows = (candles15M && Array.isArray(candles15M.low)) ? candles15M.low : [];
  const m15Volumes = (candles15M && Array.isArray(candles15M.volume)) ? candles15M.volume : [];
  const fisher = calculateFisherTransform(m15Closes, 14)[0];

  if (m15Closes.length < 50) {
    logStructured('QUANT', 'WARN', 'insufficient_data', `[${asset}] Blocked: Insufficient data (${m15Closes.length} candles)`, {
      asset,
      candlesCount: m15Closes.length,
      reason: 'INSUFFICIENT_DATA_SERIES'
    });
return {
      signal: null,
      signals: [],
      analysis: {
        asset: summary.instrument_name,
        price,
        fisher,
        vwapDeviation: 0,
        vwapZScore: 0,
        vwapMain: 0,
        vwapUpper: 0,
        vwapLower: 0,
        volatility: 0,
        bullishSweep: false,
        bearishSweep: false,
        swingLow: 0,
        swingHigh: 0,
        rSquared: 0,
        dvol,
        hurst: 0.5,
        volRatio: 1,
        yearlyHigh: 0,
        yearlyLow: 0,
        pricePositionRank: 50,
        regime: "CHOPPY/NOISE",
        qualityScore: 0,
        primaryBlocker: "INSUFFICIENT DATA",
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
        trendDirection: "NEUTRAL",
        fundingRate,
        openInterest: 0,
        isNewsPaused: false,
        isDailyLossPaused: false,
        allSummaries,
        activeEvent,
        mtfStatus: {
          dailyTrend: "NEUTRAL",
          h4Regime: "CHOPPY/NOISE",
          m15Trigger: false,
        },
      },
    };
  }

  logStructured('QUANT', 'INFO', 'signal_evaluation_start', `[${asset}] generateSignal called. Price: ${price}, Regime: ${summary.regime || 'UNKNOWN'}`, {
    asset,
    regime: summary.regime || 'UNKNOWN',
    price
  });

  // 2. Indicator Calculations
  const ema9 = calculateEMA(m15Closes, 9).pop() || price;
  const ema21 = calculateEMA(m15Closes, 21).pop() || price;
  const dailySma50 = mean(dailyCloses.slice(-50)) || price;

  const gkVolatility = calculateGarmanKlassVolatility(m15Opens, m15Highs, m15Lows, m15Closes, 14);
  const atrEquivalent = gkVolatility * price * stressScenarioService.getVolatilityMultiplier(); // Converting percentage volatility back to absolute distance for legacy systems
  
  // ADR (Average Daily Range) - Institutional Quantitative Method to identify Reversals
  const dailyHighs = (candles1D && Array.isArray(candles1D.high)) ? candles1D.high : [];
  const dailyLows = (candles1D && Array.isArray(candles1D.low)) ? candles1D.low : [];
  const adr = calculateADR(dailyHighs, dailyLows, 14);
  const todaysRange = dailyHighs.length > 0 ? (dailyHighs[dailyHighs.length - 1] - dailyLows[dailyLows.length - 1]) : 0;
  
  let adrExhaustion: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  if (adr > 0 && todaysRange >= adr * 0.85) {
      const todayLow = dailyLows[dailyLows.length - 1];
      const todayHigh = dailyHighs[dailyHighs.length - 1];
      // Exhausted downside (price dropped most of its daily range and is near the low, expected bounce)
      if (price <= todayLow + adr * 0.25) {
          adrExhaustion = 'DOWN';
      } 
      // Exhausted upside (price rallied most of its daily range and is near the high, expected pull back)
      else if (price >= todayHigh - adr * 0.25) {
          adrExhaustion = 'UP';
      }
  }

  const hurst = calculateHurst(m15Closes);
  const vwap = calculateVWAP(candles15M);
  const { vwapMain, vwapUpper, vwapLower } = calculateVWAPBands(candles15M, 1.0);
  const sigTest = statisticalSignificanceTest(m15Closes);
  const divergence = detectRSIDivergence(m15Closes, [fisher]); // Simplified
  const fvg = detectFVG(m15Highs, m15Lows);
  const sweep = detectLiquiditySweep(m15Highs, m15Lows, m15Closes);
  const advancedSweep = detectSweepAdvanced(m15Highs, m15Lows, m15Closes, m15Opens, 10);

  // Advanced Quant Metrics
  const logReturns = m15Closes.map((c, i) => i === 0 ? 0 : Math.log(c / m15Closes[i - 1])).slice(1);
  const realizedVol = stdDev(logReturns) * Math.sqrt(365 * 24 * 4) * 100; // Annualized RV
  
  // Fallback for assets without DVOL (like Gold)
  dvol = dvol > 0 ? dvol : realizedVol;
  const volRiskPremium = dvol - realizedVol; // VRP
  
  const vwapDeviation = (price - vwap) / vwap;
  const vwapZScore = vwapDeviation / (stdDev(m15Closes.map(c => (c - vwap) / vwap)) || 0.001);
  const tsmom = mean(logReturns.slice(-10)) / (stdDev(logReturns.slice(-10)) || 0.001); // Time-Series Momentum

  // Volume Analysis
  const avgVol = mean(m15Volumes.slice(-20));
  const currentVol = m15Volumes[m15Volumes.length - 1];
  const volRatio = currentVol / (avgVol || 1);

  // Order Book Analysis (Microstructure)
  const bids = orderBook?.bids || [];
  const asks = orderBook?.asks || [];
  const totalBidVol = bids.reduce((acc, b) => acc + b[1], 0);
  const totalAskVol = asks.reduce((acc, b) => acc + b[1], 0);
  const orderFlowImbalance = (totalBidVol - totalAskVol) / (totalBidVol + totalAskVol || 1);

  let microPrice = null;
  let microPriceDeviation = null;
  let topLevelImbalance = null;
  let depthPressure = null;

  if (bids.length > 0 && asks.length > 0) {
      const bestBid = bids[0]; // [price, volume]
      const bestAsk = asks[0];
      
      const bidPrice = bestBid[0];
      const bidVol = bestBid[1];
      const askPrice = bestAsk[0];
      const askVol = bestAsk[1];
      
      if (bidVol + askVol > 0) {
          microPrice = (bidPrice * askVol + askPrice * bidVol) / (bidVol + askVol);
          topLevelImbalance = (bidVol - askVol) / (bidVol + askVol);
          
          const midPrice = (bidPrice + askPrice) / 2;
          if (midPrice > 0) {
              microPriceDeviation = (microPrice - midPrice) / midPrice;
          }
      }
      
      let nearBidVol = 0;
      let nearAskVol = 0;
      const depthLevels = Math.min(3, Math.min(bids.length, asks.length));
      for (let i = 0; i < depthLevels; i++) {
          nearBidVol += bids[i][1];
          nearAskVol += asks[i][1];
      }
      if (nearBidVol + nearAskVol > 0) {
          depthPressure = (nearBidVol - nearAskVol) / (nearBidVol + nearAskVol);
      }
  }

  // Phase C: True Flow Features
  let ofi: number | null = null;
  let normalizedOfi: number | null = null;
  let recentSignedVolume: number | null = null;
  let recentTradeCount: number | null = null;
  let tradeFlowAvailable = false;
  let toxicityMetric: number | null = null;

  if (recentTrades && recentTrades.length > 0) {
      let signedVol = 0;
      let totalVol = 0;
      let hasDirection = false;

      for (const t of recentTrades) {
          if (t.direction) {
              hasDirection = true;
              const signedSize = t.direction === 'buy' ? t.size : (t.direction === 'sell' ? -t.size : 0);
              signedVol += signedSize;
          }
          totalVol += t.size;
      }

      if (hasDirection) {
          tradeFlowAvailable = true;
          recentSignedVolume = signedVol;
          recentTradeCount = recentTrades.length;
          ofi = signedVol;
          normalizedOfi = totalVol > 0 ? signedVol / totalVol : 0;
          
          // Phase D: Toxicity Proxy (VPIN-like absolute imbalance ratio)
          toxicityMetric = totalVol > 0 ? Math.abs(signedVol) / totalVol : 0;
      }
  }

  const whaleSignal =
    Math.abs(orderFlowImbalance) > 0.4
      ? orderFlowImbalance > 0
        ? "BUY_WALL"
        : "SELL_WALL"
      : "NEUTRAL";

  // Order Flow Strategy Integration
  const marketData: MarketData = {
    buyVolume: totalBidVol,
    sellVolume: totalAskVol,
    askVolume: totalAskVol,
    bidVolume: totalBidVol,
    price: price,
    volume: summary.volume,
  };
  const ofSignal = config.orderFlowConfig.enabled ? analyzeOrderFlow(marketData, config) : null;

  // 3. Market Regime Detection
  const rSquared = sigTest; // sigTest represents R-squared in this context
  const regime = detectRegime(dvol, price, dailySma50, hurst, rSquared);

  // DCA Zone Validation
  const dcaZone = config.dcaZones?.find(z => z.asset === asset);
  const inDcaZone = dcaZone ? (price >= dcaZone.priceRange[0] && price <= dcaZone.priceRange[1]) : false;

  // S-10X Upstream Cointegration Analytics
  if (candles15M && Array.isArray(candles15M.close) && candles15M.close.length >= MIN_COINT_HISTORY) {
      globalCandleCache[asset] = candles15M;
  }

  const targetAsset = asset.includes('BTC') ? 'ETH' : 'BTC';
  const targetCandles = globalCandleCache[targetAsset] || globalCandleCache[targetAsset + '-PERPETUAL'] || Object.values(globalCandleCache).find(c => c !== candles15M);
  // Actually, we just need to match by 'targetAsset' but let's be safe if keys have '-PERPETUAL'.
  // Find the target candle data in the cache by checking if key includes the targetAsset
  const targetCandleKey = Object.keys(globalCandleCache).find(k => k.includes(targetAsset));
  const targetCandleData = targetCandleKey ? globalCandleCache[targetCandleKey] : null;

  let cointBeta: number | undefined;
  let cointRollingMean: number | undefined;
  let cointRollingStd: number | undefined;
  let cointZScore: number | undefined;
  let cointStrength: number | undefined;
  let cointHalfLife: number | undefined;
  let cointBetaStability: number | undefined;

  if (targetCandleData && Array.isArray(targetCandleData.close) && targetCandleData.close.length >= MIN_COINT_HISTORY) {
      const currentCloses = m15Closes;
      const targetCloses = targetCandleData.close;
      const N = Math.min(COINT_WINDOW, currentCloses.length, targetCloses.length);
      
      if (N >= MIN_COINT_HISTORY) {
          const sliceCurrent = currentCloses.slice(-N);
          const sliceTarget = targetCloses.slice(-N);
          
          const logA = sliceCurrent.map(p => Math.log(p));
          const logB = sliceTarget.map(p => Math.log(p));
          
          const meanLogA = mean(logA);
          const meanLogB = mean(logB);
          
          let cov = 0;
          let varB = 0;
          for (let i = 0; i < N; i++) {
              cov += (logA[i] - meanLogA) * (logB[i] - meanLogB);
              varB += Math.pow(logB[i] - meanLogB, 2);
          }
          
          if (varB > COINT_EPSILON) {
              const beta = cov / varB;
              cointBeta = beta;
              
              const spreads = [];
              for (let i = 0; i < N; i++) {
                  spreads.push(logA[i] - beta * logB[i]);
              }
              
              const spreadMean = mean(spreads);
              const spreadStd = stdDev(spreads);
              
              if (spreadStd > COINT_EPSILON) {
                  cointRollingMean = spreadMean;
                  cointRollingStd = spreadStd;
                  const currentSpread = spreads[spreads.length - 1];
                  cointZScore = (currentSpread - spreadMean) / spreadStd;
                  
                  let sumSpreadT = 0, sumSpreadT1 = 0;
                  for (let i = 1; i < N; i++) {
                      sumSpreadT += spreads[i];
                      sumSpreadT1 += spreads[i-1];
                  }
                  const meanSpreadT = sumSpreadT / (N - 1);
                  const meanSpreadT1 = sumSpreadT1 / (N - 1);
                  let covAR = 0, varAR = 0;
                  for (let i = 1; i < N; i++) {
                      covAR += (spreads[i] - meanSpreadT) * (spreads[i-1] - meanSpreadT1);
                      varAR += Math.pow(spreads[i-1] - meanSpreadT1, 2);
                  }
                  
                  if (varAR > COINT_EPSILON) {
                      const phi = covAR / varAR;
                      cointStrength = 1 - Math.max(0, Math.min(1, phi)); // AR(1) proxy for stationarity
                      
                      if (phi > 0 && phi < 1) {
                          cointHalfLife = -Math.log(2) / Math.log(phi);
                      }
                  }
              }
          }
      }
  }

  // 4. Strategy Validation
  const partialState: MarketAnalysisState = {
      asset: summary.instrument_name,
      price,
      fisher,
      vwapDeviation: (price - vwap) / vwap,
      vwapZScore,
      vwapMain,
      vwapUpper,
      vwapLower,
      volatility: atrEquivalent,
      bullishSweep: advancedSweep.bullishSweep,
      bearishSweep: advancedSweep.bearishSweep,
      swingLow: advancedSweep.swingLow,
      swingHigh: advancedSweep.swingHigh,
      rSquared: sigTest,
      dvol,
      hurst,
      volRatio,
      yearlyHigh: dailyCloses.length > 0 ? Math.max(...dailyCloses) : price,
      yearlyLow: dailyCloses.length > 0 ? Math.min(...dailyCloses) : price,
      pricePositionRank: 50,
      adr: adr,
      adrExhaustion: adrExhaustion,
      regime,
      qualityScore: 0,
      primaryBlocker: "",
      isCooldownActive: false,
      cooldownRemaining: 0,
      isCorrelatedBlocked: false,
      liquidityGap: orderFlowImbalance,
      toxicityScore: 0,
      estimatedSlippage: 0,
      dataLatencyMs: 0,
      scoreBreakdown: [{factor: 'correlation', value: 0.9}],
      dominantFactor: regime,
      reversalProbability: (1 - sigTest) * 100,
      trendDirection: hurst > 0.5 ? (vwapZScore > 0 ? "UP" : "DOWN") : (tsmom > 0.5 ? "UP" : tsmom < -0.5 ? "DOWN" : "NEUTRAL"),
      fundingRate,
      openInterest: summary.open_interest || 0,
      isNewsPaused: false,
      isDailyLossPaused: false,
      allSummaries,
      activeEvent,
      strategyLogs: [],
      orderFlowSignal: ofSignal,
      cointBeta,
      cointRollingMean,
      cointRollingStd,
      cointZScore,
      cointStrength,
      cointHalfLife,
      cointBetaStability,
      correlationId: null,
      ofi,
      normalizedOfi,
      recentSignedVolume,
      recentTradeCount,
      tradeFlowAvailable,
      orderBookImbalance: totalBidVol + totalAskVol > 0 ? (totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) : null,
      microPrice,
      microPriceDeviation,
      topLevelImbalance,
      depthPressure,
      toxicityMetric,
      mtfStatus: {
          dailyTrend: hurst > 0.5 ? (vwapZScore > 0 ? "UP" : "DOWN") : (tsmom > 0.5 ? "UP" : tsmom < -0.5 ? "DOWN" : "NEUTRAL"),
          h4Regime: regime,
          m15Trigger: false,
      },
  };

  // 4. Strategy Validation & Orchestration
  const orchestrator = new StrategyOrchestrator(config);
  const rankedStrategies = orchestrator.getOptimalStrategies(partialState);
  logStructured('QUANT', 'INFO', 'strategies_ranked', `[${asset}] Ranked Strategies evaluated for current market regime`, {
    asset,
    rankedStrategies
  });
  
  let signal: TradingSignal | null = null;
  let signals: TradingSignal[] = [];
  const candidateSignals: TradingSignal[] = [];
  let strategy: StrategyType = 'WAIT';
  let direction: SignalDirection | null = null;
  let reasoning = "";
  let qualityScore = 0;
  let maxValidationScore = 0;
  let primaryBlocker = "NO VALID STRATEGY";

  // Global Active Gates Helper functions to synchronize Quality Score with the visual gates in UI
  const checkGatePassed = (gateId: string, s: MarketAnalysisState, c: AppConfig): boolean => {
    let val = 0;
    let thr = 0;
    let invert = false;

    switch (gateId) {
      case 'hurst':
        val = s.hurst;
        thr = c.hurst;
        invert = true;
        break;
      case 'fisher':
        val = Math.abs(s.fisher);
        thr = c.fisher;
        break;
      case 'vwapZScore':
        val = Math.abs(s.vwapZScore);
        thr = c.vwapZScore;
        invert = false;
        break;
      case 'rSquared':
        val = s.rSquared;
        thr = c.rSquared;
        break;
      case 'dvol':
        val = s.dvol;
        thr = c.dvol;
        break;
      case 'ofi':
        val = Math.abs(s.liquidityGap);
        thr = c.ofi;
        break;
      case 'volRatio':
        val = s.volRatio;
        thr = c.volRatio;
        break;
      default:
        return true;
    }

    const ratio = invert ? (thr / (val || 0.001)) * 100 : (val / (thr || 0.001)) * 100;
    return ratio >= 99.9;
  };

  const getActiveGatesForRegime = (regime: string): string[] => {
    if (regime === 'MEAN_REVERSION' || regime === 'CHOPPY/NOISE') {
      return ['hurst', 'fisher', 'vwapZScore', 'dvol'];
    }
    if (regime === 'MOMENTUM_TREND' || regime === 'HIGH_VOLATILITY') {
      return ['hurst', 'rSquared', 'ofi', 'dvol'];
    }
    if (regime === 'LOW_VOLATILITY') {
      return ['ofi', 'volRatio'];
    }
    return ['hurst', 'fisher', 'vwapZScore', 'rSquared', 'dvol', 'ofi', 'volRatio'];
  };

  for (const rankedStrat of rankedStrategies) {
      const strategyType = rankedStrat.strat;
      const strategyInstance = getStrategyInstance(strategyType);
      
      if (!strategyInstance) {
          logStructured('SYSTEM', 'WARN', 'strategy_instance_missing', `[${asset}] [Strategy: ${strategyType}] Skipped: Instance not found`, {
            asset,
            strategy: strategyType
          });
          continue;
      }

      const validation = strategyInstance.validate(partialState, config);
      
      const activeGates = getActiveGatesForRegime(partialState.regime);
      let failedActiveCount = 0;
      for (const gateId of activeGates) {
          if (!checkGatePassed(gateId, partialState, config)) {
              failedActiveCount++;
          }
      }

      if (failedActiveCount > 0) {
          const previousScore = validation.score;
          validation.score = Math.min(100 - (failedActiveCount * 15), validation.score - (failedActiveCount * 10));
          validation.score = Math.max(0, validation.score);
          
          const executionThreshold = config.hunterMode 
              ? Math.max(0, (config.minSignalScore || 80) - 20) 
              : (config.minSignalScore || 80);
              
          if (validation.score < executionThreshold) {
              validation.passed = false;
              validation.reason = `${validation.reason || 'Gates failed'} (Penalized score ${validation.score.toFixed(1)} < ${executionThreshold})`;
          }
          logStructured('COMPLIANCE', 'WARN', 'gate_penalty_applied', `[${asset}] Applied active gates penalty for strategy=${strategyType}: ${failedActiveCount} gates failed. Score reduced from ${previousScore} to ${validation.score}. Passed: ${validation.passed}`, {
            asset,
            strategy: strategyType,
            failedGatesCount: failedActiveCount,
            previousScore,
            score: validation.score,
            passed: validation.passed
          });
      }
      
      if (validation.passed) {
          if (validation.score > maxValidationScore) {
              maxValidationScore = validation.score;
          }
      } else {
          // Penalize scores of failed strategies so that the overall qualityScore doesn't show 100% when gates are red
          const penalizedScore = Math.min(30, validation.score * 0.3);
          if (penalizedScore > maxValidationScore) {
              maxValidationScore = penalizedScore;
          }
      }
      
      if (!validation.passed) {
          logStructured('COMPLIANCE', 'WARN', 'gate_validation_failed', `[${asset}] [Strategy: ${strategyType}] FAILED Gates. Score: ${validation.score}. Reason: ${validation.reason}`, {
            asset,
            strategy: strategyType,
            score: validation.score,
            reason: validation.reason
          });
          primaryBlocker = `FAILED (${strategyType}: ${validation.reason || 'Gates'})`;
          continue;
      } else {
          logStructured('COMPLIANCE', 'INFO', 'gate_validation_passed', `[${asset}] [Strategy: ${strategyType}] PASSED Gates. Score: ${validation.score}`, {
            asset,
            strategy: strategyType,
            score: validation.score
          });
      }

      // Strategy passed, generate signal
      const analysisState: MarketAnalysisState = {
          ...partialState,
          qualityScore: validation.score,
      };

      const sig = strategyInstance.execute(analysisState, config);
      
      // استخدام الـ Threshold المطلوب في الإعدادات (config) لجميع الأصول
      // INTENT DOCS:
      // خفض صرامة التقييم هنا (عبر خصم 20 نقطة في الـ hunterMode) هو سلوك متعمد بالكامل
      // وليس خطأ برمجياً (Not a bug). الهدف منه زيادة مرونة الشبكة (Grid Hunter) 
      // ورفع معدل الصفقات (trade frequency) حسب المتفق عليه.
      // تحذير: أي تغيير في هذه المعادلة لزيادة الصرامة سيؤدي فوراً لكسر السلوك المتفق عليه
      // وتقليل عدد الصفقات المربحة ضمن نظام الشبكة.
      const executionThreshold = config.hunterMode 
          ? Math.max(0, (config.minSignalScore || 80) - 20) 
          : (config.minSignalScore || 80);
      
      if (sig && validation.score >= executionThreshold) {
          sig.qualityScore = validation.score;
          sig.reasoning = `${config.hunterMode ? 'HUNTER SCALP' : rankedStrat.reason} | ${sig.reasoning}`;
          candidateSignals.push(sig);
          
          logStructured('QUANT', 'INFO', 'signal_candidate', `[${asset}] [Strategy: ${strategyType}] CANDIDATE signal generated (Score: ${validation.score}, Config Threshold: ${executionThreshold}, Hunter: ${config.hunterMode})`, {
            asset,
            strategy: strategyType,
            score: validation.score,
            threshold: executionThreshold,
            hunterMode: config.hunterMode
          });
      } else if (sig) {
          logStructured('QUANT', 'WARN', 'signal_rejected_low_score', `[${asset}] [Strategy: ${strategyType}] Signal generated but rejected for low score. Score: ${validation.score}, Required: ${executionThreshold}`, {
            asset,
            strategy: strategyType,
            score: validation.score,
            threshold: executionThreshold,
            reason: 'SCORE_BELOW_THRESHOLD'
          });
      }
  }

  if (candidateSignals.length > 0) {
      const coordResult = multiStrategySignalCoordinatorService.coordinate(candidateSignals);
      if (coordResult.finalSignals.length > 0) {
          signal = coordResult.finalSignals[0];
          signals = coordResult.finalSignals;
          strategy = signal.strategy as StrategyType;
          direction = signal.direction;
          reasoning = signal.reasoning || "";
          qualityScore = signal.qualityScore || 0;
          primaryBlocker = "ALPHA LOCKED 🎯";
          
          logStructured('QUANT', 'INFO', 'signal_accepted', `[${asset}] [Strategy: ${strategy}] SELECTED as final coordinated signal (Score: ${qualityScore})`, {
            asset,
            strategy,
            score: qualityScore
          });
      }
  }

  if (!signal) {
      qualityScore = maxValidationScore;
  }

  // Enforce a robust Global Active Gates Penalty to synchronize Quality Score and signal execution status with the visual gates in UI
  const finalActiveGates = getActiveGatesForRegime(partialState.regime);
  let finalFailedActiveCount = 0;
  for (const gateId of finalActiveGates) {
      if (!checkGatePassed(gateId, partialState, config)) {
          finalFailedActiveCount++;
      }
  }

  if (finalFailedActiveCount > 0) {
      const previousQuality = qualityScore;
      // Reduce quality score proportionally for any active gates failed
      qualityScore = Math.min(100 - (finalFailedActiveCount * 15), qualityScore - (finalFailedActiveCount * 10));
      qualityScore = Math.max(0, qualityScore);
      
      logStructured('COMPLIANCE', 'WARN', 'global_gate_penalty_applied', `[${asset}] Global Active Gates Penalty applied: ${finalFailedActiveCount} gates failed. Quality score reduced from ${previousQuality} to ${qualityScore}`, {
        asset,
        failedGatesCount: finalFailedActiveCount,
        previousScore: previousQuality,
        score: qualityScore
      });
      
      if (signal) {
          signal.qualityScore = qualityScore;
          
          const executionThreshold = config.hunterMode 
              ? Math.max(0, (config.minSignalScore || 80) - 20) 
              : (config.minSignalScore || 80);
              
          if (qualityScore < executionThreshold) {
              logStructured('COMPLIANCE', 'WARN', 'signal_global_compliance_rejected', `[${asset}] Rejected generated signal globally because penalized score ${qualityScore.toFixed(1)} < ${executionThreshold} (due to ${finalFailedActiveCount} failed active gates)`, {
                asset,
                score: qualityScore,
                threshold: executionThreshold,
                failedGatesCount: finalFailedActiveCount,
                reason: 'PENALIZED_SCORE_BELOW_THRESHOLD'
              });
              signal = null;
              signals = [];
              direction = null;
              primaryBlocker = `FAILED GATES (${finalFailedActiveCount} red gates)`;
          }
      }
  }

  // 6. Risk Management & Position Sizing
  const kelly = calculateKelly(0.55, config.riskRewardRatio || 2.5);
  const slDistance = atrEquivalent * 1.5 || price * 0.01;
  const tpDistance = slDistance * (config.riskRewardRatio || 2.5);

  const sl = direction === SignalDirection.LONG ? price - slDistance : price + slDistance;
  const tp = direction === SignalDirection.LONG ? price + tpDistance : price - tpDistance;

  const analysis: MarketAnalysisState = {
    ...partialState,
    qualityScore,
    primaryBlocker,
  };
  
  logStructured('QUANT', 'INFO', 'signal_evaluation_end', `[${asset}] Final Analysis: qualityScore=${analysis.qualityScore}, direction=${direction}, signal=${!!signal}`, {
    asset,
    score: analysis.qualityScore,
    direction: direction || 'NONE',
    signalGenerated: !!signal
  });


  if (signals.length > 0) {
      signals.forEach(sig => {
            // Strategy-specific TP targets based on strategy type
            // Scalper: tight TP (0.5-0.8%) — quick entries, high frequency
            // Mean Reversion: moderate TP (1-2%) — revert to VWAP/mean
            // Trend/Breakout: wide TP (3-6%) — capture directional moves
            let profitTargetPercent = 0.02; // default 2%
            
            const stratName = (sig.strategy || '').toUpperCase();
            if (stratName.includes('SCALPER') || stratName.includes('OFI')) {
              profitTargetPercent = 0.006; // 0.6% for scalpers — tight, fast
            } else if (stratName.includes('MEAN_REV') || stratName.includes('AVR')) {
              profitTargetPercent = 0.015; // 1.5% for mean reversion
            } else if (stratName.includes('BREAK') || stratName.includes('VOLATILITY')) {
              profitTargetPercent = 0.04; // 4% for breakout/volatility
            } else if (stratName.includes('TREND')) {
              profitTargetPercent = 0.035; // 3.5% for trend following
            } else if (stratName.includes('COINTEGRATION') || stratName.includes('PAIRS')) {
              profitTargetPercent = 0.025; // 2.5% for pairs trading
            } else if (stratName.includes('NEWS') || stratName.includes('SHOCK')) {
              profitTargetPercent = 0.05; // 5% for news shocks (wide moves)
            }
            
            const targetTp1 = sig.direction === SignalDirection.LONG 
                 ? price * (1 + profitTargetPercent) 
                 : price * (1 - profitTargetPercent);
            sig.stopLoss = sig.stopLoss || 0; // Keep dynamic SL from ScoringUtils if set
            sig.tp1 = targetTp1;
            // Final TP is 2x the partial TP for full position targets
            const finalMultiplier = profitTargetPercent * 2.5;
            sig.takeProfit = sig.direction === SignalDirection.LONG 
              ? price * (1 + finalMultiplier) 
              : price * (1 - finalMultiplier); 
            sig.tp2 = sig.takeProfit;
            
            if (sig.recommendedSize !== undefined) {
                const execInput = {
                    asset: sig.asset,
                    direction: sig.direction,
                    recommendedSize: sig.recommendedSize,
                    orderBookImbalance: partialState.orderBookImbalance,
                    microPrice: partialState.microPrice,
                    microPriceDeviation: partialState.microPriceDeviation,
                    topLevelImbalance: partialState.topLevelImbalance,
                    depthPressure: partialState.depthPressure,
                    normalizedOfi: partialState.normalizedOfi,
                    toxicityMetric: partialState.toxicityMetric,
                    volatilityProxy: partialState.volRatio,
                    regime: partialState.regime,
                    hunterMode: !!config.hunterMode
                };
                const execOutput = executionQualityEngine.evaluate(execInput);
                sig.executionHints = execOutput;

                // --- Signal Quality Enrichment Layer ---
                const zScoreAbs = partialState.vwapZScore !== undefined && !isNaN(partialState.vwapZScore) ? Math.abs(partialState.vwapZScore) : null;
                const breakdown = evaluateSignalQuality({
                    baseQualityScore: sig.qualityScore,
                    volatilityRegime: partialState.regime as 'LOW' | 'MEDIUM' | 'HIGH',
                    executionPenaltyFactor: execOutput.executionPenaltyFactor,
                    stressScenarioEnabled: stressScenarioService.isEnabled(),
                    zScoreAbs
                });
                
                sig.qualityScore = breakdown.finalQualityScore;
                if (!(sig as any).metadata) (sig as any).metadata = {};
                (sig as any).metadata.signalQualityBreakdown = breakdown;
            }
      });
  }
  
  if (signal) {
      // Strategy-specific TP targets
      let profitTargetPercent = 0.02; // default 2%
      const stratName = (signal.strategy || '').toUpperCase();
      if (stratName.includes('SCALPER') || stratName.includes('OFI')) {
        profitTargetPercent = 0.006;
      } else if (stratName.includes('MEAN_REV') || stratName.includes('AVR')) {
        profitTargetPercent = 0.015;
      } else if (stratName.includes('BREAK') || stratName.includes('VOLATILITY')) {
        profitTargetPercent = 0.04;
      } else if (stratName.includes('TREND')) {
        profitTargetPercent = 0.035;
      } else if (stratName.includes('COINTEGRATION') || stratName.includes('PAIRS')) {
        profitTargetPercent = 0.025;
      } else if (stratName.includes('NEWS') || stratName.includes('SHOCK')) {
        profitTargetPercent = 0.05;
      }
      
      const targetTp1 = direction === SignalDirection.LONG 
          ? price * (1 + profitTargetPercent) 
          : price * (1 - profitTargetPercent);

      signal.stopLoss = signal.stopLoss || 0; // Keep dynamic SL if set
      signal.tp1 = targetTp1; // هدف الأمان حسب الاستراتيجية
      const finalMultiplier = profitTargetPercent * 2.5;
      signal.takeProfit = direction === SignalDirection.LONG ? price * (1 + finalMultiplier) : price * (1 - finalMultiplier);
      signal.tp2 = signal.takeProfit; // الهدف النهائي
  }

  // DIAGNOSTICS: Record Signal Evaluation
  diagnosticsService.recordSignalEvaluated(
    asset,
    strategy || 'NONE',
    direction || null,
    !!signal,
    isDegraded
  );

  return { signals, analysis, signal }; // keeping signal for backwards compatibility if needed

};
