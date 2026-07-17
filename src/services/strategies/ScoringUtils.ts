import { MarketAnalysisState, AppConfig, StrategyType, SignalDirection } from "../../types";

// Helper for sigmoid/linear scoring
const getScore = (
  val: number,
  threshold: number,
  weight: number,
  invert: boolean = false,
): number => {
  // If invert is true, lower value is better
  // If invert is false, higher value is better

  // Normalize ratio around 1
  let ratio = val / (threshold || 0.0001);
  if (invert) {
    ratio = threshold / (val || 0.0001);
  }

  // To make it an aggressive profit machine, if the ratio is 1 (meets threshold),
  // it should score a solid 85. If it's better, up to 100.
  // We use a linear scale capped at 100, instead of a restrictive sigmoid.
  let score = 0;
  if (ratio >= 1) {
    score = Math.min(100, 85 + (ratio - 1) * 15);
  } else {
    // Failing gate: scale down aggressively so it cannot inflate the score
    score = Math.max(0, ratio * 45);
  }
  return score * weight;
};

export const calculateTrendScore = (
  state: MarketAnalysisState,
  config: AppConfig,
  stratName: StrategyType,
): number => {
  let gates = config.strategyGates?.[stratName] || (config as any);

  // Dynamic Override for BTC to maximize trades and optimize entry success
  if (stratName.startsWith("BTC") || state.asset.startsWith("BTC")) {
    gates = {
      ...gates,
      hurst: 0.4,
      fisher: 0.3,
      rSquared: 0.1,
      dvol: 15,
      toxicity: 0.9,
      slippage: 0.01,
      vwapZScore: 0.5,
      ofi: 0.05,
      volRatio: 0.8,
    };
  }
  let score = 0;

  const hurstPassed = state.hurst >= gates.hurst;
  const rSquaredPassed = state.rSquared >= gates.rSquared;
  const ofiPassed = Math.abs(state.liquidityGap) >= gates.ofi;
  const toxicityPassed = state.toxicityScore <= gates.toxicity;
  const dvolPassed = state.dvol >= gates.dvol;

  const hurstScore = getScore(state.hurst, gates.hurst, 0.3, false);
  const rSquaredScore = getScore(state.rSquared, gates.rSquared, 0.25, false);
  const ofiScore = getScore(
    Math.abs(state.liquidityGap),
    gates.ofi,
    0.2,
    false,
  );
  const toxicityScore = getScore(
    state.toxicityScore,
    gates.toxicity,
    0.15,
    true,
  );
  const dvolScore = getScore(state.dvol, gates.dvol, 0.1, false);

  score = hurstScore + rSquaredScore + ofiScore + toxicityScore + dvolScore;

  // Penalize extreme toxicity instead of total block
  if (state.toxicityScore > (gates.toxicity || 1) * 1.5) score -= 40;

  // Count failed gates
  let failedCount = 0;
  if (!hurstPassed) failedCount++;
  if (!rSquaredPassed) failedCount++;
  if (!ofiPassed) failedCount++;
  if (!toxicityPassed) failedCount++;
  if (!dvolPassed) failedCount++;

  // Cap and penalize if thresholds are red/failed
  if (failedCount > 0) {
    score = Math.min(100 - (failedCount * 15), score - (failedCount * 10));
  }

  return Math.min(100, Math.max(0, score));
};

export const calculateMeanRevScore = (
  state: MarketAnalysisState,
  config: AppConfig,
  stratName: StrategyType,
): number => {
  let gates = config.strategyGates?.[stratName] || (config as any);

  // Dynamic Override for BTC to maximize trades and optimize entry success
  if (stratName.startsWith("BTC") || state.asset.startsWith("BTC")) {
    gates = {
      ...gates,
      hurst: 0.6, // Higher for mean reversion so it triggers easily
      fisher: 0.3,
      rSquared: 0.1,
      dvol: 15,
      toxicity: 0.9,
      slippage: 0.01,
      vwapZScore: 0.5,
      ofi: 0.05,
      volRatio: 0.8,
    };
  }
  let score = 0;

  const hurstPassed = state.hurst <= 0.45; // lower is better
  const vwapPassed = Math.abs(state.vwapDeviation * 100) >= gates.vwapZScore;
  const fisherPassed = Math.abs(state.fisher) >= gates.fisher;
  const dvolPassed = state.dvol >= gates.dvol;
  const toxicityPassed = state.toxicityScore <= gates.toxicity;

  const hurstScore = getScore(state.hurst, 0.45, 0.3, true);
  const vwapScore = getScore(
    Math.abs(state.vwapDeviation * 100),
    gates.vwapZScore,
    0.3,
    false,
  );
  const fisherScore = getScore(
    Math.abs(state.fisher),
    gates.fisher,
    0.2,
    false,
  );
  let dvolScore = getScore(state.dvol, gates.dvol, 0.1, false);
  const toxicityScore = getScore(
    state.toxicityScore,
    gates.toxicity,
    0.1,
    true,
  );

  score = hurstScore + vwapScore + fisherScore + dvolScore + toxicityScore;

  // Penalize extreme trending instead of total block
  if (state.hurst > 0.6) score -= 40;

  // Count failed gates
  let failedCount = 0;
  if (!hurstPassed) failedCount++;
  if (!vwapPassed) failedCount++;
  if (!fisherPassed) failedCount++;
  if (!dvolPassed) failedCount++;
  if (!toxicityPassed) failedCount++;

  // Cap and penalize if thresholds are red/failed
  if (failedCount > 0) {
    score = Math.min(100 - (failedCount * 15), score - (failedCount * 10));
  }

  return Math.min(100, Math.max(0, score));
};

export const calculateBreakoutScore = (
  state: MarketAnalysisState,
  config: AppConfig,
  stratName: StrategyType,
): number => {
  let gates = config.strategyGates?.[stratName] || (config as any);

  // Dynamic Override for BTC to maximize trades and optimize entry success
  if (stratName.startsWith("BTC") || state.asset.startsWith("BTC")) {
    gates = {
      ...gates,
      hurst: 0.4,
      fisher: 0.3,
      rSquared: 0.1,
      dvol: 15,
      toxicity: 0.9,
      slippage: 0.01,
      vwapZScore: 0.5,
      ofi: 0.05,
      volRatio: 0.8,
    };
  }
  let score = 0;

  const dvolPassed = state.dvol >= gates.dvol;
  const ofiPassed = Math.abs(state.liquidityGap) >= gates.ofi;
  const rSquaredPassed = state.rSquared >= gates.rSquared;
  const toxicityPassed = state.toxicityScore <= gates.toxicity;

  const dvolScore = getScore(state.dvol, gates.dvol, 0.4, false);
  const ofiScore = getScore(
    Math.abs(state.liquidityGap),
    gates.ofi,
    0.3,
    false,
  );
  const rSquaredScore = getScore(state.rSquared, gates.rSquared, 0.2, false);
  const toxicityScore = getScore(
    state.toxicityScore,
    gates.toxicity,
    0.1,
    true,
  );

  score = dvolScore + ofiScore + rSquaredScore + toxicityScore;

  const regimeStr = state.regime as string;
  if (regimeStr === 'TRENDING' || regimeStr === 'BREAKOUT' || regimeStr === 'VOLATILE' || regimeStr === 'MOMENTUM_TREND' || regimeStr === 'HIGH_VOLATILITY') {
    score += 30; // Boost Breakout for quick target TP
  }
  score += 15; // Base boost to ensure it triggers

  // Penalize lack of volatility instead of block
  if (state.dvol < (gates.dvol || 1) * 0.8) score -= 30;

  // Count failed gates
  let failedCount = 0;
  if (!dvolPassed) failedCount++;
  if (!ofiPassed) failedCount++;
  if (!rSquaredPassed) failedCount++;
  if (!toxicityPassed) failedCount++;

  // Cap and penalize if thresholds are red/failed
  if (failedCount > 0) {
    score = Math.min(100 - (failedCount * 15), score - (failedCount * 10));
  }

  return Math.min(100, Math.max(0, score));
};

export const calculateScalpScore = (
  state: MarketAnalysisState,
  config: AppConfig,
  stratName: StrategyType,
): number => {
  let gates = config.strategyGates?.[stratName] || (config as any);

  // Dynamic Override for BTC to maximize trades and optimize entry success
  if (stratName.startsWith("BTC") || state.asset.startsWith("BTC")) {
    gates = {
      ...gates,
      hurst: 0.4,
      fisher: 0.3,
      rSquared: 0.1,
      dvol: 15,
      toxicity: 0.9,
      slippage: 0.01,
      vwapZScore: 0.5,
      ofi: 0.05,
      volRatio: 0.8,
    };
  }
  let score = 0;

  const ofiPassed = Math.abs(state.liquidityGap) >= gates.ofi;
  const slippagePassed = state.estimatedSlippage <= gates.slippage;
  const volRatioPassed = state.volRatio >= gates.volRatio;
  const toxicityPassed = state.toxicityScore <= gates.toxicity;

  const ofiScore = getScore(
    Math.abs(state.liquidityGap),
    gates.ofi,
    0.35,
    false,
  );
  const slippageScore = getScore(
    state.estimatedSlippage,
    gates.slippage,
    0.25,
    true,
  );
  const volRatioScore = getScore(state.volRatio, gates.volRatio, 0.2, false);
  const toxicityScore = getScore(
    state.toxicityScore,
    gates.toxicity,
    0.2,
    true,
  );

  score = ofiScore + slippageScore + volRatioScore + toxicityScore;

  const regimeStr = state.regime as string;
  if (regimeStr === 'CHOPPY/NOISE' || regimeStr === 'VOLATILE' || regimeStr === 'BREAKOUT' || regimeStr === 'HIGH_VOLATILITY') {
    score += 25; // Boost Scalping
  }
  score += 20; // Base boost for quick 0.5 TP

  // Penalize high slippage instead of block
  if (state.estimatedSlippage > (gates.slippage || 1) * 1.5) score -= 40;

  // Count failed gates
  let failedCount = 0;
  if (!ofiPassed) failedCount++;
  if (!slippagePassed) failedCount++;
  if (!volRatioPassed) failedCount++;
  if (!toxicityPassed) failedCount++;

  // Cap and penalize if thresholds are red/failed
  if (failedCount > 0) {
    score = Math.min(100 - (failedCount * 15), score - (failedCount * 10));
  }

  return Math.min(100, Math.max(0, score));
};

export const calculateNewsShockScore = (
  state: MarketAnalysisState,
  config: AppConfig,
  stratName: StrategyType,
): number => {
  let gates = config.strategyGates?.[stratName] || (config as any);

  // Dynamic Override for BTC to maximize trades and optimize entry success
  if (stratName.startsWith("BTC") || state.asset.startsWith("BTC")) {
    gates = {
      ...gates,
      hurst: 0.4,
      fisher: 0.3,
      rSquared: 0.1,
      dvol: 15,
      toxicity: 0.9,
      slippage: 0.01,
      vwapZScore: 0.5,
      ofi: 0.05,
      volRatio: 0.8,
    };
  }
  let score = 0;

  const dvolPassed = state.dvol >= (gates.dvol || 1) * 1.5;
  const ofiPassed = Math.abs(state.liquidityGap) >= (gates.ofi || 1) * 2;
  const slippagePassed = state.estimatedSlippage <= gates.slippage;

  const dvolScore = getScore(state.dvol, (gates.dvol || 1) * 1.5, 0.4, false);
  const ofiScore = getScore(
    Math.abs(state.liquidityGap),
    (gates.ofi || 1) * 2,
    0.4,
    false,
  );
  const slippageScore = getScore(
    state.estimatedSlippage,
    gates.slippage,
    0.2,
    true,
  );

  score = dvolScore + ofiScore + slippageScore;

  // Penalize lack of event instead of total block, allow "normal" trading if high dvol
  if (!state.activeEvent) score -= 20;

  // Count failed gates
  let failedCount = 0;
  if (!dvolPassed) failedCount++;
  if (!ofiPassed) failedCount++;
  if (!slippagePassed) failedCount++;

  // Cap and penalize if thresholds are red/failed
  if (failedCount > 0) {
    score = Math.min(100 - (failedCount * 15), score - (failedCount * 10));
  }

  return Math.min(100, Math.max(0, score));
};

export const calculateInstitutionalRisk = (
  state: MarketAnalysisState,
  direction: SignalDirection,
  strategyType: 'TREND' | 'MEAN_REV' | 'SCALPER' | 'BREAKOUT'
) => {
  // Institutional Hedge Fund Risk Management: 
  // Never use fixed %. Always use dynamic volatility (Realized Volatility / Garman-Klass).
  // Baseline volatility is calculated via the advanced Garman-Klass estimator.
  const volDistance = state.volatility && state.volatility > 0 ? state.volatility : state.price * 0.01;
  
  let riskMultiplier = 1.0;
  let rewardMultiplier = 2.0;

  switch (strategyType) {
    case 'TREND':
      // Trend following requires wide stops to avoid noise, capturing fat tails.
      riskMultiplier = 2.0; 
      rewardMultiplier = 4.0; // 1:2 or 1:3 R:R
      break;
    case 'MEAN_REV':
      // Mean reversion is quick, targeting VWAP. Stops are tight.
      riskMultiplier = 1.0;
      rewardMultiplier = Math.abs(state.vwapDeviation) > 0 ? Math.abs((state.price - state.vwapMain) / volDistance) : 1.5;
      break;
    case 'SCALPER':
      // High frequency liquidity sweeps. Very tight risk.
      riskMultiplier = 0.5;
      rewardMultiplier = 1.0;
      break;
    case 'BREAKOUT':
      // Momentum breakout. Stop just below the breakout zone.
      riskMultiplier = 1.5;
      rewardMultiplier = 3.0;
      break;
  }

  const slDistance = volDistance * riskMultiplier;
  const tpDistance = volDistance * rewardMultiplier;

  // We set stopLoss to 0 to rely strictly on the CRL (Capital Recovery Layer) budget system
  // to close losing positions dynamically instead of hard stop losses.
  const stopLoss = 0; 
  const takeProfit = direction === SignalDirection.LONG ? state.price + tpDistance : state.price - tpDistance;
  const tp1 = direction === SignalDirection.LONG ? state.price + (tpDistance * 0.5) : state.price - (tpDistance * 0.5);
  const tp2 = takeProfit;

  return { stopLoss, takeProfit, tp1, tp2, riskDistance: slDistance };
};

